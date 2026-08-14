import { describe, expect, it } from "vitest";
import {
  anchorForGoalUnit,
  applyGoalTimingPatch,
  isGoalCarryover,
  isIsoCalendarDate,
  matchesGoalAnchor,
  normalizeGoalSchedule,
  normalizeGoalTiming,
} from "./goalSchedule";

const TODAY = "2026-08-14";

describe("normalizeGoalSchedule", () => {
  it("normalizes every bounded unit to its local calendar start", () => {
    expect(normalizeGoalSchedule({ unit: "year", startDate: "2027-09-23" }, undefined, TODAY)).toEqual({
      unit: "year",
      startDate: "2027-01-01",
    });
    expect(normalizeGoalSchedule({ unit: "month", startDate: "2026-09-23" }, undefined, TODAY)).toEqual({
      unit: "month",
      startDate: "2026-09-01",
    });
    expect(normalizeGoalSchedule({ unit: "week", startDate: "2026-08-20" }, undefined, TODAY)).toEqual({
      unit: "week",
      startDate: "2026-08-16",
    });
    expect(normalizeGoalSchedule({ unit: "day", startDate: "2026-08-20" }, undefined, TODAY)).toEqual({
      unit: "day",
      startDate: "2026-08-20",
    });
  });

  it("removes stray dates from life and unscheduled", () => {
    expect(normalizeGoalSchedule({ unit: "life", startDate: "2027-01-01" }, undefined, TODAY)).toEqual({ unit: "life" });
    expect(normalizeGoalSchedule({ unit: "unscheduled", startDate: "2027-01-01" }, undefined, TODAY)).toEqual({ unit: "unscheduled" });
  });

  it("sends malformed schedules to unscheduled, not life", () => {
    expect(normalizeGoalSchedule({ unit: "month", startDate: "2026-02-31" }, undefined, TODAY)).toEqual({ unit: "unscheduled" });
    expect(normalizeGoalSchedule({ unit: "quarter", startDate: "2026-01-01" }, undefined, TODAY)).toEqual({ unit: "unscheduled" });
  });

  it("migrates legacy targetDate using the old visible horizon", () => {
    expect(normalizeGoalSchedule(undefined, "2026-08-17", TODAY)).toEqual({ unit: "week", startDate: "2026-08-16" });
    expect(normalizeGoalSchedule(undefined, "2026-09-10", TODAY)).toEqual({ unit: "month", startDate: "2026-09-01" });
    expect(normalizeGoalSchedule(undefined, "2027-03-01", TODAY)).toEqual({ unit: "year", startDate: "2027-01-01" });
    expect(normalizeGoalSchedule(undefined, "2028-01-01", TODAY)).toEqual({ unit: "life" });
    expect(normalizeGoalSchedule(undefined, undefined, TODAY)).toEqual({ unit: "life" });
  });

  it("preserves date-only values across DST boundary dates", () => {
    expect(anchorForGoalUnit("week", "2026-03-08")).toBe("2026-03-08");
    expect(anchorForGoalUnit("week", "2026-11-01")).toBe("2026-11-01");
    expect(normalizeGoalSchedule({ unit: "day", startDate: "2026-03-08" }, undefined, TODAY)).toEqual({
      unit: "day",
      startDate: "2026-03-08",
    });
  });
});

describe("goal timing compatibility", () => {
  it("preserves a legacy date as deadline while dual-writing the period representative", () => {
    expect(normalizeGoalTiming({ targetDate: "2026-09-25" }, TODAY)).toEqual({
      schedule: { unit: "month", startDate: "2026-09-01" },
      deadlineDate: "2026-09-25",
      targetDate: "2026-09-01",
    });
  });

  it("uses schedule as truth when schedule and legacy target disagree", () => {
    expect(
      normalizeGoalTiming(
        { schedule: { unit: "year", startDate: "2027-08-01" }, targetDate: "2026-09-25" },
        TODAY,
      ),
    ).toEqual({
      schedule: { unit: "year", startDate: "2027-01-01" },
      deadlineDate: "2026-09-25",
      targetDate: "2027-01-01",
    });
  });

  it("moves the plan through a legacy target patch without overwriting its deadline", () => {
    expect(
      applyGoalTimingPatch(
        {
          schedule: { unit: "month", startDate: "2026-09-01" },
          deadlineDate: "2026-09-25",
          targetDate: "2026-09-01",
        },
        { targetDate: "2027-03-01" },
        TODAY,
      ),
    ).toEqual({
      schedule: { unit: "year", startDate: "2027-01-01" },
      deadlineDate: "2026-09-25",
      targetDate: "2027-01-01",
    });
  });
});

describe("anchor matching and carryover", () => {
  it("matches only the same normalized unit and anchor", () => {
    const schedule = { unit: "month", startDate: "2026-09-01" } as const;
    expect(matchesGoalAnchor(schedule, "month", "2026-09-19")).toBe(true);
    expect(matchesGoalAnchor(schedule, "month", "2026-10-01")).toBe(false);
    expect(matchesGoalAnchor(schedule, "year", "2026-01-01")).toBe(false);
    expect(matchesGoalAnchor({ unit: "life" }, "life")).toBe(true);
  });

  it("marks only unfinished past goals while the actual current period is open", () => {
    const goal = { schedule: { unit: "month", startDate: "2026-07-01" } as const };
    expect(isGoalCarryover(goal, "month", "2026-08-01", TODAY)).toBe(true);
    expect(isGoalCarryover({ ...goal, completedAt: "2026-08-01T00:00:00.000Z" }, "month", "2026-08-01", TODAY)).toBe(false);
    expect(isGoalCarryover(goal, "month", "2026-09-01", TODAY)).toBe(false);
  });
});

describe("isIsoCalendarDate", () => {
  it("rejects impossible dates and accepts leap days", () => {
    expect(isIsoCalendarDate("2024-02-29")).toBe(true);
    expect(isIsoCalendarDate("2026-02-29")).toBe(false);
    expect(isIsoCalendarDate("2026-13-01")).toBe(false);
  });
});
