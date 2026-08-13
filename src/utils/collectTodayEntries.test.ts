import { describe, expect, it } from "vitest";
import { collectTodayEntries } from "./todayView";
import type { Task } from "../types";

const TODAY = "2026-08-13";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Untitled",
    description: "",
    status: "todo",
    priority: "none",
    dueDate: "",
    scheduledDate: TODAY,
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
    repeatType: "none",
    repeatInterval: 1,
    repeatDays: [],
    repeatEndDate: "",
    ...overrides,
  };
}

const idsOf = (tasks: Task[]) => collectTodayEntries(tasks, {}, TODAY).map((entry) => entry.task.id);

describe("collectTodayEntries ordering", () => {
  it("puts timed tasks in clock order regardless of when they were created", () => {
    // The bug: rows render their start time, but the list sorted by createdAt,
    // so a task labelled 17:00 could appear above one labelled 09:00.
    const tasks = [
      task({ id: "evening", startTime: "17:00", createdAt: "2026-08-01T09:00:00.000Z" }),
      task({ id: "morning", startTime: "09:00", createdAt: "2026-08-10T09:00:00.000Z" }),
      task({ id: "noon", startTime: "12:30", createdAt: "2026-08-05T09:00:00.000Z" }),
    ];

    expect(idsOf(tasks)).toEqual(["morning", "noon", "evening"]);
  });

  it("keeps timed tasks above untimed ones", () => {
    const tasks = [
      task({ id: "untimed", createdAt: "2026-08-01T09:00:00.000Z" }),
      task({ id: "timed", startTime: "16:00", createdAt: "2026-08-11T09:00:00.000Z" }),
    ];

    expect(idsOf(tasks)).toEqual(["timed", "untimed"]);
  });

  it("orders untimed tasks by the nearer deadline", () => {
    const tasks = [
      task({ id: "later", dueDate: "2026-08-20" }),
      task({ id: "overdue", dueDate: "2026-08-01" }),
      task({ id: "today", dueDate: TODAY }),
    ];

    expect(idsOf(tasks)).toEqual(["overdue", "today", "later"]);
  });

  it("sorts tasks with no deadline after ones that have a date", () => {
    const tasks = [
      task({ id: "no-date", status: "doing" }),
      task({ id: "far-off", dueDate: "2026-12-31" }),
    ];

    expect(idsOf(tasks)).toEqual(["far-off", "no-date"]);
  });

  it("falls back to creation order when nothing else separates two tasks", () => {
    const tasks = [
      task({ id: "second", createdAt: "2026-08-10T09:00:00.000Z" }),
      task({ id: "first", createdAt: "2026-08-02T09:00:00.000Z" }),
    ];

    expect(idsOf(tasks)).toEqual(["first", "second"]);
  });

  it("ignores the legacy order field, which nothing ever assigns", () => {
    // Guards against re-introducing `order` as the leading sort key while it
    // is still write-only: a stale non-zero value must not outrank the clock.
    const tasks = [
      task({ id: "morning", startTime: "09:00", order: 99 }),
      task({ id: "evening", startTime: "18:00", order: 0 }),
    ];

    expect(idsOf(tasks)).toEqual(["morning", "evening"]);
  });
});
