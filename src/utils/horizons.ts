// Time-horizon derivation (HORIZONS_DESIGN.md D2).
//
// The horizon a goal sits on is never stored — it is derived from the item's
// target date, the same rule the Eisenhower quadrant follows in eisenhower.ts:
//
//   "Nothing stores the quadrant itself, so the two can never disagree."
//
// Dragging a card between horizon columns therefore writes a date, not a
// horizon, and the column it lands in is recomputed from that date.
import { addDays, daysBetween } from "./date";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type Horizon = "life" | "year" | "month" | "week" | "day";

// Widest first: this is also the render order of the columns, and the order
// they are dropped in when the window is too narrow for all five (the near
// horizons are the ones a narrow screen still needs — D8).
export const HORIZONS: readonly Horizon[] = ["life", "year", "month", "week", "day"] as const;

// Upper bound in days from today for each bounded horizon; anything past the
// last one is "life". Tunable in one place on purpose — these boundaries are
// a judgement call, not a fact.
export const HORIZON_BOUNDS: Readonly<Record<Exclude<Horizon, "life">, number>> = {
  day: 0,
  week: 7,
  month: 90,
  year: 365,
};

/**
 * Which horizon an item with this target date belongs to.
 *
 * No date at all means "life": an intention with no deadline is exactly what
 * the widest horizon is for, so an undated goal is placed rather than hidden.
 * A date in the past collapses to "day" — overdue work is today's problem,
 * not last month's.
 */
/**
 * The date a card dropped on this horizon should carry.
 *
 * Aimed at the middle of the band rather than its edge, so an item does not
 * sit one day from falling into the next column down. "life" is undated by
 * definition — that is what the horizon means, not a date very far away.
 */
export function dateForHorizonDrop(horizon: Horizon, today: string): string | undefined {
  const offsets: Partial<Record<Horizon, number>> = { day: 0, week: 3, month: 45, year: 180 };
  const offset = offsets[horizon];
  if (offset === undefined) return undefined;
  // addDays, not toISOString on a local-midnight Date: the latter converts to
  // UTC and lands a day early everywhere east of Greenwich.
  return addDays(today, offset);
}

/**
 * Whether an item of this kind may be dropped on this horizon.
 *
 * Goals and milestones go anywhere, including the undated "life" column.
 * Tasks do not: a task is a unit of work with a day attached, and dropping one
 * on "life" would clear its date, which drops it out of every horizon column
 * and silently back into the Inbox. Refusing the drop is more honest than
 * making the card disappear.
 */
export function canDropOnHorizon(sourceType: "path" | "milestone" | "task", horizon: Horizon): boolean {
  if (sourceType !== "task") return true;
  return horizon === "day" || horizon === "week" || horizon === "month";
}

export function deriveHorizon(targetDate: string | undefined, today: string): Horizon {
  // The shape is checked here rather than leaning on daysBetween, which
  // returns 0 for an unparseable date — that would land a garbage value on
  // "day", the one horizon where a wrong item is most disruptive.
  if (!targetDate || !ISO_DATE.test(targetDate)) return "life";
  const days = daysBetween(today, targetDate);
  if (days <= HORIZON_BOUNDS.day) return "day";
  if (days <= HORIZON_BOUNDS.week) return "week";
  if (days <= HORIZON_BOUNDS.month) return "month";
  if (days <= HORIZON_BOUNDS.year) return "year";
  return "life";
}
