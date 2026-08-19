// What state a Task is in, in one place (Nav Shell audit D-24).
//
// Before this file the answer was written out by hand in seventeen places and
// named three different things. Worse, "active" meant three different things:
//
//   scopeQuery.isTaskActive     alive AND its owning List is alive
//   utils/planner.isActiveTask  alive
//   selectors.selectActiveTasks alive AND not finished
//
// So a screen picking the one whose name sounded right got a different answer
// depending on which module it imported from. The audit's own note on
// `scopeQuery.isTaskActive` said why that matters — an archived task showing
// up in Today should be one decision here, not a bug in nine places — and
// then nothing outside that file ever called it.
//
// Two axes, kept apart on purpose:
//
//   1. The Task's OWN state. That is this file, and it needs nothing but the
//      Task.
//   2. Whether its CONTAINER is alive. That needs the Lists, so it stays in
//      `scopeQuery.isTaskActive`, which composes the two.
//
// Splitting them is what lets the modules with no access to Lists — the
// reminder queue, calendar sharing, the AI context builder — ask the first
// question without being handed a collection they have no other use for.
import type { Task } from "../../types";

/**
 * The four fields these predicates read, and nothing else.
 *
 * Structural rather than `Task` so that callers holding a narrower shape —
 * the reminder queue's `ReminderTaskSource`, for one — can ask the same
 * question instead of keeping a second copy of the rule. A real `Task`
 * satisfies it.
 */
export interface TaskStateFields {
  status?: Task["status"] | string;
  completedAt?: string;
  deletedAt?: string;
  wontDoAt?: string;
}

/** Thrown away and recoverable (§13.20). */
export function isTrashed(task: TaskStateFields): boolean {
  return Boolean(task.deletedAt);
}

/**
 * Given up on (D-23).
 *
 * The legacy `archived` status reads as Won't Do here, which is what D-20
 * decides it becomes. Doing it in the predicate rather than only in a
 * migration means every screen agrees from the moment this ships, and the
 * migration is then a data cleanup rather than a change in behaviour. The
 * `status` arm goes when P0-4b-3 has moved the records.
 */
export function isWontDo(task: TaskStateFields): boolean {
  return Boolean(task.wontDoAt) || task.status === "archived";
}

/**
 * Finished.
 *
 * Reads `status` and not `completedAt`, because those two disagree and
 * `status` is the one the app has always believed — see D-23's table. This is
 * the shape `wontDoAt` was deliberately not given.
 */
export function isCompleted(task: TaskStateFields): boolean {
  return task.status === "done";
}

/**
 * Does this Task still exist for the user?
 *
 * The question every screen asks before showing anything. Trashed and given
 * up on are out; finished is NOT — a completed task still exists, and screens
 * that want to exclude it are asking the next question instead.
 */
export function isTaskAlive(task: TaskStateFields): boolean {
  return !isTrashed(task) && !isWontDo(task);
}

/**
 * Is this Task still something to do?
 *
 * Alive, and not finished. This is what Focus, the reminder queue and the
 * unscheduled-task lists want — they are offering the user work, and work
 * that is done, dropped or deleted is not work.
 */
export function isTaskOpen(task: TaskStateFields): boolean {
  return isTaskAlive(task) && !isCompleted(task);
}
