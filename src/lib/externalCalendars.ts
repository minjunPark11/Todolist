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
    // This function is an ALLOWLIST: a field missing from it is dropped on
    // every load, which looks like a feature that works until the app is
    // restarted. `eventType` decides whether the grid offers an edit at all
    // (GOOGLE_SYNC_HARDENING_DESIGN.md §8.3), so losing it would quietly hand
    // back the gestures Google is going to refuse.
    ...(raw.eventType ? { eventType: String(raw.eventType) } : {}),
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
  // A Google calendar has no file to read; it is refreshed by the inbound pass
  // instead. Saying so here beats fetching "" and reporting a parse failure.
  if ((calendar.source ?? "ics") !== "ics" || !calendar.icsUrl) {
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

