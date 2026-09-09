import { readGoogleOAuthEnv, readServiceRoleEnv, type ServiceRoleEnv } from "./env";
import { refreshAccessToken } from "./oauth";
import { verifyGoogleIdentity } from "./identity";

export class CalendarBindingError extends Error {
  /**
   * `reason` is the server's own word for the refusal, when it gave one.
   *
   * Re-pinning the sync time zone (036) refuses for four reasons that are all
   * temporary and all fixable by the person asking — a pass in flight, a write
   * in flight, a review still open, a generation that moved. One sentence for
   * all of them ("could not verify the calendar") sends someone to look at
   * their Google account for a problem that is in their own review list.
   */
  constructor(readonly status: 409 | 502, message = "Could not verify the dedicated calendar. The existing connection was kept.",
    readonly reason = "") {
    super(message); this.name = "CalendarBindingError";
  }
}
async function rpc(name: string, body: unknown, fetchImpl: typeof fetch, env: ServiceRoleEnv): Promise<unknown> {
  try {
    const response = await fetchImpl(`${env.url}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { apikey: env.serviceRoleKey, Authorization: `Bearer ${env.serviceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error();
    return await response.json();
  } catch { throw new CalendarBindingError(502); }
}

/** The OAuth subject is stable; the verified email is used only for this live ownership check. */
export async function verifyDedicatedCalendar(calendarId: string, accessToken: string, verifiedEmail: string,
  fetchImpl: typeof fetch = fetch, alreadyBound = false): Promise<{ calendarId: string; timezone: string }> {
  if (!calendarId.trim() || calendarId === "primary" || !verifiedEmail) throw new CalendarBindingError(409);
  try {
    const response = await fetchImpl(`https://www.googleapis.com/calendar/v3/users/me/calendarList/${encodeURIComponent(calendarId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` }, redirect: "error",
    });
    if (!response.ok) throw new CalendarBindingError(response.status === 404 ? 409 : 502);
    const body = await response.json() as Record<string, unknown>;
    if (body.id !== calendarId || body.primary === true || body.deleted === true || body.accessRole !== "owner" ||
      (!alreadyBound && body.summary !== "FocusFlow") ||
      typeof body.dataOwner !== "string" || body.dataOwner.toLowerCase() !== verifiedEmail.toLowerCase() ||
      typeof body.timeZone !== "string" || !body.timeZone.trim()) throw new CalendarBindingError(409);
    new Intl.DateTimeFormat("en", { timeZone: body.timeZone }).format(0);
    return { calendarId, timezone: body.timeZone };
  } catch (error) { if (error instanceof CalendarBindingError) throw error; throw new CalendarBindingError(502); }
}

/**
 * @param timezone The zone this account reads wall-clock times in, when the
 * client named one. It becomes `sync_timezone`, which is the single value both
 * directions of task sync use — inbound converts Google's instants into it
 * (021 line 231), outbound writes it back alongside every `dateTime`
 * (029 line 157). Absent, the calendar's own zone stands in, which is what
 * every client sent before there was a setting to send.
 *
 * The calendar's zone is a poor default and this is why the parameter exists:
 * it is a property of a calendar object, while what a reader sees in Google's
 * grid is their ACCOUNT's display zone. A calendar created while those two
 * disagree pins the difference into every event that ever syncs.
 */
export async function bindDedicatedCalendar(userId: string, calendarId: string, timezone = "",
  fetchImpl: typeof fetch = fetch, env: ServiceRoleEnv = readServiceRoleEnv()): Promise<void> {
  const snapshot = await rpc("read_google_binding_snapshot", { p_user_id: userId }, fetchImpl, env) as {
    refreshToken?: unknown; subject?: unknown; generation?: unknown; grantVersion?: unknown; boundCalendarId?: unknown; historicalCalendarIds?: unknown;
  } | null;
  if (!snapshot || typeof snapshot.refreshToken !== "string" || !snapshot.refreshToken ||
    typeof snapshot.subject !== "string" || !snapshot.subject ||
    typeof snapshot.grantVersion !== "string" || !snapshot.grantVersion ||
    (snapshot.generation !== null && typeof snapshot.generation !== "string")) throw new CalendarBindingError(409);
  const token = await refreshAccessToken(snapshot.refreshToken, readGoogleOAuthEnv(), fetchImpl);
  const identity = await verifyGoogleIdentity(token.accessToken, fetchImpl);
  if (identity.subject !== snapshot.subject) throw new CalendarBindingError(409);
  const knownCalendar = snapshot.boundCalendarId === calendarId ||
    (Array.isArray(snapshot.historicalCalendarIds) && snapshot.historicalCalendarIds.includes(calendarId));
  const calendar = await verifyDedicatedCalendar(calendarId, token.accessToken, identity.email, fetchImpl, knownCalendar);
  const result = await rpc("bind_verified_google_calendar", {
    p_user_id: userId, p_refresh_token: snapshot.refreshToken, p_subject: identity.subject,
    p_grant_version: snapshot.grantVersion, p_expected_generation: snapshot.generation, p_calendar_id: calendar.calendarId,
    p_timezone: timezone || calendar.timezone, p_email: identity.email,
  }, fetchImpl, env) as { bound?: unknown; reason?: unknown } | null;
  if (result?.bound !== true) {
    throw new CalendarBindingError(409, undefined, typeof result?.reason === "string" ? result.reason : "");
  }
}
