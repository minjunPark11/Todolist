import { describe, expect, it } from "vitest";
import { availableReminders, reconcileReminder, reminderInstant } from "./reminder";
import { EMPTY_SCHEDULE, type Schedule } from "./types";

function schedule(patch: Partial<Schedule> = {}): Schedule {
  return { ...EMPTY_SCHEDULE, ...patch };
}

describe("availableReminders", () => {
  it("offers 정시 only when there is a time to be at", () => {
    expect(availableReminders(schedule({ dueDate: "2026-08-27" }))).not.toContain("at-time");
    expect(availableReminders(schedule({ dueDate: "2026-08-27", startTime: "18:00" }))).toContain("at-time");
  });
});

describe("reconcileReminder", () => {
  it("drops a reminder that has no date to hang on (INV-06)", () => {
    expect(reconcileReminder(schedule(), "10m")).toBe("none");
  });

  it("drops 정시 when the time goes", () => {
    expect(reconcileReminder(schedule({ dueDate: "2026-08-27" }), "at-time")).toBe("none");
  });

  // Falling back to a neighbouring preset would be the editor choosing a
  // reminder the user did not.
  it("does not substitute a different reminder", () => {
    expect(reconcileReminder(schedule({ dueDate: "2026-08-27" }), "1h")).toBe("1h");
  });
});

describe("reminderInstant", () => {
  it("is null without a reminder", () => {
    expect(reminderInstant(schedule({ dueDate: "2026-08-27" }))).toBeNull();
  });

  it("resolves offsets against the start time", () => {
    const base = { dueDate: "2026-08-27", startTime: "18:00" };
    expect(reminderInstant(schedule({ ...base, reminder: "at-time" }))).toEqual({
      date: "2026-08-27",
      time: "18:00",
    });
    expect(reminderInstant(schedule({ ...base, reminder: "10m" }))).toEqual({
      date: "2026-08-27",
      time: "17:50",
    });
    expect(reminderInstant(schedule({ ...base, reminder: "1h" }))).toEqual({
      date: "2026-08-27",
      time: "17:00",
    });
  });

  it("rolls back a day when the offset crosses midnight", () => {
    expect(reminderInstant(schedule({ dueDate: "2026-08-27", startTime: "00:20", reminder: "1h" }))).toEqual({
      date: "2026-08-26",
      time: "23:20",
    });
  });

  // A fixed hour, not an offset — otherwise a 22:00 task would be announced
  // at 22:00 the night before.
  it("puts the day-before reminder at 09:00 regardless of the task's time", () => {
    expect(reminderInstant(schedule({ dueDate: "2026-08-27", startTime: "22:00", reminder: "1d-9am" }))).toEqual({
      date: "2026-08-26",
      time: "09:00",
    });
  });

  it("uses 09:00 as the hour for an all-day schedule", () => {
    expect(reminderInstant(schedule({ dueDate: "2026-08-27", reminder: "1h" }))).toEqual({
      date: "2026-08-27",
      time: "08:00",
    });
  });

  // A nudge to begin, so it anchors to the first day of a range and not to
  // the deadline at the far end.
  it("anchors a range to its start", () => {
    const ranged = schedule({
      startDate: "2026-08-24",
      dueDate: "2026-08-28",
      startTime: "09:00",
      reminder: "10m",
    });
    expect(reminderInstant(ranged)).toEqual({ date: "2026-08-24", time: "08:50" });
  });
});
