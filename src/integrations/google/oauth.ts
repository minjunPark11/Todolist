// Talking to Google's OAuth endpoints (GOOGLE_CALENDAR_SYNC_DESIGN.md §4.4).
//
// `fetch` and nothing else — no SDK. What is used of Google's OAuth is three
// form posts and one redirect URL, and a package to name those would be the
// tail wagging the dog (the same reasoning `api/mcp/index.ts` gives for typing
// its request structurally).
import { GOOGLE_CALENDAR_SCOPE, type GoogleOAuthEnv } from "./env";

const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export class GoogleOAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GoogleOAuthError";
  }
}

/**
 * Where to send the browser to ask for consent.
 *
 * Built on the SERVER, which is why no client id ever reaches the bundle. The
 * app navigates to `/api/google/start` and this decides where that goes — one
 * secret-free variable fewer to keep in three places (`.env`, `release.yml`,
 * GitHub Secrets), which is exactly where the v0.1.4 outage came from.
 *
 * `access_type=offline` with `prompt=consent` is what guarantees a refresh
 * token. Google returns one only on the FIRST consent otherwise, so a user who
 * connects, disconnects and reconnects would come back with an access token
 * that expires in an hour and no way to renew it — a failure that looks like
 * the feature working until the next morning.
 */
export function authorizeUrl(env: GoogleOAuthEnv, state: string): string {
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

export interface ExchangedTokens {
  refreshToken: string;
  accessToken: string;
  /** Seconds. */
  expiresIn: number;
  scope: string;
}

async function postForm(
  endpoint: string,
  body: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<Response> {
  try {
    return await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
  } catch {
    throw new GoogleOAuthError("Could not reach Google.", 502);
  }
}

/** Google's error bodies are `{ error, error_description }`; keep both when present. */
async function describe(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown; error_description?: unknown };
    const code = typeof body.error === "string" ? body.error : "";
    const detail = typeof body.error_description === "string" ? body.error_description : "";
    const message = [code, detail].filter(Boolean).join(": ");
    return message || fallback;
  } catch {
    return fallback;
  }
}

/**
 * A one-time code, for tokens.
 *
 * Throws rather than returning a partial result when no refresh token comes
 * back. Storing the access token alone would produce a connection that works
 * for an hour and then fails forever with nothing to renew from, and a broken
 * connection is better discovered here than tomorrow.
 */
export async function exchangeCode(
  code: string,
  env: GoogleOAuthEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<ExchangedTokens> {
  const response = await postForm(
    TOKEN_ENDPOINT,
    {
      code,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      redirect_uri: env.redirectUri,
      grant_type: "authorization_code",
    },
    fetchImpl,
  );

  if (!response.ok) {
    throw new GoogleOAuthError(await describe(response, "Google refused the authorization code."), 400);
  }

  const body = (await response.json()) as {
    refresh_token?: unknown;
    access_token?: unknown;
    expires_in?: unknown;
    scope?: unknown;
  };

  if (typeof body.refresh_token !== "string" || !body.refresh_token) {
    throw new GoogleOAuthError(
      "Google returned no refresh token. Disconnect the app under your Google account's third-party access and try again.",
      400,
    );
  }
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new GoogleOAuthError("Google returned no access token.", 502);
  }

  return {
    refreshToken: body.refresh_token,
    accessToken: body.access_token,
    expiresIn: typeof body.expires_in === "number" ? body.expires_in : 3600,
    scope: typeof body.scope === "string" ? body.scope : "",
  };
}

export interface RefreshedToken {
  accessToken: string;
  /** Seconds. */
  expiresIn: number;
}

/**
 * A short-lived access token for the client to call the Calendar API with.
 *
 * A 400 here means the grant is gone — the user revoked it in their Google
 * account, or it expired unused. That is not a transient failure and retrying
 * cannot fix it, so it is reported as 401 for the caller to turn into "connect
 * again" rather than as an error to swallow.
 */
export async function refreshAccessToken(
  refreshToken: string,
  env: GoogleOAuthEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<RefreshedToken> {
  const response = await postForm(
    TOKEN_ENDPOINT,
    {
      refresh_token: refreshToken,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      grant_type: "refresh_token",
    },
    fetchImpl,
  );

  if (!response.ok) {
    const message = await describe(response, "Google refused the refresh token.");
    throw new GoogleOAuthError(message, response.status === 400 || response.status === 401 ? 401 : 502);
  }

  const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new GoogleOAuthError("Google returned no access token.", 502);
  }

  return {
    accessToken: body.access_token,
    expiresIn: typeof body.expires_in === "number" ? body.expires_in : 3600,
  };
}

/**
 * Hands the grant back to Google.
 *
 * Never throws. Disconnecting has to remove OUR copy of the token whatever
 * Google says — a failure here would otherwise leave the user unable to
 * disconnect at all, which is worse than a grant lingering in a Google account
 * screen where they can also remove it by hand.
 */
export async function revokeToken(token: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await postForm(REVOKE_ENDPOINT, { token }, fetchImpl);
    return response.ok;
  } catch {
    return false;
  }
}
