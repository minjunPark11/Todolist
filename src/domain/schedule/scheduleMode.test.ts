import { describe, expect, it } from "vitest";
import { draftFromSchedule, getScheduleMode, setScheduleMode, toDateMode, toDurationMode } from "./scheduleMode";
import { EMPTY_SCHEDULE, type Schedule, type ScheduleDraft, type ScheduleMode } from "./types";

function schedule(patch: Partial<Schedule> = {}): Schedule {
  return { ...EMPTY_SCHEDULE, ...patch };
}

function draft(mode: ScheduleMode, patch: Partial<Schedule> = {}): ScheduleDraft {
  return { ...EMPTY_SCHEDULE, ...patch, mode };
}

describe("getScheduleMode", () => {
  it("reads a startDate as a duration", () => {
    expect(getScheduleMode(schedule({ startDate: "2026-08-27", dueDate: "2026-08-30" }))).toBe("duration");
  });

  it("reads a bare dueDate as a date", () => {
    expect(getScheduleMode(schedule({ dueDate: "2026-08-27" }))).toBe("date");
  });

  // §1.4: no schedule opens on the Date tab.
  it("defaults an empty schedule to date", () => {
    expect(getScheduleMode(EMPTY_SCHEDULE)).toBe("date");
  });
});

describe("toDurationMode", () => {
  // §1.12 Case A
  it("stays empty when there is no date to promote", () => {
    expect(toDurationMode(draft("date"))).toEqual(draft("duration"));
  });

  // §1.12 Case B — the existing date becomes the START, not the end.
  it("promotes the date to the range start and waits for an end", () => {
    const next = toDurationMode(draft("date", { dueDate: "2026-08-27" }));
    expect(next.startDate).toBe("2026-08-27");
    expect(next.dueDate).toBeNull();
  });

  it("drops the time rather than guessing which end it belonged to", () => {
    const next = toDurationMode(draft("date", { dueDate: "2026-08-27", startTime: "15:00", endTime: "16:00" }));
    expect(next.startTime).toBeNull();
    expect(next.endTime).toBeNull();
  });

  it("is a no-op when already in duration mode", () => {
    const already = draft("duration", { startDate: "2026-08-27", dueDate: "2026-08-30" });
    expect(toDurationMode(already)).toBe(already);
  });
});

describe("toDateMode", () => {
  // §1.13 — the END survives, so the deadline other views read is unchanged.
  it("keeps the end of a complete range", () => {
    const next = toDateMode(draft("duration", { startDate: "2026-08-27", dueDate: "2026-08-30" }));
    expect(next.dueDate).toBe("2026-08-30");
    expect(next.startDate).toBeNull();
  });

  // §1.13 shows `8/27 09:00 → 8/30 17:00` becoming `8/30 17:00`. Audit 1-b
  // puts 17:00 in `startTime`, because date mode anchors its block there.
  it("carries the end time onto the surviving date as the block start", () => {
    const next = toDateMode(
      draft("duration", {
        startDate: "2026-08-27",
        dueDate: "2026-08-30",
        startTime: "09:00",
        endTime: "17:00",
      }),
    );
    expect(next.startTime).toBe("17:00");
    expect(next.endTime).toBeNull();
  });

  it("drops a start-only time, which belonged to the discarded date", () => {
    const next = toDateMode(
      draft("duration", { startDate: "2026-08-27", dueDate: "2026-08-30", startTime: "09:00" }),
    );
    expect(next.startTime).toBeNull();
    expect(next.endTime).toBeNull();
  });

  // Mid-range: there is no end to keep, so the one date the user clicked wins.
  it("keeps the start when no end has been picked", () => {
    const next = toDateMode(draft("duration", { startDate: "2026-08-27", startTime: "09:00" }));
    expect(next.dueDate).toBe("2026-08-27");
    expect(next.startTime).toBe("09:00");
  });

  it("stays empty when the range was never started", () => {
    expect(toDateMode(draft("duration"))).toEqual(draft("date"));
  });
});

describe("mode round trips", () => {
  // §1.12 + §1.13 compose: out and back is not identity, and should not be.
  // The date survives; the time does not, because §1.12 refused to guess.
  it("preserves the date but not the time through date → duration → date", () => {
    const start = draft("date", { dueDate: "2026-08-27", startTime: "15:00" });
    const back = toDateMode(toDurationMode(start));
    expect(back.dueDate).toBe("2026-08-27");
    expect(back.startTime).toBeNull();
  });

  it("collapses a range to its end and back to a range starting there", () => {
    const range = draft("duration", { startDate: "2026-08-27", dueDate: "2026-08-30" });
    const out = toDurationMode(toDateMode(range));
    expect(out.startDate).toBe("2026-08-30");
    expect(out.dueDate).toBeNull();
  });
});

describe("draftFromSchedule", () => {
  it("opens on the mode the record implies", () => {
    expect(draftFromSchedule(schedule({ startDate: "2026-08-27", dueDate: "2026-08-30" })).mode).toBe("duration");
    expect(draftFromSchedule(schedule({ dueDate: "2026-08-27" })).mode).toBe("date");
  });
});

describe("setScheduleMode", () => {
  it("dispatches to the matching conversion", () => {
    const dated = draft("date", { dueDate: "2026-08-27" });
    expect(setScheduleMode(dated, "duration")).toEqual(toDurationMode(dated));
    expect(setScheduleMode(dated, "date")).toBe(dated);
  });
});
