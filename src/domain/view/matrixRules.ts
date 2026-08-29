// What belongs in a matrix box, as data rather than as a hard-coded rule.
//
// Until now the box WAS the priority: `quadrantOf` read one field and the four
// boxes covered every task exactly once (D1). That is one of the reference
// app's two presets, and it is the one this app shipped hard-coded
// (TICKTICK_MATRIX_DESIGN.md §20.1). This module is the other half of that
// discovery — the rule becomes a stored value, so the four boxes can be
// something else if the user says so.
//
// The cost is stated plainly in §23: after this, a quadrant is a SAVED FILTER.
// It stays derived — nothing writes a `quadrant` onto a task — but it stops
// being total (a task can match no box) and stops being 1:1 (a task can match
// two). The three answers this module encodes:
//
//   - No match is `null`, never a silent disappearance. Whoever asks has to
//     deal with the answer; §23.3's line under the grid is what deals with it.
//   - Two matches go to the FIRST box in reading order. Ⅰ winning is
//     deliberate: work wrongly raised to "do first" gets seen and corrected,
//     work wrongly dropped into "later" does not.
//   - A drop writes PRIORITY and DATE only. Never a list, never a tag, and
//     never a date ERASURE. A box that would need one of those to accept a
//     card cannot accept it, and says so before the drop rather than silently
//     rewriting what the task belongs to (§23.5). That is the whole of §4.2's
//     lesson, kept intact through a change that could easily have lost it.
//
// Nothing here reads the screen, and nothing here is wired to it yet: 6a ships
// the rules, storage and tests; `MatrixPage` still calls `quadrantOf` until
// §23.9's 6b builds the place where an unmatched task is reported. Wiring it
// first would open exactly the window — a task matching nothing and drawn
// nowhere — that this plan is ordered to avoid.
import type { Task, TaskPriority } from "../../types";
import { MATRIX_QUADRANTS, type MatrixQuadrant } from "../../utils/eisenhower";
import { dateBucketOf, type DateBucket } from "./matrixGroups";
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
export interface MatrixQuadrantRule {
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

export type MatrixQuadrantRules = Record<MatrixQuadrant, MatrixQuadrantRule>;

/** No conditions at all — matches every task. */
export const EMPTY_MATRIX_RULE: MatrixQuadrantRule = {
  listIds: [],
  tagIds: [],
  dateBuckets: [],
  priorities: [],
};

function priorityRule(priority: TaskPriority): MatrixQuadrantRule {
  return { ...EMPTY_MATRIX_RULE, priorities: [priority] };
}

/**
 * The reference's "Rule combination 1", and this app's D1.
 *
 * An account that never opens the editor stores nothing and reads exactly as
 * it does today — `quadrantForTask` under these is total and 1:1, which
 * `matrixRules.test.ts` asserts against `quadrantOf` directly.
 */
export const DEFAULT_MATRIX_RULES: MatrixQuadrantRules = {
  I: priorityRule("high"),
  II: priorityRule("medium"),
  III: priorityRule("low"),
  IV: priorityRule("none"),
};

/**
 * The reference's "Rule combination 2" — importance from the priority, urgency
 * from the date (§20.1).
 *
 * This is the rule this app DELETED in Phase 1, back when it was believed to
 * be a mistake rather than a preset. It comes back as data rather than as
 * code, and with one difference that matters: under it a drop writes a date,
 * which is the accident §4.2 was written about — but only for someone who
 * chose a rule that says "urgency is the date". A promise kept is not a
 * surprise; the accident was a rule nobody chose erasing a date nobody
 * mentioned.
 */
export const TIME_AND_PRIORITY_MATRIX_RULES: MatrixQuadrantRules = {
  I: { listIds: [], tagIds: [], dateBuckets: ["overdue", "today", "tomorrow"], priorities: ["high", "medium"] },
  II: { listIds: [], tagIds: [], dateBuckets: ["later", "none", "someday"], priorities: ["high", "medium"] },
  III: { listIds: [], tagIds: [], dateBuckets: ["overdue", "today", "tomorrow"], priorities: ["low", "none"] },
  IV: { listIds: [], tagIds: [], dateBuckets: ["later", "none", "someday"], priorities: ["low", "none"] },
};

export const MATRIX_RULE_PRESETS = {
  priority: DEFAULT_MATRIX_RULES,
  timeAndPriority: TIME_AND_PRIORITY_MATRIX_RULES,
} as const;

export type MatrixRulePresetId = keyof typeof MATRIX_RULE_PRESETS;

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
export function sanitizeMatrixRule(value: unknown): MatrixQuadrantRule {
  const record = (value ?? {}) as Partial<MatrixQuadrantRule>;
  return {
    listIds: sanitizeMembers(record.listIds),
    tagIds: sanitizeMembers(record.tagIds),
    dateBuckets: sanitizeMembers(record.dateBuckets, DATE_BUCKETS),
    priorities: sanitizeMembers(record.priorities, PRIORITIES),
  };
}

export function sanitizeMatrixRules(
  value: Partial<Record<MatrixQuadrant, unknown>>,
): Partial<MatrixQuadrantRules> {
  const rules: Partial<MatrixQuadrantRules> = {};
  for (const quadrant of MATRIX_QUADRANTS) {
    const stored = value?.[quadrant];
    if (stored) rules[quadrant] = sanitizeMatrixRule(stored);
  }
  return rules;
}

/**
 * The four rules in force.
 *
 * A box the user has not touched reads as its DEFAULT, not as "no conditions"
 * — an empty rule matches everything, so treating absence that way would let
 * Ⅰ swallow the entire account the moment anyone edited one box.
 */
export function resolveMatrixRules(stored?: Partial<MatrixQuadrantRules>): MatrixQuadrantRules {
  return {
    I: stored?.I ?? DEFAULT_MATRIX_RULES.I,
    II: stored?.II ?? DEFAULT_MATRIX_RULES.II,
    III: stored?.III ?? DEFAULT_MATRIX_RULES.III,
    IV: stored?.IV ?? DEFAULT_MATRIX_RULES.IV,
  };
}

/** What a rule has to be asked against, beyond the task itself. */
export interface MatrixRuleContext {
  today: string;
  /** The task's owning List, already resolved by the caller (`listIdFor`). */
  listId: string;
}

export function matchesMatrixRule(
  task: Task,
  rule: MatrixQuadrantRule,
  context: MatrixRuleContext,
): boolean {
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

/**
 * Which box a task is in, or `null` for none of them.
 *
 * Reading order, first match wins (§23.4). `null` is a real answer and the
 * caller must draw it somewhere — §23.3's line under the grid — because a task
 * that is in the account and on no screen is the worst bug a to-do app has.
 */
export function quadrantForTask(
  task: Task,
  rules: MatrixQuadrantRules,
  context: MatrixRuleContext,
): MatrixQuadrant | null {
  for (const quadrant of MATRIX_QUADRANTS) {
    if (matchesMatrixRule(task, rules[quadrant], context)) return quadrant;
  }
  return null;
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

function dateForBuckets(buckets: readonly DateBucket[], today: string): string | null {
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
export type MatrixDropRefusal = "list" | "tag" | "dueDate";

export type MatrixDropOutcome =
  | { accepted: true; patch: Partial<Task> }
  | { accepted: false; reason: MatrixDropRefusal };

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
export function dropOutcomeForRule(
  task: Task,
  rule: MatrixQuadrantRule,
  context: MatrixRuleContext,
): MatrixDropOutcome {
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
export function patchForRule(
  task: Task,
  rule: MatrixQuadrantRule,
  context: MatrixRuleContext,
): Partial<Task> | null {
  const outcome = dropOutcomeForRule(task, rule, context);
  return outcome.accepted ? outcome.patch : null;
}

/** The fields a task typed straight into a box is born with. */
export interface MatrixRuleDraft {
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
export function draftForRule(rule: MatrixQuadrantRule, context: MatrixRuleContext): MatrixRuleDraft {
  const draft: MatrixRuleDraft = {};
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
export function matrixRulesOverlap(a: MatrixQuadrantRule, b: MatrixQuadrantRule): boolean {
  return (
    dimensionsOverlap(a.listIds, b.listIds) &&
    dimensionsOverlap(a.tagIds, b.tagIds) &&
    dimensionsOverlap(a.dateBuckets, b.dateBuckets) &&
    dimensionsOverlap(a.priorities, b.priorities)
  );
}
