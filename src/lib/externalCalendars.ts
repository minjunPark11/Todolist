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
  const prefix = `${name}`;
  const line = lines.find((item) => item.startsWith(`${prefix}:`) || item.startsWith(`${prefix};`));
  if (!line) return "";
  const colon = line.indexOf(":");
  return colon >= 0 ? line.slice(colon + 1) : "";
}

function parseIcsDate(value: string) {
  if (!value) return null;
  if (/^\d{8}$/.test(value)) {
    return { value: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`, allDay: true };
  }
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00", z] = match;
  const iso = z
    ? new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString()
    : `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  return { value: iso, allDay: false };
}

function timePart(value: string) {
  return value.includes("T") ? value.slice(11, 16) : undefined;
}

export function parseIcsEvents(text: string, calendarId: string): ExternalCalendarEvent[] {
  const lines = unfoldIcsLines(text);
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
      const start = parseIcsDate(getIcsValue(block, "DTSTART"));
      if (!start) {
        block = null;
        continue;
      }
      const end = parseIcsDate(getIcsValue(block, "DTEND"));
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
    const raw = window.localStorage.getItem(STORAGE_KEY);
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Keep in-memory state when storage is unavailable.
  }
}

export function createExternalCalendarDraft(name: string, icsUrl: string, color: string): ExternalCalendar {
  const now = new Date().toISOString();
  return {
    id: createId("external-calendar"),
    name: name.trim(),
    icsUrl: icsUrl.trim(),
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

export async function fetchExternalCalendarEvents(calendar: ExternalCalendar) {
  const response = await fetch(calendar.icsUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  return parseIcsEvents(text, calendar.id);
}

export function externalEventDate(event: ExternalCalendarEvent) {
  return event.start.slice(0, 10);
}

export function externalEventStartTime(event: ExternalCalendarEvent) {
  return event.allDay ? undefined : timePart(event.start);
}

export function externalEventEndTime(event: ExternalCalendarEvent) {
  return event.allDay || !event.end ? undefined : timePart(event.end);
}
