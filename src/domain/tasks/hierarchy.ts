// How deep a Task sits, and what may become whose child (spec §12.5–§12.6,
// §12.49, §22.19).
//
// The model accepts any depth — §12.5 is explicit that the DATA keeps
// arbitrary nesting and the limit is a product rule on top of it. That
// distinction is what §22.19 depends on: data already deeper than the limit
// (from an import, an older client, a corrupted parent link) is shown as it
// is rather than force-flattened. The limit stops new nesting; it does not
// rewrite what exists.
//
// Every walk here is cycle-safe. §12.6 forbids cycles and this module refuses
// to create one, but a record that already contains one — written by another
// client, or corrupted in transit — must not hang the app that reads it, and
// §22.18 says not to silently rewrite the relation either. So the walks stop
// and report what they can see.
import type { Task } from "../../types";

/**
 * [VERIFIED TICKTICK] §12.49: five levels, counting the root as level 1.
 *
 * One constant, because §12.5 asks for exactly that — a depth rule repeated
 * in each component is a depth rule that will disagree with itself.
 */
export const MAX_TASK_DEPTH = 5;

type TaskLike = Pick<Task, "id" | "parentTaskId">;

function byId<T extends TaskLike>(tasks: T[]): Map<string, T> {
  return new Map(tasks.map((task) => [task.id, task]));
}

/**
 * The Tasks above this one, root first.
 *
 * Generic in the element type so a caller that has whole Tasks gets whole
 * Tasks back — a breadcrumb needs titles, and re-looking-up each id against
 * the same array it just passed in would be the caller doing this twice.
 *
 * This is what a breadcrumb draws, so the order is the reading order rather
 * than the walking order. A parent that is not in `tasks` — deleted, not
 * loaded yet — ends the chain instead of throwing: an unreachable ancestor is
 * a Task whose breadcrumb is short, not a Task that cannot be opened.
 */
export function ancestorsOf<T extends TaskLike>(taskId: string, tasks: T[]): T[] {
  const index = byId(tasks);
  const chain: T[] = [];
  const seen = new Set<string>([taskId]);
  let current = index.get(taskId)?.parentTaskId ?? "";
  while (current && !seen.has(current)) {
    seen.add(current);
    const parent = index.get(current);
    if (!parent) break;
    chain.push(parent);
    current = parent.parentTaskId ?? "";
  }
  return chain.reverse();
}

/**
 * Which level this Task is on, counting from 1.
 *
 * A Task whose parent is missing counts as a root — it is drawn as one, and a
 * depth that disagreed with what is on screen would be the more confusing of
 * the two answers.
 */
export function depthOf(taskId: string, tasks: TaskLike[]): number {
  return ancestorsOf(taskId, tasks).length + 1;
}

/**
 * How many levels this Task's subtree occupies, itself included.
 *
 * Reparenting moves a whole subtree, so the limit applies to its deepest leaf
 * and not to the Task being dragged — moving a two-level branch under a level
 * 4 Task would land its children on level 6.
 */
export function subtreeHeight(taskId: string, tasks: TaskLike[]): number {
  const childrenByParent = new Map<string, TaskLike[]>();
  for (const task of tasks) {
    const parent = task.parentTaskId ?? "";
    if (!parent) continue;
    const siblings = childrenByParent.get(parent);
    if (siblings) siblings.push(task);
    else childrenByParent.set(parent, [task]);
  }

  // Iterative rather than recursive: a cycle in the data would otherwise be a
  // stack overflow, and `seen` keeps one visit per Task either way.
  const seen = new Set<string>();
  let height = 0;
  let level = [taskId];
  while (level.length > 0) {
    height += 1;
    const nextLevel: string[] = [];
    for (const id of level) {
      if (seen.has(id)) continue;
      seen.add(id);
      for (const child of childrenByParent.get(id) ?? []) nextLevel.push(child.id);
    }
    level = nextLevel;
  }
  return height;
}

/**
 * This Task and everything beneath it, the Task itself first (§13.14).
 *
 * The subtree as a unit, which is what a List move operates on: §2.24's
 * invariant is that a child lives in its parent's List, so moving a parent and
 * leaving its children behind would break it on the spot.
 *
 * Includes the Task itself, because every caller wants the whole set — asking
 * for "the descendants" and then remembering to add the root back is the kind
 * of thing one caller in four forgets.
 *
 * Breadth-first and cycle-safe, like `subtreeHeight` and for the same reason:
 * a `parentTaskId` loop written by another client must not hang the walk.
 */
export function subtreeIds(taskId: string, tasks: TaskLike[]): string[] {
  const childrenByParent = new Map<string, TaskLike[]>();
  for (const task of tasks) {
    const parent = task.parentTaskId ?? "";
    if (!parent) continue;
    const siblings = childrenByParent.get(parent);
    if (siblings) siblings.push(task);
    else childrenByParent.set(parent, [task]);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  const queue = [taskId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const child of childrenByParent.get(id) ?? []) queue.push(child.id);
  }
  return out;
}

/** Whether `taskId` is `ancestorId` or sits beneath it (§12.6). */
export function isDescendantOf(taskId: string, ancestorId: string, tasks: TaskLike[]): boolean {
  if (taskId === ancestorId) return true;
  return ancestorsOf(taskId, tasks).some((task) => task.id === ancestorId);
}

/**
 * Whether a new child may be added under this Task (§12.49).
 *
 * The answer the UI needs BEFORE offering the control: §16.28's rule is that a
 * control must not appear and then refuse, so the add form is absent at the
 * bottom level rather than present and failing.
 */
export function canAddChild(parentId: string, tasks: TaskLike[]): boolean {
  return depthOf(parentId, tasks) < MAX_TASK_DEPTH;
}

export type ReparentRefusal = "self" | "cycle" | "depth";

/**
 * Why a move is not allowed, or null when it is (§12.6, §12.49).
 *
 * Returns the reason rather than a boolean so the caller can say which rule
 * stopped it — "that is already inside this one" and "that would be too deep"
 * are different problems with different fixes.
 *
 * An empty `newParentId` means "make it a root", which is always allowed:
 * outdenting cannot create a cycle and cannot exceed the depth.
 */
export function reparentRefusal(
  taskId: string,
  newParentId: string,
  tasks: TaskLike[],
): ReparentRefusal | null {
  if (!newParentId) return null;
  if (taskId === newParentId) return "self";
  // The new parent is inside the subtree being moved: the branch would become
  // its own ancestor, which is §12.6's "Descendant as Parent".
  if (isDescendantOf(newParentId, taskId, tasks)) return "cycle";
  if (depthOf(newParentId, tasks) + subtreeHeight(taskId, tasks) > MAX_TASK_DEPTH) return "depth";
  return null;
}
