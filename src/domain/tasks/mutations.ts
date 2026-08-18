// Task mutations, as descriptions rather than actions
// (TickTick plan §16.29, §12.21, §9.35).
//
// Two rules drive the shape. §12.21 says every mutation is followed by asking
// whether the Task still belongs to the Scope it was changed in — and if not,
// removing it from the list, closing the Drawer if it was that Task, and
// offering Undo. §9.35 says Undo restores a state, not a reversed action.
//
// So a mutation here returns the patch to apply AND the patch that puts it
// back. The caller applies one now and keeps the other for as long as the
// toast lives. Deriving the undo from the task at the moment of change is what
// makes it exact: "reopen" is not the inverse of "complete" in general, only
// of completing THIS task, which was `todo` and not `waiting`.
import type { Task } from "../../types";
import type { TaskScopeRef } from "./scopeRegistry";
import { matchesScope, type ScopeContext } from "./scopeQuery";

export interface TaskMutation {
  patch: Partial<Task>;
  /** Applied to the same Task to put it back exactly as it was (§9.35). */
  undo: Partial<Task>;
  /** i18n key for the toast that offers the undo (§9.36). */
  labelKey: string;
}

/** §12.13. Soft, so Undo is a patch and not a resurrection. */
export function trashTask(task: Task, now: string): TaskMutation {
  return {
    patch: { deletedAt: now },
    // The field is optional, so "never deleted" and "deleted, then emptied"
    // are different values. Undo puts back the one that was there — coercing
    // absent to "" would leave a Task that reads as restored rather than as
    // untouched, and §9.35 asks for the state, not something like it.
    undo: { deletedAt: task.deletedAt },
    labelKey: "tasks.undoTrashed",
  };
}

export function restoreTask(task: Task): TaskMutation {
  return {
    patch: { deletedAt: "" },
    undo: { deletedAt: task.deletedAt },
    labelKey: "tasks.undoRestored",
  };
}

/**
 * §12.12. `completedAt` rides along because the audit found completion stored
 * twice with `status` winning; writing one and not the other is how the two
 * come to disagree.
 */
export function completeTask(task: Task, now: string): TaskMutation {
  return {
    patch: { status: "done", completedAt: task.completedAt || now },
    undo: { status: task.status, completedAt: task.completedAt },
    labelKey: "tasks.undoCompleted",
  };
}

export function reopenTask(task: Task): TaskMutation {
  return {
    // Back to what it was before it was finished, when that is known —
    // `previousStatus` is what the store keeps for exactly this.
    patch: { status: task.previousStatus && task.previousStatus !== "done" ? task.previousStatus : "todo", completedAt: "" },
    undo: { status: task.status, completedAt: task.completedAt },
    labelKey: "tasks.undoReopened",
  };
}

export function setTaskDueDate(task: Task, dueDate: string): TaskMutation {
  return {
    patch: { dueDate },
    undo: { dueDate: task.dueDate },
    labelKey: "tasks.undoDateChanged",
  };
}

export function setTaskSomeday(task: Task, someday: boolean): TaskMutation {
  return {
    patch: { isSomeday: someday },
    undo: { isSomeday: task.isSomeday },
    labelKey: "tasks.undoSomeday",
  };
}

/**
 * §12.21, and the reason mutations are described before they are applied.
 *
 * The question is asked against the Scope the user is standing in, with the
 * Task as it will be. A `true` here is what closes the Drawer and takes the
 * row out from under the cursor — so it is worth being exact: a Task that was
 * never in this Scope has not "left" it, and removing a row that was not
 * showing would be the list flickering for no reason.
 */
export function leavesScope(
  before: Task,
  after: Task,
  scope: TaskScopeRef,
  ctx: ScopeContext,
): boolean {
  return matchesScope(before, scope, ctx) && !matchesScope(after, scope, ctx);
}

/** The Task as it will be, without committing anything (§12.21's middle step). */
export function applyPatch(task: Task, patch: Partial<Task>): Task {
  return { ...task, ...patch };
}
