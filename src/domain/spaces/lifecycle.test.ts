import { describe, expect, it } from "vitest";
import type { List, Project, Space, Task } from "../../types";
import {
  archiveList,
  archiveProject,
  archiveSpace,
  archivedLists,
  binnedLists,
  canPermanentlyDeleteSpace,
  deletedLists,
  permanentlyDeleteList,
  permanentlyDeleteProject,
  permanentlyDeleteSpace,
  restoreList,
  restoreProject,
  restoreSpace,
  taskCountInList,
  trashList,
  trashProject,
  trashSpace,
} from "./lifecycle";
import { activeLists } from "./hierarchy";
import { matchesScope, type ScopeContext } from "../tasks/scopeQuery";

const NOW = "2026-08-18T09:00:00.000Z";
const LATER = "2026-08-18T10:00:00.000Z";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Task",
    description: "",
    status: "todo",
    priority: "none",
    dueDate: "",
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
    order: 0,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: "",
    blockedByTaskId: "",
    repeatType: "none",
    repeatInterval: 0,
    repeatDays: [],
    repeatEndDate: "",
    ...overrides,
  };
}

const inboxList: List = {
  id: "list-inbox",
  projectId: "",
  kind: "inbox",
  name: "Inbox",
  order: -1,
  isDefault: false,
  createdAt: NOW,
  updatedAt: NOW,
};
const workList: List = {
  id: "l1",
  projectId: "p1",
  kind: "regular",
  name: "Work",
  order: 0,
  isDefault: false,
  createdAt: NOW,
  updatedAt: NOW,
};

describe("List lifecycle (§13.21-§13.23)", () => {
  it("archiving writes on the List and nothing else", () => {
    const lists = archiveList([inboxList, workList], "l1", LATER);
    expect(lists[1]).toMatchObject({ archivedAt: LATER });
    expect(lists[1].deletedAt).toBeUndefined();
  });

  // Gate 9, second line.
  it("deleting a List does not delete, trash or move its Tasks (§6.56)", () => {
    const tasks = [task({ id: "t1", listId: "l1" }), task({ id: "t2", listId: "l1" })];
    const lists = trashList([inboxList, workList], "l1", LATER);
    expect(lists[1].deletedAt).toBe(LATER);
    // The Tasks were not part of the operation at all.
    expect(tasks.every((item) => item.listId === "l1" && !item.deletedAt)).toBe(true);
  });

  it("keeps §13.20's exclusivity in both directions", () => {
    const archived = archiveList([inboxList, workList], "l1", LATER);
    const thenDeleted = trashList(archived, "l1", LATER);
    expect(thenDeleted[1].archivedAt).toBeUndefined();
    expect(thenDeleted[1].deletedAt).toBe(LATER);

    const backToArchived = archiveList(thenDeleted, "l1", LATER);
    expect(backToArchived[1].deletedAt).toBeUndefined();
    expect(backToArchived[1].archivedAt).toBe(LATER);
  });

  it("refuses to put the Inbox away — a Task must always have somewhere to be", () => {
    const lists = [inboxList, workList];
    expect(archiveList(lists, "list-inbox", LATER)).toBe(lists);
    expect(trashList(lists, "list-inbox", LATER)).toBe(lists);
  });

  // Gate 9, third line.
  it("restore brings the Tasks back because the relation never went away", () => {
    const deleted = trashList([inboxList, workList], "l1", LATER);
    const restored = restoreList(deleted, "l1", LATER);
    expect(restored[1].deletedAt).toBeUndefined();
    expect(restored[1].archivedAt).toBeUndefined();
    expect(activeLists(restored, "p1").map((list) => list.id)).toEqual(["l1"]);
  });

  it("takes a put-away List out of every active query", () => {
    for (const lists of [
      archiveList([inboxList, workList], "l1", LATER),
      trashList([inboxList, workList], "l1", LATER),
    ]) {
      expect(activeLists(lists, "p1")).toEqual([]);
    }
  });
});

// Gate 9, first line, at the level the user sees it.
describe("a put-away List takes its Tasks out of the Scopes (§13.19)", () => {
  function ctx(lists: List[]): ScopeContext {
    return { tasks: [], lists, dailyPlans: [], taskTags: [], today: "2026-08-18" };
  }
  const owned = task({ id: "t1", listId: "l1", dueDate: "2026-08-18" });

  it("is in Today while its List is live", () => {
    expect(matchesScope(owned, { kind: "today" }, ctx([inboxList, workList]))).toBe(true);
  });

  it("is in no Scope once the List is archived or deleted", () => {
    for (const lists of [
      archiveList([inboxList, workList], "l1", LATER),
      trashList([inboxList, workList], "l1", LATER),
    ]) {
      expect(matchesScope(owned, { kind: "today" }, ctx(lists))).toBe(false);
      expect(matchesScope(owned, { kind: "list", id: "l1" }, ctx(lists))).toBe(false);
    }
  });

  it("is still not in the Task Trash, because nobody trashed the Task", () => {
    const lists = trashList([inboxList, workList], "l1", LATER);
    expect(matchesScope(owned, { kind: "trash" }, ctx(lists))).toBe(false);
  });
});

describe("permanent delete of a List (§6.56)", () => {
  const tasks = [
    task({ id: "t1", listId: "l1" }),
    task({ id: "t2", listId: "l1", parentTaskId: "t1" }),
    task({ id: "t3", listId: "list-inbox" }),
  ];

  it("is refused for a List that has not been deleted first", () => {
    const result = permanentlyDeleteList([inboxList, workList], tasks, "l1");
    expect(result.done).toBe(false);
    expect(result.lists).toHaveLength(2);
    expect(result.tasks).toHaveLength(3);
  });

  it("takes the List and only its own Tasks", () => {
    const deleted = trashList([inboxList, workList], "l1", LATER);
    const result = permanentlyDeleteList(deleted, tasks, "l1");
    expect(result.done).toBe(true);
    expect(result.lists.map((list) => list.id)).toEqual(["list-inbox"]);
    expect(result.tasks.map((item) => item.id)).toEqual(["t3"]);
  });

  it("counts what it is about to take, top-level Tasks only", () => {
    expect(taskCountInList(tasks, "l1")).toBe(1);
  });
});

describe("Project lifecycle (§13.27-§13.29)", () => {
  const project: Project = {
    id: "p1",
    name: "Work",
    description: "",
    color: "#000",
    createdAt: NOW,
    updatedAt: NOW,
  } as Project;

  it("archive and delete leave the Lists exactly where they were", () => {
    for (const projects of [archiveProject([project], "p1", LATER), trashProject([project], "p1", LATER)]) {
      expect(projects[0].id).toBe("p1");
      const lists = [inboxList, workList];
      expect(lists[1].projectId).toBe("p1");
      expect(activeLists(lists, "p1").map((list) => list.id)).toEqual(["l1"]);
    }
  });

  it("restore needs no backfill (§13.28)", () => {
    const restored = restoreProject(trashProject([project], "p1", LATER), "p1", LATER);
    expect(restored[0].deletedAt).toBeUndefined();
    expect(activeLists([inboxList, workList], "p1").map((list) => list.id)).toEqual(["l1"]);
  });

  // Gate 9, fourth line.
  it("permanent delete makes the Lists standalone instead of deleting them", () => {
    const deleted = trashProject([project], "p1", LATER);
    const result = permanentlyDeleteProject(deleted, [inboxList, workList], "p1", LATER);
    expect(result.done).toBe(true);
    expect(result.projects).toEqual([]);
    const list = result.lists.find((item) => item.id === "l1");
    expect(list).toMatchObject({ projectId: "", kind: "regular" });
    // Standalone, and therefore in no Project's query — but still a List.
    expect(activeLists(result.lists, "p1")).toEqual([]);
  });

  it("is refused for a Project that has not been deleted first", () => {
    const result = permanentlyDeleteProject([project], [inboxList, workList], "p1", LATER);
    expect(result.done).toBe(false);
    expect(result.projects).toHaveLength(1);
  });
});

describe("Space lifecycle (§13.31/§13.32)", () => {
  const space: Space = { id: "s1", name: "Research", description: "", color: "#000", order: 0, createdAt: NOW, updatedAt: NOW };
  const project = { id: "p1", name: "Work", spaceId: "s1", createdAt: NOW, updatedAt: NOW } as Project;

  it("archive, delete and restore touch nothing below", () => {
    const deleted = trashSpace([space], "s1", LATER);
    expect(deleted[0].deletedAt).toBe(LATER);
    expect(project.spaceId).toBe("s1");
    expect(restoreSpace(deleted, "s1", LATER)[0].deletedAt).toBeUndefined();
    expect(archiveSpace([space], "s1", LATER)[0].archivedAt).toBe(LATER);
  });

  it("blocks a permanent delete while any Project still names it (§13.32)", () => {
    const deleted = trashSpace([space], "s1", LATER);
    expect(canPermanentlyDeleteSpace([project], "s1")).toBe(false);
    const result = permanentlyDeleteSpace(deleted, [project], "s1");
    expect(result.done).toBe(false);
    expect(result.spaces).toHaveLength(1);
  });

  it("blocks it for an archived or deleted Project too — those are recoverable", () => {
    expect(canPermanentlyDeleteSpace([{ ...project, archivedAt: LATER }], "s1")).toBe(false);
    expect(canPermanentlyDeleteSpace([{ ...project, deletedAt: LATER }], "s1")).toBe(false);
  });

  it("allows it once nothing points at the Space", () => {
    const deleted = trashSpace([space], "s1", LATER);
    const result = permanentlyDeleteSpace(deleted, [], "s1");
    expect(result.done).toBe(true);
    expect(result.spaces).toEqual([]);
  });
});

describe("the management surfaces (§13.25)", () => {
  it("separate the two states rather than mixing them into one list", () => {
    let lists = archiveList([inboxList, workList, { ...workList, id: "l2", name: "Home" }], "l1", LATER);
    lists = trashList(lists, "l2", LATER);
    expect(archivedLists(lists).map((list) => list.id)).toEqual(["l1"]);
    expect(deletedLists(lists).map((list) => list.id)).toEqual(["l2"]);
  });
});

// §16.3: the Trash draws both, and the ORDER is the decision — what the user
// threw away is what they came for; what they archived is a leftover from a
// verb that no longer exists (§16.6).
describe("what the Trash's List section holds", () => {
  it("puts the thrown-away first and the archived after", () => {
    let lists = archiveList([inboxList, workList, { ...workList, id: "l2", name: "Home" }], "l1", LATER);
    lists = trashList(lists, "l2", LATER);

    expect(binnedLists(lists).map((list) => list.id)).toEqual(["l2", "l1"]);
  });

  it("holds nothing while every List is live", () => {
    expect(binnedLists([inboxList, workList])).toEqual([]);
  });

  it("can permanently delete an archived List, not only a deleted one", () => {
    // The guard was `deletedAt` alone, which would have made an archived List
    // something the Trash could show and never remove (§16.6).
    const lists = archiveList([inboxList, workList], "l1", LATER);
    const result = permanentlyDeleteList(lists, [task({ listId: "l1" })], "l1");

    expect(result.done).toBe(true);
    expect(result.lists.map((list) => list.id)).toEqual(["list-inbox"]);
    expect(result.tasks).toEqual([]);
  });

  it("still refuses a List that is live", () => {
    const result = permanentlyDeleteList([inboxList, workList], [], "l1");
    expect(result.done).toBe(false);
  });
});
