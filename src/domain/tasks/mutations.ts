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
import type { List, ListSection, Task } from "../../types";
import type { TaskScopeRef } from "./scopeRegistry";
import { matchesScope, type ScopeContext } from "./scopeQuery";
import { sectionIdFor } from "./sections";
import { LIFECYCLE } from "./taskState";

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

/**
 * Gives up on a Task without deleting it (audit D-23).
 *
 * Writes one field and nothing else. That is not minimalism — it is what
 * makes the two P0 rules true by construction:
 *
 *   - a repeating Task keeps its `repeat`, so only this occurrence is given
 *     up on and the rule still produces the next one;
 *   - children are untouched, because a field on a parent is not a field on
 *     its children.
 *
 * `status` is left alone too, which is why undoing needs nothing but the old
 * value back.
 */
export function markWontDo(task: Task, now: string): TaskMutation {
  return {
    patch: { wontDoAt: now },
    // Absent and "" are different values, the same way they are for
    // `deletedAt` — undo restores the one that was there.
    undo: { wontDoAt: task.wontDoAt },
    labelKey: "tasks.undoWontDo",
  };
}

export function unmarkWontDo(task: Task): TaskMutation {
  return {
    patch: { wontDoAt: "" },
    undo: { wontDoAt: task.wontDoAt },
    labelKey: "tasks.undoWontDoCleared",
  };
}

/**
 * Keep this Task at hand (§15.6).
 *
 * One field, like `markWontDo` above and for the same reason: §15.7 says Pin
 * moves nothing and changes no priority, and the cheapest way to keep a rule
 * like that true is to write a mutation that COULD not break it.
 *
 * `now` rather than `true` because the field is a timestamp (§15.8) — see the
 * note on `Task.pinnedAt` for why the View, not the field, decides the order
 * pinned Tasks appear in.
 */
export function pinTask(task: Task, now: string): TaskMutation {
  return {
    patch: { pinnedAt: now },
    // Absent and "" differ here as they do for `deletedAt`: undo puts back
    // the value that was there, not a value that means the same thing.
    undo: { pinnedAt: task.pinnedAt },
    labelKey: "tasks.undoPinned",
  };
}

export function unpinTask(task: Task): TaskMutation {
  return {
    patch: { pinnedAt: "" },
    undo: { pinnedAt: task.pinnedAt },
    labelKey: "tasks.undoUnpinned",
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
    patch: { status: LIFECYCLE.completed, completedAt: task.completedAt || now },
    undo: { status: task.status, completedAt: task.completedAt },
    labelKey: "tasks.undoCompleted",
  };
}

export function reopenTask(task: Task): TaskMutation {
  return {
    // Back to what it was before it was finished, when that is known —
    // One destination, so nothing has to be remembered to get back to it.
    // This used to dig `previousStatus` out, because reopening a task that
    // had been `doing` and parking it on `todo` lost where it was — workflow
    // is a Section now (Ch. 26 §26.3.2) and completion never touched it.
    patch: { status: LIFECYCLE.open, completedAt: "" },
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

/**
 * Priority, as a mutation rather than a field write.
 *
 * The Detail panel has been writing `priority` straight through `onUpdate`
 * since it was built, which is why changing it there cannot be undone. Coming
 * through here gives the row's menu the undo every other change already has.
 */
export function setTaskPriority(task: Task, priority: Task["priority"]): TaskMutation {
  return {
    patch: { priority },
    undo: { priority: task.priority },
    labelKey: "tasks.undoPriorityChanged",
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
 * Move a Task to another List (§6.29).
 *
 * The Section goes with it only if the caller names one that the target List
 * actually has; otherwise it is cleared. That is not tidiness — a Section
 * belongs to exactly one List (§6.28), so carrying the old id across would
 * leave the Task pointing at a column that cannot render it. The plan says
 * the same in one line: "listId 변경 → sectionId = null", and only an explicit
 * choice of a target Section overrides it.
 */
export function moveTaskToList(
  task: Task,
  listId: string,
  sections: ListSection[],
  sectionId = "",
): TaskMutation {
  const target = sectionId ? sections.find((section) => section.id === sectionId) : undefined;
  return {
    patch: { listId, sectionId: target?.listId === listId ? target.id : "" },
    undo: { listId: task.listId, sectionId: task.sectionId },
    labelKey: "tasks.undoMoved",
  };
}

/**
 * Move a Task between columns of its own List (§6.28).
 *
 * Null when the target Section is not this List's — the domain validation the
 * plan asks for where a constraint cannot be declared. A caller that got null
 * has a bug in what it offered the user, not a state to recover from, and
 * turning it into a silent move to the default column would hide that.
 * `sectionId: ""` is the default column and always allowed.
 */
export function moveTaskToSection(
  task: Task,
  sectionId: string,
  lists: List[],
  sections: ListSection[],
): TaskMutation | null {
  if (sectionId && sectionIdFor({ ...task, sectionId }, lists, sections) !== sectionId) return null;
  return {
    patch: { sectionId },
    undo: { sectionId: task.sectionId },
    labelKey: "tasks.undoMoved",
  };
}

/**
 * Whether this change takes the Task out of the Scope it is being made in.
 *
 * The question is asked against the Scope the user is standing in, with the
 * Task as it will be. Exactness matters: a Task that was never in this Scope
 * has not "left" it.
 *
 * NO SCREEN ACTS ON THE ANSWER any more. It used to close the Drawer, and
 * §1.28 reversed that — a Task that no longer matches a filter is still a
 * Task, and its Detail stays open. The row does still leave the list, but
 * `queryScopeTasks` decides that by re-querying rather than by being told.
 *
 * What is left is a statement about Scopes, and the golden-journey tests use
 * it as one: completing a Task removes it from Today, moving it out of the
 * Inbox removes it from the Inbox. Those facts are still worth pinning down —
 * they are what the list depends on — even though nothing now branches on
 * them at the moment of the edit.
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
