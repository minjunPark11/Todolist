import { describe, expect, it } from "vitest";
import { getNextDueDate, planRecurringCompletion } from "./planner";
import { getTodayBuckets } from "./planner";
import type { Task } from "../types";

const TODAY = "2026-08-13";
const NOW = "2026-08-13T09:00:00.000Z";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Water the plants",
    description: "",
    status: "todo",
    priority: "none",
    dueDate: "",
    startDate: "",
    startTime: "",
    endTime: "",
    projectId: "",
    categoryId: "",
    parentTaskId: "",
    tags: [],
    notes: "",
    estimatedMinutes: 0,
    actualSeconds: 0,
    activeSessionId: "",
    lastFocusedAt: "",
    isSomeday: false,
    waitingReason: "",
    waitingFollowUpDate: "",
    order: 0,
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z",
    completedAt: "",
    archivedAt: "",
    blockedByTaskId: "",
    repeatType: "daily",
    repeatInterval: 1,
    repeatDays: [],
    repeatEndDate: "",
    ...overrides,
  };
}

describe("getNextDueDate", () => {
  it("advances from today when the repeat was neglected, not from the stale due date", () => {
    // The bug: completing a daily task five days late produced a next due date
    // that was still in the past, so the user had to tick it once per missed
    // day to catch up.
    expect(getNextDueDate(task({ dueDate: "2026-08-08" }), TODAY)).toBe("2026-08-14");
  });

  it("advances from the due date when the task is completed early", () => {
    expect(getNextDueDate(task({ dueDate: "2026-08-20" }), TODAY)).toBe("2026-08-21");
  });

  it("advances from today for a task due today", () => {
    expect(getNextDueDate(task({ dueDate: TODAY }), TODAY)).toBe("2026-08-14");
  });

  it("honours the interval for weekly and monthly repeats", () => {
    expect(getNextDueDate(task({ repeatType: "weekly", repeatInterval: 2 }), TODAY)).toBe("2026-08-27");
    expect(getNextDueDate(task({ repeatType: "monthly" }), TODAY)).toBe("2026-09-13");
  });

  it("treats a missing or zero interval as 1", () => {
    expect(getNextDueDate(task({ repeatInterval: 0 }), TODAY)).toBe("2026-08-14");
  });
});

describe("planRecurringCompletion", () => {
  it("splits the finished occurrence onto its own done record", () => {
    const result = planRecurringCompletion(task({ dueDate: TODAY }), "task-copy", NOW, TODAY);
    if (result.kind !== "rolled") throw new Error("expected the repeat to roll forward");

    expect(result.occurrence.id).toBe("task-copy");
    expect(result.occurrence.status).toBe("done");
    expect(result.occurrence.completedAt).toBe(NOW);
    // The snapshot must not go on repeating by itself.
    expect(result.occurrence.repeatType).toBe("none");
    expect(result.occurrence.repeatEndDate).toBe("");
    expect(result.occurrence.activeSessionId).toBe("");
  });

  it("leaves the rolled-forward task open with no completion stamp", () => {
    const result = planRecurringCompletion(task({ dueDate: TODAY }), "task-copy", NOW, TODAY);
    if (result.kind !== "rolled") throw new Error("expected the repeat to roll forward");

    expect(result.patch.status).toBe("todo");
    expect(result.patch.dueDate).toBe("2026-08-14");
    expect(result.patch.completedAt).toBe("");
  });

  it("makes the completion count as done today without hiding the next occurrence", () => {
    // Regression guard for why the occurrence needs its own row: every
    // "done today" check keys on completedAt, and getTodayBuckets assigns each
    // task to the FIRST matching bucket only.
    const original = task({ dueDate: TODAY });
    const result = planRecurringCompletion(original, "task-copy", NOW, TODAY);
    if (result.kind !== "rolled") throw new Error("expected the repeat to roll forward");

    const buckets = getTodayBuckets(
      [result.occurrence, { ...original, ...result.patch }],
      TODAY,
    );

    expect(buckets.doneToday.map((item) => item.id)).toEqual(["task-copy"]);
    expect(buckets.doneToday).toHaveLength(1);
    // The rolled-forward task is still open and simply not due today.
    expect(buckets.dueToday).toHaveLength(0);
  });

  it("shifts a range's start by the same amount as its end", () => {
    // Two days long; that length should survive the roll.
    const result = planRecurringCompletion(
      task({ repeatType: "weekly", dueDate: "2026-08-15", startDate: "2026-08-13" }),
      "task-copy",
      NOW,
      TODAY,
    );
    if (result.kind !== "rolled") throw new Error("expected the repeat to roll forward");

    expect(result.patch.dueDate).toBe("2026-08-22");
    expect(result.patch.startDate).toBe("2026-08-20");
  });

  it("leaves a single-day task without a start date", () => {
    const result = planRecurringCompletion(task({ dueDate: TODAY }), "task-copy", NOW, TODAY);
    if (result.kind !== "rolled") throw new Error("expected the repeat to roll forward");

    expect(result.patch.startDate).toBe("");
  });

  it("reports the last occurrence as final so the task itself closes out", () => {
    const result = planRecurringCompletion(
      task({ dueDate: TODAY, repeatEndDate: "2026-08-13" }),
      "task-copy",
      NOW,
      TODAY,
    );

    expect(result.kind).toBe("final");
  });

  it("keeps rolling while the end date is still ahead", () => {
    const result = planRecurringCompletion(
      task({ dueDate: TODAY, repeatEndDate: "2026-09-01" }),
      "task-copy",
      NOW,
      TODAY,
    );

    expect(result.kind).toBe("rolled");
  });
});

// `repeatDays` has been stored since long before anything read it. The
// schedule editor's 평일 preset is the first thing that writes a set of days,
// and a weekly repeat that ignored them would make "every weekday" mean
// Thursday only.
describe("getNextDueDate — named weekdays and yearly", () => {
  // 2026-08-13 is a Thursday.
  it("advances a weekday repeat to the next weekday", () => {
    const weekdays = task({ repeatType: "weekly", repeatDays: [1, 2, 3, 4, 5], dueDate: TODAY });
    expect(getNextDueDate(weekdays, TODAY)).toBe("2026-08-14");
  });

  it("skips the weekend rather than landing on it", () => {
    const friday = task({ repeatType: "weekly", repeatDays: [1, 2, 3, 4, 5], dueDate: "2026-08-14" });
    expect(getNextDueDate(friday, "2026-08-14")).toBe("2026-08-17");
  });

  it("still adds a week when the repeat names no days", () => {
    expect(getNextDueDate(task({ repeatType: "weekly", dueDate: TODAY }), TODAY)).toBe("2026-08-20");
  });

  it("honours the interval once the week has wrapped", () => {
    const fortnightly = task({ repeatType: "weekly", repeatInterval: 2, repeatDays: [4], dueDate: TODAY });
    expect(getNextDueDate(fortnightly, TODAY)).toBe("2026-08-27");
  });

  it("advances a yearly repeat by twelve months", () => {
    expect(getNextDueDate(task({ repeatType: "yearly", dueDate: TODAY }), TODAY)).toBe("2027-08-13");
  });
});
