// Which question the day's list is grouped by
// (TODAY_TICKTICK_REDESIGN.md §3.4, phase 5).
//
// Today has two, and they are not the same kind of thing:
//
//   - `date` — why the task is on today's list at all. Late, or for today.
//     `scopeQuery` gathers three populations into one (§12.5.1) and this is
//     what tells them apart. The default, and the plan's own recommendation
//     (§7.5).
//   - `plan` — which of the three boxes the reader (or "Plan Today") put it
//     in. Their arrangement of the day rather than the calendar's.
//
// A file rather than a branch inside `FocusQueue` for the reason
// `viewGroups.ts` gives at the top of itself: a grouping rule that lives in a
// component is one that has to be rewritten to be configured, and this one is
// configured — the ⋯ menu switches it.
//
// It is NOT a fourth axis added to `viewGroups`. That module belongs to the
// Matrix and the Inbox board too, and neither of those has a plan; the reason
// `plan` is a legitimate way to read Today is that Today's membership includes
// one, which is not true anywhere else.
import type { Task } from "../../types";
import { isCompleted } from "../tasks/taskState";
import { groupIdOf, type GroupId } from "./viewGroups";

export type TodayGroupAxis = "date" | "plan";
export type TodayBucket = "now" | "next" | "later";

/** A date group, a plan box, or the one that outranks both. */
export type TodayGroupId = Extract<GroupId, "overdue" | "today" | "completed"> | TodayBucket;

export const TODAY_GROUP_AXES: readonly TodayGroupAxis[] = ["date", "plan"];

export const DEFAULT_TODAY_AXIS: TodayGroupAxis = "date";

/** Reading order, per axis. Late first on one, soonest first on the other. */
const ORDER: Record<TodayGroupAxis, readonly TodayGroupId[]> = {
  date: ["overdue", "today", "completed"],
  plan: ["now", "next", "later", "completed"],
};

export function todayGroupOrder(axis: TodayGroupAxis): readonly TodayGroupId[] {
  return ORDER[axis];
}

/**
 * Which group one task belongs to.
 *
 * Completion wins on BOTH axes, and for the same reason it wins inside
 * `groupIdOf`: a task finished this morning is not late, and it is not waiting
 * in the box somebody filed it in either. It is done.
 *
 * On `date` the answer is only ever `overdue` or `today`. `groupIdOf` would
 * also say `날짜 없음` and `이후` — correct about a task in general, wrong
 * about this screen, where a task with no deadline or a deadline next week is
 * here because the reader PLANNED it for today. Calling that "No date" tells
 * them the opposite of what they did.
 */
export function todayGroupOf(
  task: Task,
  bucket: TodayBucket,
  today: string,
  axis: TodayGroupAxis = DEFAULT_TODAY_AXIS,
): TodayGroupId {
  if (isCompleted(task)) return "completed";
  if (axis === "plan") return bucket;
  return groupIdOf(task, today) === "overdue" ? "overdue" : "today";
}

/**
 * The i18n key for a group's name.
 *
 * Two namespaces because the two axes borrow their words from two places that
 * already have them — `view.group.*` is the vocabulary the Matrix and the
 * Inbox board share, `todayv.bucket.*` is the plan's. Neither is invented
 * here, which is what keeps this screen from becoming a third dictionary.
 */
export function todayGroupLabelKey(id: TodayGroupId): string {
  return id === "now" || id === "next" || id === "later"
    ? `todayv.bucket.${id}`
    : `view.group.${id}`;
}

export function isTodayGroupAxis(value: unknown): value is TodayGroupAxis {
  return value === "date" || value === "plan";
}
