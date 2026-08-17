// Which calendar period a date falls in (HORIZONS_DESIGN.md D2).
//
// What is left after the Horizons screen went. This was that screen's model:
// five columns, life to day, that a goal was dragged between — plus the render
// order, the drop rules, and the date a drop should write. All of that had one
// reader, and it is gone.
//
// The derivation stays because goal scheduling still needs it. A goal written
// before schedules existed carries only a `targetDate`, and
// `normalizeGoalSchedule` reads a unit out of it by asking which period that
// date lands in. Same rule the Eisenhower quadrant follows in eisenhower.ts:
//
//   "Nothing stores the quadrant itself, so the two can never disagree."
import { daysBetween } from "./date";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type Horizon = "life" | "year" | "month" | "week" | "day";

// Upper bound in days from today for each bounded period; anything past the
// last one is "life". Tunable in one place on purpose — these boundaries are
// a judgement call, not a fact.
const HORIZON_BOUNDS: Readonly<Record<Exclude<Horizon, "life">, number>> = {
  day: 0,
  week: 7,
  month: 90,
  year: 365,
};

/**
 * Which period an item with this target date belongs to.
 *
 * No date at all means "life": an intention with no deadline belongs to the
 * widest period rather than to none. A date in the past collapses to "day" —
 * overdue work is today's problem, not last month's.
 */
export function deriveHorizon(targetDate: string | undefined, today: string): Horizon {
  // The shape is checked here rather than leaning on daysBetween, which
  // returns 0 for an unparseable date — that would land a garbage value on
  // "day", the one period where a wrong item is most disruptive.
  if (!targetDate || !ISO_DATE.test(targetDate)) return "life";
  const days = daysBetween(today, targetDate);
  if (days <= HORIZON_BOUNDS.day) return "day";
  if (days <= HORIZON_BOUNDS.week) return "week";
  if (days <= HORIZON_BOUNDS.month) return "month";
  if (days <= HORIZON_BOUNDS.year) return "year";
  return "life";
}
