// A Task's checklist, as records (spec §11, Chapter 26 §26.4).
//
// The line this file draws, and the reason it exists at all:
//
//     CheckItem   text + a tick, and nothing else
//     Subtask     a Task — dates, priority, tags, children of its own
//
// They look identical on screen, which is exactly why the distinction has to
// be structural. §11.1 puts it as a rule: an item that needs a date or a
// priority is not a checklist item, it is a Subtask, and promoting it is a
// real conversion rather than a field appearing.
//
// §26.4 adds the other half. The legacy `Subtask` record has the same SHAPE
// as a CheckItem — text and a tick — which makes sending it here tempting.
// It keeps promoting to a child Task instead: those records were created as
// subtasks, and routing them by when the migration happened to reach them
// would split one kind of user data into two destinations on a boundary the
// user never drew.
//
// §11.3 forbids the other obvious shortcut — an array inside the Task. A
// checklist that lives in `Task.checkItems` makes every tick a rewrite of the
// whole Task, which is the write amplification this store has removed twice,
// and it makes "which is the source of truth" a question again the moment
// anything caches one.
import type { CheckItem, Task } from "../../types";
import { ORDER_STEP, orderBetween } from "./sortKey";

/**
 * The lines of one Task, in the order they are shown.
 *
 * Text breaks ties rather than `createdAt`: two devices adding a line while
 * offline both land on the same next `sortKey`, and a list whose order
 * depends on which clock was ahead is a list that reorders itself on sync —
 * the same reason `sectionsForList` sorts the way it does.
 */
export function checkItemsForTask(taskId: string, items: CheckItem[]): CheckItem[] {
  if (!taskId) return [];
  return items
    .filter((item) => item.taskId === taskId)
    .sort((a, b) => a.sortKey - b.sortKey || a.text.localeCompare(b.text));
}

export interface ChecklistProgress {
  done: number;
  total: number;
}

/**
 * Derived, never stored (§11.16, and §24.3's "derived values are not a
 * persisted source"). A stored count is a count that can disagree with the
 * lines it counts.
 */
export function checklistProgress(taskId: string, items: CheckItem[]): ChecklistProgress {
  const own = items.filter((item) => item.taskId === taskId);
  return { done: own.filter((item) => item.checked).length, total: own.length };
}

/**
 * Whether this Task shows a checklist.
 *
 * Reads the mode and not the item count. A Task in checklist mode with every
 * line deleted is still a checklist — an empty one — and flipping it back to
 * prose because the last line went would be the app undoing a choice the user
 * made.
 */
export function isChecklistMode(task: Pick<Task, "contentMode">): boolean {
  return task.contentMode === "checklist";
}

export function sanitizeCheckItem(value: unknown): CheckItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const taskId = typeof record.taskId === "string" ? record.taskId.trim() : "";
  // A line belonging to no Task can never be shown, and would sync forever
  // unseen — the same rule `sanitizeTaskTag` applies to a half-made link.
  if (!id || !taskId) return null;
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : "";
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : "";
  const checked = record.checked === true;
  const completedAt = typeof record.completedAt === "string" ? record.completedAt : "";
  return {
    ...(record as Partial<CheckItem>), // M0 passthrough
    id,
    taskId,
    // Empty text is allowed here and refused at the editor. §11.10 wants a
    // blank line to be a thing you are still typing, not a record — but one
    // that reached storage is the user's, and dropping it on load would lose
    // a line they can see.
    text: typeof record.text === "string" ? record.text : "",
    checked,
    // The two cannot disagree: a tick with no time is repaired rather than
    // stored, and a time on an unticked line is dropped.
    completedAt: checked ? completedAt || updatedAt || createdAt : "",
    sortKey: typeof record.sortKey === "number" && Number.isFinite(record.sortKey) ? record.sortKey : 0,
    createdAt: createdAt || updatedAt,
    updatedAt: updatedAt || createdAt,
  };
}

/** The key a line appended to this Task's list should take. */
export function sortKeyForNewCheckItem(taskId: string, items: CheckItem[]): number {
  const own = checkItemsForTask(taskId, items);
  const last = own[own.length - 1];
  return last ? last.sortKey + ORDER_STEP : 0;
}

/**
 * The key for a line dropped at `targetIndex` within its Task.
 *
 * Null when the neighbours have no room left between them, which is the
 * signal to renumber rather than a failure to hide — `orderBetween` states
 * that contract and this passes it through unchanged.
 */
export function sortKeyForMovedCheckItem(
  taskId: string,
  items: CheckItem[],
  movingId: string,
  targetIndex: number,
): number | null {
  const own = checkItemsForTask(taskId, items).filter((item) => item.id !== movingId);
  const clamped = Math.max(0, Math.min(targetIndex, own.length));
  return orderBetween(own[clamped - 1]?.sortKey, own[clamped]?.sortKey);
}

/**
 * Ticking a line, as the patch it means.
 *
 * `completedAt` moves with `checked` and only with it. Two fields that say
 * the same thing are two fields that can disagree — the shape `Task.status`
 * and `Task.completedAt` are still paying for (D-23).
 */
export function toggleCheckItemPatch(item: CheckItem, now: string): Partial<CheckItem> {
  return item.checked
    ? { checked: false, completedAt: "", updatedAt: now }
    : { checked: true, completedAt: now, updatedAt: now };
}

/**
 * Every line of a Task, gone.
 *
 * Deleting a Task has to take its checklist with it, or the lines outlive the
 * only thing that could ever show them — the rule `removeTag` follows for its
 * links. Returns the same array when there was nothing to remove, so a delete
 * that frees no lines marks nothing dirty.
 */
export function removeCheckItemsForTask(taskId: string, items: CheckItem[]): CheckItem[] {
  if (!taskId) return items;
  const kept = items.filter((item) => item.taskId !== taskId);
  return kept.length === items.length ? items : kept;
}

/**
 * The lines a duplicated Task gets: the same text and order, unticked.
 *
 * Unticked because a copy is work still to do — §15's Duplicate makes a Task
 * that has not been done, and carrying the ticks across would hand the user a
 * checklist that claims to be half finished.
 */
export function duplicateCheckItems(
  sourceTaskId: string,
  newTaskId: string,
  items: CheckItem[],
  createId: (index: number) => string,
  now: string,
): CheckItem[] {
  return checkItemsForTask(sourceTaskId, items).map((item, index) => ({
    ...item,
    id: createId(index),
    taskId: newTaskId,
    checked: false,
    completedAt: "",
    createdAt: now,
    updatedAt: now,
  }));
}

/**
 * Lines whose Task is gone, dropped.
 *
 * For the deletes that remove Tasks in bulk rather than one at a time — a
 * List hard-deleted with its contents. Called with the tasks that SURVIVE, so
 * it is a set difference and not a guess: a line is kept only while something
 * that can show it exists.
 *
 * Not run on load. A Task missing mid-sync is a Task that has not arrived
 * yet, and pruning then would delete lines to fix a race.
 */
export function pruneOrphanCheckItems(tasks: Array<Pick<Task, "id">>, items: CheckItem[]): CheckItem[] {
  const alive = new Set(tasks.map((task) => task.id));
  const kept = items.filter((item) => alive.has(item.taskId));
  return kept.length === items.length ? items : kept;
}
