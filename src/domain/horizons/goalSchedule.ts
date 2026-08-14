import type { GoalSchedule } from "../../lib/ai/learningPaths/types";
import { getWeekStart, todayValue } from "../../utils/date";
import { deriveHorizon, type Horizon } from "../../utils/horizons";

export type ScheduledGoalUnit = Exclude<GoalSchedule["unit"], "unscheduled" | "life">;
export type VisibleGoalUnit = Exclude<GoalSchedule["unit"], "unscheduled">;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoCalendarDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= monthDays[month - 1];
}

export function anchorForGoalUnit(unit: ScheduledGoalUnit, dateValue: string): string | undefined {
  if (!isIsoCalendarDate(dateValue)) return undefined;
  if (unit === "year") return `${dateValue.slice(0, 4)}-01-01`;
  if (unit === "month") return `${dateValue.slice(0, 7)}-01`;
  if (unit === "week") return getWeekStart(dateValue);
  return dateValue;
}

function scheduleFromLegacyTarget(targetDate: string, today: string): GoalSchedule {
  const horizon = deriveHorizon(targetDate, today);
  if (horizon === "life") return { unit: "life" };
  return { unit: horizon, startDate: anchorForGoalUnit(horizon, targetDate)! };
}

export function normalizeGoalSchedule(
  schedule: unknown,
  fallbackTargetDate?: unknown,
  today = todayValue(),
): GoalSchedule {
  if (schedule !== undefined && schedule !== null) {
    if (!schedule || typeof schedule !== "object") return { unit: "unscheduled" };
    const record = schedule as Record<string, unknown>;
    if (record.unit === "unscheduled" || record.unit === "life") return { unit: record.unit };
    if (record.unit !== "year" && record.unit !== "month" && record.unit !== "week" && record.unit !== "day") {
      return { unit: "unscheduled" };
    }
    if (!isIsoCalendarDate(record.startDate)) return { unit: "unscheduled" };
    return { unit: record.unit, startDate: anchorForGoalUnit(record.unit, record.startDate)! };
  }

  if (fallbackTargetDate === undefined || fallbackTargetDate === null || fallbackTargetDate === "") {
    return { unit: "life" };
  }
  if (!isIsoCalendarDate(fallbackTargetDate)) return { unit: "unscheduled" };
  return scheduleFromLegacyTarget(fallbackTargetDate, today);
}

export function representativeTargetDate(schedule: GoalSchedule): string | undefined {
  return "startDate" in schedule ? schedule.startDate : undefined;
}

export interface GoalTimingFields {
  schedule?: GoalSchedule;
  deadlineDate?: string;
  targetDate?: string;
}

export interface GoalTimingInput {
  schedule?: unknown;
  deadlineDate?: unknown;
  targetDate?: unknown;
}

export function normalizeGoalTiming(fields: GoalTimingInput, today = todayValue()): Required<Pick<GoalTimingFields, "schedule">> & Omit<GoalTimingFields, "schedule"> {
  const schedule = normalizeGoalSchedule(fields.schedule, fields.targetDate, today);
  const legacyDeadline = isIsoCalendarDate(fields.targetDate) ? fields.targetDate : undefined;
  const deadlineDate = isIsoCalendarDate(fields.deadlineDate) ? fields.deadlineDate : legacyDeadline;
  return {
    schedule,
    deadlineDate,
    targetDate: representativeTargetDate(schedule),
  };
}

export function applyGoalTimingPatch(
  current: GoalTimingFields,
  patch: GoalTimingFields,
  today = todayValue(),
): Required<Pick<GoalTimingFields, "schedule">> & Omit<GoalTimingFields, "schedule"> {
  const hasSchedule = Object.prototype.hasOwnProperty.call(patch, "schedule");
  const hasTargetDate = Object.prototype.hasOwnProperty.call(patch, "targetDate");
  const hasDeadline = Object.prototype.hasOwnProperty.call(patch, "deadlineDate");
  const schedule = normalizeGoalSchedule(
    hasSchedule ? patch.schedule : hasTargetDate ? undefined : current.schedule,
    hasTargetDate ? patch.targetDate : current.targetDate,
    today,
  );
  const deadlineCandidate = hasDeadline ? patch.deadlineDate : current.deadlineDate;
  return {
    schedule,
    deadlineDate: isIsoCalendarDate(deadlineCandidate) ? deadlineCandidate : undefined,
    targetDate: representativeTargetDate(schedule),
  };
}

export function matchesGoalAnchor(schedule: GoalSchedule, unit: VisibleGoalUnit, anchor?: string): boolean {
  if (schedule.unit !== unit) return false;
  if (unit === "life") return true;
  if (!("startDate" in schedule) || !anchor) return false;
  return schedule.startDate === anchorForGoalUnit(unit, anchor);
}

export function isGoalCarryover(
  goal: GoalTimingFields & { completedAt?: string },
  unit: ScheduledGoalUnit,
  currentAnchor: string,
  today = todayValue(),
): boolean {
  if (goal.completedAt) return false;
  const actualAnchor = anchorForGoalUnit(unit, today);
  if (!actualAnchor || currentAnchor !== actualAnchor) return false;
  const schedule = normalizeGoalSchedule(goal.schedule, goal.targetDate, today);
  return schedule.unit === unit && schedule.startDate < currentAnchor;
}

export function horizonForGoalSchedule(schedule: GoalSchedule): Horizon | null {
  return schedule.unit === "unscheduled" ? null : schedule.unit;
}
