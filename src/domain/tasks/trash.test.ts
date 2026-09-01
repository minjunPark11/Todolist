import { describe, expect, it } from "vitest";
import type { CheckItem, Reminder, Subtask, Task, TaskTag } from "../../types";
import {
  emptyTrash,
  permanentlyDeleteTask,
  removeTasksForever,
  trashedTaskIds,
  type TaskRows,
} from "./trash";

function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    parentTaskId: "",
    deletedAt: "",
    ...patch,
  } as Task;
}

const rowsOf = (over: Partial<TaskRows> = {}): TaskRows => ({
  tasks: [],
  subtasks: [],
  checkItems: [],
  taskTags: [],
  reminders: [],
  ...over,
});

const sub = (id: string, taskId: string) => ({ id, taskId }) as Subtask;
const line = (id: string, taskId: string) => ({ id, taskId }) as CheckItem;
const link = (id: string, taskId: string) => ({ id, taskId }) as TaskTag;
const ring = (id: string, taskId: string) => ({ id, taskId }) as Reminder;

describe("what a permanent delete takes with it", () => {
  // The rule `deleteTask` wrote in a comment and only half kept: the lines and
  // the reminders have no meaning without their Task, and neither do the tag
  // links — which is the one it left behind.
  it("takes the rows that only existed for the Task", () => {
    const before = rowsOf({
      tasks: [task("t1"), task("t2")],
      subtasks: [sub("s1", "t1"), sub("s2", "t2")],
      checkItems: [line("c1", "t1"), line("c2", "t2")],
      taskTags: [link("g1", "t1"), link("g2", "t2")],
      reminders: [ring("r1", "t1"), ring("r2", "t2")],
    });

    const after = removeTasksForever(before, ["t1"]);

    expect(after.tasks.map((row) => row.id)).toEqual(["t2"]);
    expect(after.subtasks.map((row) => row.id)).toEqual(["s2"]);
    expect(after.checkItems.map((row) => row.id)).toEqual(["c2"]);
    expect(after.taskTags.map((row) => row.id)).toEqual(["g2"]);
    expect(after.reminders.map((row) => row.id)).toEqual(["r2"]);
  });

  // A child is real work. It is the one thing below a Task that survives it,
  // and the reason this is not a recursive collect.
  it("promotes a child instead of taking it", () => {
    const before = rowsOf({
      tasks: [task("parent"), task("child", { parentTaskId: "parent" })],
      checkItems: [line("c1", "child")],
    });

    const after = removeTasksForever(before, ["parent"]);

    expect(after.tasks.map((row) => row.id)).toEqual(["child"]);
    expect(after.tasks[0].parentTaskId).toBe("");
    // The child kept its own lines — they belonged to the child, not to the
    // Task that was removed.
    expect(after.checkItems.map((row) => row.id)).toEqual(["c1"]);
  });

  it("takes a child that was named too", () => {
    const before = rowsOf({
      tasks: [task("parent"), task("child", { parentTaskId: "parent" })],
    });
    expect(removeTasksForever(before, ["parent", "child"]).tasks).toEqual([]);
  });

  // Same arrays back, so a delete that frees nothing does not mark the store
  // dirty and does not cost a save and a sync.
  it("hands back what it was given when nothing matched", () => {
    const before = rowsOf({ tasks: [task("t1")], checkItems: [line("c1", "t1")] });
    const after = removeTasksForever(before, ["nobody"]);
    expect(after).toBe(before);
    expect(removeTasksForever(before, [])).toBe(before);
  });
});

describe("permanentlyDeleteTask", () => {
  // The guard is the two-step written where a caller cannot forget it.
  it("refuses a Task that was never thrown away", () => {
    const before = rowsOf({ tasks: [task("t1")] });
    const result = permanentlyDeleteTask(before, "t1");
    expect(result.done).toBe(false);
    expect(result.rows).toBe(before);
  });

  it("refuses a Task that is not there", () => {
    const before = rowsOf({ tasks: [task("t1", { deletedAt: "2026-09-01T00:00:00.000Z" })] });
    expect(permanentlyDeleteTask(before, "gone").done).toBe(false);
  });

  it("removes one that is in the Trash", () => {
    const before = rowsOf({
      tasks: [task("t1", { deletedAt: "2026-09-01T00:00:00.000Z" }), task("t2")],
      reminders: [ring("r1", "t1")],
    });

    const result = permanentlyDeleteTask(before, "t1");

    expect(result.done).toBe(true);
    expect(result.rows.tasks.map((row) => row.id)).toEqual(["t2"]);
    expect(result.rows.reminders).toEqual([]);
  });
});

describe("emptyTrash", () => {
  const at = "2026-09-01T00:00:00.000Z";

  it("takes every thrown-away Task and leaves the rest", () => {
    const before = rowsOf({
      tasks: [task("t1", { deletedAt: at }), task("t2"), task("t3", { deletedAt: at })],
      checkItems: [line("c1", "t1"), line("c2", "t2")],
    });

    const result = emptyTrash(before);

    expect(result.removed).toBe(2);
    expect(result.rows.tasks.map((row) => row.id)).toEqual(["t2"]);
    expect(result.rows.checkItems.map((row) => row.id)).toEqual(["c2"]);
  });

  // The count is what the confirmation says out loud, so it has to be the
  // number this call is actually about to remove — not a number the screen
  // worked out separately from a list it filtered its own way.
  it("counts what it removes, and nothing when the Trash is empty", () => {
    const before = rowsOf({ tasks: [task("t1"), task("t2")] });
    const result = emptyTrash(before);
    expect(result.removed).toBe(0);
    expect(result.rows).toBe(before);
  });

  // A live child of a trashed parent is still real work, so emptying the
  // Trash must not take it — it comes back to top level.
  it("leaves a live child behind at top level", () => {
    const before = rowsOf({
      tasks: [task("parent", { deletedAt: at }), task("child", { parentTaskId: "parent" })],
    });

    const result = emptyTrash(before);

    expect(result.removed).toBe(1);
    expect(result.rows.tasks.map((row) => row.id)).toEqual(["child"]);
    expect(result.rows.tasks[0].parentTaskId).toBe("");
  });
});

describe("trashedTaskIds", () => {
  it("reads the one field the Trash is (§12.13)", () => {
    const tasks = [
      task("t1", { deletedAt: "2026-09-01T00:00:00.000Z" }),
      task("t2"),
      task("t3", { deletedAt: "" }),
    ];
    expect(trashedTaskIds(tasks)).toEqual(["t1"]);
  });
});
