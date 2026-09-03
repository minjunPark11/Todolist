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
 * What emptying the Trash is about to take (§16.5).
 *
 * Three numbers and not one, because the Trash holds two kinds of thing now
 * and the second kind brings a third number with it:
 *
 *   - `tasks` — thrown away one at a time, and the rows the screen draws;
 *   - `lists` — thrown away as containers;
 *   - `tasksWithLists` — the work inside those Lists, which is NOT in the
 *     first number and never was. A trashed List does not stamp its Tasks
 *     (§13.22): they leave the active Scopes because their owner did, which
 *     is what makes restoring a List one field. So a reader told "12 tasks"
 *     would agree to losing seventeen.
 */
export interface TrashSummary {
  tasks: number;
  lists: number;
  tasksWithLists: number;
}

/**
 * Everything in the Trash, gone (§3.3, widened by §16.5).
 *
 * The Lists arrive as IDS rather than as records, which keeps this file's
 * blast radius where its type says it is: it can count and remove Tasks, and
 * it cannot touch a List row. Dropping those Lists is the caller's line, and
 * `binnedListIds` is what the caller already had to compute to ask.
 *
 * Counted here so the screen cannot count it differently from what this is
 * about to delete — the rule §7.1 set when the count was one number.
 */
export function emptyTrash(
  rows: TaskRows,
  binnedListIds: readonly string[] = [],
): { rows: TaskRows; summary: TrashSummary } {
  const binned = new Set(binnedListIds);
  const thrownAway = trashedTaskIds(rows.tasks);
  const inBinnedLists = rows.tasks.filter(
    (task) => !task.deletedAt && binned.has(task.listId ?? "") && !task.parentTaskId,
  );
  // Children of a doomed Task are promoted rather than removed
  // (`removeTasksForever`), but a child inside a doomed LIST has nowhere to be
  // promoted to — its List is going. So the ids include every Task the List
  // owns, while the COUNT the reader is shown stays top-level, which is the
  // number `taskCountInList` shows beside a List everywhere else.
  const doomed = [
    ...thrownAway,
    ...rows.tasks.filter((task) => !task.deletedAt && binned.has(task.listId ?? "")).map((task) => task.id),
  ];
  return {
    rows: removeTasksForever(rows, doomed),
    summary: {
      tasks: thrownAway.length,
      lists: binned.size,
      tasksWithLists: inBinnedLists.length,
    },
  };
}
