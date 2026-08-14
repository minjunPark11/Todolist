import type { GoalSchedule } from "../../lib/ai/learningPaths/types";
import { addDays, addMonths } from "../../utils/date";
import { deriveHorizon, type Horizon } from "../../utils/horizons";
import { anchorForGoalUnit, type ScheduledGoalUnit } from "./goalSchedule";

export interface HorizonAnchors {
  year: string;
  month: string;
  week: string;
  day: string;
}

export function createHorizonAnchors(today: string): HorizonAnchors {
  return {
    year: anchorForGoalUnit("year", today)!,
    month: anchorForGoalUnit("month", today)!,
    week: anchorForGoalUnit("week", today)!,
    day: anchorForGoalUnit("day", today)!,
  };
}

export function shiftHorizonAnchor(unit: ScheduledGoalUnit, anchor: string, amount: number): string {
  if (unit === "year") {
    const year = Number(anchor.slice(0, 4)) + amount;
    return `${String(year).padStart(4, "0")}-01-01`;
  }
  if (unit === "month") return addMonths(anchor, amount).slice(0, 7) + "-01";
  if (unit === "week") return addDays(anchor, amount * 7);
  return addDays(anchor, amount);
}

export function scheduleForHorizon(horizon: Horizon, anchors: HorizonAnchors): GoalSchedule {
  if (horizon === "life") return { unit: "life" };
  return { unit: horizon, startDate: anchors[horizon] };
}

export function anchorForTaskDate(targetDate: string, today: string): { horizon: Horizon; anchor?: string } {
  const horizon = deriveHorizon(targetDate, today);
  if (horizon === "life") return { horizon };
  // The legacy task model treats overdue work as today's problem. Preserve
  // that behavior while Goals move to exact calendar-period anchors.
  if (horizon === "day" && targetDate < today) return { horizon, anchor: today };
  return { horizon, anchor: anchorForGoalUnit(horizon, targetDate) };
}

// Compatibility placement for dated Tasks. Goals and milestones never use a
// representative date now; they store the selected GoalSchedule directly.
export function dateForTaskAnchorDrop(horizon: Horizon, anchors: HorizonAnchors): string | undefined {
  if (horizon === "day") return anchors.day;
  if (horizon === "week") return addDays(anchors.week, 3);
  if (horizon === "month") return addDays(anchors.month, 14);
  if (horizon === "year") return addMonths(anchors.year, 6);
  return undefined;
}

export function isCurrentHorizonAnchor(
  horizon: Horizon,
  anchors: HorizonAnchors,
  current: HorizonAnchors,
): boolean {
  return horizon === "life" || anchors[horizon] === current[horizon];
}
