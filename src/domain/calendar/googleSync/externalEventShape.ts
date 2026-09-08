// An external event, on its way back to Google
// (GOOGLE_CALENDAR_SYNC_DESIGN.md §6.2).
//
// The reverse of `inboundShape.ts`, and narrower on purpose. Inbound reads
// everything Google sends; this writes only the fields the app actually lets a
// person change — when, and what it is called, and what the note says. A patch
// that echoed back every field we happened to be holding would overwrite an
// attendee list, a conference link, a colour, with a stale copy of itself.
//
// "When" is a day as well as a clock. The popover could only ever move an event
// inside its own day, so the day was read off the record and never written; the
// grid's own gestures — drag across a column, drop on the all-day band, drag a
// chip down into the time grid — all say a day, and two of them say whether it
// is an all-day event at all. Those are the same edit expressed three ways, so
// they land in one place here rather than three at the call sites.
//
// Pure. `lib/googleCalendarEventWrite.ts` is the I/O around it.
import type { ExternalCalendarEvent } from "../../../types";

/** The fields a person may change from the calendar grid. */
export interface ExternalEventEdit {
  title?: string;
  description?: string;
  /** `YYYY-MM-DD`. Absent leaves the event on the day it is already on. */
  date?: string;
  /** `HH:MM`, or empty to leave the time alone. Ignored for an all-day event. */
  startTime?: string;
  endTime?: string;
  /**
   * Which kind of event this becomes.
   *
   * Absent means "whatever it already is" — the ordinary case, where an edit
   * changes when something happens and not what sort of thing it is. The drop
   * on the all-day band says `true`, the drag from that band into the time grid
   * says `false` and brings the clock the grid dropped it at.
   */
  allDay?: boolean;
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

function isDate(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
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
 * The clock this event shows, in its own zone — the other half of `dayIn`.
 *
 * Needed because a drag across a column says the day and nothing about the
 * time: keeping the clock means reading it, and reading it off the UTC string
 * would move a 14:00 meeting to 05:00 for everyone in Seoul.
 *
 * `hourCycle: "h23"` and no `hour12`, for the reason spelled out over
 * `zoneOffsetMs` below: asking two ways reports midnight as hour 24.
 */
function clockIn(instant: string, timezone: string | undefined): string {
  if (!instant.includes("T")) return "";
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      ...(timezone ? { timeZone: timezone } : { timeZone: "UTC" }),
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

/** `date` shifted by `days`, in UTC so the machine's own zone cannot move it. */
function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return date;
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, negative when `to` is the earlier one. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * How many days an all-day event covers. At least one.
 *
 * Google's `end.date` is exclusive, so a single day reads as start + 1. The
 * span is preserved across a move because a three-day trip dragged onto Friday
 * is still a three-day trip; collapsing it to one day would be an edit nobody
 * asked for, made on the way to the one they did.
 */
function allDaySpan(event: ExternalCalendarEvent): number {
  if (!event.end) return 1;
  return Math.max(1, daysBetween(event.start.slice(0, 10), event.end.slice(0, 10)));
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

/** The event's current position, said the way a patch would say it. */
function currentWriteTime(
  instant: string | undefined,
  allDay: boolean,
  zone: string | undefined,
): GoogleWriteTime | undefined {
  if (!instant) return undefined;
  if (allDay) return { date: instant.slice(0, 10) };
  return { dateTime: localDateTime(dayIn(instant, zone), clockIn(instant, zone)), ...(zone ? { timeZone: zone } : {}) };
}

function sameTime(a: GoogleWriteTime | undefined, b: GoogleWriteTime | undefined): boolean {
  if (!a || !b) return false;
  return a.date === b.date && a.dateTime === b.dateTime && a.timeZone === b.timeZone;
}

/**
 * Where the event should end up, minus whatever it already says.
 *
 * The subtraction is the point. Every grid gesture reports a whole position —
 * a resize of the bottom edge still names the start it did not touch — and
 * sending the parts that did not move would bump the etag, come back on the
 * next poll, and read downstream as somebody else's edit (§6.3).
 */
function toGoogleTimes(
  event: ExternalCalendarEvent,
  edit: ExternalEventEdit,
): { start?: GoogleWriteTime; end?: GoogleWriteTime } {
  const zone = event.timezone;
  const wantsAllDay = edit.allDay ?? event.allDay;
  const day = isDate(edit.date) ? edit.date : dayIn(event.start, zone);

  let next: { start?: GoogleWriteTime; end?: GoogleWriteTime };
  if (wantsAllDay) {
    const span = event.allDay ? allDaySpan(event) : 1;
    next = { start: { date: day }, end: { date: addDays(day, span) } };
  } else {
    // An all-day event has no clock, so the only thing that can give it one is
    // an edit that names it. The drag into the time grid does; a drop onto
    // another day in the month grid does not, and turning that into a timed
    // event at an invented hour is worse than leaving it all-day.
    const startClock = isTime(edit.startTime) ? edit.startTime : event.allDay ? "" : clockIn(event.start, zone);
    if (!startClock) return {};

    const endClock = isTime(edit.endTime)
      ? edit.endTime
      : event.allDay || !event.end
        ? ""
        : clockIn(event.end, zone);
    // A move keeps the number of days the event spanned; an explicit end names
    // its own day, and one at or before the start means "until tomorrow
    // morning", which Google refuses outright written on a single day.
    const keepsSpan = !isTime(edit.endTime) && !event.allDay && Boolean(event.end);
    const endDay = keepsSpan
      ? addDays(day, daysBetween(dayIn(event.start, zone), dayIn(event.end as string, zone)))
      : endClock && endClock < startClock
        ? addDays(day, 1)
        : day;

    next = {
      start: { dateTime: localDateTime(day, startClock), ...(zone ? { timeZone: zone } : {}) },
      ...(endClock
        ? { end: { dateTime: localDateTime(endDay, endClock), ...(zone ? { timeZone: zone } : {}) } }
        : {}),
    };
  }

  const current = {
    start: currentWriteTime(event.start, event.allDay, zone),
    end: currentWriteTime(event.end, event.allDay, zone),
  };
  return {
    ...(next.start && !sameTime(next.start, current.start) ? { start: next.start } : {}),
    ...(next.end && !sameTime(next.end, current.end) ? { end: next.end } : {}),
  };
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

  const times = toGoogleTimes(event, edit);
  if (times.start) patch.start = times.start;
  if (times.end) patch.end = times.end;

  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * The offset `zone` was at, around `instant`, in milliseconds.
 *
 * Formatting an instant into a zone and reading the result back as if it were
 * UTC gives the difference between the two, which is the offset. One pass, so a
 * time inside the hour a DST change removes can be off by that hour — the
 * authoritative value comes back from Google on the next poll regardless, and
 * this only has to be right enough for the grid not to jump in the meantime.
 *
 * `hour12: false` is NOT passed, and that is the whole of a day-long bug. On
 * older engines it overrides `hourCycle` and reports midnight as hour 24 of the
 * PREVIOUS day's number — except the day number has already rolled over, so
 * `Date.UTC` reads "the 9th at 24:00", rolls it again, and the offset comes back
 * a full day too large. Every event at midnight in its own zone moved a day.
 * `hourCycle: "h23"` alone says the same thing and is honoured everywhere; the
 * modulo below is the belt to its braces.
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
      Number(parts.hour) % 24,
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
 * alongside for a timed event, a bare date for an all-day one — and not the
 * local string Google is sent. A timed event's two forms are the same moment
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
  // The kind of event follows the form the patch writes the start in, because
  // that is exactly what Google will decide when it reads the same patch.
  if (patch.start?.date) {
    next.start = patch.start.date;
    next.allDay = true;
  } else if (patch.start?.dateTime) {
    next.start = instantOf(patch.start.dateTime.slice(0, 10), patch.start.dateTime.slice(11, 16), event.timezone);
    next.allDay = false;
  }
  if (patch.end?.date) {
    next.end = patch.end.date;
  } else if (patch.end?.dateTime) {
    next.end = instantOf(patch.end.dateTime.slice(0, 10), patch.end.dateTime.slice(11, 16), event.timezone);
  }
  return next;
}
