import { describe, expect, it } from "vitest";
import { duplicateTaskPlan } from "./duplicate";
import { byManualOrder } from "./sortKey";
import type { CheckItem, Subtask, Task, TaskTag } from "../../types";

const NOW = "2026-08-25T10:00:00.000Z";
const BEFORE = "2026-08-01T00:00:00.000Z";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Write the release notes",
    description: "The body",
    status: "open",
    priority: "high",
    dueDate: "2026-08-26",
    startDate: "",
    startTime: "",
    endTime: "",
    projectId: "p1",
    categoryId: "",
    parentTaskId: "",
    listId: "l1",
    tags: ["work"],
    notes: "",
    estimatedMinutes: 0,
    actualSeconds: 0,
    activeSessionId: "",
    lastFocusedAt: "",
    isSomeday: false,
    waitingReason: "",
    waitingFollowUpDate: "",
    order: 0,
    createdAt: BEFORE,
    updatedAt: BEFORE,
    completedAt: "",
    blockedByTaskId: "",
    repeatType: "none",
    repeatInterval: 1,
    repeatDays: [],
    repeatEndDate: "",
    ...overrides,
  } as Task;
}

/** Ids in the order they are asked for, so §15.13's mapping is checkable. */
function counter() {
  const seen = new Map<string, number>();
  return (prefix: string) => {
    const next = (seen.get(prefix) ?? 0) + 1;
    seen.set(prefix, next);
    return `${prefix}-copy-${next}`;
  };
}

function sources(overrides: Partial<Parameters<typeof duplicateTaskPlan>[1]> = {}) {
  return { tasks: [], subtasks: [], checkItems: [], taskTags: [], reminders: [], ...overrides };
}

describe("duplicateTaskPlan (§15.9–§15.18)", () => {
  it("gives the copy a new id and leaves the original alone", () => {
    const original = task();
    const plan = duplicateTaskPlan("t1", sources({ tasks: [original] }), counter(), NOW)!;

    expect(plan.rootId).toBe("task-copy-1");
    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0].id).not.toBe("t1");
    // §15.18: the plan is only new records. Nothing here is a patch to
    // something that already exists.
    expect(original).toEqual(task());
  });

  it("copies what §15.10 lists as copied", () => {
    const plan = duplicateTaskPlan("t1", sources({ tasks: [task()] }), counter(), NOW)!;
    const copy = plan.tasks[0];

    expect(copy.title).toBe("Write the release notes");
    expect(copy.description).toBe("The body");
    expect(copy.priority).toBe("high");
    expect(copy.listId).toBe("l1");
    // §15.11: the schedule comes across, because a copy is a copy and not a
    // Quick Add.
    expect(copy.dueDate).toBe("2026-08-26");
  });

  it("resets the copy to work not yet done (§15.10)", () => {
    const finished = task({
      status: "completed",
      completedAt: NOW,
      wontDoAt: NOW,
      deletedAt: NOW,
      createdAt: BEFORE,
    });
    const copy = duplicateTaskPlan("t1", sources({ tasks: [finished] }), counter(), NOW)!.tasks[0];

    expect(copy.status).toBe("open");
    expect(copy.completedAt).toBe("");
    expect(copy.wontDoAt).toBe("");
    expect(copy.deletedAt).toBe("");
    expect(copy.createdAt).toBe(NOW);
  });

  it("does not hand the copy the original's focus history or its pin", () => {
    const worked = task({
      actualSeconds: 5400,
      lastFocusedAt: BEFORE,
      activeSessionId: "focus-1",
      pinnedAt: BEFORE,
    });
    const copy = duplicateTaskPlan("t1", sources({ tasks: [worked] }), counter(), NOW)!.tasks[0];

    // These rode the object spread before. A brand new copy claimed ninety
    // minutes of work and pointed at a session that belonged to the original.
    expect(copy.actualSeconds).toBe(0);
    expect(copy.lastFocusedAt).toBe("");
    expect(copy.activeSessionId).toBe("");
    expect(copy.pinnedAt).toBe("");
  });

  it("copies the whole subtree and repoints the children at the copies (§15.13)", () => {
    const tree = [
      task({ id: "A", title: "A" }),
      task({ id: "B", title: "B", parentTaskId: "A" }),
      task({ id: "C", title: "C", parentTaskId: "B" }),
    ];
    const plan = duplicateTaskPlan("A", sources({ tasks: tree }), counter(), NOW)!;

    expect(plan.tasks.map((copy) => copy.title)).toEqual(["A", "B", "C"]);
    const [a, b, c] = plan.tasks;
    expect(b.parentTaskId).toBe(a.id);
    expect(c.parentTaskId).toBe(b.id);
    // The one that mattered: not a single new id may point back into the tree
    // that was copied.
    expect(plan.tasks.some((copy) => ["A", "B", "C"].includes(copy.parentTaskId))).toBe(false);
  });

  it("makes the root copy a sibling of the original, not its child", () => {
    const tree = [task({ id: "parent" }), task({ id: "child", parentTaskId: "parent" })];
    const plan = duplicateTaskPlan("child", sources({ tasks: tree }), counter(), NOW)!;

    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0].parentTaskId).toBe("parent");
  });

  it("puts the copy directly after the original", () => {
    const column = [task({ id: "t1", order: 1000 }), task({ id: "t2", order: 2000 })];
    const plan = duplicateTaskPlan("t1", sources({ tasks: column }), counter(), NOW)!;

    const ordered = [...column, plan.tasks[0]].sort(byManualOrder);
    expect(ordered.map((row) => row.id)).toEqual(["t1", plan.rootId, "t2"]);
  });

  it("halves the gap rather than renumbering the column (§6.31)", () => {
    // Adjacent integers are not a full gap — the keys are fractional, which
    // is the point of §6.30's spacing. A duplicate writes one row here, never
    // the column.
    const column = [task({ id: "t1", order: 1 }), task({ id: "t2", order: 2 })];
    const plan = duplicateTaskPlan("t1", sources({ tasks: column }), counter(), NOW)!;

    expect(plan.tasks[0].order).toBe(1.5);
    expect(column.map((row) => row.order)).toEqual([1, 2]);
  });

  it("puts a copy of the last Task after it", () => {
    const column = [task({ id: "t1", order: 1000 })];
    const plan = duplicateTaskPlan("t1", sources({ tasks: column }), counter(), NOW)!;
    expect(plan.tasks[0].order).toBeGreaterThan(1000);
  });

  it("copies the checklist unticked (§15.14)", () => {
    const items: CheckItem[] = [
      { id: "c1", taskId: "t1", text: "First", checked: true, sortKey: 1, completedAt: NOW, createdAt: BEFORE, updatedAt: BEFORE },
      { id: "c2", taskId: "t1", text: "Second", checked: false, sortKey: 2, completedAt: "", createdAt: BEFORE, updatedAt: BEFORE },
    ];
    const plan = duplicateTaskPlan("t1", sources({ tasks: [task()], checkItems: items }), counter(), NOW)!;

    expect(plan.checkItems.map((item) => item.text)).toEqual(["First", "Second"]);
    expect(plan.checkItems.every((item) => item.checked === false)).toBe(true);
    expect(plan.checkItems.every((item) => item.taskId === plan.rootId)).toBe(true);
    expect(plan.checkItems.some((item) => item.id === "c1")).toBe(false);
  });

  it("copies the Tag relations, not only the name array (§15.17)", () => {
    const links: TaskTag[] = [{ id: "tasktag-t1--tag-work", taskId: "t1", tagId: "tag-work", createdAt: BEFORE }];
    const plan = duplicateTaskPlan("t1", sources({ tasks: [task()], taskTags: links }), counter(), NOW)!;

    // §13.32 made the relation canonical. Before this the copy carried
    // `tags: ["work"]` and no relation, so every screen that reads the
    // relation — which is all of them — showed an untagged Task.
    expect(plan.taskTags).toEqual([
      { id: `tasktag-${plan.rootId}--tag-work`, taskId: plan.rootId, tagId: "tag-work", createdAt: NOW },
    ]);
  });

  it("gives the copy its own tag array", () => {
    const original = task({ tags: ["work"] });
    const copy = duplicateTaskPlan("t1", sources({ tasks: [original] }), counter(), NOW)!.tasks[0];

    copy.tags.push("later");
    expect(original.tags).toEqual(["work"]);
  });

  it("copies legacy Subtask rows unticked, under the new Task", () => {
    const rows: Subtask[] = [
      { id: "s1", taskId: "t1", title: "Legacy step", completed: true, createdAt: BEFORE, updatedAt: BEFORE },
    ];
    const plan = duplicateTaskPlan("t1", sources({ tasks: [task()], subtasks: rows }), counter(), NOW)!;

    expect(plan.subtasks).toHaveLength(1);
    expect(plan.subtasks[0].id).not.toBe("s1");
    expect(plan.subtasks[0].taskId).toBe(plan.rootId);
    expect(plan.subtasks[0].completed).toBe(false);
  });

  it("answers null for a Task that is no longer there (§15.67)", () => {
    expect(duplicateTaskPlan("gone", sources({ tasks: [task()] }), counter(), NOW)).toBeNull();
  });
});
