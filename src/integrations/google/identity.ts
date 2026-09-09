import { readServiceRoleEnv, type ServiceRoleEnv } from "./env";

export class GoogleIdentityError extends Error {
  constructor(readonly code: "google_identity_unavailable" | "google_identity_reconnect_required", readonly status: 502 | 409) {
    super(code === "google_identity_reconnect_required"
      ? "The existing Google account could not be matched. Disconnect the existing connection before connecting another account."
      : "Could not verify the Google account. No connection was replaced.");
    this.name = "GoogleIdentityError";
  }
}
export interface VerifiedGoogleIdentity { subject: string; email: string }

/** Only call with an access token obtained by the server's own OAuth code exchange. */
export async function verifyGoogleIdentity(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<VerifiedGoogleIdentity> {
  try {
    const response = await fetchImpl("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` }, redirect: "error",
    });
    if (!response.ok) throw new Error();
    const body = await response.json() as { sub?: unknown; email?: unknown; email_verified?: unknown } | null;
    if (!body || typeof body.sub !== "string" || !body.sub.trim() || body.sub.length > 255 || body.sub !== body.sub.trim()) throw new Error();
    return { subject: body.sub, email: body.email_verified === true && typeof body.email === "string" ? body.email : "" };
  } catch { throw new GoogleIdentityError("google_identity_unavailable", 502); }
}

/** Atomic server-only comparison and credential replacement. Email is display metadata only. */
export async function storeVerifiedGoogleGrant(userId: string, refreshToken: string, scope: string,
  identity: VerifiedGoogleIdentity, fetchImpl: typeof fetch = fetch, env: ServiceRoleEnv = readServiceRoleEnv()): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(`${env.url}/rest/v1/rpc/store_verified_google_grant`, {
      method: "POST", headers: { apikey: env.serviceRoleKey, Authorization: `Bearer ${env.serviceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_user_id: userId, p_refresh_token: refreshToken, p_scope: scope,
        p_subject: identity.subject, p_email: identity.email }),
    });
  } catch { throw new GoogleIdentityError("google_identity_unavailable", 502); }
  // Never expose database error bodies: they may contain a credential.
  if (!response.ok) throw new GoogleIdentityError("google_identity_unavailable", 502);
  const result = await response.json().catch(() => null) as { stored?: unknown; reason?: unknown } | null;
  if (result?.stored === false && result.reason === "identity-mismatch") throw new GoogleIdentityError("google_identity_reconnect_required", 409);
  if (result?.stored !== true) throw new GoogleIdentityError("google_identity_unavailable", 502);
}
