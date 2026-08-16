import { describe, expect, it } from "vitest";
import type { Subtask, Task } from "../../types";
import { childDraft, childProgress, childrenOf, promoteDraft } from "./children";

const NOW = "2026-08-15T00:00:00.000Z";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Parent",
    description: "",
    status: "todo",
    priority: "high",
    dueDate: "2026-08-20",
    startDate: "",
    scheduledDate: "2026-08-17",
    startTime: "",
    endTime: "",
    projectId: "space-1",
    categoryId: "",
    parentTaskId: "",
    tags: ["space:s1", "group:g1", "reading"],
    notes: "",
    estimatedMinutes: 0,
    actualSeconds: 0,
    activeSessionId: "",
    lastFocusedAt: "",
    isSomeday: false,
    waitingReason: "",
    waitingFollowUpDate: "",
    order: 0,
    createdAt: NOW,
    updatedAt: NOW,
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

function subtask(overrides: Partial<Subtask> = {}): Subtask {
  return { id: "sub-1", taskId: "task-1", title: "Legacy", completed: false, createdAt: NOW, updatedAt: NOW, ...overrides };
}

describe("childrenOf", () => {
  it("answers with both kinds at once", () => {
    // The whole point: two features, one question. A panel should not have to
    // know which mechanism produced a child.
    const children = childrenOf("task-1", [task(), task({ id: "c1", title: "Child", parentTaskId: "task-1" })], [subtask()]);
    expect(children.map((child) => [child.kind, child.title])).toEqual([
      ["task", "Child"],
      ["legacy", "Legacy"],
    ]);
  });

  it("reads done from whichever field the kind uses", () => {
    const children = childrenOf(
      "task-1",
      [task({ id: "c1", parentTaskId: "task-1", status: "done" })],
      [subtask({ completed: true })],
    );
    expect(children.every((child) => child.done)).toBe(true);
    expect(childProgress(children)).toEqual({ done: 2, total: 2 });
  });

  it("ignores other parents, deleted children, and no parent at all", () => {
    const tasks = [
      task(),
      task({ id: "c1", parentTaskId: "other" }),
      task({ id: "c2", parentTaskId: "task-1", deletedAt: NOW }),
    ];
    expect(childrenOf("task-1", tasks, [subtask({ taskId: "other" })])).toEqual([]);
    expect(childrenOf("", tasks, [subtask()])).toEqual([]);
  });
});

describe("childDraft", () => {
  it("inherits where the work lives, not when it is due", () => {
    // A child is not due when its parent is; inheriting a deadline would put a
    // date on the timeline that nobody chose.
    const draft = childDraft(task({ listId: "list-2" }), "  Read the paper  ");
    expect(draft).toEqual({
      title: "Read the paper",
      status: "todo",
      projectId: "space-1",
      parentTaskId: "task-1",
      listId: "list-2",
      tags: ["space:s1", "group:g1"],
    });
  });

  it("carries only the tags that place it", () => {
    // "reading" is the user's label for the parent, not a location.
    expect(childDraft(task(), "x").tags).not.toContain("reading");
  });
});

describe("promoteDraft", () => {
  it("keeps a finished Subtask finished", () => {
    expect(promoteDraft(task(), subtask({ title: "Done thing", completed: true }))).toMatchObject({
      title: "Done thing",
      status: "done",
      parentTaskId: "task-1",
    });
  });

  it("lands an open one as open", () => {
    expect(promoteDraft(task(), subtask()).status).toBe("todo");
  });

  it("promotes into the same place as a fresh child", () => {
    // Otherwise a promoted subtask would drift out of its parent's List.
    const promoted = promoteDraft(task({ listId: "list-2" }), subtask({ title: "x" }));
    const fresh = childDraft(task({ listId: "list-2" }), "x");
    expect({ ...promoted, status: fresh.status }).toEqual(fresh);
  });
});
