import { describe, expect, it } from "vitest";
import { applyQuickDate, quickTargetDate } from "./quickDate";
import { EMPTY_SCHEDULE, type Schedule, type ScheduleDraft, type ScheduleMode } from "./types";

const TODAY = "2026-08-19";

function draft(mode: ScheduleMode, patch: Partial<Schedule> = {}): ScheduleDraft {
  return { ...EMPTY_SCHEDULE, ...patch, mode };
}

describe("quickTargetDate", () => {
  it("counts from today, never from the task's current date", () => {
    expect(quickTargetDate("today", TODAY)).toBe(TODAY);
    expect(quickTargetDate("tomorrow", TODAY)).toBe("2026-08-20");
    expect(quickTargetDate("plus7", TODAY)).toBe("2026-08-26");
    expect(quickTargetDate("nextMonth", TODAY)).toBe("2026-09-19");
  });

  // The trap `Date.setMonth` walks into: adding a month to the 31st overflows
  // into the month after next. 다음 달 must stay inside the month it names.
  it("clamps the day to the length of the month it lands in", () => {
    expect(quickTargetDate("nextMonth", "2026-01-31")).toBe("2026-02-28");
    expect(quickTargetDate("nextMonth", "2028-01-31")).toBe("2028-02-29");
    expect(quickTargetDate("nextMonth", "2026-03-31")).toBe("2026-04-30");
  });

  it("carries the year over from December", () => {
    expect(quickTargetDate("nextMonth", "2026-12-15")).toBe("2027-01-15");
  });
});

/* `tonightTime`'s three tests stood here — 18:00 through the day, the next
   half hour once the evening had started, and 23:59 rather than rolling into
   tomorrow. They went with the shortcut: 다음 달 answers with a day. */

describe("applyQuickDate — date mode", () => {
  it("sets the date and leaves an existing time alone", () => {
    const next = applyQuickDate(draft("date", { dueDate: "2026-01-01", startTime: "09:00" }), "tomorrow", TODAY);
    expect(next.dueDate).toBe("2026-08-20");
    expect(next.startTime).toBe("09:00");
  });

  // What replaced the three 오늘 밤 tests: the fourth shortcut is a date like
  // the other three, and leaves the clock alone like the other three.
  it("next month moves the date and keeps the hours", () => {
    const next = applyQuickDate(
      draft("date", { dueDate: "2026-01-01", startTime: "09:00", endTime: "11:00" }),
      "nextMonth",
      TODAY,
    );
    expect(next.dueDate).toBe("2026-09-19");
    expect(next.startTime).toBe("09:00");
    expect(next.endTime).toBe("11:00");
  });
});

describe("applyQuickDate — duration mode", () => {
  it("starts a range when there is nothing yet", () => {
    const next = applyQuickDate(draft("duration"), "today", TODAY);
    expect(next.startDate).toBe(TODAY);
    expect(next.dueDate).toBeNull();
  });

  it("closes a half-picked range", () => {
    const next = applyQuickDate(draft("duration", { startDate: "2026-08-17" }), "plus7", TODAY);
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
    );
    expect(next.startDate).toBe("2026-08-20");
    expect(next.dueDate).toBe("2026-08-24");
  });

  it("restarts the range when the target falls before an existing start", () => {
    const next = applyQuickDate(draft("duration", { startDate: "2026-09-01" }), "today", TODAY);
    expect(next.startDate).toBe(TODAY);
    expect(next.dueDate).toBeNull();
  });
});
