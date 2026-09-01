// @vitest-environment jsdom
//
// Permanent delete through the store (TRASH_PERMANENT_DELETE_DESIGN.md §4
// Phase 1). The rule about what goes with a Task is a pure function and is
// tested as one in `domain/tasks/trash.test.ts`; what cannot be seen there is
// the transaction — that the store really loses those rows, that the guard
// holds when a caller reaches for a Task nobody threw away, and that Undo puts
// back everything the delete took.
//
// That last one is why this file exists at all. `deleteTask` was taking the
// checklist, the tag links and the reminders while `restoreDeletedTask` put
// back only the Task and its subtasks, so Undo looked like it worked and the
// lines were gone.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { popUndo } from "../lib/undoStack";

const store = new Map<string, string>();
vi.mock("../platform", () => ({
  platform: {
    storage: {
      getSync: (key: string) => store.get(key) ?? null,
      setSync: (key: string, value: string) => void store.set(key, value),
      removeSync: (key: string) => void store.delete(key),
    },
  },
}));

import { usePlannerData } from "./usePlannerData";

type Planner = { current: ReturnType<typeof usePlannerData> };

let clock = 0;

beforeEach(() => {
  store.clear();
  clock = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => clock);
});

afterEach(() => {
  while (popUndo());
  vi.restoreAllMocks();
  cleanup();
});

/**
 * A Task with one of everything a permanent delete can reach, and one child.
 *
 * `addSubtask` writes a child TASK now, not a legacy `Subtask` row — the
 * promotion path landed a while ago and the old collection has no writer left.
 * That is why the child is checked separately below: it is the one thing under
 * a Task that a permanent delete must NOT take.
 */
function plannerWithFurnishedTask() {
  const { result } = renderHook(() => usePlannerData());
  let id = "";
  act(() => {
    id = result.current.addTask({ title: "Talk prep" });
  });
  act(() => {
    result.current.addCheckItem(id, "Prepare slides");
    result.current.addSubtask(id, "Book the room");
    result.current.toggleTaskTag(id, "urgent");
    result.current.updateTaskSchedule(id, {
      startDate: null,
      dueDate: "2026-09-10",
      startTime: "09:00",
      endTime: null,
      timezone: null,
      repeat: "none",
      reminders: [
        { type: "relative", offsetMinutes: 30, absoluteAt: null, allDayTime: null, enabled: true },
      ],
    });
  });
  clock += 200;
  return { result: result as Planner, id };
}

const rowsFor = (result: Planner, taskId: string) => ({
  task: result.current.tasks.some((row) => row.id === taskId),
  checkItems: result.current.checkItems.filter((row) => row.taskId === taskId).length,
  subtasks: result.current.subtasks.filter((row) => row.taskId === taskId).length,
  taskTags: result.current.taskTags.filter((row) => row.taskId === taskId).length,
  reminders: result.current.reminders.filter((row) => row.taskId === taskId).length,
});

describe("deleting a Task for good", () => {
  it("takes every row that only existed for it", () => {
    const { result, id } = plannerWithFurnishedTask();
    const before = rowsFor(result, id);
    // The Task really is furnished — otherwise the assertion below would pass
    // against a Task that had nothing to lose.
    expect(before.checkItems).toBeGreaterThan(0);
    expect(before.taskTags).toBeGreaterThan(0);
    expect(before.reminders).toBeGreaterThan(0);
    const child = result.current.tasks.find((row) => row.parentTaskId === id)!;
    expect(child).toBeDefined();

    act(() => {
      result.current.deleteTask(id);
    });

    expect(rowsFor(result, id)).toEqual({
      task: false,
      checkItems: 0,
      subtasks: 0,
      taskTags: 0,
      reminders: 0,
    });
    // The child is real work and outlives its parent, at top level.
    const orphan = result.current.tasks.find((row) => row.id === child.id);
    expect(orphan).toBeDefined();
    expect(orphan!.parentTaskId).toBe("");
  });

  it("puts all of them back on Undo", () => {
    const { result, id } = plannerWithFurnishedTask();
    const before = rowsFor(result, id);

    // What `App.deleteTaskWithUndo` captures before it deletes.
    const task = result.current.tasks.find((row) => row.id === id)!;
    const subtasks = result.current.subtasks.filter((row) => row.taskId === id);
    const checkItems = result.current.checkItems.filter((row) => row.taskId === id);
    const taskTags = result.current.taskTags.filter((row) => row.taskId === id);
    const reminders = result.current.reminders.filter((row) => row.taskId === id);

    act(() => {
      result.current.deleteTask(id);
    });
    act(() => {
      result.current.restoreDeletedTask(task, subtasks, [], checkItems, taskTags, reminders);
    });

    expect(rowsFor(result, id)).toEqual(before);
  });

  // A toast can be clicked twice. Restoring by rebuilding each list — "what is
  // there for other Tasks, plus what this Task had" — is what keeps the second
  // click from doubling every row.
  it("survives the same Undo running twice", () => {
    const { result, id } = plannerWithFurnishedTask();
    const before = rowsFor(result, id);
    const task = result.current.tasks.find((row) => row.id === id)!;
    const checkItems = result.current.checkItems.filter((row) => row.taskId === id);
    const taskTags = result.current.taskTags.filter((row) => row.taskId === id);
    const reminders = result.current.reminders.filter((row) => row.taskId === id);
    const subtasks = result.current.subtasks.filter((row) => row.taskId === id);

    act(() => {
      result.current.deleteTask(id);
    });
    act(() => {
      result.current.restoreDeletedTask(task, subtasks, [], checkItems, taskTags, reminders);
    });
    act(() => {
      result.current.restoreDeletedTask(task, subtasks, [], checkItems, taskTags, reminders);
    });

    expect(rowsFor(result, id)).toEqual(before);
  });
});

describe("permanentlyDeleteTask", () => {
  it("refuses a Task nobody threw away", () => {
    const { result, id } = plannerWithFurnishedTask();

    act(() => {
      result.current.permanentlyDeleteTask(id);
    });

    expect(result.current.tasks.some((row) => row.id === id)).toBe(true);
  });

  it("removes one that is in the Trash", () => {
    const { result, id } = plannerWithFurnishedTask();
    act(() => {
      result.current.updateTask(id, { deletedAt: new Date().toISOString() });
    });

    act(() => {
      result.current.permanentlyDeleteTask(id);
    });

    expect(rowsFor(result, id)).toEqual({
      task: false,
      checkItems: 0,
      subtasks: 0,
      taskTags: 0,
      reminders: 0,
    });
  });
});

describe("emptyTrash", () => {
  it("takes the thrown-away Tasks, leaves the rest, and says how many", () => {
    const { result } = renderHook(() => usePlannerData());
    let trashed = "";
    let kept = "";
    act(() => {
      trashed = result.current.addTask({ title: "Thrown away" });
      kept = result.current.addTask({ title: "Still here" });
    });
    act(() => {
      result.current.updateTask(trashed, { deletedAt: new Date().toISOString() });
    });

    let removed = -1;
    act(() => {
      removed = result.current.emptyTrash();
    });

    expect(removed).toBe(1);
    expect(result.current.tasks.map((row) => row.id)).toEqual([kept]);
  });

  it("counts nothing and changes nothing when the Trash is empty", () => {
    const { result } = renderHook(() => usePlannerData());
    act(() => {
      result.current.addTask({ title: "Still here" });
    });
    const before = result.current.tasks;

    let removed = -1;
    act(() => {
      removed = result.current.emptyTrash();
    });

    expect(removed).toBe(0);
    expect(result.current.tasks).toBe(before);
  });
});
