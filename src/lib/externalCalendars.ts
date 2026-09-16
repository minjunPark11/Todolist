import { platform } from "../platform";
import type { ExternalCalendar, ExternalCalendarEvent } from "../types";
// Parsing lives in ./ics, which has no platform under it and so can also run
// on a server (FOCUSFLOW_EXTERNAL_AI_ACCESS_ARCHITECTURE.md §7.2). Re-exported
// here because this module was the door to it and the call sites still knock.
import { parseIcsEvents } from "./ics/parse";

export {
  parseIcsEvents,
  externalEventDate,
  externalEventEndDate,
  externalEventStartTime,
  externalEventEndTime,
} from "./ics/parse";
export { expandIcsOccurrences } from "./ics/recurrence";

export const EXTERNAL_CALENDAR_STALE_MINUTES = 30;

export type ExternalCalendarState = {
  calendars: ExternalCalendar[];
  events: ExternalCalendarEvent[];
};

const STORAGE_KEY = "focusflow.externalCalendars.v1";

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeCalendar(raw: Partial<ExternalCalendar>): ExternalCalendar | null {
  if (!raw.id || !raw.name) return null;
  // Absent means the record predates Google calendars, and every one of those
  // was a subscription.
  const source = raw.source === "google" ? "google" : "ics";
  // Each source is required to carry the address it is reached by, and only
  // that one. A subscription without a URL cannot be fetched; a Google calendar
  // without an id cannot be listed. Both would sit in the sidebar doing nothing.
  if (source === "ics" && !raw.icsUrl) return null;
  if (source === "google" && !raw.googleCalendarId) return null;
  const now = new Date().toISOString();
  return {
    id: String(raw.id),
    name: String(raw.name),
    source,
    ...(raw.icsUrl ? { icsUrl: String(raw.icsUrl) } : {}),
    ...(raw.googleCalendarId ? { googleCalendarId: String(raw.googleCalendarId) } : {}),
    color: raw.color || "#4f73ff",
    visible: raw.visible !== false,
    enabled: raw.enabled !== false,
    syncStatus: raw.syncStatus ?? "idle",
    lastSyncedAt: raw.lastSyncedAt,
    lastAttemptedAt: raw.lastAttemptedAt,
    lastError: raw.lastError,
    eventCount: raw.eventCount ?? 0,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
  };
}

function sanitizeEvent(raw: Partial<ExternalCalendarEvent>): ExternalCalendarEvent | null {
  if (!raw.id || !raw.externalCalendarId || !raw.externalUid || !raw.title || !raw.start) return null;
  const now = new Date().toISOString();
  return {
    id: String(raw.id),
    externalCalendarId: String(raw.externalCalendarId),
    externalUid: String(raw.externalUid),
    title: String(raw.title),
    description: raw.description,
    location: raw.location,
    start: String(raw.start),
    end: raw.end,
    allDay: Boolean(raw.allDay),
    timezone: raw.timezone,
    sourceUrl: raw.sourceUrl,
    // Read-only unless the record says otherwise, so anything written before
    // Google calendars existed stays exactly as unwritable as it was.
    readOnly: raw.readOnly !== false,
    ...(raw.etag ? { etag: String(raw.etag) } : {}),
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
    // Carried through the cache, or a reload would leave every repeating event
    // as the single occurrence it was first written on — the exact bug
    // ./ics/recurrence exists to fix.
    recurrence: raw.recurrence,
    exdates: raw.exdates,
    recurrenceId: raw.recurrenceId,
  };
}

export function loadExternalCalendarState(): ExternalCalendarState {
  try {
    const raw = platform.storage.getSync(STORAGE_KEY);
    if (!raw) return { calendars: [], events: [] };
    const parsed = JSON.parse(raw) as Partial<ExternalCalendarState>;
    return {
      calendars: Array.isArray(parsed.calendars) ? parsed.calendars.map(sanitizeCalendar).filter(Boolean) as ExternalCalendar[] : [],
      events: Array.isArray(parsed.events) ? parsed.events.map(sanitizeEvent).filter(Boolean) as ExternalCalendarEvent[] : [],
    };
  } catch {
    return { calendars: [], events: [] };
  }
}

export function saveExternalCalendarState(state: ExternalCalendarState) {
  try {
    platform.storage.setSync(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Keep in-memory state when storage is unavailable.
  }
}

export function createExternalCalendarDraft(name: string, icsUrl: string, color: string): ExternalCalendar {
  const now = new Date().toISOString();
  return {
    id: createId("external-calendar"),
    name: name.trim(),
    icsUrl: normalizeIcsUrl(icsUrl),
    color,
    visible: true,
    enabled: true,
    syncStatus: "idle",
    eventCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 이 캘린더가 **파일로 읽는** 구독인가.
 *
 * 외부 캘린더 목록에는 두 종류가 섞여 있다. ICS 구독은 URL 하나를 주기적으로
 * 내려받는 것이고, 구글 캘린더는 API 로 읽어 인바운드 패스가 채운다
 * (`hooks/useGoogleInboundSync.ts`). 아래 갱신 경로는 앞의 것만을 위한
 * 것인데, 그 사실이 `fetchExternalCalendarEvents` 안에만 있었다 — 즉 **던지는
 * 자리에만** 있고 부르는 자리에는 없었다.
 *
 * 그 결과 구글 캘린더를 가진 계정은 앱을 열 때마다 이렇게 됐다 [실측]:
 *
 *   syncStatus = "failed"
 *   lastError  = "That calendar is not an ICS subscription."
 *   벨         = "Calendar sync failed — 내 구글 캘린더 could not be
 *                 refreshed. That calendar is not an ICS subscription."
 *
 * 그 캘린더는 멀쩡히 동기화되고 있었다. 실패한 것은 그것을 ICS 로 읽으려 한
 * 쪽이고, 화면은 캘린더가 고장 난 것처럼 말했다. 게다가 한 번 `failed` 가
 * 되면 자동 갱신 필터가 그 상태를 걸러내므로, 그 거짓말은 지워지지 않고
 * 남는다.
 */
export function isIcsSubscription(
  calendar: ExternalCalendar,
  // 좁히는 술어로 쓴다 — `server/data/calendar/icsSource.ts` 가 같은 이유로
  // 같은 모양을 쓴다. 이렇게 두면 URL 이 없는 캘린더가 아래 본문에 **들어올
  // 수 없다**는 것을 타입이 보증한다.
): calendar is ExternalCalendar & { icsUrl: string } {
  return (calendar.source ?? "ics") === "ics" && Boolean(calendar.icsUrl);
}

export function shouldSyncExternalCalendar(calendar: ExternalCalendar, nowMs = Date.now()) {
  if (!calendar.enabled) return false;
  // 읽을 파일이 없는 캘린더는 이 경로의 일이 아니다. 자격을 여기서 끊는 것은
  // 자동 갱신을 도는 두 곳과 수동 버튼이 모두 이 함수를 지나가기 때문이다.
  if (!isIcsSubscription(calendar)) return false;
  if (!calendar.lastSyncedAt) return true;
  return nowMs - new Date(calendar.lastSyncedAt).getTime() >= EXTERNAL_CALENDAR_STALE_MINUTES * 60_000;
}

export function normalizeIcsUrl(raw: string) {
  const trimmed = raw.trim();
  if (/^webcal:\/\//i.test(trimmed)) return `https://${trimmed.slice("webcal://".length)}`;
  return trimmed;
}

function isSameOrigin(url: string) {
  try {
    return new URL(url, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

async function readIcsResponse(response: Response) {
  const text = await response.text();
  if (!response.ok) {
    const detail = text.trim().replace(/\s+/g, " ").slice(0, 120);
    throw new Error(detail ? `HTTP ${response.status} — ${detail}` : `HTTP ${response.status}`);
  }
  if (!text.toUpperCase().includes("BEGIN:VCALENDAR")) {
    throw new Error("Not an ICS calendar");
  }
  return text;
}

export async function fetchExternalCalendarEvents(calendar: ExternalCalendar) {
  // A Google calendar has no file to read; it is refreshed by the inbound pass
  // instead. Saying so here beats fetching "" and reporting a parse failure.
  // 마지막 방어선으로 남긴다. 부르는 쪽이 `isIcsSubscription` 으로 이미
  // 걸러야 하고, 여기까지 온 것은 그 거름망이 새고 있다는 뜻이다.
  if (!isIcsSubscription(calendar)) {
    throw new Error("That calendar is not an ICS subscription.");
  }
  const url = normalizeIcsUrl(calendar.icsUrl);
  let text: string;
  if (isSameOrigin(url)) {
    text = await readIcsResponse(await platform.aiFetch(url));
  } else {
    try {
      text = await readIcsResponse(await platform.aiFetch(url));
    } catch {
      // Cross-origin ICS hosts (Google, iCloud, ...) don't send CORS headers,
      // so the direct fetch dies with an opaque network error; retry through
      // the same-origin proxy which fetches server-side.
      text = await readIcsResponse(await platform.aiFetch(`/api/ics?url=${encodeURIComponent(url)}`));
    }
  }
  return parseIcsEvents(text, calendar.id);
}

