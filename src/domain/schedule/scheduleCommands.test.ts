import { describe, expect, it } from "vitest";
import {
  addDays,
  clearSchedule,
  clearTime,
  daysBetween,
  selectDate,
  setEndTime,
  setStartTime,
  shiftSchedule,
} from "./scheduleCommands";
import { getRangeStage } from "./scheduleQueries";
import { EMPTY_SCHEDULE, type Schedule, type ScheduleDraft, type ScheduleMode } from "./types";

function draft(mode: ScheduleMode, patch: Partial<Schedule> = {}): ScheduleDraft {
  return { ...EMPTY_SCHEDULE, ...patch, mode };
}

describe("selectDate — date mode", () => {
  it("sets the date", () => {
    expect(selectDate(draft("date"), "2026-08-27").dueDate).toBe("2026-08-27");
  });

  it("replaces an existing date", () => {
    expect(selectDate(draft("date", { dueDate: "2026-08-27" }), "2026-08-29").dueDate).toBe("2026-08-29");
  });

  // §1.11: date mode's canonical form has no startDate, so a leftover from a
  // previous range must not make the result read as a duration.
  it("clears a leftover startDate", () => {
    const stale = draft("date", { startDate: "2026-08-20", dueDate: "2026-08-27" });
    expect(selectDate(stale, "2026-08-29").startDate).toBeNull();
  });

  it("keeps the time when only the date changes", () => {
    const timed = draft("date", { dueDate: "2026-08-27", startTime: "09:00", endTime: "10:00" });
    const next = selectDate(timed, "2026-08-29");
    expect(next.startTime).toBe("09:00");
    expect(next.endTime).toBe("10:00");
  });
});

describe("selectDate — duration mode", () => {
  it("takes the first click as the start", () => {
    const next = selectDate(draft("duration"), "2026-08-27");
    expect(next.startDate).toBe("2026-08-27");
    expect(next.dueDate).toBeNull();
    expect(getRangeStage(next)).toBe("start-selected");
  });

  it("takes the second click as the end", () => {
    const next = selectDate(draft("duration", { startDate: "2026-08-27" }), "2026-08-30");
    expect(next.dueDate).toBe("2026-08-30");
    expect(getRangeStage(next)).toBe("complete");
  });

  // §4.9 — a same-day range is legitimate: a task that starts and ends today.
  it("allows the end to equal the start", () => {
    const next = selectDate(draft("duration", { startDate: "2026-08-27" }), "2026-08-27");
    expect(next.startDate).toBe("2026-08-27");
    expect(next.dueDate).toBe("2026-08-27");
  });

  // §4.11–4.12 — the rule that matters most here.
  it("restarts the range instead of swapping when the end falls before the start", () => {
    const next = selectDate(draft("duration", { startDate: "2026-08-27" }), "2026-08-25");
    expect(next.startDate).toBe("2026-08-25");
    expect(next.dueDate).toBeNull();
    expect(getRangeStage(next)).toBe("start-selected");
  });

  // §4.13 — clicking inside a finished range starts a new one.
  it("restarts from a click on a complete range", () => {
    const complete = draft("duration", { startDate: "2026-08-27", dueDate: "2026-08-30" });
    const next = selectDate(complete, "2026-09-02");
    expect(next.startDate).toBe("2026-09-02");
    expect(next.dueDate).toBeNull();
  });

  it("drops times when the range restarts, since they described the old one", () => {
    const complete = draft("duration", {
      startDate: "2026-08-27",
      dueDate: "2026-08-30",
      startTime: "09:00",
      endTime: "17:00",
    });
    const next = selectDate(complete, "2026-09-02");
    expect(next.startTime).toBeNull();
    expect(next.endTime).toBeNull();
  });

  it("keeps times when only the end is being added", () => {
    const midway = draft("duration", { startDate: "2026-08-27", startTime: "09:00" });
    expect(selectDate(midway, "2026-08-30").startTime).toBe("09:00");
  });
});

describe("setStartTime / setEndTime", () => {
  it("sets a start time on a dated draft", () => {
    expect(setStartTime(draft("date", { dueDate: "2026-08-27" }), "09:00").startTime).toBe("09:00");
  });

  // INV-03
  it("refuses a time when there is no date", () => {
    const bare = draft("date");
    expect(setStartTime(bare, "09:00")).toBe(bare);
  });

  it("sets an end time once a start exists", () => {
    const started = draft("date", { dueDate: "2026-08-27", startTime: "09:00" });
    expect(setEndTime(started, "10:00").endTime).toBe("10:00");
  });

  // An end alone renders as all-day and the value is lost — calendarItems.ts:237.
  it("refuses an end time with no start", () => {
    const noStart = draft("date", { dueDate: "2026-08-27" });
    expect(setEndTime(noStart, "10:00")).toBe(noStart);
  });

  it("clearing the start clears the end with it", () => {
    const both = draft("date", { dueDate: "2026-08-27", startTime: "09:00", endTime: "10:00" });
    const next = setStartTime(both, null);
    expect(next.startTime).toBeNull();
    expect(next.endTime).toBeNull();
  });

  it("clearing the end keeps the start", () => {
    const both = draft("date", { dueDate: "2026-08-27", startTime: "09:00", endTime: "10:00" });
    const next = setEndTime(both, null);
    expect(next.startTime).toBe("09:00");
    expect(next.endTime).toBeNull();
  });
});

describe("clearTime", () => {
  it("drops both times and keeps the dates", () => {
    const next = clearTime(draft("duration", {
      startDate: "2026-08-27",
      dueDate: "2026-08-30",
      startTime: "09:00",
      endTime: "17:00",
    }));
    expect(next.startDate).toBe("2026-08-27");
    expect(next.dueDate).toBe("2026-08-30");
    expect(next.startTime).toBeNull();
    expect(next.endTime).toBeNull();
  });
});

describe("clearSchedule", () => {
  it("removes every date and time", () => {
    const next = clearSchedule(draft("duration", {
      startDate: "2026-08-27",
      dueDate: "2026-08-30",
      startTime: "09:00",
      endTime: "17:00",
    }));
    expect(next).toEqual(draft("duration"));
  });

  // §2.23 — clearing is not leaving the tab.
  it("keeps the mode", () => {
    expect(clearSchedule(draft("duration", { startDate: "2026-08-27", dueDate: "2026-08-30" })).mode).toBe("duration");
  });
});

describe("shiftSchedule", () => {
  // §4.42 — dragging the bar keeps its length.
  it("moves both ends and preserves the length", () => {
    const next = shiftSchedule(draft("duration", { startDate: "2026-08-27", dueDate: "2026-08-30" }), 3);
    expect(next.startDate).toBe("2026-08-30");
    expect(next.dueDate).toBe("2026-09-02");
  });

  it("moves a single date", () => {
    expect(shiftSchedule(draft("date", { dueDate: "2026-08-27" }), -1).dueDate).toBe("2026-08-26");
  });

  it("is a no-op for zero", () => {
    const same = draft("date", { dueDate: "2026-08-27" });
    expect(shiftSchedule(same, 0)).toBe(same);
  });
});

describe("addDays / daysBetween", () => {
  it("crosses a month boundary", () => {
    expect(addDays("2026-08-30", 3)).toBe("2026-09-02");
  });

  it("crosses a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  // The reason this is UTC arithmetic and not local: a 23-hour night must not
  // eat a day.
  it("adds a day across a spring-forward boundary", () => {
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
  });

  it("counts days in both directions", () => {
    expect(daysBetween("2026-08-27", "2026-08-30")).toBe(3);
    expect(daysBetween("2026-08-30", "2026-08-27")).toBe(-3);
    expect(daysBetween("2026-08-27", "2026-08-27")).toBe(0);
  });
});
