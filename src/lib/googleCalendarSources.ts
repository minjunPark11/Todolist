// The calendars we read from, and where we stopped reading each
// (GOOGLE_CALENDAR_SYNC_DESIGN.md §6.1).
//
// M1 wrote to exactly one calendar, so `google_calendar_connections` held one
// id and one cursor. Reading is a choice with several answers — a personal
// calendar, a work one, a shared family one — so 019 gave each its own row and
// this is the door to it.
//
// Like `lib/googleCalendar.ts`, everything takes its dependencies as an
// argument so the flow is testable without Supabase or a Google account.
import { GoogleCalendarError, googleCalendarFetch, type GoogleCalendarDeps } from "./googleCalendar";
import { supabase } from "../services/supabaseClient";
import { deviceId } from "./deviceId";

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

/** One calendar in the connected account, as the settings list needs it. */
export interface GoogleCalendarSummary {
  calendarId: string;
  summary: string;
  color: string;
  /** `owner` or `writer` — the account may change events here (§6.2). */
  writable: boolean;
  timezone?: string;
  primary: boolean;
}

/** A row of `google_calendar_sources`. */
export interface GoogleCalendarSource extends GoogleCalendarSummary {
  selected: boolean;
  /** Where the inbound pass stopped. Absent until the first full list. */
  syncToken?: string;
}

/**
 * Every calendar the account can see.
 *
 * `accessRole` decides `writable`, and it is read rather than assumed: a
 * subscribed holiday calendar is readable and not writable, and offering an
 * edit Google will refuse is worse than not offering one.
 */
export async function listGoogleCalendars(
  accessToken: string,
  deps: Pick<GoogleCalendarDeps, "fetch"> = { fetch: googleCalendarFetch },
): Promise<GoogleCalendarSummary[]> {
  let response: Response;
  try {
    response = await deps.fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList?maxResults=250`, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
  } catch {
    throw new GoogleCalendarError("network", "Could not reach Google.");
  }

  const body = (await response.json().catch(() => null)) as { items?: unknown } | null;
  if (!response.ok) {
    throw new GoogleCalendarError("google", `Could not list your calendars (${response.status}).`);
  }

  const items = Array.isArray(body?.items) ? body.items : [];
  const calendars: GoogleCalendarSummary[] = [];
  for (const raw of items) {
    const item = raw as Record<string, unknown>;
    const calendarId = typeof item.id === "string" ? item.id : "";
    if (!calendarId) continue;
    const accessRole = typeof item.accessRole === "string" ? item.accessRole : "";
    calendars.push({
      calendarId,
      summary: typeof item.summary === "string" && item.summary ? item.summary : calendarId,
      color: typeof item.backgroundColor === "string" ? item.backgroundColor : "",
      writable: accessRole === "owner" || accessRole === "writer",
      ...(typeof item.timeZone === "string" && item.timeZone ? { timezone: item.timeZone } : {}),
      primary: item.primary === true,
    });
  }
  return calendars;
}

function rowToSource(row: Record<string, unknown>): GoogleCalendarSource {
  return {
    calendarId: String(row.calendar_id ?? ""),
    summary: String(row.summary ?? ""),
    color: String(row.color ?? ""),
    writable: row.writable === true,
    selected: row.selected === true,
    ...(typeof row.sync_token === "string" && row.sync_token ? { syncToken: row.sync_token } : {}),
    primary: false,
  };
}

/**
 * What this account chose, and where THIS DEVICE stopped reading
 * (MULTI_DEVICE_SYNC_DESIGN.md §5).
 *
 * Two tables, because the two halves have different owners. The list and the
 * ticks belong to the account: pick a calendar on the laptop and the phone
 * should show it picked. The cursor belongs to the device, because the mirror
 * it describes is local — sharing one cursor meant whichever app polled first
 * consumed the changes and the other never saw them.
 */
export async function readGoogleSources(): Promise<GoogleCalendarSource[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("google_calendar_sources")
    .select("calendar_id, summary, color, writable, selected");
  if (error) throw new GoogleCalendarError("store", error.message);

  const { data: cursors, error: cursorError } = await supabase
    .from("google_calendar_device_cursors")
    .select("calendar_id, sync_token")
    .eq("device_id", deviceId());
  // A cursor we cannot read is a full listing, which is correct and costs one
  // request — not a reason to fail the pass and read nothing at all.
  const byCalendar = new Map(
    cursorError
      ? []
      : (cursors ?? []).map((row) => {
          const cursor = row as Record<string, unknown>;
          return [String(cursor.calendar_id ?? ""), cursor.sync_token];
        }),
  );

  return (data ?? []).map((row) => {
    const source = row as Record<string, unknown>;
    return rowToSource({ ...source, sync_token: byCalendar.get(String(source.calendar_id ?? "")) });
  });
}

async function userId(): Promise<string> {
  if (!supabase) throw new GoogleCalendarError("signedOut", "Sign in to FocusFlow first.");
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new GoogleCalendarError("signedOut", "Sign in to FocusFlow first.");
  return id;
}

/**
 * The account's calendar list, refreshed — names, colours and access included.
 *
 * `selected` is deliberately NOT written here. It is the one column that
 * belongs to the person rather than to Google, and a refresh that reset it
 * would silently unsubscribe them every time the settings screen opened.
 */
export async function rememberGoogleCalendars(calendars: GoogleCalendarSummary[]): Promise<void> {
  if (!supabase || calendars.length === 0) return;
  const id = await userId();
  const known = new Set((await readGoogleSources()).map((source) => source.calendarId));

  const rows = calendars.map((calendar) => ({
    user_id: id,
    calendar_id: calendar.calendarId,
    summary: calendar.summary,
    color: calendar.color,
    writable: calendar.writable,
    // Only for rows this is creating. An existing row keeps its own answer.
    ...(known.has(calendar.calendarId) ? {} : { selected: false }),
  }));

  const { error } = await supabase
    .from("google_calendar_sources")
    .upsert(rows, { onConflict: "user_id,calendar_id" });
  if (error) throw new GoogleCalendarError("store", error.message);
}

/**
 * Turn one calendar on or off.
 *
 * Turning it OFF clears the cursor. A cursor is a position in a stream of
 * changes, and one left behind while nobody was reading names a position whose
 * intervening changes are gone — resuming from it would skip everything that
 * happened in between, invisibly. Off and on again re-lists in full, which
 * costs one request and is correct.
 */
export async function setGoogleSourceSelected(calendarId: string, selected: boolean): Promise<void> {
  if (!supabase) throw new GoogleCalendarError("signedOut", "Sign in to FocusFlow first.");
  const id = await userId();
  const { error } = await supabase
    .from("google_calendar_sources")
    .upsert({ user_id: id, calendar_id: calendarId, selected }, { onConflict: "user_id,calendar_id" });
  if (error) throw new GoogleCalendarError("store", error.message);

  // EVERY device's cursor, not just this one. The argument in the comment
  // above is about nobody reading the stream, and while a calendar is off
  // nobody is reading it on any device — each of them would resume from a
  // position whose intervening changes are gone.
  if (!selected) {
    const { error: cursorError } = await supabase
      .from("google_calendar_device_cursors")
      .delete()
      .eq("user_id", id)
      .eq("calendar_id", calendarId);
    if (cursorError) throw new GoogleCalendarError("store", cursorError.message);
  }
}

/**
 * Where THIS DEVICE's last pass stopped, so its next one asks for changes only.
 *
 * Another device's cursor is none of this one's business: it is reading the
 * same stream into a different mirror, and it has to see every change too.
 */
export async function saveGoogleSyncToken(calendarId: string, syncToken: string | null): Promise<void> {
  if (!supabase) return;
  const id = await userId();
  const { error } = await supabase
    .from("google_calendar_device_cursors")
    .upsert(
      { user_id: id, device_id: deviceId(), calendar_id: calendarId, sync_token: syncToken },
      { onConflict: "user_id,device_id,calendar_id" },
    );
  if (error) throw new GoogleCalendarError("store", error.message);
}
