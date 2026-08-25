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
import type { Task, TaskLifecycle } from "../../types";

/**
 * The five fields these predicates read, and nothing else.
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
  pinnedAt?: string;
}

/**
 * Kept at hand (§15.6).
 *
 * Orthogonal to everything else here, which is §15.7 as a fact about the
 * data rather than a rule to remember: nothing below reads `pinnedAt`, and
 * this reads nothing but `pinnedAt`. A pinned Task can be completed, dated,
 * in any List, and none of those answers changes because it is pinned.
 */
export function isPinned(task: TaskStateFields): boolean {
  return Boolean(task.pinnedAt);
}

/** Thrown away and recoverable (§13.20). */
export function isTrashed(task: TaskStateFields): boolean {
  return Boolean(task.deletedAt);
}

/**
 * Given up on (D-23).
 *
 * Three spellings, one question. `wontDoAt` is the field D-20 introduced,
 * `wont_do` is the lifecycle value written since Chapter 26 §26.3.2, and
 * `archived` is what accounts written before either still carry. Reading all
 * three here is what lets a legacy record answer correctly without being
 * rewritten — the same expand/migrate/contract the List membership follows.
 */
export function isWontDo(task: TaskStateFields): boolean {
  return Boolean(task.wontDoAt) || task.status === "wont_do" || task.status === "archived";
}

/**
 * Finished.
 *
 * Reads `status` and not `completedAt`, because those two disagree and
 * `status` is the one the app has always believed — see D-23's table. This is
 * the shape `wontDoAt` was deliberately not given.
 *
 * Two spellings: `completed` since Chapter 26 §26.3.2, `done` for everything
 * written before it.
 */
export function isCompleted(task: TaskStateFields): boolean {
  return task.status === "completed" || task.status === "done";
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

// === What the legacy values still answer ===
//
// `doing`, `waiting` and `inbox` were never lifecycle. Chapter 26 §26.3.2
// split them off: the first two are a List's Section (`Task.sectionId`) and
// the third is List membership. Nothing writes them any more.
//
// They are still READ, because accounts have them stored. `migrateWorkflowStatus`
// (hooks/usePlannerData) moves the first two into real Sections on load,
// which is what eventually makes these two answer false for everyone.

/** In flight, as a record written before §26.3.4 spells it. */
export function isInProgress(task: TaskStateFields): boolean {
  return task.status === "doing";
}

/** Parked, as a record written before §26.3.4 spells it. */
export function isWaiting(task: TaskStateFields): boolean {
  return task.status === "waiting";
}

/**
 * Not filed yet, as a record written before §26.3.4 spells it.
 *
 * The canonical answer is List membership — the owning List's `kind`, which
 * is how `scopeQuery` has always asked it. Callers that hold the Lists should
 * ask that instead; this covers the ones that hold a Task and nothing else.
 */
export function isUnsorted(task: TaskStateFields): boolean {
  return task.status === "inbox";
}

/**
 * The lifecycle value to WRITE. Never a legacy spelling.
 *
 * A constant rather than a literal at each call site: the point of §26.3.2 is
 * that three values exist, and a screen typing `"open"` inline is a screen
 * that could just as easily type `"todo"`.
 */
export const LIFECYCLE = {
  open: "open",
  completed: "completed",
  wontDo: "wont_do",
} as const satisfies Record<string, TaskLifecycle>;
