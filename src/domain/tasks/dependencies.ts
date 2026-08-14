// Task dependencies — "this one is waiting on that one".
//
// `blockedByTaskId` has been on Task, and synced, since long before anything
// read it: nothing in the UI ever set it and nothing ever looked at it, so it
// was always "". This module is what finally gives it a meaning.
//
// It stays SINGULAR and one-directional, which is worth explaining because
// CLICKUP_IMPORT_DESIGN W2.2 argued for many-to-many once it was established
// that record shape costs the sync layer nothing (§6). It still costs nothing
// there — but M0 found the other barrier: a *new* field is erased by any
// client that predates it (SPACES_CLICKUP_REDESIGN M0). `blockedByTaskId`
// already exists in every shipped version, so using it carries no such risk,
// while `blockedBy: string[]` would have to wait for M0 to propagate.
//
// The reverse direction is derived, never stored (`dependentsOf`), so there is
// no second copy of the same fact to fall out of step.
import type { Task } from "../../types";

/** A task that is finished, filed away, or gone cannot block anything. */
export function isBlockerResolved(blocker: Task | undefined): boolean {
  if (!blocker) return true;
  return blocker.status === "done" || blocker.status === "archived" || Boolean(blocker.deletedAt);
}

export function blockerFor(task: Task, taskById: Map<string, Task>): Task | undefined {
  if (!task.blockedByTaskId) return undefined;
  return taskById.get(task.blockedByTaskId);
}

/**
 * Blocked means the named blocker exists and is still open. A dangling id —
 * the blocker was deleted, or the reference arrived from another device that
 * had it — reads as unblocked rather than as permanently stuck.
 */
export function isTaskBlocked(task: Task, taskById: Map<string, Task>): boolean {
  if (!task.blockedByTaskId) return false;
  const blocker = taskById.get(task.blockedByTaskId);
  if (!blocker) return false;
  return !isBlockerResolved(blocker);
}

export function taskMap(tasks: Task[]): Map<string, Task> {
  return new Map(tasks.map((task) => [task.id, task]));
}

/** Ids of every task currently waiting on something still open. */
export function blockedTaskIds(tasks: Task[]): Set<string> {
  const byId = taskMap(tasks);
  const blocked = new Set<string>();
  for (const task of tasks) {
    if (isTaskBlocked(task, byId)) blocked.add(task.id);
  }
  return blocked;
}

/** The other direction, derived: everything waiting on this task. */
export function dependentsOf(tasks: Task[], taskId: string): Task[] {
  if (!taskId) return [];
  return tasks.filter((task) => task.blockedByTaskId === taskId);
}

/**
 * Would pointing `taskId` at `blockerId` close a loop?
 *
 * Walks the blocker chain from the candidate back up. A cycle would make
 * "blocked" unanswerable — every task in the ring waits for another that
 * waits for it — and the Today demotion walks the same links, so it has to be
 * refused at the point of writing rather than handled at every read.
 */
export function wouldCycle(tasks: Task[], taskId: string, blockerId: string): boolean {
  if (!taskId || !blockerId) return false;
  if (taskId === blockerId) return true;
  const byId = taskMap(tasks);
  const seen = new Set<string>([taskId]);
  let current = byId.get(blockerId);
  while (current) {
    if (seen.has(current.id)) return true;
    seen.add(current.id);
    if (!current.blockedByTaskId) return false;
    current = byId.get(current.blockedByTaskId);
  }
  return false;
}

/**
 * What the picker may offer. Excludes the task itself, anything that would
 * close a loop, and work already finished — waiting on a done task is a
 * blocker that never blocks, which is just a confusing way to write nothing.
 */
export function eligibleBlockers(tasks: Task[], taskId: string): Task[] {
  return tasks.filter((candidate) => {
    if (candidate.id === taskId) return false;
    if (candidate.deletedAt || candidate.status === "archived" || candidate.status === "done") return false;
    return !wouldCycle(tasks, taskId, candidate.id);
  });
}
