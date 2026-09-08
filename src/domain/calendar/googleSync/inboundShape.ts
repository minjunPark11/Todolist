// One Google event, as the record this app already knows how to draw
// (GOOGLE_CALENDAR_SYNC_DESIGN.md §6.2).
//
// The mirror of `eventShape.ts`, and deliberately the smaller of the two.
// Outbound had to invent a calendar event out of a Task; inbound is handed one
// that already has the shape, because §6.2's whole argument is that
// `ExternalCalendarEvent` and a Google event are the same thing written twice.
//
// Pure, and structural about its input: Google's resource is described by the
// half-dozen fields read here rather than by a package, for the reason
// `integrations/google/oauth.ts` gives about its own three form posts.
import { parseRRule } from "../../../lib/ics/parse";
import type { ExternalCalendarEvent } from "../../../types";

/** The half of Google's event resource this reads. */
export interface GoogleEventTimes {
  date?: unknown;
  dateTime?: unknown;
  timeZone?: unknown;
}

export interface GoogleEventResource {
  id?: unknown;
  status?: unknown;
  etag?: unknown;
  summary?: unknown;
  description?: unknown;
  location?: unknown;
  htmlLink?: unknown;
  start?: GoogleEventTimes;
  end?: GoogleEventTimes;
  recurrence?: unknown;
  recurringEventId?: unknown;
  originalStartTime?: GoogleEventTimes;
  updated?: unknown;
  /**
   * What KIND of event this is (GOOGLE_SYNC_HARDENING_DESIGN.md §8).
   *
   * `default` is an ordinary event. The other five — `birthday`, `fromGmail`,
   * `focusTime`, `outOfOffice`, `workingLocation` — refuse an ordinary PATCH or
   * accept only their own fields, and they live on calendars the account owns,
   * so `accessRole` alone says they are editable when they are not.
   */
  eventType?: unknown;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/** Google's word for "this event is gone" (§7.1). Nothing else means it. */
export function isCancelled(item: GoogleEventResource): boolean {
  return item.status === "cancelled";
}

export function googleEventId(item: GoogleEventResource): string {
  return typeof item.id === "string" ? item.id : "";
}

export function googleEtag(item: GoogleEventResource): string | undefined {
  return text(item.etag);
}

/**
 * The kind of event, as a value we can compare (§8.2).
 *
 * Absent reads as `default`, which is the permissive answer, and deliberately:
 * treating a missing field as "not editable" would silently lock every event in
 * the account the day Google stopped sending it. The cost of the other mistake
 * is one 400 from Google, which surfaces as a failed write and a visible
 * rollback — loud beats silent.
 */
export function googleEventType(item: GoogleEventResource): string {
  return text(item.eventType) ?? "default";
}

/**
 * A cancelled row that names one occurrence of a series, not an event
 * (GOOGLE_SYNC_HARDENING_DESIGN.md §5.1).
 *
 * Google says "this Tuesday's standup is off" with a row whose id is the
 * INSTANCE (`<masterId>_20260910T010000Z`), and the record we hold is the
 * series. Deleting by that id therefore finds nothing, which is why cancelling
 * one occurrence used to do nothing at all. What the series needs is an
 * exdate, and `originalStartTime` is where it comes from.
 *
 * Null when the row is an ordinary event — then the id-based deletion is right.
 */
export function cancelledOccurrenceOf(
  item: GoogleEventResource,
  defaultTimezone?: string,
): { masterUid: string; originalStart: string } | null {
  const masterUid = text(item.recurringEventId);
  if (!masterUid) return null;
  const original = moment(item.originalStartTime, defaultTimezone);
  if (!original) return null;
  return { masterUid, originalStart: original.value };
}

/**
 * A moment, in the form `lib/ics/parse.ts` already reads.
 *
 * All-day stays a bare date, because that is what `localDateTimeParts` uses to
 * recognise one — a date with no `T` in it. A timed event is converted to UTC
 * and carries its zone alongside, which is the branch that formats correctly
 * for a reader in a different zone. Google's `dateTime` arrives with an offset
 * (`2026-09-08T14:00:00+09:00`) and slicing that string would silently show
 * 14:00 to everyone on earth.
 */
function moment(times: GoogleEventTimes | undefined, fallbackZone?: string): {
  value: string;
  allDay: boolean;
  timezone?: string;
} | null {
  if (!times) return null;

  const date = text(times.date);
  if (date) return { value: date.slice(0, 10), allDay: true };

  const dateTime = text(times.dateTime);
  if (!dateTime) return null;

  const zone = text(times.timeZone) ?? fallbackZone;
  const parsed = new Date(dateTime);
  if (Number.isNaN(parsed.getTime())) return null;
  return { value: parsed.toISOString(), allDay: false, ...(zone ? { timezone: zone } : {}) };
}

/** `["RRULE:FREQ=WEEKLY;BYDAY=MO", "EXDATE;VALUE=DATE:20261225"]` */
function rules(value: unknown): { rrule?: string; exdates: string[] } {
  if (!Array.isArray(value)) return { exdates: [] };
  let rrule: string | undefined;
  const exdates: string[] = [];
  for (const line of value) {
    if (typeof line !== "string") continue;
    if (/^RRULE[:;]/i.test(line)) rrule ??= line.slice(line.indexOf(":") + 1);
    else if (/^EXDATE[:;]/i.test(line)) {
      for (const stamp of line.slice(line.indexOf(":") + 1).split(",")) {
        const trimmed = stamp.trim();
        if (trimmed) exdates.push(trimmed);
      }
    }
  }
  return { ...(rrule ? { rrule } : {}), exdates };
}

export interface ToExternalEventOptions {
  /** Our own id for the calendar this came from. */
  externalCalendarId: string;
  /** `accessRole` said owner or writer, so the app may edit it (§6.2). */
  writable: boolean;
  /** The calendar's own zone, for a timed event that names none. */
  defaultTimezone?: string;
  now?: string;
  /** Preserved so a re-list does not reset the record's age. */
  createdAt?: string;
}

/**
 * The record, or null when there is not enough of an event to draw.
 *
 * Null rather than a placeholder: an event with no id cannot be written back
 * to, and one with no start cannot be put on a day. Both would sit in the grid
 * as something the reader can neither use nor get rid of.
 */
export function toExternalEvent(
  item: GoogleEventResource,
  options: ToExternalEventOptions,
): ExternalCalendarEvent | null {
  const id = googleEventId(item);
  if (!id) return null;

  const start = moment(item.start, options.defaultTimezone);
  if (!start) return null;
  const end = moment(item.end, options.defaultTimezone);

  const now = options.now ?? new Date().toISOString();
  const { rrule, exdates } = rules(item.recurrence);
  const recurrence = rrule ? parseRRule(rrule, start.timezone) : null;
  // What this record stands in for, when it replaces one occurrence of a
  // series — the meeting that moved to Thursday that week (`types.ts`).
  const original = item.recurringEventId ? moment(item.originalStartTime, options.defaultTimezone) : null;

  // §8: the calendar may be writable and this event still not be. A birthday
  // or a Gmail-derived event sits on a calendar the account owns and refuses
  // the PATCH anyway, so the grid must not offer the edit.
  const eventType = googleEventType(item);
  const editable = options.writable && eventType === "default";

  return {
    id: `${options.externalCalendarId}:${id}`,
    externalCalendarId: options.externalCalendarId,
    externalUid: id,
    title: text(item.summary) || "Untitled event",
    description: text(item.description),
    location: text(item.location),
    start: start.value,
    end: end?.value,
    allDay: start.allDay,
    timezone: start.timezone,
    sourceUrl: text(item.htmlLink),
    readOnly: !editable,
    // Stored only when it is not the ordinary kind, so absent keeps meaning
    // `default` wherever it is read back — including out of storage.
    ...(eventType !== "default" ? { eventType } : {}),
    ...(googleEtag(item) ? { etag: googleEtag(item) } : {}),
    createdAt: options.createdAt ?? now,
    // Google's own `updated`, not ours: it is what the LWW comparison on a
    // refused write comes back to (`lib/googleCalendarOutbound.ts`).
    updatedAt: text(item.updated) ?? now,
    ...(recurrence ? { recurrence } : {}),
    ...(exdates.length ? { exdates } : {}),
    ...(original ? { recurrenceId: original.value } : {}),
  };
}
