import { describe, expect, it } from "vitest";
import { planScheduleUpdate } from "./updateTaskSchedule";
import type { TaskScheduleSource } from "./taskSchedule";
import { EMPTY_SCHEDULE, type Schedule } from "./types";

function task(patch: TaskScheduleSource = {}): TaskScheduleSource {
  return { startDate: "", scheduledDate: "", dueDate: "", startTime: "", endTime: "", ...patch };
}

function schedule(patch: Partial<Schedule> = {}): Schedule {
  return { ...EMPTY_SCHEDULE, ...patch };
}

describe("planScheduleUpdate — writing", () => {
  it("writes a date onto an undated task", () => {
    const plan = planScheduleUpdate(task(), schedule({ dueDate: "2026-08-20" }));
    expect(plan.issues).toEqual([]);
    expect(plan.unchanged).toBe(false);
    expect(plan.patch).toEqual({
      startDate: "",
      scheduledDate: "",
      dueDate: "2026-08-20",
      startTime: "",
      endTime: "",
    });
  });

  it("writes a range", () => {
    const plan = planScheduleUpdate(task(), schedule({ startDate: "2026-08-17", dueDate: "2026-08-20" }));
    expect(plan.patch).toMatchObject({ startDate: "2026-08-17", dueDate: "2026-08-20" });
  });

  // Clearing the dates is a real edit, not an empty one (design §0.10).
  it("writes an empty schedule over an existing one", () => {
    const plan = planScheduleUpdate(task({ dueDate: "2026-08-20" }), EMPTY_SCHEDULE);
    expect(plan.unchanged).toBe(false);
    expect(plan.patch).toMatchObject({ dueDate: "", startDate: "" });
  });

  // Valid but redundant: a range whose ends are the same day IS a date.
  it("stores a same-day range as the plain date it means", () => {
    const plan = planScheduleUpdate(task(), schedule({ startDate: "2026-08-20", dueDate: "2026-08-20" }));
    expect(plan.patch).toMatchObject({ startDate: "", dueDate: "2026-08-20" });
  });

  it("always clears the legacy work day", () => {
    const plan = planScheduleUpdate(task({ scheduledDate: "2026-08-17" }), schedule({ dueDate: "2026-08-20" }));
    expect(plan.patch?.scheduledDate).toBe("");
  });
});

describe("planScheduleUpdate — no-op (design §2.28)", () => {
  it("declines to write the schedule a task already has", () => {
    const plan = planScheduleUpdate(task({ dueDate: "2026-08-20" }), schedule({ dueDate: "2026-08-20" }));
    expect(plan.unchanged).toBe(true);
    expect(plan.patch).toBeNull();
    expect(plan.issues).toEqual([]);
  });

  it("declines when both are empty", () => {
    expect(planScheduleUpdate(task(), EMPTY_SCHEDULE).unchanged).toBe(true);
  });

  // The comparison is about meaning, so a record still carrying the legacy
  // work day counts as unchanged when asked for what it already means.
  // Tidying the stored shape belongs to the rewrite phase, not to closing an
  // editor (audit §7.1).
  it("declines when a legacy record already means the requested schedule", () => {
    const legacy = task({ scheduledDate: "2026-08-20" });
    const plan = planScheduleUpdate(legacy, schedule({ dueDate: "2026-08-20" }));
    expect(plan.unchanged).toBe(true);
    expect(plan.patch).toBeNull();
  });

  it("declines when a legacy work day and deadline already mean the requested range", () => {
    const legacy = task({ scheduledDate: "2026-08-17", dueDate: "2026-08-20" });
    const plan = planScheduleUpdate(legacy, schedule({ startDate: "2026-08-17", dueDate: "2026-08-20" }));
    expect(plan.unchanged).toBe(true);
  });

  it("still writes when only the time differs", () => {
    const plan = planScheduleUpdate(
      task({ dueDate: "2026-08-20", startTime: "09:00" }),
      schedule({ dueDate: "2026-08-20", startTime: "10:00" }),
    );
    expect(plan.unchanged).toBe(false);
    expect(plan.patch?.startTime).toBe("10:00");
  });
});

describe("planScheduleUpdate — rejection", () => {
  // Rejected, not repaired: normalizing first would swap this into a valid
  // range and report success for a request nobody should have made.
  it("refuses a backwards range instead of swapping it", () => {
    const plan = planScheduleUpdate(task(), schedule({ startDate: "2026-08-20", dueDate: "2026-08-17" }));
    expect(plan.patch).toBeNull();
    expect(plan.unchanged).toBe(false);
    expect(plan.issues.map((issue) => issue.code)).toContain("end-before-start");
  });

  it("refuses a range with no end", () => {
    const plan = planScheduleUpdate(task(), schedule({ startDate: "2026-08-17" }));
    expect(plan.issues.map((issue) => issue.code)).toContain("missing-due-date");
  });

  it("refuses a time with no date", () => {
    const plan = planScheduleUpdate(task(), schedule({ startTime: "09:00" }));
    expect(plan.issues.map((issue) => issue.code)).toContain("time-without-date");
  });

  it("refuses an end time with no start", () => {
    const plan = planScheduleUpdate(task(), schedule({ dueDate: "2026-08-20", endTime: "10:00" }));
    expect(plan.issues.map((issue) => issue.code)).toContain("end-time-without-start");
  });

  it("refuses a malformed date", () => {
    const plan = planScheduleUpdate(task(), schedule({ dueDate: "2026-02-31" }));
    expect(plan.issues.map((issue) => issue.code)).toContain("invalid-date-format");
  });

  it("leaves the task alone when it refuses", () => {
    const plan = planScheduleUpdate(task({ dueDate: "2026-08-20" }), schedule({ startTime: "09:00" }));
    expect(plan.patch).toBeNull();
  });
});
