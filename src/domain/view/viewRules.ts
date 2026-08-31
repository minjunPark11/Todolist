// What belongs in a box, as data rather than as a hard-coded rule.
//
// This is the vocabulary two screens now share: the Matrix's four quadrants
// (TICKTICK_MATRIX_DESIGN.md §23) and the Inbox board's columns
// (TICKTICK_INBOX_COLUMNS_DESIGN.md §4.1). Both ask the same four questions of
// a task — which List, which tags, which date bucket, which priority — and both
// answer a drop the same way. It lived in `matrixRules.ts` until the Board
// started importing it, at which point the module was named after one of its
// two callers; §7 Q3 of the Inbox document is that complaint, and this file is
// the answer to it.
//
// What is NOT here is what each board does with a rule. The Matrix keeps its
// four quadrants, its presets and its reading order in `matrixRules.ts`; the
// Board keeps its columns in `inboxColumnRules.ts`. The line between them is
// the one §14.3 of the Inbox document drew: what a rule MEANS is shared, what a
// drop may WRITE belongs to the board that owns the field.
//
// The three answers this module encodes:
//
//   - No match is `null`, never a silent disappearance. Whoever asks has to
//     deal with the answer; §23.3's line under the grid is what deals with it.
//   - Two matches go to the FIRST box in reading order. That resolution lives
//     with each board, because reading order is a property of the board.
//   - A drop writes PRIORITY and DATE only. Never a list, never a tag, and
//     never a date ERASURE. A box that would need one of those to accept a
//     card cannot accept it, and says so before the drop rather than silently
//     rewriting what the task belongs to (§23.5). That is the whole of §4.2's
//     lesson, kept intact through a change that could easily have lost it.
import type { Task, TaskPriority } from "../../types";
import { dateBucketOf, type DateBucket } from "./viewGroups";
import { addDays } from "../../utils/date";

const PRIORITIES: readonly TaskPriority[] = ["high", "medium", "low", "none"];
const DATE_BUCKETS: readonly DateBucket[] = ["overdue", "today", "tomorrow", "later", "none", "someday"];

/**
 * One box's conditions.
 *
 * An EMPTY array means "전체" — no constraint on that dimension. There is no
 * separate `any` marker on purpose: two ways to say "unconstrained" is two
 * things that can disagree, and this is the same rule that makes an unset
 * name absent rather than "" (§21.3).
 *
 * The reference app has a fifth row, 작업 유형 (과제 · 노트). It is not here
 * because this app has no Note record to filter for — `contentMode` is the
 * shape of a task's body, not a kind of record (§22.4). Adding one to satisfy
 * a filter row would be the tail wagging the dog; adding the field later is
 * one line.
 */
export interface ViewRule {
  listIds: string[];
  tagIds: string[];
  /**
   * Dates as BUCKETS, not as a range.
   *
   * The reference works in ranges ("today ~ the day after tomorrow"), which
   * needs an algebra over relative days that this app does not have. It does
   * have `dateBucketOf`, built in Phase 2 — and those are the same five words
   * the group headers inside a box already use, so "the box that takes overdue
   * work" reads literally on screen.
   */
  dateBuckets: DateBucket[];
  priorities: TaskPriority[];
}

/** No conditions at all — matches every task. */
export const EMPTY_RULE: ViewRule = {
  listIds: [],
  tagIds: [],
  dateBuckets: [],
  priorities: [],
};

/** A box that asks for one priority and nothing else — the Matrix's D1 shape. */
export function priorityRule(priority: TaskPriority): ViewRule {
  return { ...EMPTY_RULE, priorities: [priority] };
}

function sanitizeMembers<T extends string>(value: unknown, allowed?: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<T>();
  for (const entry of value) {
    if (typeof entry !== "string" || !entry) continue;
    if (allowed && !allowed.includes(entry as T)) continue;
    seen.add(entry as T);
  }
  return [...seen];
}

/**
 * A stored rule, as this build understands it.
 *
 * Priorities and buckets are checked against what this build knows; list and
 * tag ids are NOT, because this module has no list table to check them
 * against. An id pointing at a deleted list therefore survives a round trip
 * and simply matches nothing — the same forward-compatibility choice
 * `parseListColor` makes, and the alternative would be this client quietly
 * deleting a condition another one can still resolve.
 */
export function sanitizeRule(value: unknown): ViewRule {
  const record = (value ?? {}) as Partial<ViewRule>;
  return {
    listIds: sanitizeMembers(record.listIds),
    tagIds: sanitizeMembers(record.tagIds),
    dateBuckets: sanitizeMembers(record.dateBuckets, DATE_BUCKETS),
    priorities: sanitizeMembers(record.priorities, PRIORITIES),
  };
}

/** What a rule has to be asked against, beyond the task itself. */
export interface RuleContext {
  today: string;
  /** The task's owning List, already resolved by the caller (`listIdFor`). */
  listId: string;
}

export function matchesRule(task: Task, rule: ViewRule, context: RuleContext): boolean {
  if (rule.priorities.length > 0 && !rule.priorities.includes(task.priority)) return false;
  // Dates only — completion is NOT asked about here. A finished task keeps the
  // box its fields put it in and lands in that box's "완료" group (D2); letting
  // a rule move it would make ticking a card relocate it.
  if (rule.dateBuckets.length > 0 && !rule.dateBuckets.includes(dateBucketOf(task, context.today))) {
    return false;
  }
  if (rule.listIds.length > 0 && !rule.listIds.includes(context.listId)) return false;
  // Any one of the named tags is enough. Requiring all of them would make a
  // two-tag rule almost always empty, and the row in the editor reads as a
  // list of tags to include rather than a set to demand.
  if (rule.tagIds.length > 0 && !task.tags.some((tag) => rule.tagIds.includes(tag))) return false;
  return true;
}

/** Strongest first, so a box taking "high or medium" is entered as high. */
function strongestPriority(priorities: readonly TaskPriority[]): TaskPriority {
  return PRIORITIES.find((priority) => priorities.includes(priority)) ?? "none";
}

/**
 * The buckets a drop is allowed to WRITE, strongest preference first.
 *
 * "none" is deliberately absent. Satisfying it would mean clearing `dueDate` —
 * deleting a deadline the user chose, by dragging a card. That is the exact
 * accident D1 exists to prevent (§4.2), so a box that only accepts undated
 * work simply cannot be dropped on.
 *
 * "overdue" is last: writing yesterday onto a task makes it late on purpose,
 * which is only ever right when the box asks for nothing else.
 */
const WRITABLE_BUCKETS: readonly DateBucket[] = ["today", "tomorrow", "later", "overdue"];

export function dateForBuckets(buckets: readonly DateBucket[], today: string): string | null {
  const bucket = WRITABLE_BUCKETS.find((candidate) => buckets.includes(candidate));
  if (!bucket) return null;
  if (bucket === "today") return today;
  if (bucket === "tomorrow") return addDays(today, 1);
  if (bucket === "later") return addDays(today, 7);
  return addDays(today, -1);
}

/**
 * Why a box will not take a card.
 *
 * Named rather than boolean because a refusal the reader cannot explain is
 * indistinguishable from a bug — "it just would not drop" is the bug report
 * this type exists to prevent. Each value maps to one sentence the box says
 * while the card is over it.
 */
export type DropRefusal = "list" | "tag" | "dueDate";

export type DropOutcome =
  | { accepted: true; patch: Partial<Task> }
  | { accepted: false; reason: DropRefusal };

/**
 * Moving a card into a box.
 *
 * Three answers, not two:
 *
 *   accepted, patch {}    already matches; the drop changes nothing and must
 *                         not touch `updatedAt` (the contract
 *                         `patchForQuadrant` has always had)
 *   accepted, patch {…}   the fields to write
 *   refused               this box cannot accept this task
 *
 * A refusal happens when satisfying the rule would need a LIST, a TAG, or the
 * deletion of a due date. The caller's job is then to refuse the drop before
 * it lands — §23.5 — rather than to write any of those three.
 */
export function dropOutcomeForRule(task: Task, rule: ViewRule, context: RuleContext): DropOutcome {
  if (rule.listIds.length > 0 && !rule.listIds.includes(context.listId)) {
    return { accepted: false, reason: "list" };
  }
  if (rule.tagIds.length > 0 && !task.tags.some((tag) => rule.tagIds.includes(tag))) {
    return { accepted: false, reason: "tag" };
  }

  const patch: Partial<Task> = {};

  if (rule.priorities.length > 0 && !rule.priorities.includes(task.priority)) {
    patch.priority = strongestPriority(rule.priorities);
  }

  if (rule.dateBuckets.length > 0 && !rule.dateBuckets.includes(dateBucketOf(task, context.today))) {
    const dueDate = dateForBuckets(rule.dateBuckets, context.today);
    if (dueDate === null) return { accepted: false, reason: "dueDate" };
    patch.dueDate = dueDate;
  }

  return { accepted: true, patch };
}

/** The patch alone, with a refusal flattened to `null`. */
export function patchForRule(task: Task, rule: ViewRule, context: RuleContext): Partial<Task> | null {
  const outcome = dropOutcomeForRule(task, rule, context);
  return outcome.accepted ? outcome.patch : null;
}

/** The fields a task typed straight into a box is born with. */
export interface RuleDraft {
  priority?: TaskPriority;
  dueDate?: string;
  listId?: string;
  tags?: string[];
}

/**
 * Unlike a drop, this MAY set a list and tags: a new task has no membership to
 * overwrite, so there is nothing to lose by filing it where the box says
 * (§23.6). The reference documents the same behaviour — a task added to
 * "urgent & important" under combination 2 is born today and high.
 */
export function draftForRule(rule: ViewRule, context: RuleContext): RuleDraft {
  const draft: RuleDraft = {};
  if (rule.priorities.length > 0) draft.priority = strongestPriority(rule.priorities);
  // A rule that accepts undated work gets an undated task: the box is already
  // satisfied, and inventing a deadline nobody typed is worse than no date.
  if (rule.dateBuckets.length > 0 && !rule.dateBuckets.includes("none")) {
    const dueDate = dateForBuckets(rule.dateBuckets, context.today);
    if (dueDate) draft.dueDate = dueDate;
  }
  if (rule.listIds.length > 0) draft.listId = rule.listIds[0];
  if (rule.tagIds.length > 0) draft.tags = [rule.tagIds[0]];
  return draft;
}

function dimensionsOverlap(a: readonly string[], b: readonly string[]): boolean {
  // An empty side is "전체", which intersects everything.
  if (a.length === 0 || b.length === 0) return true;
  return a.some((value) => b.includes(value));
}

/**
 * Whether two boxes can claim the same task.
 *
 * Exact, not a guess: two rules overlap when EVERY dimension's value sets
 * intersect. The editor warns with this rather than refusing to save — an app
 * that rejects the arrangement someone asked for is worse than one that
 * resolves it predictably and says how (§23.4).
 */
export function rulesOverlap(a: ViewRule, b: ViewRule): boolean {
  return (
    dimensionsOverlap(a.listIds, b.listIds) &&
    dimensionsOverlap(a.tagIds, b.tagIds) &&
    dimensionsOverlap(a.dateBuckets, b.dateBuckets) &&
    dimensionsOverlap(a.priorities, b.priorities)
  );
}
