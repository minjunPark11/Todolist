import { describe, expect, it } from "vitest";
import type { List, Project, Status, Task } from "../../types";
import { DEFAULT_STATUSES, ensureDefaultLists, makeDefaultList } from "./hierarchy";
import {
  defaultListIdFor,
  isDoneStatus,
  itemsInList,
  listIdFor,
  MIGRATED_TASK_STATUSES,
  statusesForSpace,
  statusesWithBoardLists,
  statusFor,
  statusIdFor,
} from "./membership";

const NOW = "2026-08-15T00:00:00.000Z";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "space-1",
    name: "Career",
    description: "",
    color: "#0066cc",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Task",
    description: "",
    status: "todo",
    priority: "none",
    dueDate: "",
    scheduledDate: "",
    startTime: "",
    endTime: "",
    projectId: "space-1",
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

const defaultList: List = makeDefaultList(defaultListIdFor("space-1"), "space-1", NOW);

// The migration writes nothing to tasks, which only works if every status the
// app can store already exists in the default set. If TaskStatus ever gains a
// value, this fails before any task can end up in a state nothing renders.
describe("default statuses cover every TaskStatus", () => {
  it("has an id for each one", () => {
    const ids = DEFAULT_STATUSES.map((status) => status.id);
    for (const status of MIGRATED_TASK_STATUSES) {
      expect(ids).toContain(status);
    }
  });

  it("agrees on the count, so a stale extra cannot hide a missing one", () => {
    expect(DEFAULT_STATUSES).toHaveLength(MIGRATED_TASK_STATUSES.length);
  });
});

describe("listIdFor", () => {
  it("falls back to the Space's default List, so no task needed rewriting", () => {
    expect(listIdFor(task(), [defaultList])).toBe(defaultList.id);
  });

  it("prefers a stored listId once the task has actually been moved", () => {
    const moved: List = { ...defaultList, id: "list-2", isDefault: false };
    expect(listIdFor(task({ listId: "list-2" }), [defaultList, moved])).toBe("list-2");
  });

  it("returns empty for a task in no space rather than guessing", () => {
    expect(listIdFor(task({ projectId: "" }), [defaultList])).toBe("");
  });

  it("returns empty when the space somehow has no list", () => {
    expect(listIdFor(task(), [])).toBe("");
  });
});

describe("statusIdFor", () => {
  it("uses the task's own status while the Space runs the defaults", () => {
    expect(statusIdFor(task({ status: "doing" }), DEFAULT_STATUSES)).toBe("doing");
  });

  it("prefers a stored id once the task sits on a custom status", () => {
    const custom: Status[] = [
      ...DEFAULT_STATUSES,
      { id: "review", label: "In review", color: "#000", order: 9, group: "active" },
    ];
    expect(statusIdFor(task({ statusId: "review" }), custom)).toBe("review");
  });

  it("falls back when the stored id no longer exists — a status deleted elsewhere", () => {
    // Otherwise the task would sit in a state nothing in the set can render.
    expect(statusIdFor(task({ statusId: "deleted", status: "todo" }), DEFAULT_STATUSES)).toBe("todo");
  });

  it("resolves the status object and its done-ness", () => {
    expect(statusFor(task({ status: "done" }), DEFAULT_STATUSES)?.label).toBe("Done");
    expect(isDoneStatus(task({ status: "done" }), DEFAULT_STATUSES)).toBe(true);
    expect(isDoneStatus(task({ status: "doing" }), DEFAULT_STATUSES)).toBe(false);
  });
});

describe("statusesForSpace", () => {
  it("returns the defaults for a Space that has never been edited", () => {
    expect(statusesForSpace(project())).toBe(DEFAULT_STATUSES);
    expect(statusesForSpace(undefined)).toBe(DEFAULT_STATUSES);
  });

  it("returns the Space's own set once it has one", () => {
    const own: Status[] = [{ id: "x", label: "X", color: "#000", order: 0, group: "done" }];
    expect(statusesForSpace(project({ statuses: own }))).toBe(own);
  });
});

describe("statusesWithBoardLists", () => {
  it("reads board lists as extra active statuses instead of rewriting them", () => {
    const space = project({
      boardLists: [{ id: "bl-1", name: "In review", order: 0 }],
    });
    const statuses = statusesWithBoardLists(space);
    const added = statuses.find((status) => status.id === "bl-1");
    expect(added).toMatchObject({ label: "In review", group: "active" });
    // Appended after the defaults, not interleaved with them.
    expect(statuses.slice(0, DEFAULT_STATUSES.length)).toEqual(DEFAULT_STATUSES);
  });

  it("ignores archived board lists", () => {
    const space = project({ boardLists: [{ id: "bl-1", name: "Old", order: 0, archivedAt: NOW }] });
    expect(statusesWithBoardLists(space)).toBe(DEFAULT_STATUSES);
  });

  it("returns the base set unchanged when there are no board lists", () => {
    expect(statusesWithBoardLists(project())).toBe(DEFAULT_STATUSES);
  });

  it("does not shadow a default status with a board list of the same id", () => {
    const space = project({ boardLists: [{ id: "done", name: "Done column", order: 0 }] });
    expect(statusesWithBoardLists(space)).toBe(DEFAULT_STATUSES);
  });
});

describe("itemsInList", () => {
  it("collects tasks that resolve to the list, stored or derived", () => {
    const other: List = { ...defaultList, id: "list-2", isDefault: false };
    const tasks = [
      task({ id: "derived" }),
      task({ id: "moved", listId: "list-2" }),
      task({ id: "elsewhere", projectId: "space-9" }),
    ];
    expect(itemsInList(tasks, [defaultList, other], defaultList.id).map((item) => item.id)).toEqual([
      "derived",
    ]);
    expect(itemsInList(tasks, [defaultList, other], "list-2").map((item) => item.id)).toEqual(["moved"]);
  });

  it("skips deleted tasks", () => {
    const tasks = [task({ id: "gone", deletedAt: NOW })];
    expect(itemsInList(tasks, [defaultList], defaultList.id)).toEqual([]);
  });
});

describe("ensureDefaultLists", () => {
  it("creates one list per space and leaves the array alone when there is nothing to do", () => {
    const created = ensureDefaultLists(["space-1", "space-2"], [], NOW, defaultListIdFor);
    expect(created.map((list) => list.spaceId)).toEqual(["space-1", "space-2"]);
    expect(created.every((list) => list.isDefault)).toBe(true);

    const again = ensureDefaultLists(["space-1", "space-2"], created, NOW, defaultListIdFor);
    // Same reference: a load that changes nothing must not mark anything dirty.
    expect(again).toBe(created);
  });

  it("is idempotent across devices because the id is derived, not generated", () => {
    const deviceA = ensureDefaultLists(["space-1"], [], NOW, defaultListIdFor);
    const deviceB = ensureDefaultLists(["space-1"], [], NOW, defaultListIdFor);
    expect(deviceA[0].id).toBe(deviceB[0].id);
    // Merged by id on sync, so the two runs collapse to one record.
    expect(ensureDefaultLists(["space-1"], deviceA, NOW, defaultListIdFor)).toBe(deviceA);
  });

  it("does not add one when the space already has a non-default list", () => {
    const existing: List[] = [{ ...defaultList, id: "custom", isDefault: true }];
    expect(ensureDefaultLists(["space-1"], existing, NOW, defaultListIdFor)).toBe(existing);
  });

  it("skips empty space ids", () => {
    expect(ensureDefaultLists([""], [], NOW, defaultListIdFor)).toEqual([]);
  });
});
