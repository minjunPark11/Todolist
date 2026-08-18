import { describe, expect, it } from "vitest";
import { normalizeSchedule } from "./normalizeSchedule";
import { isValidSchedule } from "./validateSchedule";
import { EMPTY_SCHEDULE, type Schedule } from "./types";

function schedule(patch: Partial<Schedule> = {}): Schedule {
  return { ...EMPTY_SCHEDULE, ...patch };
}

describe("normalizeSchedule — formats (INV-09)", () => {
  it("drops a malformed date", () => {
    expect(normalizeSchedule(schedule({ dueDate: "27/08/2026" })).dueDate).toBeNull();
  });

  // The shape is right and the day does not exist. Left in place it would
  // compare cleanly against real dates and never surface.
  it("drops a date that does not exist", () => {
    expect(normalizeSchedule(schedule({ dueDate: "2026-02-31" })).dueDate).toBeNull();
    expect(normalizeSchedule(schedule({ dueDate: "2026-02-29" })).dueDate).toBeNull();
  });

  it("keeps a real leap day", () => {
    expect(normalizeSchedule(schedule({ dueDate: "2028-02-29" })).dueDate).toBe("2028-02-29");
  });

  it("drops a malformed time", () => {
    expect(normalizeSchedule(schedule({ dueDate: "2026-08-27", startTime: "9:00" })).startTime).toBeNull();
    expect(normalizeSchedule(schedule({ dueDate: "2026-08-27", startTime: "24:00" })).startTime).toBeNull();
  });
});

describe("normalizeSchedule — dates", () => {
  // INV-01
  it("turns a start with no end into a plain date", () => {
    const next = normalizeSchedule(schedule({ startDate: "2026-08-27" }));
    expect(next.startDate).toBeNull();
    expect(next.dueDate).toBe("2026-08-27");
  });

  // INV-02 — here a swap IS right: nobody is mid-gesture to ask.
  it("swaps a backwards range", () => {
    const next = normalizeSchedule(schedule({ startDate: "2026-08-30", dueDate: "2026-08-27" }));
    expect(next.startDate).toBe("2026-08-27");
    expect(next.dueDate).toBe("2026-08-30");
  });

  it("collapses a single-day range to a date", () => {
    const next = normalizeSchedule(schedule({ startDate: "2026-08-27", dueDate: "2026-08-27" }));
    expect(next.startDate).toBeNull();
    expect(next.dueDate).toBe("2026-08-27");
  });

  it("leaves a real range alone", () => {
    const range = schedule({ startDate: "2026-08-27", dueDate: "2026-08-30" });
    expect(normalizeSchedule(range)).toEqual(range);
  });
});

describe("normalizeSchedule — times", () => {
  // INV-03
  it("drops times when no date survives", () => {
    const next = normalizeSchedule(schedule({ startTime: "09:00", endTime: "10:00" }));
    expect(next.startTime).toBeNull();
    expect(next.endTime).toBeNull();
  });

  it("drops times when the only date was malformed", () => {
    const next = normalizeSchedule(schedule({ dueDate: "nope", startTime: "09:00" }));
    expect(next.startTime).toBeNull();
  });

  it("drops an end time that has no start", () => {
    expect(normalizeSchedule(schedule({ dueDate: "2026-08-27", endTime: "10:00" })).endTime).toBeNull();
  });

  // INV-05
  it("drops an end that precedes its start on the same day", () => {
    const next = normalizeSchedule(schedule({ dueDate: "2026-08-27", startTime: "10:00", endTime: "09:00" }));
    expect(next.startTime).toBe("10:00");
    expect(next.endTime).toBeNull();
  });

  // Across a range the times sit on different days, so 08:00 after 09:00 is
  // ninety-five hours later, not negative one.
  it("keeps an earlier end time when the range spans days", () => {
    const next = normalizeSchedule(
      schedule({ startDate: "2026-08-27", dueDate: "2026-08-30", startTime: "09:00", endTime: "08:00" }),
    );
    expect(next.endTime).toBe("08:00");
  });
});

describe("normalizeSchedule — contract", () => {
  const cases: Schedule[] = [
    EMPTY_SCHEDULE,
    schedule({ dueDate: "2026-08-27" }),
    schedule({ startDate: "2026-08-27" }),
    schedule({ startDate: "2026-08-30", dueDate: "2026-08-27" }),
    schedule({ startDate: "2026-08-27", dueDate: "2026-08-27" }),
    schedule({ dueDate: "2026-08-27", startTime: "10:00", endTime: "09:00" }),
    schedule({ dueDate: "2026-08-27", endTime: "10:00" }),
    schedule({ startTime: "09:00" }),
    schedule({ dueDate: "2026-02-31", startTime: "09:00" }),
    schedule({ startDate: "2026-08-27", dueDate: "2026-08-30", startTime: "09:00", endTime: "17:00" }),
  ];

  // Runs on every load, so a second pass must not move anything.
  it.each(cases)("is idempotent (%o)", (input) => {
    const once = normalizeSchedule(input);
    expect(normalizeSchedule(once)).toEqual(once);
  });

  // The whole point: whatever comes out is safe to hand to the calendar.
  it.each(cases)("always produces a valid schedule (%o)", (input) => {
    expect(isValidSchedule(normalizeSchedule(input))).toBe(true);
  });
});

describe("normalizeSchedule — timezone", () => {
  it("carries a zone through", () => {
    expect(normalizeSchedule(schedule({ dueDate: "2026-08-27", timezone: "Asia/Seoul" })).timezone).toBe("Asia/Seoul");
  });

  it("treats an empty zone as unset", () => {
    expect(normalizeSchedule(schedule({ timezone: "" })).timezone).toBeNull();
  });
});
