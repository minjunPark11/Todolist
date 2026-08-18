import { describe, expect, it } from "vitest";
import type { Task } from "../../types";
import { ORDER_STEP, orderBetween, orderForNewTask, placeTask, sortByManualOrder } from "./sortKey";

const NOW = "2026-08-18T09:00:00.000Z";

function task(id: string, order: number, createdAt = NOW): Task {
  return {
    id,
    title: id,
    description: "",
    status: "todo",
    priority: "none",
    dueDate: "",
    scheduledDate: "",
    startDate: "",
    startTime: "",
    endTime: "",
    projectId: "p1",
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
    order,
    createdAt,
    updatedAt: createdAt,
    completedAt: "",
    blockedByTaskId: "",
    repeatType: "none",
    repeatInterval: 0,
    repeatDays: [],
    repeatEndDate: "",
  };
}

describe("orderBetween", () => {
  it("lands strictly between two neighbours", () => {
    const key = orderBetween(0, ORDER_STEP);
    expect(key).toBeGreaterThan(0);
    expect(key).toBeLessThan(ORDER_STEP);
  });

  it("extends past either end", () => {
    expect(orderBetween(undefined, 0)).toBe(-ORDER_STEP);
    expect(orderBetween(0, undefined)).toBe(ORDER_STEP);
    expect(orderBetween(undefined, undefined)).toBe(0);
  });

  it("reports no room rather than tying with a neighbour", () => {
    expect(orderBetween(1, 1)).toBeNull();
    expect(orderBetween(2, 1)).toBeNull();
    expect(orderBetween(1, 1 + Number.EPSILON)).toBeNull();
  });

  it("survives the repeated drops between the same two Tasks §6.30 is about", () => {
    let before = 0;
    const after = ORDER_STEP;
    for (let drop = 0; drop < 40; drop += 1) {
      const key = orderBetween(before, after);
      expect(key).not.toBeNull();
      before = key as number;
    }
  });
});

describe("sortByManualOrder", () => {
  it("falls back to creation time while every Task is still at 0", () => {
    const tasks = [task("t3", 0, "2026-08-03T00:00:00.000Z"), task("t1", 0, "2026-08-01T00:00:00.000Z")];
    expect(sortByManualOrder(tasks).map((item) => item.id)).toEqual(["t1", "t3"]);
  });

  it("does not mutate what it is given", () => {
    const tasks = [task("t2", 2), task("t1", 1)];
    sortByManualOrder(tasks);
    expect(tasks.map((item) => item.id)).toEqual(["t2", "t1"]);
  });
});

describe("orderForNewTask", () => {
  it("puts a new Task after everything in the column", () => {
    expect(orderForNewTask([])).toBe(0);
    expect(orderForNewTask([task("t1", 0), task("t2", ORDER_STEP)])).toBe(2 * ORDER_STEP);
  });
});

describe("placeTask", () => {
  const column = [task("t1", 0), task("t2", ORDER_STEP), task("t3", 2 * ORDER_STEP)];

  it("writes one row for an ordinary drop", () => {
    const changes = placeTask(column, "t3", 1);
    expect(changes).toHaveLength(1);
    expect(changes[0].id).toBe("t3");
    expect(changes[0].order).toBeGreaterThan(0);
    expect(changes[0].order).toBeLessThan(ORDER_STEP);
  });

  it("puts the result in the order the user dropped it in", () => {
    const changes = placeTask(column, "t1", 2);
    const next = column.map((item) => ({ ...item, order: changes.find((row) => row.id === item.id)?.order ?? item.order }));
    expect(sortByManualOrder(next).map((item) => item.id)).toEqual(["t2", "t3", "t1"]);
  });

  it("handles both ends", () => {
    expect(placeTask(column, "t3", 0)[0].order).toBeLessThan(0);
    expect(placeTask(column, "t1", 3)[0].order).toBeGreaterThan(2 * ORDER_STEP);
  });

  it("writes nothing when the Task is dropped where it already was", () => {
    expect(placeTask(column, "t2", 1)).toEqual([]);
  });

  it("renumbers the column, and only the rows that moved, when the gap runs out", () => {
    const tight = [task("a", 0), task("b", 1), task("c", 1 + Number.EPSILON / 2), task("d", 5000)];
    const changes = placeTask(tight, "d", 2);
    expect(changes.length).toBeGreaterThan(1);
    const next = tight.map((item) => ({ ...item, order: changes.find((row) => row.id === item.id)?.order ?? item.order }));
    expect(sortByManualOrder(next).map((item) => item.id)).toEqual(["a", "b", "d", "c"]);
  });

  it("ignores a Task that is not in the column", () => {
    expect(placeTask(column, "nope", 0)).toEqual([]);
  });
});
