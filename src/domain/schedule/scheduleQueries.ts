// Everything the editor needs to know about a draft that is NOT stored
// (design §1.28, §2.7–2.9).
//
// Each of these was a candidate for a state field, and each is a function
// instead for the same reason: a stored copy of a derived value is a value
// that can drift from what it was derived from. §2.7 makes the case with
// `rangeStage` — a stored stage can say `complete` while `dueDate` is null,
// and every consumer downstream then has to decide which one to believe.
import type { RangeStage, Schedule, ScheduleDraft } from "./types";

/** True when anything about the "when" is set at all. */
export function hasSchedule(schedule: Schedule): boolean {
  return schedule.startDate !== null || schedule.dueDate !== null;
}

/**
 * How far along the range selection is (design §1.14, §2.7).
 *
 * Date mode has no range, and answers `complete` when it holds a date so that
 * "is this ready" reads the same in both modes.
 */
export function getRangeStage(draft: ScheduleDraft): RangeStage {
  if (draft.mode === "date") return draft.dueDate !== null ? "complete" : "empty";
  if (draft.startDate === null) return draft.dueDate === null ? "empty" : "complete";
  return draft.dueDate === null ? "start-selected" : "complete";
}

/**
 * The inclusive [start, end] the schedule covers, or null when it covers
 * nothing.
 *
 * A date-mode schedule spans one day, which is why this collapses to the same
 * date twice rather than returning null — callers drawing a bar should not
 * have to special-case the single-day form.
 */
export function scheduleSpan(schedule: Schedule): { start: string; end: string } | null {
  if (schedule.dueDate === null) {
    return schedule.startDate === null ? null : { start: schedule.startDate, end: schedule.startDate };
  }
  if (schedule.startDate === null) return { start: schedule.dueDate, end: schedule.dueDate };
  return schedule.startDate <= schedule.dueDate
    ? { start: schedule.startDate, end: schedule.dueDate }
    : { start: schedule.dueDate, end: schedule.startDate };
}

/** Inclusive day count, so a single-day schedule is 1 rather than 0. */
export function scheduleSpanDays(schedule: Schedule): number {
  const span = scheduleSpan(schedule);
  if (span === null) return 0;
  const start = Date.parse(`${span.start}T00:00:00Z`);
  const end = Date.parse(`${span.end}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1;
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

/**
 * True when the schedule carries a time of day.
 *
 * The calendar's all-day test is the absence of a block START
 * (`calendarItems.ts:237`), so that is what this asks — an end alone does not
 * make a timed block, and `normalizeSchedule` removes that shape anyway.
 */
export function isTimed(schedule: Schedule): boolean {
  return schedule.startTime !== null;
}

/**
 * A day with no time of its own (Chapter 26 §26.5.3).
 *
 * Derived, and deliberately not a stored `allDay` field — which is what the
 * Task Detail spec's own model proposes. Storing it makes
 * `allDay: true` beside `startTime: "14:00"` representable and meaningless;
 * deriving it makes that contradiction impossible to write down. The same
 * rule the schedule mode and the Eisenhower quadrant already follow.
 *
 * A schedule with no date at all is not all-day, it is unscheduled — so the
 * date is asked for first rather than reading "no time" as a yes.
 */
export function isAllDay(schedule: Schedule): boolean {
  return hasSchedule(schedule) && !isTimed(schedule);
}

/**
 * True when the schedule's last day is before `today` (design §4.60).
 *
 * A range is overdue on the day after its END, not its start — a task running
 * Monday to Friday is not late on Tuesday. Date-only comparison, so a task due
 * today is never overdue regardless of the time on it; whether an unfinished
 * 09:00 block counts as late at 10:00 is a product question this does not
 * answer.
 */
export function isOverdue(schedule: Schedule, today: string): boolean {
  const span = scheduleSpan(schedule);
  return span !== null && span.end < today;
}
