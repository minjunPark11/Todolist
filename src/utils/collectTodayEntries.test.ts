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
    startDate: "",
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

// Membership reads the owning List's lifecycle now (§13.19), so the fixtures
// hand over the same context the sidebar counts with.
const ctx = (tasks: Task[]) => ({ tasks, lists: [], dailyPlans: [], taskTags: [], today: TODAY });
const idsOf = (tasks: Task[]) => collectTodayEntries(ctx(tasks), {}).map((entry) => entry.task.id);

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

// W2.3 — a task you cannot start is not the next thing to do. The demotion is
// derived on every read from the blocker's status, never stored, so finishing
// the blocker releases it with no cleanup pass.
describe("collectTodayEntries blocked demotion", () => {
  const entryFor = (tasks: Task[], id: string) =>
    collectTodayEntries(ctx(tasks), {}).find((entry) => entry.task.id === id);

  it("sends a blocked task to later and says why", () => {
    const tasks = [task({ id: "blocked", blockedByTaskId: "blocker" }), task({ id: "blocker" })];
    const entry = entryFor(tasks, "blocked");
    expect(entry?.defaultBucket).toBe("later");
    expect(entry?.reason).toBe("blocked");
  });

  it("releases it as soon as the blocker is done", () => {
    const tasks = [
      task({ id: "blocked", blockedByTaskId: "blocker", priority: "high", dueDate: TODAY }),
      task({ id: "blocker", status: "done", completedAt: `${TODAY}T09:00:00.000Z` }),
    ];
    const entry = entryFor(tasks, "blocked");
    expect(entry?.defaultBucket).toBe("now");
    expect(entry?.reason).toBe("high");
  });

  it("demotes a high-priority task due today, which would otherwise be now", () => {
    const tasks = [
      task({ id: "blocked", blockedByTaskId: "blocker", priority: "high", dueDate: TODAY }),
      task({ id: "blocker" }),
    ];
    expect(entryFor(tasks, "blocked")?.defaultBucket).toBe("later");
  });

  it("still shows an overdue task, because a missed deadline outranks being stuck", () => {
    const tasks = [
      task({ id: "blocked", blockedByTaskId: "blocker", dueDate: "2026-08-01" }),
      task({ id: "blocker" }),
    ];
    const entry = entryFor(tasks, "blocked");
    expect(entry?.defaultBucket).toBe("now");
    expect(entry?.reason).toBe("overdue");
  });

  it("lets the user's own override win, exactly as it does for every other rule", () => {
    const tasks = [task({ id: "blocked", blockedByTaskId: "blocker" }), task({ id: "blocker" })];
    const [entry] = collectTodayEntries(ctx(tasks), { blocked: "now" }).filter(
      (item) => item.task.id === "blocked",
    );
    expect(entry.bucket).toBe("now");
    // The default it was moved away from is still reported, so the row can
    // explain itself.
    expect(entry.defaultBucket).toBe("later");
  });

  it("does not treat a dangling blocker id as blocked", () => {
    // Asserted on the reason, not the bucket: a priority-none task with no
    // deadline already lands in `later` on its own, so the bucket cannot tell
    // the two causes apart.
    const tasks = [
      task({ id: "dangling", blockedByTaskId: "deleted-long-ago", priority: "high", dueDate: TODAY }),
    ];
    const entry = entryFor(tasks, "dangling");
    expect(entry?.reason).toBe("high");
    expect(entry?.defaultBucket).toBe("now");
  });
});
