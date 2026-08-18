// How a schedule reads on the trigger (design §2.28, §19.5).
//
// In the domain rather than the component because more than one place shows
// it — the task detail today, a list row and a chip later — and three of them
// inventing three formats is how "Aug 20" and "8/20" and "2026-08-20" end up
// on the same screen.
//
// Intl only. No `Date` arithmetic, no timezone conversion: these are
// wall-clock dates (see `Schedule.timezone`), so they are formatted as written
// and pinned to UTC so that a viewer west of the date line does not see
// yesterday.
import { scheduleSpan } from "./scheduleQueries";
import type { Schedule } from "./types";

const DATE_FORMAT: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
const WITH_YEAR: Intl.DateTimeFormatOptions = { ...DATE_FORMAT, year: "numeric" };

function formatDate(date: string, locale: string, withYear: boolean): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, withYear ? WITH_YEAR : DATE_FORMAT);
}

/**
 * A one-line label, or "" when there is no schedule.
 *
 * Empty rather than a placeholder: the caller knows what its own empty state
 * should say, and a domain function guessing at "No date" would put an English
 * string in a Korean UI.
 *
 * The year appears only when the schedule leaves `today`'s year, which is the
 * rule that keeps the common case short without ever being ambiguous.
 */
export function formatScheduleTrigger(schedule: Schedule, today: string, locale = "en-US"): string {
  const span = scheduleSpan(schedule);
  if (span === null) return "";

  const year = today.slice(0, 4);
  const withYear = span.start.slice(0, 4) !== year || span.end.slice(0, 4) !== year;
  const start = formatDate(span.start, locale, withYear);

  if (span.start !== span.end) return `${start} – ${formatDate(span.end, locale, withYear)}`;
  // A time belongs to a single day; on a range it names one end and reads as
  // if it applied to both.
  return schedule.startTime ? `${start} ${schedule.startTime}` : start;
}

/**
 * The Time row's summary, or "" when the schedule has no time (design §3.34).
 *
 * A range shows one time per end, because that is where each belongs (audit
 * 1-b): `startTime` is the first day starting, `endTime` is the last day
 * finishing. Writing them as a single "09:00 – 17:00" would read as one
 * afternoon rather than as the shape of a multi-day block.
 */
export function formatTimeSummary(schedule: Schedule): string {
  if (schedule.startTime === null) return "";
  if (schedule.endTime === null) return schedule.startTime;
  const sameDay = schedule.startDate === null || schedule.startDate === schedule.dueDate;
  return sameDay
    ? `${schedule.startTime} – ${schedule.endTime}`
    : `${schedule.startTime} → ${schedule.endTime}`;
}
