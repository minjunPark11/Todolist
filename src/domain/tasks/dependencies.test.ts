import { describe, expect, it } from "vitest";
import type { Task } from "../../types";
import {
  blockedTaskIds,
  blockerChoices,
  dependentsOf,
  eligibleBlockers,
  isTaskBlocked,
  taskMap,
  wouldCycle,
} from "./dependencies";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Task",
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
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
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

describe("isTaskBlocked", () => {
  it("is blocked while the blocker is still open", () => {
    const tasks = [task({ id: "a", blockedByTaskId: "b" }), task({ id: "b" })];
    expect(isTaskBlocked(tasks[0], taskMap(tasks))).toBe(true);
  });

  it("is free once the blocker is done — no cleanup pass needed", () => {
    const tasks = [task({ id: "a", blockedByTaskId: "b" }), task({ id: "b", status: "done" })];
    expect(isTaskBlocked(tasks[0], taskMap(tasks))).toBe(false);
  });

  it("is free when the blocker was archived or deleted", () => {
    const archived = [task({ id: "a", blockedByTaskId: "b" }), task({ id: "b", status: "archived" })];
    expect(isTaskBlocked(archived[0], taskMap(archived))).toBe(false);

    const deleted = [task({ id: "a", blockedByTaskId: "b" }), task({ id: "b", deletedAt: "2026-08-02" })];
    expect(isTaskBlocked(deleted[0], taskMap(deleted))).toBe(false);
  });

  // The arms this used to be written as read `status` directly and knew
  // nothing about `wontDoAt`, so a blocker given up on through the field —
  // rather than through the legacy `archived` status — went on blocking work
  // nobody was waiting for any more.
  it("is free when the blocker was given up on through wontDoAt", () => {
    const tasks = [task({ id: "a", blockedByTaskId: "b" }), task({ id: "b", wontDoAt: "2026-08-02" })];
    expect(isTaskBlocked(tasks[0], taskMap(tasks))).toBe(false);
  });

  it("treats a dangling reference as unblocked, not as permanently stuck", () => {
    const tasks = [task({ id: "a", blockedByTaskId: "gone" })];
    expect(isTaskBlocked(tasks[0], taskMap(tasks))).toBe(false);
  });

  it("is free when nothing is named", () => {
    const tasks = [task({ id: "a" })];
    expect(isTaskBlocked(tasks[0], taskMap(tasks))).toBe(false);
  });
});

describe("blockedTaskIds", () => {
  it("collects only the tasks actually waiting on open work", () => {
    const tasks = [
      task({ id: "a", blockedByTaskId: "c" }),
      task({ id: "b", blockedByTaskId: "d" }),
      task({ id: "c" }),
      task({ id: "d", status: "done" }),
    ];
    expect(blockedTaskIds(tasks)).toEqual(new Set(["a"]));
  });
});

describe("dependentsOf", () => {
  it("derives the reverse direction rather than storing it", () => {
    const tasks = [
      task({ id: "a", blockedByTaskId: "c" }),
      task({ id: "b", blockedByTaskId: "c" }),
      task({ id: "c" }),
    ];
    expect(dependentsOf(tasks, "c").map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("returns nothing for an empty id", () => {
    expect(dependentsOf([task({ id: "a", blockedByTaskId: "" })], "")).toEqual([]);
  });
});

describe("wouldCycle", () => {
  it("refuses a task blocking itself", () => {
    expect(wouldCycle([task({ id: "a" })], "a", "a")).toBe(true);
  });

  it("refuses a two-task loop", () => {
    const tasks = [task({ id: "a" }), task({ id: "b", blockedByTaskId: "a" })];
    expect(wouldCycle(tasks, "a", "b")).toBe(true);
  });

  it("refuses a longer loop", () => {
    const tasks = [
      task({ id: "a" }),
      task({ id: "b", blockedByTaskId: "a" }),
      task({ id: "c", blockedByTaskId: "b" }),
    ];
    expect(wouldCycle(tasks, "a", "c")).toBe(true);
  });

  it("allows a plain chain", () => {
    const tasks = [task({ id: "a" }), task({ id: "b" }), task({ id: "c", blockedByTaskId: "b" })];
    expect(wouldCycle(tasks, "a", "c")).toBe(false);
  });

  it("terminates on a ring that already exists in the data", () => {
    // Two devices could each write half of this before either saw the other.
    const tasks = [task({ id: "a", blockedByTaskId: "b" }), task({ id: "b", blockedByTaskId: "a" })];
    expect(wouldCycle(tasks, "c", "a")).toBe(true);
  });
});

describe("eligibleBlockers", () => {
  it("omits one given up on through wontDoAt, not just an archived one", () => {
    const tasks = [task({ id: "a" }), task({ id: "b", wontDoAt: "2026-08-02" })];
    expect(eligibleBlockers(tasks, "a").map((entry) => entry.id)).toEqual([]);
  });

  it("omits the task itself", () => {
    const tasks = [task({ id: "a" }), task({ id: "b" })];
    expect(eligibleBlockers(tasks, "a").map((item) => item.id)).toEqual(["b"]);
  });

  it("omits finished, archived and deleted work", () => {
    const tasks = [
      task({ id: "a" }),
      task({ id: "done", status: "done" }),
      task({ id: "archived", status: "archived" }),
      task({ id: "deleted", deletedAt: "2026-08-02" }),
      task({ id: "open" }),
    ];
    expect(eligibleBlockers(tasks, "a").map((item) => item.id)).toEqual(["open"]);
  });

  it("omits candidates that would close a loop", () => {
    const tasks = [task({ id: "a" }), task({ id: "b", blockedByTaskId: "a" }), task({ id: "c" })];
    expect(eligibleBlockers(tasks, "a").map((item) => item.id)).toEqual(["c"]);
  });
});

/**
 * What the two panels DRAW, which is not quite what is eligible.
 *
 * Both the legacy panel and the Drawer render this list into a `<select>`
 * whose value is `blockedByTaskId`. A select whose value is absent from its
 * options renders empty — so the one rule these tests exist for is that the
 * value already held is always among them, however it got there.
 */
describe("blockerChoices", () => {
  it("offers the eligible candidates when nothing is set", () => {
    const subject = task({ id: "a" });
    const tasks = [subject, task({ id: "b", title: "B" })];
    expect(blockerChoices(tasks, subject)).toEqual([{ id: "b", title: "B" }]);
  });

  it("keeps the blocker already set once it has been completed", () => {
    const subject = task({ id: "a", blockedByTaskId: "done" });
    const tasks = [subject, task({ id: "done", title: "Finished", status: "done" })];
    expect(blockerChoices(tasks, subject)).toEqual([{ id: "done", title: "Finished" }]);
  });

  it("does not offer the set blocker twice while it is still eligible", () => {
    const subject = task({ id: "a", blockedByTaskId: "b" });
    const tasks = [subject, task({ id: "b", title: "B" })];
    expect(blockerChoices(tasks, subject)).toEqual([{ id: "b", title: "B" }]);
  });

  it("falls back to the id for a blocker this account does not have", () => {
    const subject = task({ id: "a", blockedByTaskId: "elsewhere" });
    expect(blockerChoices([subject], subject)).toEqual([{ id: "elsewhere", title: "elsewhere" }]);
  });
});
