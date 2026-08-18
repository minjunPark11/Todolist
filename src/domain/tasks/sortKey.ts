// Manual order for Tasks (TickTick plan §6.30/§6.31).
//
// §6.30 asks for an "insertion-friendly rank" rather than a plain index, and
// gives the reason: dropping a Task between two others should write ONE row,
// not renumber the column. That is the same write-amplification argument that
// put `listId` on a Task and made a Tag a record, so the answer is the same
// shape — a key with room between its values.
//
// The key is the `order` field a Task already has. §6.68 says to reuse a
// field the schema already holds, and this one qualifies: nothing has ever
// sorted Tasks by it (`normalizeTask` defaults every Task to 0), so adopting
// it costs no migration and no second meaning.
//
// §6.31 fixes what the order is WITHIN: the owner List, and the Section
// inside it when there is one — `(listId, sectionId, sortKey)`. A Task
// therefore has one manual position, not one per screen, and a Scope that
// gathers Tasks from several Lists (Today, a Tag) cannot order them manually
// at all. `scopeRegistry.canManualReorder` already says which those are.
import type { Task } from "../../types";

/**
 * Gap between neighbours when a column is numbered from scratch.
 *
 * Large enough that ordinary insertion never runs out of room: halving 1000
 * repeatedly gives about 50 drops between the same two Tasks before the
 * doubles collide, and `orderBetween` reports that case instead of silently
 * tying.
 */
export const ORDER_STEP = 1000;

/**
 * A key that sorts between two neighbours, or null when there is no room.
 *
 * Null is not a failure to hide — it is the signal to renumber the column,
 * which `placeTask` does. Callers that ignore it would write a key equal to
 * its neighbour, and a tie here is a list that reorders itself on the next
 * render.
 */
export function orderBetween(before: number | undefined, after: number | undefined): number | null {
  if (before === undefined && after === undefined) return 0;
  if (before === undefined) return (after as number) - ORDER_STEP;
  if (after === undefined) return before + ORDER_STEP;
  if (after <= before) return null;
  const middle = before + (after - before) / 2;
  return middle > before && middle < after ? middle : null;
}

/** Manual order, oldest first for anything never placed by hand (every Task starts at 0). */
export function byManualOrder(a: Task, b: Task): number {
  return a.order - b.order || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

export function sortByManualOrder(tasks: Task[]): Task[] {
  return [...tasks].sort(byManualOrder);
}

/** The key a newly created Task gets: after everything already in the column. */
export function orderForNewTask(columnTasks: Task[]): number {
  if (columnTasks.length === 0) return 0;
  return columnTasks.reduce((max, task) => Math.max(max, task.order), 0) + ORDER_STEP;
}

/**
 * Where every Task in one column ends up after a drop, as the rows that
 * actually change.
 *
 * `column` is the Tasks of one `(listId, sectionId)` in their current manual
 * order; `targetIndex` is the position the Task is dropped at, counted in
 * that same column with the moving Task removed.
 *
 * Normally one row comes back. The whole column comes back only when the gap
 * between its new neighbours has run out — the renumber §6.30 exists to make
 * rare, not to make impossible.
 */
export function placeTask(column: Task[], movingId: string, targetIndex: number): Array<{ id: string; order: number }> {
  const ordered = sortByManualOrder(column);
  const moving = ordered.find((task) => task.id === movingId);
  if (!moving) return [];

  const without = ordered.filter((task) => task.id !== movingId);
  const index = Math.max(0, Math.min(without.length, targetIndex));
  const before = without[index - 1]?.order;
  const after = without[index]?.order;

  const key = orderBetween(before, after);
  if (key !== null) return key === moving.order ? [] : [{ id: movingId, order: key }];

  // No room left between the neighbours. Rebuild the column at full spacing,
  // with the Task in its new place, and report only the rows whose key moved.
  const placed = [...without.slice(0, index), moving, ...without.slice(index)];
  return placed
    .map((task, position) => ({ id: task.id, order: position * ORDER_STEP }))
    .filter((row, position) => row.order !== placed[position].order);
}
