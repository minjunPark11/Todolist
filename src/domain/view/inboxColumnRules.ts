// What belongs in an Inbox board column, as data rather than as a constant.
//
// `INBOX_COLUMNS` is a frozen array of three, and membership is computed by
// `inboxBucketOf` reading two fields. That is why four of the five items the
// reference app puts behind a column's ⋯ menu have no answer here: renaming a
// column leaves its meaning untouched, deleting one leaves its tasks nowhere,
// adding one has no rule to give it, and reordering has nothing to store
// (TICKTICK_INBOX_COLUMNS_DESIGN.md §3). This module is what makes them
// answerable, and it ships without a screen — phase 4 has to build the place
// an unmatched task is reported BEFORE phase 5 hands anybody a delete button.
//
// The vocabulary is the Matrix's, deliberately and not by accident of reuse.
// "What belongs in this container" is the same question on both screens, and
// §23 already answered it once with lists, tags, date buckets and priorities.
// The one thing it could not say was `언젠가` — so `DateBucket` gained a
// sixth member rather than this module growing a dimension of its own, which
// keeps ONE vocabulary for both screens and is the evidence §7's Q3 was
// waiting for: when phase 5 builds one editor, it edits one shape.
//
// Gate 7 is not weakened by sharing it. What a rule MEANS is shared; what a
// drop may WRITE is not, and that stays with each board's own adapter — the
// Matrix writes priority and date, the Inbox writes `isSomeday` and date, and
// neither has ever been able to write the other's field.
import type { Task } from "../../types";
import { INBOX_BUCKETS, type InboxBucket } from "../tasks/board";
import {
  EMPTY_MATRIX_RULE,
  matchesMatrixRule,
  sanitizeMatrixRule,
  type MatrixQuadrantRule,
  type MatrixRuleContext,
} from "./matrixRules";

/**
 * One column's conditions.
 *
 * The Matrix's shape under another name, because it is the same shape and
 * naming it again here would be a second thing to keep in step. The alias is
 * what a later rename can move without touching either caller.
 */
export type InboxColumnRule = MatrixQuadrantRule;
export type InboxColumnRules = Record<InboxBucket, InboxColumnRule>;

/**
 * The three columns this app has always drawn, said as rules.
 *
 * Every one of them is a date bucket and nothing else, which is the honest
 * reading of what §6.24 built: an Inbox column is a statement about WHEN, and
 * the list, tag and priority rows exist for columns nobody has made yet.
 *
 * `inboxColumnRules.test.ts` asserts these against `inboxBucketOf` over every
 * combination of the two fields — the same way Phase 6a pinned the Matrix's
 * default rules against the `quadrantOf` they replaced. An account that never
 * edits a column has to see exactly what it sees today, and "exactly" is a
 * property worth a test rather than a promise.
 */
export const DEFAULT_INBOX_COLUMN_RULES: InboxColumnRules = {
  unsorted: { ...EMPTY_MATRIX_RULE, dateBuckets: ["none"] },
  scheduled: { ...EMPTY_MATRIX_RULE, dateBuckets: ["overdue", "today", "tomorrow", "later"] },
  someday: { ...EMPTY_MATRIX_RULE, dateBuckets: ["someday"] },
};

/**
 * A stored set, as this build understands it.
 *
 * A column missing from storage reads as its default rather than as "no
 * conditions" — an absent key means the user never touched that column, and
 * `EMPTY_MATRIX_RULE` would make it swallow every task in the Inbox.
 */
export function sanitizeInboxColumnRules(value: unknown): Partial<InboxColumnRules> {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const out: Partial<InboxColumnRules> = {};
  for (const bucket of INBOX_BUCKETS) {
    if (record[bucket] === undefined) continue;
    out[bucket] = sanitizeMatrixRule(record[bucket]);
  }
  return out;
}

/** The stored set filled in with the defaults, so callers get all three. */
export function resolveInboxColumnRules(stored?: Partial<InboxColumnRules>): InboxColumnRules {
  return {
    unsorted: stored?.unsorted ?? DEFAULT_INBOX_COLUMN_RULES.unsorted,
    scheduled: stored?.scheduled ?? DEFAULT_INBOX_COLUMN_RULES.scheduled,
    someday: stored?.someday ?? DEFAULT_INBOX_COLUMN_RULES.someday,
  };
}

/**
 * Which column a task is in, or `null` for none of them.
 *
 * Reading order, first match wins — the Matrix's §23.4 answer, and for the
 * same reason: two columns matching is a state the user built, and the one on
 * the left is the one they read first.
 *
 * `null` is a real answer. Under the defaults it is unreachable (the three
 * buckets partition every task), which the test states outright — but the
 * moment a column's rule is edited it becomes reachable, and phase 4's
 * remainder row is what has to be standing before that happens.
 */
export function columnForTask(task: Task, rules: InboxColumnRules, context: MatrixRuleContext): InboxBucket | null {
  for (const bucket of INBOX_BUCKETS) {
    if (matchesMatrixRule(task, rules[bucket], context)) return bucket;
  }
  return null;
}
