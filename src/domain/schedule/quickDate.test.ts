import { describe, expect, it } from "vitest";
import { applyQuickDate, quickTargetDate, tonightTime } from "./quickDate";
import { EMPTY_SCHEDULE, type Schedule, type ScheduleDraft, type ScheduleMode } from "./types";

const TODAY = "2026-08-19";
const AFTERNOON = "14:20";

function draft(mode: ScheduleMode, patch: Partial<Schedule> = {}): ScheduleDraft {
  return { ...EMPTY_SCHEDULE, ...patch, mode };
}

describe("quickTargetDate", () => {
  it("counts from today, never from the task's current date", () => {
    expect(quickTargetDate("today", TODAY)).toBe(TODAY);
    expect(quickTargetDate("tomorrow", TODAY)).toBe("2026-08-20");
    expect(quickTargetDate("plus7", TODAY)).toBe("2026-08-26");
    expect(quickTargetDate("tonight", TODAY)).toBe(TODAY);
  });
});

describe("tonightTime", () => {
  it("is 18:00 for most of the day", () => {
    expect(tonightTime("09:00")).toBe("18:00");
    expect(tonightTime("14:20")).toBe("18:00");
    expect(tonightTime("17:59")).toBe("18:00");
  });

  // The whole point of the rounding: pressing 오늘 밤 must never produce a
  // time that has already gone.
  it("rounds up to the next half hour once the evening has started", () => {
    expect(tonightTime("18:10")).toBe("18:30");
    expect(tonightTime("20:42")).toBe("21:00");
    expect(tonightTime("22:51")).toBe("23:00");
  });

  it("stops at 23:59 rather than rolling into tomorrow", () => {
    expect(tonightTime("23:00")).toBe("23:59");
    expect(tonightTime("23:40")).toBe("23:59");
  });
});

describe("applyQuickDate — date mode", () => {
  it("sets the date and leaves an existing time alone", () => {
    const next = applyQuickDate(draft("date", { dueDate: "2026-01-01", startTime: "09:00" }), "tomorrow", TODAY, AFTERNOON);
    expect(next.dueDate).toBe("2026-08-20");
    expect(next.startTime).toBe("09:00");
  });

  it("tonight sets the time too, because that is what the word means", () => {
    const next = applyQuickDate(draft("date", { dueDate: "2026-01-01", startTime: "09:00" }), "tonight", TODAY, AFTERNOON);
    expect(next.dueDate).toBe(TODAY);
    expect(next.startTime).toBe("18:00");
  });

  // 09:00–11:00 moved to the evening cannot keep an 11:00 end (INV-05).
  it("tonight drops an end that would now precede the start", () => {
    const next = applyQuickDate(
      draft("date", { dueDate: TODAY, startTime: "09:00", endTime: "11:00" }),
      "tonight",
      TODAY,
      AFTERNOON,
    );
    expect(next.startTime).toBe("18:00");
    expect(next.endTime).toBeNull();
  });

  it("tonight keeps an end that still follows the start", () => {
    const next = applyQuickDate(
      draft("date", { dueDate: TODAY, startTime: "09:00", endTime: "20:00" }),
      "tonight",
      TODAY,
      AFTERNOON,
    );
    expect(next.endTime).toBe("20:00");
  });
});

describe("applyQuickDate — duration mode", () => {
  it("starts a range when there is nothing yet", () => {
    const next = applyQuickDate(draft("duration"), "today", TODAY, AFTERNOON);
    expect(next.startDate).toBe(TODAY);
    expect(next.dueDate).toBeNull();
  });

  it("closes a half-picked range", () => {
    const next = applyQuickDate(draft("duration", { startDate: "2026-08-17" }), "plus7", TODAY, AFTERNOON);
    expect(next.startDate).toBe("2026-08-17");
    expect(next.dueDate).toBe("2026-08-26");
  });

  // §5.24. Pressing 내일 on a Mon–Fri task moves the week; it does not
  // collapse five days onto tomorrow.
  it("moves a finished range whole, keeping its length", () => {
    const next = applyQuickDate(
      draft("duration", { startDate: "2026-08-24", dueDate: "2026-08-28" }),
      "tomorrow",
      TODAY,
      AFTERNOON,
    );
    expect(next.startDate).toBe("2026-08-20");
    expect(next.dueDate).toBe("2026-08-24");
  });

  it("restarts the range when the target falls before an existing start", () => {
    const next = applyQuickDate(draft("duration", { startDate: "2026-09-01" }), "today", TODAY, AFTERNOON);
    expect(next.startDate).toBe(TODAY);
    expect(next.dueDate).toBeNull();
  });
});
