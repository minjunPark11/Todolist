// How the tasks inside one box are divided up and ordered.
//
// The box says what the user thinks of the work — a matrix quadrant says its
// priority (D1), an Inbox column says when it is due. This says the rest: a box
// holding thirty tasks in one flat list is a box nobody reads; the same thirty
// under "기한 초과 3 / 오늘 1 / 날짜 없음 26" is a day.
//
// Both boards ask for it. The Matrix has since Phase 2, the Inbox board since
// its own phase 2, and until now the Board imported this from a file named
// after the Matrix — the same complaint §7 Q3 of the Inbox document made about
// `matrixRules`, one size down (§15.6). What is left in `matrixGroups.ts` is
// the quadrant's stored view: its name, its hint, its colour.
//
// Pure, and separate from the screen, because the axis and the order are the
// user's to choose (the box's ⋯ menu) — a grouping rule that lives in a
// component is one that has to be rewritten to be configured.
import type { Task } from "../../types";
import { isCompleted } from "../tasks/taskState";
import { addDays } from "../../utils/date";

export type DateBucket = "overdue" | "today" | "tomorrow" | "later" | "none" | "someday";

/** A date bucket, the group that outranks them, or "no grouping at all". */
export type GroupId = DateBucket | "completed" | "all";

export type GroupAxis = "dueDate" | "none";

/**
 * What a box may be sorted by.
 *
 * Priority is deliberately absent. Since D1 every task in a matrix box HAS the
 * box's priority, so sorting by it would be a control that visibly does
 * nothing — the one thing worse than a missing option.
 */
export type SortKey = "dueDate" | "title" | "createdAt";
export type SortOrder = "asc" | "desc";

export const GROUP_AXES: readonly GroupAxis[] = ["dueDate", "none"];
export const SORT_KEYS: readonly SortKey[] = ["dueDate", "title", "createdAt"];
export const SORT_ORDERS: readonly SortOrder[] = ["asc", "desc"];

/**
 * How a box wants its contents arranged.
 *
 * Three fields and nothing else: what a box is CALLED belongs to the board
 * that owns it (`MatrixQuadrantView` adds a name, a hint and a colour), and a
 * board with no such settings — the Inbox — passes nothing and gets the
 * default.
 */
export interface GroupView {
  groupBy: GroupAxis;
  sortKey: SortKey;
  sortOrder: SortOrder;
}

/** What the reference app's menu reads on a box nobody has touched. */
export const DEFAULT_GROUP_VIEW: GroupView = {
  groupBy: "dueDate",
  sortKey: "dueDate",
  sortOrder: "asc",
};

/**
 * How much of a "완료" group is drawn before the reader has to ask for more.
 *
 * The cap is on finished work alone, wherever it is grouped. Everything else
 * on these screens is work still to be done and hiding any of it would be
 * hiding the answer; finished work is the opposite — it accumulates forever,
 * and a box or a column whose bottom half is last month's successes has
 * stopped being useful. Five, then a link.
 *
 * Shared rather than declared twice: the Matrix's boxes and the Board's
 * columns are the same reader making the same request, and two constants that
 * mean one rule are one rule that can drift.
 */
export const COMPLETED_PAGE = 5;

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
export const GROUP_ORDER: readonly GroupId[] = [
  "overdue",
  "today",
  "tomorrow",
  "later",
  "none",
  // After "날짜 없음", because it is the one bucket that is not waiting for a
  // decision — it IS the decision, and the least of anybody's day.
  "someday",
  "all",
  "completed",
];

/**
 * Where a task sits on the time axis. No completion — that is asked above.
 *
 * "언젠가" is one of these rather than a dimension of its own, and that is the
 * whole reason this takes a task now instead of a date string. §6.23 makes the
 * two exclusive: a someday task has no due date, so under the old reading it
 * fell into "날짜 없음" beside work that simply has not been scheduled yet.
 * Those are different statements — "I have not decided when" against "I have
 * decided not to plan this" — and a rule that cannot tell them apart cannot
 * describe the Inbox board's `언젠가` column (INBOX_COLUMNS design §7 Q1).
 */
export function dateBucketOf(task: Pick<Task, "dueDate" | "isSomeday">, today: string): DateBucket {
  if (task.isSomeday) return "someday";
  if (!task.dueDate) return "none";
  if (task.dueDate < today) return "overdue";
  if (task.dueDate === today) return "today";
  if (task.dueDate === addDays(today, 1)) return "tomorrow";
  return "later";
}

/**
 * Completion wins over every axis.
 *
 * A task finished last Tuesday is not "overdue" — it is done, and the date it
 * carried has stopped being a claim on anybody's time. Reporting it as late
 * would be the screen inventing an obligation that no longer exists. It stays
 * its own group even when grouping is off, because "finished" is the one
 * division that is never noise.
 */
export function groupIdOf(task: Task, today: string, axis: GroupAxis = "dueDate"): GroupId {
  if (isCompleted(task)) return "completed";
  return axis === "none" ? "all" : dateBucketOf(task, today);
}

export interface TaskGroup {
  id: GroupId;
  tasks: Task[];
}

/**
 * One box's tasks, divided and put in order.
 *
 * Empty groups are dropped rather than drawn empty: "오늘 0" is a row that
 * costs a line of the box and answers a question nobody asked.
 */
export function groupTasks(tasks: Task[], today: string, view: GroupView = DEFAULT_GROUP_VIEW): TaskGroup[] {
  const byGroup = new Map<GroupId, Task[]>();
  for (const task of tasks) {
    const id = groupIdOf(task, today, view.groupBy);
    const bucket = byGroup.get(id);
    if (bucket) bucket.push(task);
    else byGroup.set(id, [task]);
  }

  const compare = taskComparator(view);
  const groups: TaskGroup[] = [];
  for (const id of GROUP_ORDER) {
    const bucket = byGroup.get(id);
    if (!bucket || bucket.length === 0) continue;
    // "완료" ignores the chosen order and is always newest first.
    //
    // Not an exception for its own sake. The other groups are ordered to
    // answer "what next", and a deadline is what that turns on; inside
    // "완료" every deadline is settled and sorting by one puts the task
    // finished a moment ago below work finished last month. The screen caps
    // this group, so that task would not be on it at all — and seeing what you
    // just ticked is the reason it is drawn here rather than vanishing.
    groups.push({ id, tasks: [...bucket].sort(id === "completed" ? byFinishedAt : compare) });
  }
  return groups;
}

/**
 * The order inside a group, as the box's menu has it set.
 *
 * Every key falls back to the title and then the id, so the result is total
 * and stable: two tasks created in the same millisecond must not swap places
 * between renders.
 */
export function taskComparator(view: GroupView): (a: Task, b: Task) => number {
  const direction = view.sortOrder === "desc" ? -1 : 1;
  return (a, b) => {
    const primary = compareBy(view.sortKey, a, b);
    if (primary !== 0) return primary * direction;
    const byTitle = a.title.localeCompare(b.title);
    if (byTitle !== 0) return byTitle * direction;
    return a.id < b.id ? -direction : a.id > b.id ? direction : 0;
  };
}

const NO_DATE = "9999-12-31";

function compareBy(key: SortKey, a: Task, b: Task): number {
  if (key === "title") return a.title.localeCompare(b.title);
  if (key === "createdAt") return (a.createdAt || "").localeCompare(b.createdAt || "");
  // Undated work sinks rather than sorting as an empty string, which would
  // float it above every deadline. Descending flips that too — "the furthest
  // out first" puts work with no date at all at the very front, which is what
  // the reader asked for by reversing the order.
  return (a.dueDate || NO_DATE).localeCompare(b.dueDate || NO_DATE);
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
