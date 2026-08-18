// The invariants a stored Schedule must satisfy (design §1.6, §1.25).
//
// There is no database constraint behind any of this. The Task lives in a
// jsonb blob (audit §2), so nothing between here and the calendar will reject
// a malformed schedule — which makes these functions load-bearing in a way
// they would not be against a real schema (audit §2.2).
//
// Two layers, because they answer different questions (design §1.25):
//
//   validateDraft    — may the user press Confirm?
//   validateSchedule — may this be written to a Task?
//
// A draft is allowed to be incomplete on its way somewhere (a range with no
// end yet). A record is not. Everything else is checked in both.
import { getRangeStage } from "./scheduleQueries";
import { isLocalDate, isLocalTime, type Schedule, type ScheduleDraft } from "./types";

/**
 * What is wrong, in a form the UI can map to a message.
 *
 * `field` names where to put the error, not what broke — `end-before-start`
 * belongs on the end even though it is a statement about the pair.
 */
export interface ScheduleIssue {
  code: ScheduleIssueCode;
  field: "startDate" | "dueDate" | "startTime" | "endTime";
  message: string;
}

export type ScheduleIssueCode =
  | "invalid-date-format"
  | "invalid-time-format"
  | "missing-due-date"
  | "end-before-start"
  | "time-without-date"
  | "end-time-without-start";

/**
 * Rules that hold for a draft AND a record.
 *
 * INV-01 is the only one that does not, so it lives in `validateSchedule`
 * alone: a draft mid-range legitimately has a start and no end (design §1.7).
 */
function commonIssues(schedule: Schedule): ScheduleIssue[] {
  const issues: ScheduleIssue[] = [];

  // INV-09 — formats. Checked first: every rule below compares these values,
  // and comparing a malformed date lexicographically produces a confident
  // wrong answer rather than an error.
  if (schedule.startDate !== null && !isLocalDate(schedule.startDate)) {
    issues.push({
      code: "invalid-date-format",
      field: "startDate",
      message: "Start date must be a real YYYY-MM-DD date.",
    });
  }
  if (schedule.dueDate !== null && !isLocalDate(schedule.dueDate)) {
    issues.push({
      code: "invalid-date-format",
      field: "dueDate",
      message: "Due date must be a real YYYY-MM-DD date.",
    });
  }
  if (schedule.startTime !== null && !isLocalTime(schedule.startTime)) {
    issues.push({
      code: "invalid-time-format",
      field: "startTime",
      message: "Start time must be HH:mm.",
    });
  }
  if (schedule.endTime !== null && !isLocalTime(schedule.endTime)) {
    issues.push({
      code: "invalid-time-format",
      field: "endTime",
      message: "End time must be HH:mm.",
    });
  }
  if (issues.length > 0) return issues;

  // INV-02 — a range cannot run backwards. Not auto-swapped, here or in the
  // commands: see `selectDate` for why a backwards pair is treated as a
  // re-pick rather than an ordering mistake (design §4.12).
  if (
    schedule.startDate !== null &&
    schedule.dueDate !== null &&
    schedule.startDate > schedule.dueDate
  ) {
    issues.push({
      code: "end-before-start",
      field: "dueDate",
      message: "The end date cannot be before the start date.",
    });
  }

  // INV-03 — a time needs a day to land on.
  const hasDate = schedule.startDate !== null || schedule.dueDate !== null;
  if (!hasDate && (schedule.startTime !== null || schedule.endTime !== null)) {
    issues.push({
      code: "time-without-date",
      field: "startTime",
      message: "A time needs a date.",
    });
  }

  // A block needs a start. This replaces the design's INV-04, which forbids
  // `startTime` in date mode entirely because §1.11 models date-mode time as a
  // single instant; this app keeps blocks in both modes (audit decision 1-b),
  // so the rule that matters is the one the calendar actually enforces — an
  // end with no start renders as all-day and the end is silently lost
  // (`calendarItems.ts:237`).
  if (schedule.endTime !== null && schedule.startTime === null) {
    issues.push({
      code: "end-time-without-start",
      field: "endTime",
      message: "An end time needs a start time.",
    });
  }

  // INV-05 — within one day, the block cannot end before it begins. Only
  // meaningful when both times sit on the SAME date: a range from the 27th
  // 09:00 to the 30th 08:00 is ninety-five hours, not negative one.
  const sameDay = schedule.startDate === null || schedule.startDate === schedule.dueDate;
  if (
    sameDay &&
    schedule.startTime !== null &&
    schedule.endTime !== null &&
    schedule.endTime < schedule.startTime
  ) {
    issues.push({
      code: "end-before-start",
      field: "endTime",
      message: "The end time cannot be before the start time.",
    });
  }

  return issues;
}

/**
 * May this draft be confirmed? (design §1.25, §2.9)
 *
 * An unfinished range is NOT reported here. It is a waypoint, not a mistake,
 * and surfacing "pick an end date" as an error the moment someone clicks a
 * start would be scolding them for using the feature. `canConfirm` keeps the
 * button disabled on its own (design §2.38).
 */
export function validateDraft(draft: ScheduleDraft): ScheduleIssue[] {
  return commonIssues(draft);
}

/**
 * May this be written to a Task? (design §1.6)
 *
 * Adds INV-01: a stored `startDate` without a `dueDate` is the one draft state
 * with no record equivalent, and letting it through would put a range with no
 * end into the calendar.
 */
export function validateSchedule(schedule: Schedule): ScheduleIssue[] {
  const issues = commonIssues(schedule);
  if (schedule.startDate !== null && schedule.dueDate === null) {
    issues.push({
      code: "missing-due-date",
      field: "dueDate",
      message: "A range needs an end date.",
    });
  }
  return issues;
}

/** True when `validateSchedule` finds nothing. */
export function isValidSchedule(schedule: Schedule): boolean {
  return validateSchedule(schedule).length === 0;
}

/**
 * True when the draft is complete enough AND clean enough to save
 * (design §2.9).
 */
export function isConfirmable(draft: ScheduleDraft): boolean {
  return validateDraft(draft).length === 0 && getRangeStage(draft) !== "start-selected";
}
