// GOOGLE_CALENDAR_SYNC_DESIGN.md §4.4.
//
// The parts of the OAuth round trip that can be proven without Google: what
// `state` accepts, what the consent URL asks for, and how the token endpoint's
// answers are read. The last one matters most — the failure this guards is a
// connection that works for an hour and then dies with nothing to renew from,
// which is invisible until the next morning.
import { describe, expect, it } from "vitest";
import { authorizeUrl, exchangeCode, GoogleOAuthError, refreshAccessToken, revokeToken } from "./oauth";
import { decodeOAuthState, encodeOAuthState } from "./state";
import type { GoogleOAuthEnv } from "./env";

const env: GoogleOAuthEnv = {
  clientId: "client-123.apps.googleusercontent.com",
  clientSecret: "secret-abc",
  redirectUri: "https://todolist-three-gray-92.vercel.app/api/google/callback",
};

function respondWith(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("oauth state", () => {
  it("round-trips", () => {
    const state = { nonce: "a1b2c3d4e5f60718", platform: "desktop" as const };
    expect(decodeOAuthState(encodeOAuthState(state))).toEqual(state);
  });

  it("refuses anything it did not write", () => {
    expect(decodeOAuthState(undefined)).toBeNull();
    expect(decodeOAuthState("")).toBeNull();
    expect(decodeOAuthState("nodot")).toBeNull();
    // A platform we do not know is not defaulted — guessing would send an
    // unknown party's code to whichever destination we picked.
    expect(decodeOAuthState("a1b2c3d4e5f60718.android")).toBeNull();
    // Nonces are hex from getRandomValues; a "nonce" with punctuation in it is
    // someone experimenting.
    expect(decodeOAuthState("../../etc.web")).toBeNull();
    expect(decodeOAuthState("short.web")).toBeNull();
  });
});

describe("authorizeUrl", () => {
  it("asks in a way that guarantees a refresh token", () => {
    // Without both of these Google returns a refresh token only on a user's
    // FIRST consent, so connect → disconnect → reconnect would come back with
    // an access token that expires in an hour and nothing behind it.
    const url = new URL(authorizeUrl(env, "a1b2c3d4e5f60718.web"));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("carries the client, the redirect and the state", () => {
    const url = new URL(authorizeUrl(env, "a1b2c3d4e5f60718.web"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe(env.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(env.redirectUri);
    expect(url.searchParams.get("state")).toBe("a1b2c3d4e5f60718.web");
    expect(url.searchParams.get("response_type")).toBe("code");
  });
});

describe("exchangeCode", () => {
  it("reads a full response", async () => {
    const tokens = await exchangeCode(
      "code-1",
      env,
      respondWith({ refresh_token: "r1", access_token: "a1", expires_in: 3599, scope: "calendar" }),
    );
    expect(tokens).toEqual({ refreshToken: "r1", accessToken: "a1", expiresIn: 3599, scope: "calendar" });
  });

  it("REFUSES a response with no refresh token", async () => {
    // The whole point. Storing the access token alone builds a connection that
    // dies within the hour and cannot be renewed — better to fail here, where
    // there is a person watching, than tomorrow.
    await expect(exchangeCode("code-1", env, respondWith({ access_token: "a1" }))).rejects.toThrow(
      /no refresh token/i,
    );
  });

  it("turns Google's refusal into its own words", async () => {
    await expect(
      exchangeCode("code-1", env, respondWith({ error: "invalid_grant", error_description: "Code was expired" }, 400)),
    ).rejects.toThrow(/invalid_grant: Code was expired/);
  });

  it("reports an unreachable Google as 502, not as a bad code", async () => {
    const failing = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    await expect(exchangeCode("code-1", env, failing)).rejects.toMatchObject({ status: 502 });
  });
});

describe("refreshAccessToken", () => {
  it("returns a short-lived token", async () => {
    const token = await refreshAccessToken("r1", env, respondWith({ access_token: "a2", expires_in: 3599 }));
    expect(token).toEqual({ accessToken: "a2", expiresIn: 3599 });
  });

  it("reports a dead grant as 401 so the client asks to connect again", async () => {
    // A revoked grant is not a transient failure. Retrying never fixes it, so
    // the status has to say "start over" rather than "try again".
    await expect(refreshAccessToken("r1", env, respondWith({ error: "invalid_grant" }, 400))).rejects.toMatchObject({
      status: 401,
    });
  });

  it("reports Google being broken as 502", async () => {
    await expect(refreshAccessToken("r1", env, respondWith({ error: "backend_error" }, 500))).rejects.toMatchObject({
      status: 502,
    });
  });

  it("is a GoogleOAuthError either way", async () => {
    await expect(refreshAccessToken("r1", env, respondWith({}, 400))).rejects.toBeInstanceOf(GoogleOAuthError);
  });
});

describe("revokeToken", () => {
  it("never throws, so disconnecting cannot be blocked by Google", async () => {
    const failing = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await expect(revokeToken("r1", failing)).resolves.toBe(false);
    await expect(revokeToken("r1", respondWith({}, 200))).resolves.toBe(true);
  });
});
