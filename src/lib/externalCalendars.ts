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
  if (!raw.id || !raw.name || !raw.icsUrl) return null;
  const now = new Date().toISOString();
  return {
    id: String(raw.id),
    name: String(raw.name),
    icsUrl: String(raw.icsUrl),
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
    readOnly: true,
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

export function shouldSyncExternalCalendar(calendar: ExternalCalendar, nowMs = Date.now()) {
  if (!calendar.enabled) return false;
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

