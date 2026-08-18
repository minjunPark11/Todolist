import { describe, expect, it } from "vitest";
import { isConfirmable, isValidSchedule, validateDraft, validateSchedule } from "./validateSchedule";
import { EMPTY_SCHEDULE, type Schedule, type ScheduleDraft, type ScheduleMode } from "./types";

function schedule(patch: Partial<Schedule> = {}): Schedule {
  return { ...EMPTY_SCHEDULE, ...patch };
}

function draft(mode: ScheduleMode, patch: Partial<Schedule> = {}): ScheduleDraft {
  return { ...EMPTY_SCHEDULE, ...patch, mode };
}

function codes(issues: { code: string }[]): string[] {
  return issues.map((issue) => issue.code);
}

describe("validateSchedule — the record shape", () => {
  it("accepts nothing set", () => {
    expect(validateSchedule(EMPTY_SCHEDULE)).toEqual([]);
  });

  it("accepts a plain date", () => {
    expect(validateSchedule(schedule({ dueDate: "2026-08-27" }))).toEqual([]);
  });

  it("accepts a range", () => {
    expect(validateSchedule(schedule({ startDate: "2026-08-27", dueDate: "2026-08-30" }))).toEqual([]);
  });

  // INV-01 — the one rule a draft is exempt from.
  it("rejects a start with no end", () => {
    expect(codes(validateSchedule(schedule({ startDate: "2026-08-27" })))).toContain("missing-due-date");
  });

  // INV-02
  it("rejects a backwards range", () => {
    expect(codes(validateSchedule(schedule({ startDate: "2026-08-30", dueDate: "2026-08-27" })))).toContain(
      "end-before-start",
    );
  });

  // INV-03
  it("rejects a time with no date", () => {
    expect(codes(validateSchedule(schedule({ startTime: "09:00" })))).toContain("time-without-date");
  });

  it("rejects an end time with no start time", () => {
    expect(codes(validateSchedule(schedule({ dueDate: "2026-08-27", endTime: "10:00" })))).toContain(
      "end-time-without-start",
    );
  });

  // INV-05
  it("rejects an end before its start on the same day", () => {
    expect(
      codes(validateSchedule(schedule({ dueDate: "2026-08-27", startTime: "10:00", endTime: "09:00" }))),
    ).toContain("end-before-start");
  });

  it("allows an earlier end time across a multi-day range", () => {
    expect(
      validateSchedule(
        schedule({ startDate: "2026-08-27", dueDate: "2026-08-30", startTime: "09:00", endTime: "08:00" }),
      ),
    ).toEqual([]);
  });

  // INV-09 — and format errors stop the pass, so a malformed date is never
  // compared against a good one.
  it("reports a malformed date without also reporting an ordering error", () => {
    const issues = validateSchedule(schedule({ startDate: "2026-02-31", dueDate: "2026-08-27" }));
    expect(codes(issues)).toEqual(["invalid-date-format"]);
  });

  it("rejects a malformed time", () => {
    expect(codes(validateSchedule(schedule({ dueDate: "2026-08-27", startTime: "25:00" })))).toContain(
      "invalid-time-format",
    );
  });
});

describe("validateDraft — the editing shape", () => {
  // §1.7 — the whole reason there are two validators.
  it("accepts a half-picked range that the record would reject", () => {
    const midway = draft("duration", { startDate: "2026-08-27" });
    expect(validateDraft(midway)).toEqual([]);
    expect(codes(validateSchedule(midway))).toContain("missing-due-date");
  });

  it("still enforces the shared rules", () => {
    expect(codes(validateDraft(draft("date", { startTime: "09:00" })))).toContain("time-without-date");
  });
});

describe("isConfirmable", () => {
  // §2.23 / §0.10 — clearing the dates is a real edit, not an empty one.
  it("allows confirming an empty schedule", () => {
    expect(isConfirmable(draft("date"))).toBe(true);
  });

  it("allows confirming a date", () => {
    expect(isConfirmable(draft("date", { dueDate: "2026-08-27" }))).toBe(true);
  });

  it("allows confirming a complete range", () => {
    expect(isConfirmable(draft("duration", { startDate: "2026-08-27", dueDate: "2026-08-30" }))).toBe(true);
  });

  // §2.9 — incomplete, not invalid. Different reason, same disabled button.
  it("blocks a range with no end", () => {
    expect(isConfirmable(draft("duration", { startDate: "2026-08-27" }))).toBe(false);
  });

  // §2.10 — an untouched Duration tab has nothing to save but nothing wrong.
  it("allows an empty duration draft", () => {
    expect(isConfirmable(draft("duration"))).toBe(true);
  });

  it("blocks an invalid draft", () => {
    expect(isConfirmable(draft("date", { dueDate: "2026-08-27", endTime: "10:00" }))).toBe(false);
  });
});

describe("isValidSchedule", () => {
  it("agrees with validateSchedule", () => {
    expect(isValidSchedule(schedule({ dueDate: "2026-08-27" }))).toBe(true);
    expect(isValidSchedule(schedule({ startDate: "2026-08-27" }))).toBe(false);
  });
});
