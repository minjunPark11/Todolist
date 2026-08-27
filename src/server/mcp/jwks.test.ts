import { beforeAll, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "./auth";
import { supabaseTokenVerifier } from "./jwks";

const ISSUER = "https://project.supabase.co/auth/v1";
const NOW = new Date("2026-08-28T01:00:00.000Z");

let keyPair: CryptoKeyPair;
let publicJwk: JsonWebKey & { kid: string };

beforeAll(async () => {
  keyPair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  publicJwk = { ...(await crypto.subtle.exportKey("jwk", keyPair.publicKey)), kid: "key-1" } as JsonWebKey & {
    kid: string;
  };
});

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function sign(
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "ES256", kid: "key-1", typ: "JWT" },
): Promise<string> {
  const signed = `${encode(header)}.${encode(claims)}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    new TextEncoder().encode(signed),
  );
  return `${signed}.${Buffer.from(signature).toString("base64url")}`;
}

function goodClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: "11111111-2222-3333-4444-555555555555",
    iss: ISSUER,
    aud: "authenticated",
    exp: Math.floor(NOW.getTime() / 1000) + 3600,
    ...overrides,
  };
}

function jwksServer(keys: unknown[] = [publicJwk]) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ keys }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function verifier(overrides: Parameters<typeof supabaseTokenVerifier>[0] extends infer T ? Partial<T> : never = {}) {
  const server = jwksServer();
  return {
    server,
    verifier: supabaseTokenVerifier({
      issuer: ISSUER,
      fetchImpl: server.fetchImpl,
      now: () => NOW,
      ...overrides,
    }),
  };
}

describe("a token this project issued", () => {
  it("is accepted, and its subject and client are read out", async () => {
    const { verifier: verify } = verifier();
    const result = await verify.verify(await sign(goodClaims({ client_id: "claude-desktop" })));

    expect(result.userId).toBe("11111111-2222-3333-4444-555555555555");
    expect(result.clientId).toBe("claude-desktop");
  });

  it("has no client_id when it came from the app's own session", async () => {
    // §6.5 leans on exactly this difference: an OAuth token carries the claim
    // and an ordinary session token does not.
    const { verifier: verify } = verifier();
    const result = await verify.verify(await sign(goodClaims()));

    expect(result.clientId).toBeUndefined();
  });

  it("fetches the key set once and then works from memory", async () => {
    const { verifier: verify, server } = verifier();
    await verify.verify(await sign(goodClaims()));
    await verify.verify(await sign(goodClaims()));

    expect(server.calls).toHaveLength(1);
  });
});

describe("a token this project did not issue", () => {
  it("is refused when the signature does not check out", async () => {
    const { verifier: verify } = verifier();
    const token = await sign(goodClaims());
    const tampered = `${token.slice(0, -4)}AAAA`;

    await expect(verify.verify(tampered)).rejects.toThrow(/signature/);
  });

  it("is refused when it was issued by another project", async () => {
    // The confused deputy. A perfectly valid token from somebody else's
    // Supabase project must not be logged as one of our users — the check
    // belongs before the request, not at PostgREST afterwards.
    const { verifier: verify } = verifier();
    const other = await sign(goodClaims({ iss: "https://someone-else.supabase.co/auth/v1" }));

    await expect(verify.verify(other)).rejects.toThrow(/different service/);
  });

  it("is refused when the audience is not ours", async () => {
    const { verifier: verify } = verifier();
    await expect(verify.verify(await sign(goodClaims({ aud: "anon" })))).rejects.toThrow(/different audience/);
  });

  it("is refused when it has expired", async () => {
    const { verifier: verify } = verifier();
    const expired = await sign(goodClaims({ exp: Math.floor(NOW.getTime() / 1000) - 120 }));

    await expect(verify.verify(expired)).rejects.toThrow(/expired/);
  });

  it("is refused when it is signed with a shared secret", async () => {
    // HS256 cannot be verified from a public key set, and verifying it
    // remotely would put a network round trip on every tool call. This project
    // publishes an ES256 key, so refusing is the honest answer.
    const { verifier: verify } = verifier();
    const hs256 = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(goodClaims())}.signature`;

    await expect(verify.verify(hs256)).rejects.toThrow(/HS256/);
  });

  it("is refused when it names a key nobody published", async () => {
    const { verifier: verify } = verifier();
    const unknownKid = await sign(goodClaims(), { alg: "ES256", kid: "key-99", typ: "JWT" });

    await expect(verify.verify(unknownKid)).rejects.toThrow(/unknown key/);
  });

  it("refuses rather than accepting when the key set cannot be read", async () => {
    const failing = supabaseTokenVerifier({
      issuer: ISSUER,
      fetchImpl: (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch,
      now: () => NOW,
    });

    await expect(failing.verify(await sign(goodClaims()))).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("key rotation", () => {
  it("looks again when a token names a key it has not seen", async () => {
    // A rotated key would otherwise lock every user out until the cache
    // expired hours later.
    let published: unknown[] = [publicJwk];
    const calls: string[] = [];
    const verify = supabaseTokenVerifier({
      issuer: ISSUER,
      now: () => NOW,
      refetchFloorMs: 0,
      fetchImpl: (async (url: string) => {
        calls.push(String(url));
        return new Response(JSON.stringify({ keys: published }), { status: 200 });
      }) as unknown as typeof fetch,
    });

    await verify.verify(await sign(goodClaims()));
    published = [{ ...publicJwk, kid: "key-2" }];
    const rotated = await sign(goodClaims(), { alg: "ES256", kid: "key-2", typ: "JWT" });

    await expect(verify.verify(rotated)).resolves.toMatchObject({ userId: goodClaims().sub });
    expect(calls.length).toBeGreaterThan(1);
  });

  it("does not refetch on every bad token", async () => {
    // Otherwise an unknown `kid` is a free way to make this server hammer
    // Supabase: send junk in a loop, and every request becomes a JWKS fetch.
    const server = jwksServer();
    let clock = NOW.getTime();
    const verify = supabaseTokenVerifier({
      issuer: ISSUER,
      fetchImpl: server.fetchImpl,
      now: () => new Date(clock),
      refetchFloorMs: 60_000,
    });

    await verify.verify(await sign(goodClaims()));
    expect(server.calls).toHaveLength(1);

    const bogus = await sign(goodClaims(), { alg: "ES256", kid: "made-up", typ: "JWT" });

    // Inside the floor: refused from the keys already held, no fetch.
    await expect(verify.verify(bogus)).rejects.toThrow(/unknown key/);
    expect(server.calls).toHaveLength(1);

    // Past it: one look, in case a key really did rotate.
    clock += 61_000;
    await expect(verify.verify(bogus)).rejects.toThrow(/unknown key/);
    expect(server.calls).toHaveLength(2);

    // And then quiet again.
    await expect(verify.verify(bogus)).rejects.toThrow(/unknown key/);
    expect(server.calls).toHaveLength(2);
  });
});

describe("the JWKS address", () => {
  it("is derived from the issuer", async () => {
    const { verifier: verify, server } = verifier();
    await verify.verify(await sign(goodClaims()));

    expect(server.calls[0]).toBe(`${ISSUER}/.well-known/jwks.json`);
  });

  it("can be overridden", async () => {
    const server = jwksServer();
    const verify = supabaseTokenVerifier({
      issuer: ISSUER,
      jwksUrl: "https://example.test/keys",
      fetchImpl: server.fetchImpl,
      now: () => NOW,
    });
    await verify.verify(await sign(goodClaims()));

    expect(server.calls[0]).toBe("https://example.test/keys");
  });
});

// Keeps the unused-import lint honest about `vi`, which the fetch stubs above
// deliberately do not need.
void vi;
