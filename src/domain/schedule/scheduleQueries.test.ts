import { describe, expect, it } from "vitest";
import { getRangeStage, hasSchedule, isAllDay, isOverdue, isTimed, scheduleSpan, scheduleSpanDays } from "./scheduleQueries";
import { isDirty, schedulesEqual } from "./scheduleEquality";
import { EMPTY_SCHEDULE, type Schedule, type ScheduleDraft, type ScheduleMode } from "./types";

function schedule(patch: Partial<Schedule> = {}): Schedule {
  return { ...EMPTY_SCHEDULE, ...patch };
}

function draft(mode: ScheduleMode, patch: Partial<Schedule> = {}): ScheduleDraft {
  return { ...EMPTY_SCHEDULE, ...patch, mode };
}

describe("getRangeStage", () => {
  it("reports the three duration stages", () => {
    expect(getRangeStage(draft("duration"))).toBe("empty");
    expect(getRangeStage(draft("duration", { startDate: "2026-08-27" }))).toBe("start-selected");
    expect(getRangeStage(draft("duration", { startDate: "2026-08-27", dueDate: "2026-08-30" }))).toBe("complete");
  });

  it("reads date mode as complete once it holds a date", () => {
    expect(getRangeStage(draft("date"))).toBe("empty");
    expect(getRangeStage(draft("date", { dueDate: "2026-08-27" }))).toBe("complete");
  });
});

describe("hasSchedule", () => {
  it("is false only when no date is set", () => {
    expect(hasSchedule(EMPTY_SCHEDULE)).toBe(false);
    expect(hasSchedule(schedule({ dueDate: "2026-08-27" }))).toBe(true);
    expect(hasSchedule(schedule({ startDate: "2026-08-27" }))).toBe(true);
  });
});

describe("scheduleSpan", () => {
  it("is null when nothing is set", () => {
    expect(scheduleSpan(EMPTY_SCHEDULE)).toBeNull();
  });

  it("collapses a single date to a one-day span", () => {
    expect(scheduleSpan(schedule({ dueDate: "2026-08-27" }))).toEqual({
      start: "2026-08-27",
      end: "2026-08-27",
    });
  });

  it("covers a range", () => {
    expect(scheduleSpan(schedule({ startDate: "2026-08-27", dueDate: "2026-08-30" }))).toEqual({
      start: "2026-08-27",
      end: "2026-08-30",
    });
  });

  // Mirrors span.ts: take min/max so a contradictory pair still draws a bar
  // over the dates the user actually typed rather than a backwards one.
  it("orders a backwards pair rather than returning it as-is", () => {
    expect(scheduleSpan(schedule({ startDate: "2026-08-30", dueDate: "2026-08-27" }))).toEqual({
      start: "2026-08-27",
      end: "2026-08-30",
    });
  });
});

describe("scheduleSpanDays", () => {
  it("counts a single day as one", () => {
    expect(scheduleSpanDays(schedule({ dueDate: "2026-08-27" }))).toBe(1);
  });

  it("counts both ends inclusively", () => {
    expect(scheduleSpanDays(schedule({ startDate: "2026-08-27", dueDate: "2026-08-30" }))).toBe(4);
  });

  it("is zero when there is no schedule", () => {
    expect(scheduleSpanDays(EMPTY_SCHEDULE)).toBe(0);
  });
});

describe("isTimed", () => {
  // The calendar's own test is the absence of a block start.
  it("follows the block start, not the end", () => {
    expect(isTimed(schedule({ dueDate: "2026-08-27" }))).toBe(false);
    expect(isTimed(schedule({ dueDate: "2026-08-27", startTime: "09:00" }))).toBe(true);
  });
});

describe("isOverdue", () => {
  it("is true the day after a date passes", () => {
    expect(isOverdue(schedule({ dueDate: "2026-08-27" }), "2026-08-28")).toBe(true);
    expect(isOverdue(schedule({ dueDate: "2026-08-27" }), "2026-08-27")).toBe(false);
  });

  // §4.60 — a task running Monday to Friday is not late on Tuesday.
  it("measures a range from its end", () => {
    const range = schedule({ startDate: "2026-08-27", dueDate: "2026-08-30" });
    expect(isOverdue(range, "2026-08-28")).toBe(false);
    expect(isOverdue(range, "2026-08-31")).toBe(true);
  });

  it("is false with no schedule", () => {
    expect(isOverdue(EMPTY_SCHEDULE, "2026-08-28")).toBe(false);
  });
});

describe("schedulesEqual", () => {
  it("compares meaning, not shape", () => {
    // Same day, two spellings — only one survives normalization.
    expect(
      schedulesEqual(
        schedule({ startDate: "2026-08-27", dueDate: "2026-08-27" }),
        schedule({ dueDate: "2026-08-27" }),
      ),
    ).toBe(true);
  });

  it("ignores values normalization would have dropped", () => {
    expect(schedulesEqual(schedule({ dueDate: "2026-08-27", endTime: "10:00" }), schedule({ dueDate: "2026-08-27" }))).toBe(
      true,
    );
  });

  it("separates different dates", () => {
    expect(schedulesEqual(schedule({ dueDate: "2026-08-27" }), schedule({ dueDate: "2026-08-28" }))).toBe(false);
  });

  it("separates different zones", () => {
    expect(
      schedulesEqual(
        schedule({ dueDate: "2026-08-27", startTime: "09:00", timezone: "Asia/Seoul" }),
        schedule({ dueDate: "2026-08-27", startTime: "09:00", timezone: "UTC" }),
      ),
    ).toBe(false);
  });
});

describe("isDirty", () => {
  it("is false for an untouched draft", () => {
    const saved = schedule({ dueDate: "2026-08-27" });
    expect(isDirty(draft("date", saved), saved)).toBe(false);
  });

  it("is true once a date changes", () => {
    const saved = schedule({ dueDate: "2026-08-27" });
    expect(isDirty(draft("date", { dueDate: "2026-08-29" }), saved)).toBe(true);
  });

  // §2.8 — the tab is a view onto the draft, not part of it. Switching to
  // Duration and picking nothing must not arm the discard prompt.
  it("ignores a mode switch that changed no dates", () => {
    expect(isDirty(draft("duration"), EMPTY_SCHEDULE)).toBe(false);
  });

  it("is true after clearing a schedule", () => {
    expect(isDirty(draft("date"), schedule({ dueDate: "2026-08-27" }))).toBe(true);
  });
});

// Ch. 26 §26.5.3: derived, so `allDay: true` beside a start time cannot be
// written down. The spec's own model stores it as a field, which is what makes
// that contradiction representable.
describe("isAllDay", () => {
  it("is a day with no time of its own", () => {
    expect(isAllDay({ ...EMPTY_SCHEDULE, dueDate: "2026-08-23" })).toBe(true);
  });

  it("is false once the day has a time", () => {
    expect(isAllDay({ ...EMPTY_SCHEDULE, dueDate: "2026-08-23", startTime: "14:00" })).toBe(false);
  });

  // No date is unscheduled, not all-day — reading "no time" as a yes would
  // put every undated task on the calendar's all-day row.
  it("is false for a schedule with no date at all", () => {
    expect(isAllDay(EMPTY_SCHEDULE)).toBe(false);
  });
});
