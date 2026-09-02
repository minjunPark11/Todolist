import { describe, expect, it } from "vitest";
import { countdownLabel } from "./countdown";

const TODAY = "2026-09-02";

describe("a deadline read as what is left of it", () => {
  it("says today for today", () => {
    expect(countdownLabel(TODAY, TODAY)).toEqual({ key: "common.today", days: 0 });
  });

  // Whole days, midnight to midnight: tomorrow is "1 day left" all of today,
  // which is what a reader means by it.
  it("counts the days ahead", () => {
    expect(countdownLabel("2026-09-03", TODAY)).toEqual({ key: "view.daysLeft", days: 1 });
    expect(countdownLabel("2026-09-07", TODAY)).toEqual({ key: "view.daysLeft", days: 5 });
  });

  // The same words the Schedule editor already uses for lateness, so one fact
  // is not spelled two ways one screen apart.
  it("counts the days past, as a positive number", () => {
    expect(countdownLabel("2026-09-01", TODAY)).toEqual({ key: "schedule.overdueDays", days: 1 });
    expect(countdownLabel("2026-08-20", TODAY)).toEqual({ key: "schedule.overdueDays", days: 13 });
  });

  // Nothing to count down to. The row draws no date rather than a zero.
  it("has nothing to say about a task with no deadline", () => {
    expect(countdownLabel("", TODAY)).toBeNull();
  });

  it("crosses a month and a year without drifting", () => {
    expect(countdownLabel("2026-10-02", TODAY)).toEqual({ key: "view.daysLeft", days: 30 });
    expect(countdownLabel("2027-09-02", TODAY)).toEqual({ key: "view.daysLeft", days: 365 });
  });
});
