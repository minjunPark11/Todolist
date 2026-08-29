// How the tasks inside one matrix box are divided up and ordered.
//
// The box says what the user thinks of the work (its priority — D1). This says
// when it is due, which is the other half of the question and the half the box
// deliberately stopped answering. A box holding thirty tasks in one flat list
// is a box nobody reads; the same thirty under "기한 초과 3 / 오늘 1 / 날짜
// 없음 26" is a day.
//
// Pure, and separate from the screen, because the axis and the order are the
// user's to choose (the box's ⋯ menu) — a grouping rule that lives in a
// component is one that has to be rewritten to be configured.
import type { Task } from "../../types";
import { isCompleted } from "../tasks/taskState";
import { LIST_COLOR_PRESETS } from "../tasks/listColor";
import { addDays } from "../../utils/date";

export type DateBucket = "overdue" | "today" | "tomorrow" | "later" | "none";

/** A date bucket, the group that outranks them, or "no grouping at all". */
export type MatrixGroupId = DateBucket | "completed" | "all";

export type MatrixGroupAxis = "dueDate" | "none";

/**
 * What a box may be sorted by.
 *
 * Priority is deliberately absent. Since D1 every task in a box HAS the box's
 * priority, so sorting by it would be a control that visibly does nothing —
 * the one thing worse than a missing option.
 */
export type MatrixSortKey = "dueDate" | "title" | "createdAt";
export type MatrixSortOrder = "asc" | "desc";

/**
 * The colours a box may be given.
 *
 * The app's existing palette rather than a second one invented here: a colour
 * vocabulary that exists twice is two things to keep in step, and the Lists
 * already answer "which eight colours does this app offer". `""` is not in the
 * list — it is the absence of a choice, and it means the box's built-in colour.
 */
export const MATRIX_QUADRANT_COLORS: readonly string[] = LIST_COLOR_PRESETS.map((preset) => preset.key);

/** Long enough for a sentence fragment, short enough to sit in a box header. */
export const MATRIX_LABEL_MAX = 40;

export interface MatrixQuadrantView {
  groupBy: MatrixGroupAxis;
  sortKey: MatrixSortKey;
  sortOrder: MatrixSortOrder;
  /**
   * What the user calls this box, its second line, and its colour
   * (TICKTICK_MATRIX_DESIGN.md §20.6). Absent — never "" — means the built-in
   * one, so an account that has never opened the editor stores nothing and
   * reads exactly as it does today.
   *
   * A name the user typed does NOT follow the interface language. There is no
   * way to translate "화요일 마감", and guessing would be worse than leaving
   * the words they chose alone.
   */
  name?: string;
  hint?: string;
  /** A `MATRIX_QUADRANT_COLORS` key, or absent for the box's own colour. */
  color?: string;
}

/** What the reference app's menu reads on a box nobody has touched. */
export const DEFAULT_MATRIX_VIEW: MatrixQuadrantView = {
  groupBy: "dueDate",
  sortKey: "dueDate",
  sortOrder: "asc",
};

export const MATRIX_GROUP_AXES: readonly MatrixGroupAxis[] = ["dueDate", "none"];
export const MATRIX_SORT_KEYS: readonly MatrixSortKey[] = ["dueDate", "title", "createdAt"];
export const MATRIX_SORT_ORDERS: readonly MatrixSortOrder[] = ["asc", "desc"];

/**
 * A stored view, as this build understands it.
 *
 * These live in the user's settings and sync, so a value written by another
 * version — or a key this one has retired — must fold to something drawable
 * rather than crash a box.
 */
/**
 * A user-typed label, as it is worth storing.
 *
 * Trimmed and capped rather than rejected: a name is not a field anyone can
 * get wrong, and a dialog that refuses "  " is a dialog arguing about
 * whitespace. Empty comes back as "" and the caller drops the key entirely,
 * which is what makes "cleared" and "never set" the same state.
 */
function sanitizeLabel(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MATRIX_LABEL_MAX) : "";
}

export function sanitizeMatrixView(value: unknown): MatrixQuadrantView {
  const record = (value ?? {}) as Partial<MatrixQuadrantView>;
  const name = sanitizeLabel(record.name);
  const hint = sanitizeLabel(record.hint);
  const color = MATRIX_QUADRANT_COLORS.includes(record.color as string) ? (record.color as string) : "";
  return {
    groupBy: MATRIX_GROUP_AXES.includes(record.groupBy as MatrixGroupAxis)
      ? (record.groupBy as MatrixGroupAxis)
      : DEFAULT_MATRIX_VIEW.groupBy,
    sortKey: MATRIX_SORT_KEYS.includes(record.sortKey as MatrixSortKey)
      ? (record.sortKey as MatrixSortKey)
      : DEFAULT_MATRIX_VIEW.sortKey,
    sortOrder: MATRIX_SORT_ORDERS.includes(record.sortOrder as MatrixSortOrder)
      ? (record.sortOrder as MatrixSortOrder)
      : DEFAULT_MATRIX_VIEW.sortOrder,
    // Spread rather than written as "": absent is the default, and an account
    // that stored `name: ""` would be storing a preference nobody expressed.
    ...(name ? { name } : {}),
    ...(hint ? { hint } : {}),
    ...(color ? { color } : {}),
  };
}

/**
 * What a box is called, and what its second line says.
 *
 * The name's fallback comes from the caller because it is a translation and
 * this module is pure — but the RULE lives here, so the header, the `+`'s label
 * and the ⋯'s label cannot disagree about what the box is named.
 *
 * The second line has NO fallback. The built-in one said the name again in
 * other words — "지금 하기" over "중요하고 급한 일" — and once §23 let a box's
 * conditions be edited it could be false as well: a box filtered to one List
 * went on claiming to be about importance. A line appears only if the user
 * wrote one, and then it is theirs and cannot be wrong about our rules.
 */
export function matrixQuadrantLabels(
  view: MatrixQuadrantView | undefined,
  fallbackName: string,
): { name: string; hint: string } {
  return {
    name: view?.name || fallbackName,
    hint: view?.hint ?? "",
  };
}

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
  "all",
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
 * Completion wins over every axis.
 *
 * A task finished last Tuesday is not "overdue" — it is done, and the date it
 * carried has stopped being a claim on anybody's time. Reporting it as late
 * would be the screen inventing an obligation that no longer exists. It stays
 * its own group even when grouping is off, because "finished" is the one
 * division that is never noise.
 */
export function matrixGroupOf(task: Task, today: string, axis: MatrixGroupAxis = "dueDate"): MatrixGroupId {
  if (isCompleted(task)) return "completed";
  return axis === "none" ? "all" : dateBucketOf(task.dueDate, today);
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
 */
export function groupMatrixTasks(
  tasks: Task[],
  today: string,
  view: MatrixQuadrantView = DEFAULT_MATRIX_VIEW,
): MatrixGroup[] {
  const byGroup = new Map<MatrixGroupId, Task[]>();
  for (const task of tasks) {
    const id = matrixGroupOf(task, today, view.groupBy);
    const bucket = byGroup.get(id);
    if (bucket) bucket.push(task);
    else byGroup.set(id, [task]);
  }

  const compare = matrixComparator(view);
  const groups: MatrixGroup[] = [];
  for (const id of MATRIX_GROUP_ORDER) {
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
export function matrixComparator(view: MatrixQuadrantView): (a: Task, b: Task) => number {
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

function compareBy(key: MatrixSortKey, a: Task, b: Task): number {
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
