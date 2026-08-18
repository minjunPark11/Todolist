// The one place a Task's schedule changes (design §13, audit §7 Phase 4).
//
// Every writer — the calendar's drop, the editor's Confirm, whatever comes
// next — asks this what to write instead of assembling a patch itself. Three
// things have to happen on every write and each was previously nobody's job:
//
//   normalize   the record must never hold a shape the readers cannot read,
//               and there is no DB constraint to catch one (audit §2.2)
//   validate    a rejected write is better than a repaired one when a caller
//               is asserting something impossible
//   no-op       confirming an unchanged schedule must not write (design §2.28)
//
// Pure and synchronous. It decides WHAT to write; the caller still owns the
// writing, because persistence here is a whole-document save queue rather than
// a per-record round trip, and a domain function has no business knowing that.
import { schedulesEqual } from "./scheduleEquality";
import { scheduleFromTask, scheduleToTaskPatch, type TaskScheduleSource } from "./taskSchedule";
import { validateSchedule, type ScheduleIssue } from "./validateSchedule";
import type { Schedule } from "./types";

export interface ScheduleUpdatePlan {
  /**
   * Fields to write, or null when there is nothing to do.
   *
   * Null covers both "the schedule is already this" and "the request was
   * invalid" — `issues` is what tells those apart. Callers that only want to
   * know whether to write can check this alone.
   */
  patch: Required<TaskScheduleSource> | null;
  /** Empty when the request was accepted. */
  issues: ScheduleIssue[];
  /** True when the schedule was already what the caller asked for. */
  unchanged: boolean;
}

/**
 * What writing `next` onto `task` should do.
 *
 * The comparison runs against the task's CONSOLIDATED schedule, not its raw
 * fields, so a record still carrying the legacy work day counts as unchanged
 * when the caller asks for the schedule that record already means. Cleaning up
 * the stored shape is the rewrite phase's job (audit §7.1); doing it as a side
 * effect of closing an editor would make "I changed nothing" write a row.
 *
 * Invalid requests are rejected rather than repaired, which is why validation
 * runs on what the caller passed and not on its normalized form — normalizing
 * first would swap a backwards range into a valid one and report success for a
 * request nobody should have made. `normalizeSchedule` exists for data already
 * on disk, where refusing helps nobody; a live caller asking for an end before
 * its start is a bug, and quietly moving the dates would hide it.
 *
 * What gets written is still canonical: `scheduleToTaskPatch` normalizes, so a
 * valid-but-redundant shape (a range whose ends are the same day) is stored as
 * the plain date it means.
 */
export function planScheduleUpdate(task: TaskScheduleSource, next: Schedule): ScheduleUpdatePlan {
  const issues = validateSchedule(next);
  if (issues.length > 0) return { patch: null, issues, unchanged: false };

  const current = scheduleFromTask(task);
  if (schedulesEqual(current, next)) return { patch: null, issues: [], unchanged: true };

  return { patch: scheduleToTaskPatch(next), issues: [], unchanged: false };
}
