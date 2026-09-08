// An external event, on its way back to Google
// (GOOGLE_CALENDAR_SYNC_DESIGN.md §6.2).
//
// The reverse of `inboundShape.ts`, and narrower on purpose. Inbound reads
// everything Google sends; this writes only the fields the app actually lets a
// person change — when, and what it is called, and what the note says. A patch
// that echoed back every field we happened to be holding would overwrite an
// attendee list, a conference link, a colour, with a stale copy of itself.
//
// Pure. `lib/googleCalendarEventWrite.ts` is the I/O around it.
import type { ExternalCalendarEvent } from "../../../types";

/** The fields a person may change from the calendar grid. */
export interface ExternalEventEdit {
  title?: string;
  description?: string;
  /** `HH:MM`, or empty to leave the time alone. Ignored for an all-day event. */
  startTime?: string;
  endTime?: string;
}

export interface GoogleWriteTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GoogleEventPatch {
  summary?: string;
  description?: string;
  start?: GoogleWriteTime;
  end?: GoogleWriteTime;
}

function isTime(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

/**
 * The day this event sits on, as Google would write it.
 *
 * Read off the stored `start`, which inbound normalised: a bare date for an
 * all-day event, and a UTC instant otherwise. The date part of a UTC instant is
 * NOT the day the reader sees it on when their zone crosses midnight, which is
 * why the zone is applied rather than the string sliced.
 */
function dayIn(instant: string, timezone: string | undefined): string {
  if (!instant.includes("T")) return instant.slice(0, 10);
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return instant.slice(0, 10);
  if (!timezone) return date.toISOString().slice(0, 10);
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * A wall-clock time on a day, in a zone, as an offset-free local string.
 *
 * Google accepts `dateTime` + `timeZone` and resolves the offset itself, which
 * is the form that survives a daylight-saving boundary. Computing the offset
 * here would bake in whichever one was current when the edit was made.
 */
function localDateTime(day: string, time: string): string {
  return `${day}T${time}:00`;
}

/**
 * What to PATCH, or null when the edit changes nothing.
 *
 * Null rather than an empty object: a PATCH with no fields still costs a
 * request, still bumps the etag, and still comes back on the next poll — which
 * makes it an edit as far as everything downstream is concerned.
 */
export function toGoogleEventPatch(
  event: ExternalCalendarEvent,
  edit: ExternalEventEdit,
): GoogleEventPatch | null {
  const patch: GoogleEventPatch = {};

  const title = edit.title?.trim();
  if (title && title !== event.title) patch.summary = title;

  if (edit.description !== undefined && edit.description !== (event.description ?? "")) {
    patch.description = edit.description;
  }

  // An all-day event has no clock to set, and writing one would silently turn
  // it into a timed event an hour long.
  if (!event.allDay && (isTime(edit.startTime) || isTime(edit.endTime))) {
    const zone = event.timezone;
    const day = dayIn(event.start, zone);
    if (isTime(edit.startTime)) {
      patch.start = { dateTime: localDateTime(day, edit.startTime), ...(zone ? { timeZone: zone } : {}) };
    }
    if (isTime(edit.endTime)) {
      const endDay = event.end ? dayIn(event.end, zone) : day;
      // An end before the start is the reader saying "until tomorrow morning",
      // which Google refuses outright if written on the same day.
      const crossesMidnight = isTime(edit.startTime) && edit.endTime < edit.startTime;
      patch.end = {
        dateTime: localDateTime(crossesMidnight ? nextDay(day) : endDay, edit.endTime),
        ...(zone ? { timeZone: zone } : {}),
      };
    }
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

/** The day after `date`, in UTC so the machine's own zone cannot move it. */
function nextDay(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

/**
 * The offset `zone` was at, around `instant`, in milliseconds.
 *
 * Formatting an instant into a zone and reading the result back as if it were
 * UTC gives the difference between the two, which is the offset. One pass, so a
 * time inside the hour a DST change removes can be off by that hour — the
 * authoritative value comes back from Google on the next poll regardless, and
 * this only has to be right enough for the grid not to jump in the meantime.
 */
function zoneOffsetMs(instant: number, zone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23",
    })
      .formatToParts(new Date(instant))
      .reduce<Record<string, string>>((acc, part) => {
        if (part.type !== "literal") acc[part.type] = part.value;
        return acc;
      }, {});
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return asUtc - instant;
  } catch {
    return 0;
  }
}

/** The instant a wall-clock time in `zone` names, in the form inbound stores. */
function instantOf(day: string, time: string, zone: string | undefined): string {
  const naive = Date.parse(`${day}T${time}:00Z`);
  if (Number.isNaN(naive)) return `${day}T${time}:00`;
  if (!zone) return new Date(naive).toISOString();
  return new Date(naive - zoneOffsetMs(naive, zone)).toISOString();
}

/**
 * The same edit, applied to our own record.
 *
 * Kept beside the patch so the two cannot drift: what the grid shows after an
 * edit and what Google is told about it are computed from one function each,
 * from the same input, in the same file.
 *
 * The stored form is the one INBOUND writes — a UTC instant with the zone
 * alongside — and not the local string Google is sent. They are the same moment
 * said two ways, and keeping our own record in the other way would make an
 * edited event jump on the grid of anyone reading it from a different zone,
 * until the next poll quietly moved it back.
 */
export function withExternalEdit(
  event: ExternalCalendarEvent,
  edit: ExternalEventEdit,
  now = new Date().toISOString(),
): ExternalCalendarEvent {
  const patch = toGoogleEventPatch(event, edit);
  if (!patch) return event;

  const next: ExternalCalendarEvent = { ...event, updatedAt: now };
  if (patch.summary) next.title = patch.summary;
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.start?.dateTime) {
    next.start = instantOf(patch.start.dateTime.slice(0, 10), patch.start.dateTime.slice(11, 16), event.timezone);
  }
  if (patch.end?.dateTime) {
    next.end = instantOf(patch.end.dateTime.slice(0, 10), patch.end.dateTime.slice(11, 16), event.timezone);
  }
  return next;
}
