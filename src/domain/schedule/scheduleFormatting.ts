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
import { formatClock } from "../../utils/clock";
import type { TimeFormat } from "../../types";

const DATE_FORMAT: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
const WITH_YEAR: Intl.DateTimeFormatOptions = { ...DATE_FORMAT, year: "numeric" };

function formatDate(date: string, locale: string, withYear: boolean): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, withYear ? WITH_YEAR : DATE_FORMAT);
}

/**
 * A wall-clock `HH:mm` as the locale writes it — `오후 6:00`, `6:00 PM`.
 *
 * Formatted through a throwaway UTC date pinned to the same day, so the clock
 * is the only thing Intl is being asked about. The 24-hour string is what is
 * stored and what `<input type="time">` speaks; this is only ever for reading.
 */
export function formatLocalTime(time: string, locale = "en-US"): string {
  return new Date(`2000-01-01T${time}:00Z`).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
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

  // An arrow rather than a dash for a range: the trigger sits inline in a
  // sentence of other fields, and `8월 25일 – 8월 28일` reads as one hyphenated
  // thing at small sizes where `→` cannot.
  if (span.start !== span.end) return `${start} → ${formatDate(span.end, locale, withYear)}`;
  // A time belongs to a single day; on a range it names one end and reads as
  // if it applied to both.
  return schedule.startTime ? `${start} · ${formatLocalTime(schedule.startTime, locale)}` : start;
}

/**
 * The Time row's summary, or "" when the schedule has no time (design §3.34).
 *
 * A range shows one time per end, because that is where each belongs (audit
 * 1-b): `startTime` is the first day starting, `endTime` is the last day
 * finishing. Writing them as a single "09:00 – 17:00" would read as one
 * afternoon rather than as the shape of a multi-day block.
 */
export function formatTimeSummary(
  schedule: Schedule,
  locale = "en-US",
  /**
   * The app's clock setting, where the caller has one
   * (SCHEDULE_TIME_FIELD_DESIGN.md §13.4).
   *
   * Optional and locale-shaped by default, because two of the three callers
   * are formatting for a place with no setting to read. Given, it wins: a
   * reader who chose 24 hours was being told `오후 11:00` by this row while
   * the field one line below said `23:00`.
   */
  timeFormat?: TimeFormat,
): string {
  if (schedule.startTime === null) return "";
  const write = (time: string) =>
    timeFormat ? formatClock(time, timeFormat, locale) : formatLocalTime(time, locale);
  const start = write(schedule.startTime);
  if (schedule.endTime === null) return start;
  const end = write(schedule.endTime);
  const sameDay = schedule.startDate === null || schedule.startDate === schedule.dueDate;
  return sameDay ? `${start} – ${end}` : `${start} → ${end}`;
}
