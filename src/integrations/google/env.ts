// The Google OAuth client, and the Supabase key that may touch the token table
// (GOOGLE_CALENDAR_SYNC_DESIGN.md §4.4).
//
// Read lazily by every caller rather than at module load: a missing variable on
// a serverless function that throws during import is a blank 500 with nothing
// in it, and the same problem read here is a message naming the variable.

export interface GoogleOAuthEnv {
  clientId: string;
  clientSecret: string;
  /** Must match a URI registered on the client, character for character. */
  redirectUri: string;
}

/**
 * What we ask Google for.
 *
 * The full calendar scope, because §4.1 has the app CREATE a dedicated
 * calendar and `calendar.events` cannot make one. See §13 Q6: a narrower
 * app-created-calendars scope would fit this design exactly, and is worth
 * confirming before this ships.
 */
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

/**
 * The OAuth client.
 *
 * `GOOGLE_REDIRECT_URI` is explicit and NOT derived from `VERCEL_URL`, unlike
 * `readAppUrl`. Every preview deployment has a different host, and a redirect
 * URI Google has not been shown is rejected before the user sees anything we
 * could explain — so previews deliberately point at the production callback,
 * which is the one address registered on the client.
 */
export function readGoogleOAuthEnv(env: NodeJS.ProcessEnv = process.env): GoogleOAuthEnv {
  const clientId = (env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (env.GOOGLE_CLIENT_SECRET || "").trim();
  const redirectUri = (env.GOOGLE_REDIRECT_URI || "").trim();

  const missing = [
    !clientId && "GOOGLE_CLIENT_ID",
    !clientSecret && "GOOGLE_CLIENT_SECRET",
    !redirectUri && "GOOGLE_REDIRECT_URI",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Google Calendar sync is not configured (missing env: ${missing.join(", ")}).`);
  }

  return { clientId, clientSecret, redirectUri };
}

export interface ServiceRoleEnv {
  url: string;
  serviceRoleKey: string;
}

/**
 * The key that bypasses RLS.
 *
 * Deliberately NOT added to `readSupabaseEnv`, which asserts the opposite —
 * that layer serves per-request user tokens and `assertNotServiceRole` makes a
 * service key there a startup failure. This is the one place in the codebase
 * that wants the superpower, because `google_calendar_tokens` has no policy any
 * user token could satisfy (§4.4.1).
 */
export function readServiceRoleEnv(env: NodeJS.ProcessEnv = process.env): ServiceRoleEnv {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").trim();
  const serviceRoleKey = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !serviceRoleKey) {
    const missing = [!url && "SUPABASE_URL", !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY"]
      .filter(Boolean)
      .join(", ");
    throw new Error(`Google Calendar sync needs Supabase service access (missing env: ${missing}).`);
  }
  return { url: url.replace(/\/+$/, ""), serviceRoleKey };
}
