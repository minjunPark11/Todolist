import { platform } from "../platform";
import type { ExternalCalendar, ExternalCalendarEvent } from "../types";

export const EXTERNAL_CALENDAR_STALE_MINUTES = 30;

export type ExternalCalendarState = {
  calendars: ExternalCalendar[];
  events: ExternalCalendarEvent[];
};

const STORAGE_KEY = "focusflow.externalCalendars.v1";

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function unfoldIcsLines(text: string) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const unfolded: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

function unescapeIcsText(value = "") {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function getIcsValue(lines: string[], name: string) {
  const property = getIcsProperty(lines, name);
  return property?.value ?? "";
}

function getIcsProperty(lines: string[], name: string) {
  const prefix = name.toUpperCase();
  const line = lines.find((item) => {
    const upper = item.toUpperCase();
    return upper.startsWith(`${prefix}:`) || upper.startsWith(`${prefix};`);
  });
  if (!line) return null;
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const params = new Map<string, string>();
  for (const part of head.split(";").slice(1)) {
    const equals = part.indexOf("=");
    if (equals < 0) continue;
    params.set(part.slice(0, equals).toUpperCase(), part.slice(equals + 1).replace(/^"|"$/g, ""));
  }
  return { value: line.slice(colon + 1), params };
}

function parseIcsDate(value: string, timezone?: string) {
  if (!value) return null;
  if (/^\d{8}$/.test(value)) {
    return { value: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`, allDay: true, timezone: undefined };
  }
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00", z] = match;
  const iso = z
    ? new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString()
    : `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  return { value: iso, allDay: false, timezone };
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

// UTC ("...Z") stamps are converted to the source calendar's timezone when
// available, otherwise to the device's local date/time. Floating TZID values
// are already in the source calendar's wall time, so they are taken as-is.
function localDateTimeParts(value: string, timezone?: string): { date: string; time?: string } {
  if (!value.includes("T")) return { date: value.slice(0, 10) };
  if (value.endsWith("Z")) {
    const date = new Date(value);
    if (timezone) {
      try {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          hourCycle: "h23",
        })
          .formatToParts(date)
          .reduce<Record<string, string>>((acc, part) => {
            if (part.type !== "literal") acc[part.type] = part.value;
            return acc;
          }, {});
        return {
          date: `${parts.year}-${parts.month}-${parts.day}`,
          time: `${parts.hour}:${parts.minute}`,
        };
      } catch {
        // Unknown/non-IANA TZID: fall back to device local handling.
      }
    }
    return {
      date: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
      time: `${pad2(date.getHours())}:${pad2(date.getMinutes())}`,
    };
  }
  return { date: value.slice(0, 10), time: value.slice(11, 16) };
}

export function parseIcsEvents(text: string, calendarId: string): ExternalCalendarEvent[] {
  const lines = unfoldIcsLines(text);
  const calendarTimezone = getIcsValue(lines, "X-WR-TIMEZONE") || getIcsValue(lines, "TZID") || undefined;
  const now = new Date().toISOString();
  const events: ExternalCalendarEvent[] = [];
  let block: string[] | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      block = [];
      continue;
    }
    if (line === "END:VEVENT" && block) {
      const uid = getIcsValue(block, "UID") || createId("ics-event");
      const startProperty = getIcsProperty(block, "DTSTART");
      const startTimezone = startProperty?.params.get("TZID") || calendarTimezone;
      const start = parseIcsDate(startProperty?.value ?? "", startTimezone);
      if (!start) {
        block = null;
        continue;
      }
      const endProperty = getIcsProperty(block, "DTEND");
      const endTimezone = endProperty?.params.get("TZID") || start.timezone;
      const end = parseIcsDate(endProperty?.value ?? "", endTimezone);
      events.push({
        id: `${calendarId}:${uid}`,
        externalCalendarId: calendarId,
        externalUid: uid,
        title: unescapeIcsText(getIcsValue(block, "SUMMARY")) || "Untitled event",
        description: unescapeIcsText(getIcsValue(block, "DESCRIPTION")),
        location: unescapeIcsText(getIcsValue(block, "LOCATION")),
        start: start.value,
        end: end?.value,
        allDay: start.allDay,
        timezone: start.timezone,
        sourceUrl: getIcsValue(block, "URL"),
        readOnly: true,
        createdAt: now,
        updatedAt: now,
      });
      block = null;
      continue;
    }
    if (block) block.push(line);
  }

  return events;
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

export function externalEventDate(event: ExternalCalendarEvent) {
  return localDateTimeParts(event.start, event.timezone).date;
}

// End date (exclusive for all-day events per RFC 5545), or undefined.
export function externalEventEndDate(event: ExternalCalendarEvent) {
  return event.end ? localDateTimeParts(event.end, event.timezone).date : undefined;
}

export function externalEventStartTime(event: ExternalCalendarEvent) {
  return event.allDay ? undefined : localDateTimeParts(event.start, event.timezone).time;
}

export function externalEventEndTime(event: ExternalCalendarEvent) {
  return event.allDay || !event.end ? undefined : localDateTimeParts(event.end, event.timezone).time;
}
