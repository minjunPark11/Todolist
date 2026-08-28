import { describe, expect, it } from "vitest";
import type { Task, TaskStatus } from "../../types";
import { MATRIX_GROUP_ORDER, dateBucketOf, groupMatrixTasks, matrixGroupOf } from "./matrixGroups";

const TODAY = "2026-08-28";
const YESTERDAY = "2026-08-27";
const TOMORROW = "2026-08-29";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "A task",
    status: "todo" as TaskStatus,
    priority: "none",
    dueDate: "",
    projectId: "",
    tags: [],
    notes: "",
    ...overrides,
  } as Task;
}

describe("dateBucketOf", () => {
  it("sorts a deadline by which side of today it falls on", () => {
    expect(dateBucketOf(YESTERDAY, TODAY)).toBe("overdue");
    expect(dateBucketOf(TODAY, TODAY)).toBe("today");
    expect(dateBucketOf(TOMORROW, TODAY)).toBe("tomorrow");
    expect(dateBucketOf("2026-09-15", TODAY)).toBe("later");
    expect(dateBucketOf("", TODAY)).toBe("none");
  });

  it("crosses a month boundary without arithmetic of its own", () => {
    expect(dateBucketOf("2026-09-01", "2026-08-31")).toBe("tomorrow");
  });
});

describe("matrixGroupOf", () => {
  it("puts a finished task under completed, whatever its date said", () => {
    // A task finished last week is not "overdue" — it is done, and the date it
    // carried has stopped being a claim on anybody's time.
    const done = task({ status: "completed" as TaskStatus, dueDate: YESTERDAY });
    expect(matrixGroupOf(done, TODAY)).toBe("completed");
  });

  it("leaves unfinished work to its date", () => {
    expect(matrixGroupOf(task({ dueDate: YESTERDAY }), TODAY)).toBe("overdue");
  });
});

describe("groupMatrixTasks", () => {
  const tasks = [
    task({ id: "later", dueDate: "2026-09-30" }),
    task({ id: "done", status: "completed" as TaskStatus, dueDate: YESTERDAY }),
    task({ id: "undated" }),
    task({ id: "late", dueDate: YESTERDAY }),
    task({ id: "now", dueDate: TODAY }),
    task({ id: "soon", dueDate: TOMORROW }),
  ];

  it("returns the groups in reading order", () => {
    expect(groupMatrixTasks(tasks, TODAY).map((group) => group.id)).toEqual([
      "overdue",
      "today",
      "tomorrow",
      "later",
      "none",
      "completed",
    ]);
  });

  it("drops groups nothing fell into", () => {
    // "오늘 0" costs a line of the box and answers a question nobody asked.
    const groups = groupMatrixTasks([task({ id: "only", dueDate: YESTERDAY })], TODAY);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: "overdue" });
  });

  it("answers nothing for an empty box", () => {
    expect(groupMatrixTasks([], TODAY)).toEqual([]);
  });

  it("keeps every task, exactly once", () => {
    const seen = groupMatrixTasks(tasks, TODAY).flatMap((group) => group.tasks.map((entry) => entry.id));
    expect(seen.sort()).toEqual(["done", "late", "later", "now", "soon", "undated"]);
  });

  it("orders inside a group with the comparator it was given, and not otherwise", () => {
    const unsorted = [task({ id: "b", title: "b" }), task({ id: "a", title: "a" })];
    expect(groupMatrixTasks(unsorted, TODAY)[0].tasks.map((entry) => entry.id)).toEqual(["b", "a"]);
    const sorted = groupMatrixTasks(unsorted, TODAY, (x, y) => x.title.localeCompare(y.title));
    expect(sorted[0].tasks.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("does not sort the caller's array underneath it", () => {
    const original = [task({ id: "b", title: "b" }), task({ id: "a", title: "a" })];
    groupMatrixTasks(original, TODAY, (x, y) => x.title.localeCompare(y.title));
    expect(original.map((entry) => entry.id)).toEqual(["b", "a"]);
  });
});

describe("the completed group's own order", () => {
  const done = (id: string, completedAt: string, dueDate = "") =>
    task({ id, status: "completed" as TaskStatus, completedAt, dueDate });

  it("puts what was just ticked at the top", () => {
    // The box caps this group at five, so a task sorted to the bottom is a
    // task that is not on screen — and seeing what you just ticked is the
    // whole reason finished work is drawn here instead of vanishing.
    const tasks = [
      done("old", "2026-08-01T09:00:00.000Z"),
      done("newest", "2026-08-28T09:00:00.000Z"),
      done("middle", "2026-08-14T09:00:00.000Z"),
    ];
    const group = groupMatrixTasks(tasks, TODAY)[0];
    expect(group.tasks.map((entry) => entry.id)).toEqual(["newest", "middle", "old"]);
  });

  it("ignores the comparator the other groups use", () => {
    // Sorting finished work by its deadline puts a task completed a moment ago
    // below work completed last month. Every deadline in here is settled.
    const tasks = [done("late-due", "2026-08-01T09:00:00.000Z", "2026-12-31"), done("early-due", "2026-08-28T09:00:00.000Z", "2026-01-01")];
    const group = groupMatrixTasks(tasks, TODAY, (a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    expect(group.tasks.map((entry) => entry.id)).toEqual(["early-due", "late-due"]);
  });

  it("falls back to updatedAt for a record with no completion stamp", () => {
    const legacy = task({ id: "legacy", status: "completed" as TaskStatus, updatedAt: "2026-08-28T09:00:00.000Z" });
    const group = groupMatrixTasks([done("stamped", "2026-08-01T09:00:00.000Z"), legacy], TODAY)[0];
    expect(group.tasks.map((entry) => entry.id)).toEqual(["legacy", "stamped"]);
  });
});

describe("MATRIX_GROUP_ORDER", () => {
  it("ends with completed", () => {
    expect(MATRIX_GROUP_ORDER[MATRIX_GROUP_ORDER.length - 1]).toBe("completed");
  });
});
