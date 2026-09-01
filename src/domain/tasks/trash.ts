// What removing a Task for good takes with it
// (TRASH_PERMANENT_DELETE_DESIGN.md §4 Phase 1).
//
// The rule already existed — `usePlannerData.deleteTask` wrote it, correctly,
// in a comment worth keeping: a child Task is promoted to top level rather
// than cascade-deleted, because its work is still real, while a CheckItem or a
// Reminder has no meaning apart from the Task it belongs to and would be a row
// nothing could ever show.
//
// What did not exist was ONE place saying it. Measured before this file:
//
//   - `deleteTask` dropped subtasks, check items and reminders, and left the
//     `taskTags` links behind;
//   - `lifecycle.permanentlyDeleteList` dropped the Lists's Tasks and left ALL
//     FOUR behind, for every Task in the List.
//
// So the same question had two answers and both leaked. It has one here, and
// the callers ask it rather than re-deciding it.
import type { CheckItem, Reminder, Subtask, Task, TaskTag } from "../../types";

/**
 * The rows a permanent delete can reach.
 *
 * A slice of the store rather than the store, so this file cannot touch
 * Lists, Folders or settings — the blast radius is in the type.
 */
export interface TaskRows {
  tasks: Task[];
  subtasks: Subtask[];
  checkItems: CheckItem[];
  taskTags: TaskTag[];
  reminders: Reminder[];
}

/** Every Task the user has thrown away (§12.13's one field). */
export function trashedTaskIds(tasks: Task[]): string[] {
  return tasks.filter((task) => Boolean(task.deletedAt)).map((task) => task.id);
}

/**
 * Removes these Tasks and everything that only existed for them.
 *
 * Returns the SAME arrays when nothing matched, so a delete that frees no
 * lines marks nothing dirty — the rule `removeCheckItemsForTask` already
 * follows, and the reason a no-op here does not cost a save and a sync.
 */
export function removeTasksForever(rows: TaskRows, taskIds: Iterable<string>): TaskRows {
  const doomed = new Set(taskIds);
  if (doomed.size === 0) return rows;

  let movedOrGone = false;
  const tasks: Task[] = [];
  for (const task of rows.tasks) {
    if (doomed.has(task.id)) {
      movedOrGone = true;
      continue;
    }
    // Children outlive their parent at top level. A pass over the SURVIVORS
    // rather than a recursive collect, because that is the rule itself:
    // nothing below a removed Task is removed with it.
    if (task.parentTaskId && doomed.has(task.parentTaskId)) {
      movedOrGone = true;
      tasks.push({ ...task, parentTaskId: "" });
      continue;
    }
    tasks.push(task);
  }

  const subtasks = keep(rows.subtasks, doomed);
  const checkItems = keep(rows.checkItems, doomed);
  const taskTags = keep(rows.taskTags, doomed);
  const reminders = keep(rows.reminders, doomed);

  if (
    !movedOrGone &&
    subtasks === rows.subtasks &&
    checkItems === rows.checkItems &&
    taskTags === rows.taskTags &&
    reminders === rows.reminders
  ) {
    return rows;
  }

  return { tasks: movedOrGone ? tasks : rows.tasks, subtasks, checkItems, taskTags, reminders };
}

function keep<T extends { taskId: string }>(rows: T[], doomed: Set<string>): T[] {
  const kept = rows.filter((row) => !doomed.has(row.taskId));
  return kept.length === rows.length ? rows : kept;
}

/**
 * One Task, out of the Trash and gone (§3.1).
 *
 * `deletedAt` is the guard, and it is here rather than in the screen for the
 * same reason `permanentlyDeleteList` guards on the List's: the two-step is
 * what stops a single click from arriving, and a guard a caller can forget is
 * not a guard. `done` is false when the Task is missing or was never thrown
 * away — the caller shows nothing and nothing changes.
 */
export function permanentlyDeleteTask(
  rows: TaskRows,
  taskId: string,
): { rows: TaskRows; done: boolean } {
  const task = rows.tasks.find((row) => row.id === taskId);
  if (!task || !task.deletedAt) return { rows, done: false };
  return { rows: removeTasksForever(rows, [taskId]), done: true };
}

/**
 * Everything in the Trash, gone (§3.3).
 *
 * `removed` is the count the confirmation has to say out loud — the fact the
 * word "empty" hides, the way `ListManager` says how many Tasks go with a
 * List. Counted here so the screen cannot count it differently from what this
 * is about to delete.
 */
export function emptyTrash(rows: TaskRows): { rows: TaskRows; removed: number } {
  const doomed = trashedTaskIds(rows.tasks);
  return { rows: removeTasksForever(rows, doomed), removed: doomed.length };
}
