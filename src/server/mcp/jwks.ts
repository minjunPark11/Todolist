// Verifying the bearer token ourselves, before the request goes anywhere.
//
// Phase 4 decoded the token and let PostgREST do the checking. That was
// survivable — a forged token reads nothing, because the same token is what
// PostgREST demands — but it left the confused-deputy hole open: a VALID token
// from somebody else's Supabase project would be accepted here, logged as one
// of our users, and only rejected a layer later. §8.2 step 2 closes it, and
// this is that step.
//
// Local verification, not a call to Supabase. The project publishes an ES256
// key (§26.4), so the check is a JWKS fetch that is cached for hours and then
// arithmetic — no network on the request path, which is what makes it
// affordable to do on every single tool call.
//
// HS256 is refused rather than verified remotely. A legacy shared-secret
// project would need `getClaims` to make a round trip per request, and this
// project is not one (§26.4, SEC-1). Refusing loudly beats silently adding a
// network hop nobody asked for.
import { UnauthorizedError, type TokenVerifier } from "./auth";

export interface JwtHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

export interface SupabaseVerifierOptions {
  /** `https://<ref>.supabase.co/auth/v1` — the `iss` we will accept. */
  issuer: string;
  jwksUrl?: string;
  /** Supabase issues user tokens with `aud: "authenticated"`. */
  audience?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** How long a fetched key set is trusted without asking again. */
  cacheTtlMs?: number;
  /** Floor between two refetches provoked by an unknown `kid`. */
  refetchFloorMs?: number;
  /** Tolerance for a clock that disagrees with Supabase's. */
  clockSkewMs?: number;
}

export const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const DEFAULT_REFETCH_FLOOR_MS = 60 * 1000;
export const DEFAULT_CLOCK_SKEW_MS = 30 * 1000;

interface CachedKeys {
  keys: Map<string, JsonWebKey & { kid?: string; alg?: string }>;
  fetchedAt: number;
}

export function supabaseTokenVerifier(options: SupabaseVerifierOptions): TokenVerifier {
  const {
    issuer,
    jwksUrl = `${issuer.replace(/\/+$/, "")}/.well-known/jwks.json`,
    audience = "authenticated",
    fetchImpl = fetch,
    now = () => new Date(),
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    refetchFloorMs = DEFAULT_REFETCH_FLOOR_MS,
    clockSkewMs = DEFAULT_CLOCK_SKEW_MS,
  } = options;

  let cache: CachedKeys | null = null;
  let inFlight: Promise<CachedKeys> | null = null;

  async function loadKeys(force: boolean): Promise<CachedKeys> {
    const age = cache ? now().getTime() - cache.fetchedAt : Number.POSITIVE_INFINITY;
    if (cache && !force && age < cacheTtlMs) return cache;
    // An unknown `kid` is the signal that a key rotated, and it is also what
    // an attacker sends to make us fetch. The floor turns "refetch on every
    // bad token" into "refetch at most once a minute".
    if (cache && force && age < refetchFloorMs) return cache;
    // One fetch at a time: a cold start under load should not open twenty.
    inFlight ??= fetchKeys(jwksUrl, fetchImpl, now).finally(() => {
      inFlight = null;
    });
    cache = await inFlight;
    return cache;
  }

  return {
    async verify(bearer) {
      const parts = bearer.split(".");
      if (parts.length !== 3) throw new UnauthorizedError("invalid_token", "That token is not a JWT.");

      const header = decodeSegment<JwtHeader>(parts[0]);
      const claims = decodeSegment<Record<string, unknown>>(parts[1]);
      if (!header || !claims) throw new UnauthorizedError("invalid_token", "That token is not a JWT.");

      if (header.alg !== "ES256" && header.alg !== "RS256") {
        throw new UnauthorizedError(
          "invalid_token",
          `Tokens signed with ${header.alg || "an unnamed algorithm"} are not accepted here.`,
        );
      }

      let keys = await loadKeys(false);
      let jwk = header.kid ? keys.keys.get(header.kid) : undefined;
      if (!jwk) {
        keys = await loadKeys(true);
        jwk = header.kid ? keys.keys.get(header.kid) : undefined;
      }
      if (!jwk) throw new UnauthorizedError("invalid_token", "That token was signed with an unknown key.");

      const signed = `${parts[0]}.${parts[1]}`;
      const valid = await verifySignature(header.alg, jwk, signed, base64UrlToBytes(parts[2]));
      if (!valid) throw new UnauthorizedError("invalid_token", "That token's signature does not check out.");

      // Only now are the claims worth reading. Checking `exp` before the
      // signature would be checking a number anybody could have written.
      const nowMs = now().getTime();
      if (typeof claims.exp === "number" && claims.exp * 1000 + clockSkewMs <= nowMs) {
        throw new UnauthorizedError("invalid_token", "That token has expired.");
      }
      if (typeof claims.nbf === "number" && claims.nbf * 1000 - clockSkewMs > nowMs) {
        throw new UnauthorizedError("invalid_token", "That token is not valid yet.");
      }
      // The confused-deputy check: a perfectly good token from another project
      // is still not a token for this one.
      if (claims.iss !== issuer) {
        throw new UnauthorizedError("invalid_token", "That token was issued for a different service.");
      }
      if (!audienceMatches(claims.aud, audience)) {
        throw new UnauthorizedError("invalid_token", "That token was issued for a different audience.");
      }

      const userId = typeof claims.sub === "string" ? claims.sub : "";
      if (!userId) throw new UnauthorizedError("invalid_token", "That token names no subject.");

      return {
        userId,
        ...(typeof claims.client_id === "string" ? { clientId: claims.client_id } : {}),
        accessToken: bearer,
      };
    },
  };
}

async function fetchKeys(url: string, fetchImpl: typeof fetch, now: () => Date): Promise<CachedKeys> {
  let response: Response;
  try {
    response = await fetchImpl(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new UnauthorizedError("invalid_token", "The signing keys could not be read right now.");
  }
  if (!response.ok) throw new UnauthorizedError("invalid_token", "The signing keys could not be read right now.");

  const body = (await response.json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
  const keys = new Map<string, JsonWebKey & { kid?: string }>();
  for (const key of body.keys ?? []) {
    if (key.kid) keys.set(key.kid, key);
  }
  return { keys, fetchedAt: now().getTime() };
}

async function verifySignature(
  alg: "ES256" | "RS256",
  jwk: JsonWebKey,
  signed: string,
  signature: Uint8Array,
): Promise<boolean> {
  const algorithm =
    alg === "ES256"
      ? ({ name: "ECDSA", namedCurve: "P-256" } as const)
      : ({ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const);

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("jwk", { ...jwk, alg, key_ops: ["verify"], ext: true }, algorithm, false, [
      "verify",
    ]);
  } catch {
    throw new UnauthorizedError("invalid_token", "That token's signing key is unusable.");
  }

  const parameters = alg === "ES256" ? { name: "ECDSA", hash: "SHA-256" } : { name: "RSASSA-PKCS1-v1_5" };
  return crypto.subtle.verify(parameters, key, signature as unknown as BufferSource, new TextEncoder().encode(signed));
}

/** `aud` may be a string or an array; either may carry the one we want. */
function audienceMatches(aud: unknown, expected: string): boolean {
  if (typeof aud === "string") return aud === expected;
  if (Array.isArray(aud)) return aud.includes(expected);
  return false;
}

function decodeSegment<T>(segment: string): T | null {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function base64UrlToBytes(segment: string): Uint8Array {
  return new Uint8Array(Buffer.from(segment, "base64url"));
}
