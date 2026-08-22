import { describe, expect, it } from "vitest";
import type { List, Project, Task } from "../../types";
import { ensureDefaultLists, ensureInboxList, makeDefaultList } from "./hierarchy";
import {
  backfillTaskListId,
  defaultListIdFor,
  itemsInList,
  listIdFor,
  patchForListMove,
  projectIdFor,
  resolveListMove,
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
    startDate: "",
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
const inbox: List = ensureInboxList([], NOW)[0];

// TickTick plan Migration Phase 3 (§6.70). The three cases are the plan's own,
// and case B is the one with a trap in it.
describe("backfillTaskListId", () => {
  const lists = [defaultList, inbox];

  it("A — leaves a Task that already names its List untouched", () => {
    const already = task({ listId: "list-chosen" });
    expect(backfillTaskListId([already], lists, NOW)[0]).toBe(already);
  });

  it("B — files a Project's Task under that Project's default List, NOT the Inbox", () => {
    // §6.71: sending these to the Inbox would make them disappear from the
    // Space and Project screens that show them today.
    const [filed] = backfillTaskListId([task({ projectId: "space-1" })], lists, NOW);
    expect(filed.listId).toBe(defaultList.id);
    expect(filed.listId).not.toBe(inbox.id);
  });

  it("C — files a Task with no Project at all into the Inbox", () => {
    const [filed] = backfillTaskListId([task({ projectId: "" })], lists, NOW);
    expect(filed.listId).toBe(inbox.id);
  });

  it("returns the SAME array when there is nothing to write", () => {
    const settled = [task({ listId: defaultList.id })];
    expect(backfillTaskListId(settled, lists, NOW)).toBe(settled);
  });

  it("leaves a Task alone when no List can answer for it yet", () => {
    // A Project whose default List has not been created. Writing "" would be
    // worse than waiting: the fallback still resolves it next load.
    const orphan = task({ projectId: "space-9" });
    expect(backfillTaskListId([orphan], [defaultList], NOW)[0]).toBe(orphan);
  });
});

describe("projectIdFor — membership read through the List (§6.77)", () => {
  const lists = [defaultList, inbox];

  it("answers from the List, not from the Task's own projectId", () => {
    // The stored `projectId` is deliberately wrong here: the List is the owner.
    const moved = task({ listId: defaultList.id, projectId: "stale" });
    expect(projectIdFor(moved, lists)).toBe("space-1");
  });

  it("answers '' for a Task in the Inbox, which belongs to no Project (§6.80)", () => {
    expect(projectIdFor(task({ listId: inbox.id, projectId: "" }), lists)).toBe("");
  });

  it("falls back to the stored projectId for a Task the backfill has not reached", () => {
    expect(projectIdFor(task({ listId: "", projectId: "space-1" }), lists)).toBe("space-1");
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

describe("moving an Item into a List", () => {
  // Two Spaces, and a second List in the first — the shapes a tree can drop on.
  const otherDefault: List = makeDefaultList(defaultListIdFor("space-2"), "space-2", NOW);
  const reading: List = {
    id: "list-reading",
    projectId: "space-1",
    spaceId: "space-1",
    name: "Reading",
    order: 1,
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const lists = [defaultList, otherDefault, reading];

  it("stores the id only for a List that is not the default", () => {
    expect(resolveListMove(reading.id, lists)).toEqual({ spaceId: "space-1", listId: reading.id });
  });

  it("clears the id when landing on the default List", () => {
    // The answer is derivable from projectId again, so nothing should be
    // stored — the same discipline listIdFor is built on.
    expect(resolveListMove(defaultList.id, lists)).toEqual({ spaceId: "space-1", listId: "" });
  });

  it("refuses a List that is gone or archived", () => {
    expect(resolveListMove("list-missing", lists)).toBeNull();
    expect(resolveListMove(reading.id, [{ ...reading, archivedAt: NOW }])).toBeNull();
  });

  it("writes the stored id when a task moves off its default List", () => {
    expect(patchForListMove(task(), reading.id, lists)).toEqual({ listId: reading.id });
  });

  it("clears it again when the task comes back", () => {
    expect(patchForListMove(task({ listId: reading.id }), defaultList.id, lists)).toEqual({ listId: "" });
  });

  it("round-trips through listIdFor", () => {
    // The move and the read have to agree, or the card lands somewhere the
    // tree does not show it.
    const moved = { ...task(), ...patchForListMove(task(), reading.id, lists) };
    expect(listIdFor(moved, lists)).toBe(reading.id);
    const back = { ...moved, ...patchForListMove(moved, defaultList.id, lists) };
    expect(listIdFor(back, lists)).toBe(defaultList.id);
  });

  it("takes the task to the List's Space, because the List decides", () => {
    expect(patchForListMove(task(), otherDefault.id, lists)).toEqual({
      listId: "",
      projectId: "space-2",
    });
  });

  // This asserted that the move cleared `statusId`, because a status the user
  // invented belonged to the Space that defined it. There are no invented
  // statuses any more (Ch. 26 §26.3.3), so the move writes the List and the
  // Space and nothing else.
  it("writes the List and the Space, and nothing else", () => {
    expect(patchForListMove(task(), otherDefault.id, lists)).toEqual({
      listId: "",
      projectId: "space-2",
    });
  });

  it("writes nothing when the Item is already there", () => {
    expect(patchForListMove(task(), defaultList.id, lists)).toEqual({});
    expect(patchForListMove(task({ listId: reading.id }), reading.id, lists)).toEqual({});
    expect(patchForListMove(task(), "list-missing", lists)).toEqual({});
  });

});
