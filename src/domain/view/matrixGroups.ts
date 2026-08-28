// How the tasks inside one matrix box are divided up.
//
// The box says what the user thinks of the work (its priority — D1). This says
// when it is due, which is the other half of the question and the half the box
// deliberately stopped answering. A box holding thirty tasks in one flat list
// is a box nobody reads; the same thirty under "기한 초과 3 / 오늘 1 / 날짜
// 없음 26" is a day.
//
// Pure, and separate from the screen, because Phase 3 lets the user choose the
// axis and the order — and a grouping rule that lives in a component is one
// that has to be rewritten to be configured.
import type { Task } from "../../types";
import { isCompleted } from "../tasks/taskState";
import { addDays } from "../../utils/date";

export type DateBucket = "overdue" | "today" | "tomorrow" | "later" | "none";

/** A date bucket, or the answer that outranks all of them. */
export type MatrixGroupId = DateBucket | "completed";

/**
 * Reading order.
 *
 * Late first and undated last, which is the order of how much the day depends
 * on them. "완료" is last of all: it is the only group that is not about what
 * is left to do.
 *
 * There is no "이번 주" here, and that is deliberate. It would need a
 * week-start rule (Sunday or Monday, a setting this app has), and the evidence
 * for the bucket existing at all is a screenshot of an account with no
 * future-dated work in it (TICKTICK_MATRIX_DESIGN.md §14). "이후" covers those
 * tasks correctly until somebody confirms the finer division is real.
 */
export const MATRIX_GROUP_ORDER: readonly MatrixGroupId[] = [
  "overdue",
  "today",
  "tomorrow",
  "later",
  "none",
  "completed",
];

/** Which side of today a deadline falls on. Dates only — no completion. */
export function dateBucketOf(dueDate: string, today: string): DateBucket {
  if (!dueDate) return "none";
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  if (dueDate === addDays(today, 1)) return "tomorrow";
  return "later";
}

/**
 * Completion wins over every date.
 *
 * A task finished last Tuesday is not "overdue" — it is done, and the date it
 * carried has stopped being a claim on anybody's time. Reporting it as late
 * would be the screen inventing an obligation that no longer exists.
 */
export function matrixGroupOf(task: Task, today: string): MatrixGroupId {
  if (isCompleted(task)) return "completed";
  return dateBucketOf(task.dueDate, today);
}

export interface MatrixGroup {
  id: MatrixGroupId;
  tasks: Task[];
}

/**
 * One box's tasks, divided and put in order.
 *
 * Empty groups are dropped rather than drawn empty: "오늘 0" is a row that
 * costs a line of the box and answers a question nobody asked.
 *
 * `compare` is passed in because the order inside a group is the user's
 * (Phase 3) while the order OF the groups is the product's — mixing the two
 * into one function is what makes a sort setting hard to add later.
 */
export function groupMatrixTasks(
  tasks: Task[],
  today: string,
  compare?: (a: Task, b: Task) => number,
): MatrixGroup[] {
  const byGroup = new Map<MatrixGroupId, Task[]>();
  for (const task of tasks) {
    const id = matrixGroupOf(task, today);
    const bucket = byGroup.get(id);
    if (bucket) bucket.push(task);
    else byGroup.set(id, [task]);
  }

  const groups: MatrixGroup[] = [];
  for (const id of MATRIX_GROUP_ORDER) {
    const bucket = byGroup.get(id);
    if (!bucket || bucket.length === 0) continue;
    // "완료" ignores the comparator and is always newest first.
    //
    // Not an exception for its own sake. The other groups are ordered to
    // answer "what next", and a deadline is what that turns on; inside
    // "완료" every deadline is settled and sorting by one puts the task
    // finished a moment ago below work finished last month. The screen caps
    // this group at five, so that task would not be on it at all — and seeing
    // what you just ticked is the reason it is drawn here rather than
    // vanishing.
    const ordered =
      id === "completed" ? [...bucket].sort(byFinishedAt) : compare ? [...bucket].sort(compare) : bucket;
    groups.push({ id, tasks: ordered });
  }
  return groups;
}

/**
 * Most recently finished first.
 *
 * `completedAt` is the stamp, and a record finished by an older client may not
 * carry one — `updatedAt` is what moved when it was ticked, so it stands in.
 */
function byFinishedAt(a: Task, b: Task): number {
  const finishedA = a.completedAt || a.updatedAt || "";
  const finishedB = b.completedAt || b.updatedAt || "";
  if (finishedA !== finishedB) return finishedA < finishedB ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
