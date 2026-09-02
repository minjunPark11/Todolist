// Moving late work to today (TODAY_TICKTICK_REDESIGN.md §3.5).
//
// The reference app puts a `Postpone` on the `Overdue` group's own header
// (§1.3) — one click for the whole group, which is the point: a day that opens
// with eleven late things is a day nobody wants to fix eleven times.
//
// One click changing eleven dates is also why this is a description and not an
// action. It returns the patch AND what to put back, the same shape
// `domain/tasks/mutations.ts` uses, so the toast can restore the state rather
// than reverse the verb (§9.35). "Move it back a day" is not the inverse of
// this for a task that was three weeks late.
import type { Task } from "../../types";
import { addDays, daysBetween } from "../../utils/date";

/** One task's move, and the way back. */
export interface PostponePatch {
  taskId: string;
  patch: Pick<Task, "startDate" | "dueDate">;
  undo: Pick<Task, "startDate" | "dueDate">;
}

/**
 * Where a late task lands when it is postponed to today.
 *
 * Two cases, and the second is the one worth writing down:
 *
 *   - A deadline alone moves to today.
 *   - A task with a START and a deadline is a SPAN, and the span moves whole.
 *     Its start becomes today and its deadline keeps its distance, so three
 *     days of work stays three days of work. Setting only the deadline would
 *     put the start after the end, which is not a schedule — and squeezing the
 *     span into one day would be the app deciding the work got smaller.
 *
 * Returns null when there is nothing to do: no deadline, or a deadline that is
 * not in the past. The caller counts what came back rather than counting what
 * it sent, so the toast says the number that actually moved.
 */
export function postponeToToday(task: Task, today: string): PostponePatch | null {
  if (!task.dueDate || task.dueDate >= today) return null;

  const undo = { startDate: task.startDate, dueDate: task.dueDate };

  if (!task.startDate) {
    return { taskId: task.id, patch: { startDate: task.startDate, dueDate: today }, undo };
  }

  // Measured from the start, because the start is what becomes today. Using
  // the deadline instead would move the start into the future on a span whose
  // end is nearer than its length.
  const shift = daysBetween(task.startDate, today);
  return {
    taskId: task.id,
    patch: { startDate: today, dueDate: addDays(task.dueDate, shift) },
    undo,
  };
}

/** Every late task in a list, moved. Ones with nothing to move are dropped. */
export function postponeAllToToday(tasks: Task[], today: string): PostponePatch[] {
  return tasks
    .map((task) => postponeToToday(task, today))
    .filter((row): row is PostponePatch => row !== null);
}
