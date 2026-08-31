// The matrix's four boxes, said in the vocabulary of `viewRules`.
//
// Until Phase 6a the box WAS the priority: `quadrantOf` read one field and the
// four boxes covered every task exactly once (D1). That is one of the reference
// app's two presets, and it is the one this app shipped hard-coded
// (TICKTICK_MATRIX_DESIGN.md §20.1). Since then the rule is a stored value, so
// the four boxes can be something else if the user says so.
//
// The cost is stated plainly in §23: after this, a quadrant is a SAVED FILTER.
// It stays derived — nothing writes a `quadrant` onto a task — but it stops
// being total (a task can match no box) and stops being 1:1 (a task can match
// two). What is left in this file is exactly the part of that which is the
// MATRIX's: the four defaults, the presets, and reading order as the tie-break.
// Everything a rule can say, and everything a drop may write, is shared with
// the Board and lives in `viewRules.ts` (§7 Q3 of the Inbox document).
import type { Task } from "../../types";
import { MATRIX_QUADRANTS, type MatrixQuadrant } from "../../utils/eisenhower";
import {
  matchesRule,
  priorityRule,
  sanitizeRule,
  type RuleContext,
  type ViewRule,
} from "./viewRules";

export type MatrixQuadrantRules = Record<MatrixQuadrant, ViewRule>;

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

export function sanitizeMatrixRules(
  value: Partial<Record<MatrixQuadrant, unknown>>,
): Partial<MatrixQuadrantRules> {
  const rules: Partial<MatrixQuadrantRules> = {};
  for (const quadrant of MATRIX_QUADRANTS) {
    const stored = value?.[quadrant];
    if (stored) rules[quadrant] = sanitizeRule(stored);
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
  context: RuleContext,
): MatrixQuadrant | null {
  for (const quadrant of MATRIX_QUADRANTS) {
    if (matchesRule(task, rules[quadrant], context)) return quadrant;
  }
  return null;
}
