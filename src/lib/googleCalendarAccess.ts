// Whether a calendar is still there at all
// (GOOGLE_SYNC_HARDENING_DESIGN.md §7).
//
// A 404 on an event answers a question we did not ask. We asked "patch this
// event"; Google answered "not found", and that sentence is true both when the
// event is gone and when the CALENDAR is gone. Reading it only the first way is
// how a deleted calendar turns into an app that quietly forgets every event in
// it, one 404 at a time — and, on the outbound side, unlinks every Task and
// then fails to recreate any of them, forever.
//
// So when a 404 arrives, ask the question we actually need answered. One
// request, once per pass: the answer cannot change halfway through.
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export type CalendarAccess =
  /** It is there and we may read it. The 404 was about the event. */
  | "alive"
  /** Deleted, or never existed under this id. */
  | "gone"
  /** There, but not ours any more — a share that was withdrawn. */
  | "forbidden"
  /** The question could not be asked. Concludes nothing. */
  | "unknown";

export interface CalendarAccessDeps {
  fetch: typeof fetch;
}

/**
 * `alive` unless Google says otherwise.
 *
 * `unknown` on a network failure or a 5xx, and callers must treat it as
 * `alive` would be treated — that is, keep whatever conclusion the 404 already
 * licensed. A probe that cannot run must not be able to change what happens,
 * or a flaky connection becomes a way to hold events hostage.
 */
export async function probeCalendar(
  googleCalendarId: string,
  accessToken: string,
  deps: CalendarAccessDeps,
): Promise<CalendarAccess> {
  let response: Response;
  try {
    response = await deps.fetch(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(googleCalendarId)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
  } catch {
    return "unknown";
  }
  if (response.status >= 200 && response.status < 300) return "alive";
  if (response.status === 404 || response.status === 410) return "gone";
  if (response.status === 403) return "forbidden";
  return "unknown";
}

/** Whether this answer means "stop concluding things about events in here". */
export function calendarIsUnreachable(access: CalendarAccess): boolean {
  return access === "gone" || access === "forbidden";
}

/**
 * What to tell the person, in the terms of what they can do about it.
 *
 * A deleted calendar and a withdrawn share look identical from here — both are
 * "your events are not coming back on their own" — but the fix is different
 * enough that one sentence for both would be no help at all.
 */
export function calendarErrorMessage(access: CalendarAccess): string {
  if (access === "forbidden") return "Google denied access to this calendar. It may no longer be shared with you.";
  return "This calendar is no longer in the Google account.";
}
