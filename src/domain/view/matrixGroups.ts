// What a matrix box is called, and how it wants its contents arranged.
//
// The arranging is in `viewGroups.ts` — both boards do it, and doing it under
// this file's name is what §15.6 of the Inbox document called the same lie one
// size down. What is genuinely the Matrix's is here: a quadrant may be given a
// name, a second line and a colour (§20.6), and those ride along with the
// grouping options in one stored record per box.
import { LIST_COLOR_PRESETS } from "../tasks/listColor";
import {
  DEFAULT_GROUP_VIEW,
  GROUP_AXES,
  SORT_KEYS,
  SORT_ORDERS,
  type GroupAxis,
  type GroupView,
  type SortKey,
  type SortOrder,
} from "./viewGroups";

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

export interface MatrixQuadrantView extends GroupView {
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

/** The shared default, under the name this screen's callers already use. */
export const DEFAULT_MATRIX_VIEW: MatrixQuadrantView = DEFAULT_GROUP_VIEW;

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

/**
 * A stored view, as this build understands it.
 *
 * These live in the user's settings and sync, so a value written by another
 * version — or a key this one has retired — must fold to something drawable
 * rather than crash a box.
 */
export function sanitizeMatrixView(value: unknown): MatrixQuadrantView {
  const record = (value ?? {}) as Partial<MatrixQuadrantView>;
  const name = sanitizeLabel(record.name);
  const hint = sanitizeLabel(record.hint);
  const color = MATRIX_QUADRANT_COLORS.includes(record.color as string) ? (record.color as string) : "";
  return {
    groupBy: GROUP_AXES.includes(record.groupBy as GroupAxis)
      ? (record.groupBy as GroupAxis)
      : DEFAULT_MATRIX_VIEW.groupBy,
    sortKey: SORT_KEYS.includes(record.sortKey as SortKey)
      ? (record.sortKey as SortKey)
      : DEFAULT_MATRIX_VIEW.sortKey,
    sortOrder: SORT_ORDERS.includes(record.sortOrder as SortOrder)
      ? (record.sortOrder as SortOrder)
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
