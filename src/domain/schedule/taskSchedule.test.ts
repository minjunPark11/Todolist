import { describe, expect, it } from "vitest";
import type { Task } from "../../types";
import {
  classifyTaskSchedule,
  countScheduleShapes,
  scheduleFromTask,
  scheduleToTaskPatch,
  type TaskScheduleSource,
} from "./taskSchedule";
import { isValidSchedule } from "./validateSchedule";
import { getScheduleMode } from "./scheduleMode";
import { EMPTY_SCHEDULE, type Schedule } from "./types";

function task(patch: TaskScheduleSource = {}): TaskScheduleSource {
  return { startDate: "", scheduledDate: "", dueDate: "", startTime: "", endTime: "", ...patch };
}

function schedule(patch: Partial<Schedule> = {}): Schedule {
  return { ...EMPTY_SCHEDULE, ...patch };
}

// Phase 3 hands real Tasks to this adapter, so `Task` must satisfy the
// structural type without the domain ever naming it. If a field is renamed or
// its type widened, this stops compiling — which is the point.
describe("Task compatibility", () => {
  it("accepts a Task without the domain importing one", () => {
    const asSource: TaskScheduleSource = {} as Task;
    expect(asSource).toBeDefined();
  });
});

describe("classifyTaskSchedule", () => {
  it("names each consolidation case", () => {
    expect(classifyTaskSchedule(task())).toBe("empty");
    expect(classifyTaskSchedule(task({ dueDate: "2026-08-30" }))).toBe("canonical");
    expect(classifyTaskSchedule(task({ scheduledDate: "2026-08-27" }))).toBe("scheduled-only");
    expect(classifyTaskSchedule(task({ scheduledDate: "2026-08-27", dueDate: "2026-08-27" }))).toBe("aligned");
    expect(classifyTaskSchedule(task({ scheduledDate: "2026-08-27", dueDate: "2026-08-30" }))).toBe("promoted");
    expect(
      classifyTaskSchedule(task({ startDate: "2026-08-20", scheduledDate: "2026-08-27", dueDate: "2026-08-30" })),
    ).toBe("start-kept");
  });

  // A record already carrying a range and no work day needs no consolidation.
  it("treats an existing range with no work day as canonical", () => {
    expect(classifyTaskSchedule(task({ startDate: "2026-08-27", dueDate: "2026-08-30" }))).toBe("canonical");
  });

  // An implicit work day equal to the range start is not a third date.
  it("does not flag a work day that matches the range start", () => {
    expect(
      classifyTaskSchedule(task({ startDate: "2026-08-27", scheduledDate: "2026-08-27", dueDate: "2026-08-30" })),
    ).toBe("promoted");
  });
});

describe("scheduleFromTask — sentinels", () => {
  it("reads empty strings as unset", () => {
    expect(scheduleFromTask(task())).toEqual(EMPTY_SCHEDULE);
  });

  it("reads missing fields as unset", () => {
    expect(scheduleFromTask({})).toEqual(EMPTY_SCHEDULE);
  });
});

describe("scheduleFromTask — consolidation (audit 1-d)", () => {
  it("keeps a deadline as the date", () => {
    expect(scheduleFromTask(task({ dueDate: "2026-08-30" }))).toEqual(schedule({ dueDate: "2026-08-30" }));
  });

  it("turns a lone work day into the date", () => {
    expect(scheduleFromTask(task({ scheduledDate: "2026-08-27" }))).toEqual(schedule({ dueDate: "2026-08-27" }));
  });

  it("collapses a work day that already equals the deadline", () => {
    const next = scheduleFromTask(task({ scheduledDate: "2026-08-27", dueDate: "2026-08-27" }));
    expect(next).toEqual(schedule({ dueDate: "2026-08-27" }));
    expect(getScheduleMode(next)).toBe("date");
  });

  // The case that makes option C survivable: neither date is thrown away.
  it("promotes a differing work day and deadline into a range", () => {
    const next = scheduleFromTask(task({ scheduledDate: "2026-08-27", dueDate: "2026-08-30" }));
    expect(next.startDate).toBe("2026-08-27");
    expect(next.dueDate).toBe("2026-08-30");
    expect(getScheduleMode(next)).toBe("duration");
  });

  // Three dates, two slots. The explicit range wins over the work day.
  it("keeps an existing range and drops a conflicting work day", () => {
    const next = scheduleFromTask(
      task({ startDate: "2026-08-20", scheduledDate: "2026-08-27", dueDate: "2026-08-30" }),
    );
    expect(next.startDate).toBe("2026-08-20");
    expect(next.dueDate).toBe("2026-08-30");
  });
});

describe("scheduleFromTask — where the times land", () => {
  it("carries both times when the work day becomes the date", () => {
    const next = scheduleFromTask(task({ scheduledDate: "2026-08-27", startTime: "09:00", endTime: "11:00" }));
    expect(next).toEqual(schedule({ dueDate: "2026-08-27", startTime: "09:00", endTime: "11:00" }));
  });

  // Wednesday 09:00–11:00 must not become Wednesday 09:00 → Friday 11:00.
  it("drops the end time when promoting to a range, since it would move days", () => {
    const next = scheduleFromTask(
      task({ scheduledDate: "2026-08-27", dueDate: "2026-08-30", startTime: "09:00", endTime: "11:00" }),
    );
    expect(next.startTime).toBe("09:00");
    expect(next.endTime).toBeNull();
  });

  it("drops both times when the work day they belonged to is dropped", () => {
    const next = scheduleFromTask(
      task({
        startDate: "2026-08-20",
        scheduledDate: "2026-08-27",
        dueDate: "2026-08-30",
        startTime: "09:00",
        endTime: "11:00",
      }),
    );
    expect(next.startTime).toBeNull();
    expect(next.endTime).toBeNull();
  });

  it("drops an orphan time that has no date at all", () => {
    expect(scheduleFromTask(task({ startTime: "09:00" }))).toEqual(EMPTY_SCHEDULE);
  });
});

describe("scheduleFromTask — contract", () => {
  const records: TaskScheduleSource[] = [
    task(),
    task({ dueDate: "2026-08-30" }),
    task({ scheduledDate: "2026-08-27" }),
    task({ scheduledDate: "2026-08-27", dueDate: "2026-08-27" }),
    task({ scheduledDate: "2026-08-27", dueDate: "2026-08-30" }),
    task({ startDate: "2026-08-20", scheduledDate: "2026-08-27", dueDate: "2026-08-30" }),
    task({ scheduledDate: "2026-08-30", dueDate: "2026-08-27" }),
    task({ dueDate: "2026-02-31", startTime: "09:00" }),
    task({ scheduledDate: "2026-08-27", startTime: "09:00", endTime: "08:00" }),
    task({ dueDate: "2026-08-30", endTime: "11:00" }),
  ];

  // Every reader downstream assumes this. Nothing malformed on disk may reach
  // the calendar as a schedule, and there is no constraint below to help.
  it.each(records)("always produces a valid schedule (%o)", (record) => {
    expect(isValidSchedule(scheduleFromTask(record))).toBe(true);
  });

  // A record written by a newer build reads back unchanged — this is what lets
  // the adapter serve both shapes during Phase 3.
  it.each(records)("is stable once consolidated (%o)", (record) => {
    const once = scheduleFromTask(record);
    expect(scheduleFromTask(scheduleToTaskPatch(once))).toEqual(once);
  });

  // A backwards pair survives as a range rather than losing a date, because
  // normalization swaps what the record can no longer be asked about.
  it("orders a work day that falls after the deadline", () => {
    const next = scheduleFromTask(task({ scheduledDate: "2026-08-30", dueDate: "2026-08-27" }));
    expect(next.startDate).toBe("2026-08-27");
    expect(next.dueDate).toBe("2026-08-30");
  });
});

describe("countScheduleShapes", () => {
  // Audit §10 wants these numbers before Phase 4 rewrites anything.
  it("tallies a mixed set", () => {
    const counts = countScheduleShapes([
      task(),
      task({ dueDate: "2026-08-30" }),
      task({ scheduledDate: "2026-08-27" }),
      task({ scheduledDate: "2026-08-27", dueDate: "2026-08-27" }),
      task({ scheduledDate: "2026-08-27", dueDate: "2026-08-30" }),
      task({ scheduledDate: "2026-08-28", dueDate: "2026-08-30" }),
      task({ startDate: "2026-08-20", scheduledDate: "2026-08-27", dueDate: "2026-08-30" }),
    ]);
    expect(counts).toEqual({
      empty: 1,
      canonical: 1,
      "scheduled-only": 1,
      aligned: 1,
      promoted: 2,
      "start-kept": 1,
    });
  });

  it("reports zeroes for an empty set", () => {
    expect(countScheduleShapes([])).toEqual({
      empty: 0,
      canonical: 0,
      "scheduled-only": 0,
      aligned: 0,
      promoted: 0,
      "start-kept": 0,
    });
  });
});

describe("scheduleToTaskPatch", () => {
  it("writes nulls back as the record's empty string", () => {
    expect(scheduleToTaskPatch(EMPTY_SCHEDULE)).toEqual({
      startDate: "",
      scheduledDate: "",
      dueDate: "",
      startTime: "",
      endTime: "",
    });
  });

  it("writes a range", () => {
    expect(scheduleToTaskPatch(schedule({ startDate: "2026-08-27", dueDate: "2026-08-30" }))).toEqual({
      startDate: "2026-08-27",
      scheduledDate: "",
      dueDate: "2026-08-30",
      startTime: "",
      endTime: "",
    });
  });

  // Leaving the old field populated would give the record two answers.
  it("always clears the legacy work day", () => {
    expect(scheduleToTaskPatch(schedule({ dueDate: "2026-08-27" })).scheduledDate).toBe("");
  });

  it("normalizes before writing, so an invalid shape cannot reach the record", () => {
    expect(scheduleToTaskPatch(schedule({ dueDate: "2026-08-27", endTime: "11:00" })).endTime).toBe("");
  });
});
