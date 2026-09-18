// The calendars we read from, and where we stopped reading each
// (GOOGLE_CALENDAR_SYNC_DESIGN.md §6.1).
//
// M1 wrote to exactly one calendar, so `google_calendar_connections` held one
// id and one cursor. Reading is a choice with several answers — a personal
// calendar, a work one, a shared family one — so 019 gave each its own row.
//
// 이 문이 한 번 닫혔다가 다시 열렸다. 2026-09-10 에 설정의 목록을 지우면서
// 그 목록만이 부르던 세 함수 — 나열하고, 기억하고, 고르는 — 도 같이 지웠다.
// 그때 모듈 머리에 결과를 적어뒀다: "이후에 연결하는 계정은 행이 없으니 외부
// 캘린더를 하나도 읽지 않는다."
//
// 그 문장이 맞았다. 행을 만드는 코드가 `rememberGoogleCalendars` 하나뿐이고
// 그것을 부르는 화면이 없었으므로, 그 뒤로 연결한 계정에서 인바운드 패스는
// `chosen.length === 0` 에서 바로 돌아섰다 — 700 줄과 테이블 하나가 돌 수
// 없는 채로 남아 있었다.
//
// 되살린다. 지워진 세 함수는 그대로 돌아왔고, 인바운드 나머지는 애초에
// 지워진 적이 없다.
import { GoogleCalendarError, googleCalendarFetch, type GoogleCalendarDeps } from "./googleCalendar";
import { supabase } from "../services/supabaseClient";

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

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

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
    // 빈 문자열은 "구글이 이 캘린더의 시간대를 말하지 않았다"와 "046 이전에
    // 쓰인 행이다"를 둘 다 뜻한다. 어느 쪽이든 붙일 라벨이 없다는 결론은
    // 같으므로, 키를 아예 두지 않는다 — `syncToken` 과 같은 이유로 같은 모양.
    ...(typeof row.timezone === "string" && row.timezone ? { timezone: row.timezone } : {}),
    primary: false,
  };
}

/** What this account chose, last time it was asked. */
export async function readGoogleSources(): Promise<GoogleCalendarSource[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("google_calendar_sources")
    .select("calendar_id, summary, color, writable, selected, sync_token, timezone");
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
    // 구글의 것이지 사람의 것이 아니므로 `selected` 와 달리 매번 덮는다.
    // 캘린더를 다른 지역으로 옮기면 여기도 따라와야 한다.
    timezone: calendar.timezone ?? "",
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
    .upsert(
      { user_id: id, calendar_id: calendarId, selected, ...(selected ? {} : { sync_token: null }) },
      { onConflict: "user_id,calendar_id" },
    );
  if (error) throw new GoogleCalendarError("store", error.message);
}

export async function saveGoogleSyncToken(calendarId: string, syncToken: string | null): Promise<void> {
  if (!supabase) return;
  const id = await userId();
  const { error } = await supabase
    .from("google_calendar_sources")
    .upsert({ user_id: id, calendar_id: calendarId, sync_token: syncToken }, { onConflict: "user_id,calendar_id" });
  if (error) throw new GoogleCalendarError("store", error.message);
}
