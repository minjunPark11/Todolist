// Turning a repeating event into the occurrences that fall inside a range.
//
// Why this is not optional (FOCUSFLOW_EXTERNAL_AI_ACCESS_ARCHITECTURE.md
// §9.2.1): without it, a weekly 2 p.m. meeting appears once, on the day it was
// first created. In a drawn calendar that is a missing row. To anything
// reasoning over the calendar it is worse than missing — the hours read as
// free, and a recommendation lands inside a meeting.
//
// Pure: dates in, dates out, no clock and no network. The one concession is
// `Intl`, used only to read a UTC stamp in a named zone.
import type { ExternalCalendarEvent, IcsRecurrence } from "../../types";
import { localDateTimeParts } from "./parse";

/**
 * A rule with no `UNTIL` and no `COUNT` repeats forever, and the range is not
 * always enough of a fence — a daily rule over a 92-day window is 92 rows, but
 * a malformed one could ask for far more. This is the backstop.
 */
const MAX_OCCURRENCES_PER_EVENT = 400;

const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

function toUtcDate(dateValue: string): Date {
  return new Date(`${dateValue}T00:00:00Z`);
}

function toDateValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(dateValue: string, days: number): string {
  const date = toUtcDate(dateValue);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateValue(date);
}

function addMonths(dateValue: string, months: number): string {
  const date = toUtcDate(dateValue);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  // "The 31st, monthly" has no February. RFC 5545 says skip such a month
  // rather than slide into March; clamping would invent a meeting on a day the
  // rule never named.
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  if (day > lastDay) return "";
  date.setUTCDate(day);
  return toDateValue(date);
}

function weekdayCodeOf(dateValue: string): string {
  return WEEKDAY_CODES[toUtcDate(dateValue).getUTCDay()];
}

/**
 * The wall-clock date an event starts on, in the frame the recurrence lives in.
 *
 * RFC 5545 computes a recurrence in DTSTART's own timezone, which is what makes
 * a weekly 9 a.m. stay 9 a.m. across a daylight-saving change instead of
 * drifting to 8 or 10.
 */
function baseDateOf(event: ExternalCalendarEvent, viewerTimezone?: string): string {
  return localDateTimeParts(event.start, event.timezone, viewerTimezone).date;
}

/** Whole days from the start of the event to the start of its last day. */
function spanDaysOf(event: ExternalCalendarEvent, viewerTimezone?: string): number {
  if (!event.end) return 0;
  const start = baseDateOf(event, viewerTimezone);
  const end = localDateTimeParts(event.end, event.timezone, viewerTimezone).date;
  const delta = Math.round((toUtcDate(end).getTime() - toUtcDate(start).getTime()) / 86400000);
  return Number.isFinite(delta) && delta > 0 ? delta : 0;
}

/**
 * Rebuild one occurrence's `start`/`end` on a different date, keeping the time
 * of day the master had.
 *
 * Emitted as floating local values rather than as UTC instants, deliberately.
 * A floating value is read as already being wall time in `event.timezone`
 * (see `localDateTimeParts`), which is exactly what the recurrence produced —
 * and it means an occurrence after a DST change reads as the same clock time,
 * not an hour off.
 */
function occurrenceAt(
  event: ExternalCalendarEvent,
  dateValue: string,
  spanDays: number,
  viewerTimezone?: string,
): { start: string; end?: string } {
  if (event.allDay) {
    return {
      start: dateValue,
      end: event.end ? addDays(dateValue, Math.max(spanDays, 1)) : undefined,
    };
  }
  const startTime = localDateTimeParts(event.start, event.timezone, viewerTimezone).time ?? "00:00";
  const endTime = event.end ? localDateTimeParts(event.end, event.timezone, viewerTimezone).time : undefined;
  return {
    start: `${dateValue}T${startTime}:00`,
    end: endTime ? `${addDays(dateValue, spanDays)}T${endTime}:00` : undefined,
  };
}

/**
 * The dates a rule produces, from its start, bounded by the range and the cap.
 *
 * Walked by index rather than by moving a cursor, because a cursor cannot
 * express "this month has no 31st". Stepping from the start each time means a
 * skipped month is skipped and not the end of the series.
 */
function occurrenceDates(
  rule: IcsRecurrence,
  startDate: string,
  rangeEnd: string,
  untilDate: string | undefined,
): string[] {
  const dates: string[] = [];
  const limit = rule.count ?? Number.POSITIVE_INFINITY;
  const stopAt = untilDate && untilDate < rangeEnd ? untilDate : rangeEnd;
  const full = () => dates.length >= limit || dates.length >= MAX_OCCURRENCES_PER_EVENT;

  // WEEKLY with BYDAY is the one shape that yields several dates per step, so
  // it walks weeks and fans out inside each.
  if (rule.freq === "WEEKLY" && rule.byDay?.length) {
    let weekStart = addDays(startDate, -toUtcDate(startDate).getUTCDay());
    for (let step = 0; step < MAX_OCCURRENCES_PER_EVENT && !full(); step += 1) {
      if (weekStart > stopAt) break;
      for (const code of WEEKDAY_CODES) {
        if (full()) break;
        if (!rule.byDay.includes(code)) continue;
        const candidate = addDays(weekStart, WEEKDAY_CODES.indexOf(code));
        if (candidate < startDate || candidate > stopAt) continue;
        dates.push(candidate);
      }
      weekStart = addDays(weekStart, 7 * rule.interval);
    }
    return dates;
  }

  // MONTHLY/YEARLY naming days other than DTSTART's: walk months, and within
  // each emit the days the rule named. Without this, a rule whose DTSTART
  // falls on the 5th while BYMONTHDAY says 15 produces nothing at all.
  const monthly = rule.freq === "MONTHLY" || rule.freq === "YEARLY";
  if (monthly && rule.byMonthDay?.length) {
    const monthStep = rule.freq === "YEARLY" ? 12 * rule.interval : rule.interval;
    const named = [...rule.byMonthDay].sort((a, b) => a - b);
    for (let step = 0; step < MAX_OCCURRENCES_PER_EVENT && !full(); step += 1) {
      const monthAnchor = addMonths(`${startDate.slice(0, 8)}01`, step * monthStep);
      if (!monthAnchor) continue;
      if (monthAnchor.slice(0, 7) > stopAt.slice(0, 7)) break;
      for (const day of named) {
        if (full()) break;
        const candidate = `${monthAnchor.slice(0, 8)}${String(day).padStart(2, "0")}`;
        // Rejects the 31st of a 30-day month: the round trip only survives a
        // date that exists.
        if (toDateValue(toUtcDate(candidate)) !== candidate) continue;
        if (candidate < startDate || candidate > stopAt) continue;
        dates.push(candidate);
      }
    }
    return dates;
  }

  for (let step = 0; step < MAX_OCCURRENCES_PER_EVENT && !full(); step += 1) {
    let candidate: string;
    switch (rule.freq) {
      case "DAILY":
        candidate = addDays(startDate, step * rule.interval);
        break;
      case "WEEKLY":
        candidate = addDays(startDate, 7 * step * rule.interval);
        break;
      case "MONTHLY":
        candidate = addMonths(startDate, step * rule.interval);
        break;
      default:
        candidate = addMonths(startDate, 12 * step * rule.interval);
        break;
    }
    // "" is a month with no such day — skip it and keep going, which is what
    // RFC 5545 asks for and what a cursor-based walk got wrong.
    if (!candidate) continue;
    if (candidate > stopAt) break;
    if (rule.byDay?.length && !rule.byDay.includes(weekdayCodeOf(candidate))) continue;
    dates.push(candidate);
  }

  return dates;
}

export interface ExpandOptions {
  /** Which zone to read a UTC stamp in when the calendar named none. */
  viewerTimezone?: string;
}

/**
 * Every occurrence that touches `[from, to]`, with edited ones substituted and
 * cancelled ones dropped.
 *
 * Non-repeating events pass through unchanged when they intersect the range, so
 * a caller can hand over a whole calendar and get back what to draw.
 */
export function expandIcsOccurrences(
  events: ExternalCalendarEvent[],
  range: { from: string; to: string },
  options: ExpandOptions = {},
): ExternalCalendarEvent[] {
  const { viewerTimezone } = options;
  const overrides = new Map<string, ExternalCalendarEvent>();
  const masters: ExternalCalendarEvent[] = [];

  for (const event of events) {
    if (event.recurrenceId) {
      // Keyed by the date the occurrence WAS on, which is what RECURRENCE-ID
      // names — an occurrence moved to another day still replaces the one it
      // came from.
      const date = localDateTimeParts(event.recurrenceId, event.timezone, viewerTimezone).date;
      overrides.set(`${event.externalCalendarId}:${event.externalUid}:${date}`, event);
      continue;
    }
    masters.push(event);
  }

  const expanded: ExternalCalendarEvent[] = [];

  for (const master of masters) {
    const startDate = baseDateOf(master, viewerTimezone);
    const spanDays = spanDaysOf(master, viewerTimezone);

    if (!master.recurrence) {
      const endDate = master.end
        ? localDateTimeParts(master.end, master.timezone, viewerTimezone).date
        : startDate;
      if (endDate >= range.from && startDate <= range.to) expanded.push(master);
      continue;
    }

    // UNTIL is an instant, not a day. Reduced to a date it lets one occurrence
    // too many through whenever the two disagree — a rule ending
    // 20260304T235959Z read in Asia/Seoul is the 5th at 08:59, and the 5th's
    // 09:00 meeting is past the end the organiser set.
    const until = master.recurrence.until
      ? localDateTimeParts(master.recurrence.until, master.timezone, viewerTimezone)
      : undefined;
    const untilDate = until?.date;

    const cancelled = new Set(
      (master.exdates ?? []).map((value) => localDateTimeParts(value, master.timezone, viewerTimezone).date),
    );

    for (const date of occurrenceDates(master.recurrence, startDate, range.to, untilDate)) {
      // An occurrence that starts before the range can still run into it.
      if (addDays(date, spanDays) < range.from) continue;
      if (cancelled.has(date)) continue;
      // Same day as UNTIL: the time decides.
      if (until?.time && date === until.date) {
        const startTime = localDateTimeParts(master.start, master.timezone, viewerTimezone).time ?? "00:00";
        if (startTime > until.time) continue;
      }

      const key = `${master.externalCalendarId}:${master.externalUid}:${date}`;
      const override = overrides.get(key);
      if (override) {
        const movedTo = baseDateOf(override, viewerTimezone);
        if (movedTo >= range.from && movedTo <= range.to) {
          expanded.push({ ...override, id: key, occurrenceOf: master.externalUid });
        }
        continue;
      }

      const { start, end } = occurrenceAt(master, date, spanDays, viewerTimezone);
      expanded.push({
        ...master,
        // Each occurrence gets its own id. Sharing the master's — which is what
        // happened before this module existed — meant a list keyed by id showed
        // one of them and silently dropped the rest.
        id: key,
        start,
        end,
        occurrenceOf: master.externalUid,
        // The rule belongs to the master, not to a date it produced.
        recurrence: undefined,
        exdates: undefined,
      });
    }
  }

  return expanded;
}
