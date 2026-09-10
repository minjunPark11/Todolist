// The calendars we read from, and where we stopped reading each
// (GOOGLE_CALENDAR_SYNC_DESIGN.md §6.1).
//
// M1 wrote to exactly one calendar, so `google_calendar_connections` held one
// id and one cursor. Reading is a choice with several answers — a personal
// calendar, a work one, a shared family one — so 019 gave each its own row.
//
// **Read-only now.** The settings list that offered those calendars and ticked
// them is gone, and with it the only caller of the three functions that
// listed, remembered and selected them. What is left is what the inbound pass
// needs: the rows already stored, and where each got to. An account whose rows
// predate the removal keeps syncing exactly as it did; one connected after it
// has no rows and reads no external calendars at all. If the choice comes
// back, so do those three — `git log` has them.
import { GoogleCalendarError } from "./googleCalendar";
import { supabase } from "../services/supabaseClient";

/** One calendar in the connected account, as a stored row describes it. */
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

/** What this account chose, last time it was asked. */
export async function readGoogleSources(): Promise<GoogleCalendarSource[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("google_calendar_sources")
    .select("calendar_id, summary, color, writable, selected, sync_token");
  if (error) throw new GoogleCalendarError("store", error.message);
  return (data ?? []).map((row) => rowToSource(row as Record<string, unknown>));
}

async function userId(): Promise<string> {
  if (!supabase) throw new GoogleCalendarError("signedOut", "Sign in to FocusFlow first.");
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new GoogleCalendarError("signedOut", "Sign in to FocusFlow first.");
  return id;
}

export async function saveGoogleSyncToken(calendarId: string, syncToken: string | null): Promise<void> {
  if (!supabase) return;
  const id = await userId();
  const { error } = await supabase
    .from("google_calendar_sources")
    .upsert({ user_id: id, calendar_id: calendarId, sync_token: syncToken }, { onConflict: "user_id,calendar_id" });
  if (error) throw new GoogleCalendarError("store", error.message);
}
