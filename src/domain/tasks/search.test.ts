import { describe, expect, it } from "vitest";
import type { Folder, List, Project, SavedFilter, SidebarFolder, Space, Tag, Task } from "../../types";
import { flattenGroups, matchRank, PALETTE_LIMITS, searchAll, type SearchCollections } from "./search";

const NOW = "2026-08-18T09:00:00.000Z";
const LABELS = { inbox: "Inbox", defaultList: "List" };

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
  name: "Work notes",
  order: 0,
  isDefault: true,
  createdAt: NOW,
  updatedAt: NOW,
};

function collections(overrides: Partial<SearchCollections> = {}): SearchCollections {
  return {
    tasks: [],
    lists: [inboxList, workList],
    folders: [],
    sidebarFolders: [],
    tags: [],
    savedFilters: [],
    projects: [],
    spaces: [],
    ...overrides,
  };
}

describe("matchRank — §10.25", () => {
  it("ranks exact above prefix above substring", () => {
    expect(matchRank("report", "report")).toBe(0);
    expect(matchRank("report draft", "report")).toBe(1);
    expect(matchRank("draft report", "report")).toBe(2);
  });

  it("ignores case and surrounding space", () => {
    expect(matchRank(" Report ", "report")).toBe(0);
  });

  it("answers nothing for a miss or an empty query", () => {
    expect(matchRank("report", "invoice")).toBeNull();
    expect(matchRank("report", "  ")).toBeNull();
  });
});

describe("searchAll", () => {
  it("groups by type rather than flattening (§10.10)", () => {
    const groups = searchAll(
      "work",
      collections({
        tasks: [task({ id: "t1", title: "Work on report", listId: "l1" })],
        tags: [{ id: "tag-work", name: "work", createdAt: NOW, updatedAt: NOW }],
      }),
      LABELS,
    );
    expect(groups.map((group) => group.kind)).toEqual(["task", "list", "tag"]);
  });

  it("keeps §10.11's group order whatever matched", () => {
    const groups = searchAll(
      "a",
      collections({
        tasks: [task({ id: "t1", title: "a task", listId: "l1" })],
        tags: [{ id: "tag-a", name: "a tag", createdAt: NOW, updatedAt: NOW }],
        savedFilters: [{ id: "f1", name: "a filter", spec: { version: 1, all: [] }, createdAt: NOW, updatedAt: NOW }] as SavedFilter[],
        sidebarFolders: [{ id: "sf1", name: "a group", createdAt: NOW, updatedAt: NOW }] as SidebarFolder[],
        lists: [inboxList, { ...workList, name: "a list" }],
      }),
      LABELS,
    );
    expect(groups.map((group) => group.kind)).toEqual(["task", "list", "tag", "filter", "folder"]);
  });

  // Gate 8, second line.
  it("never answers with a trashed Task (§10.30)", () => {
    const groups = searchAll(
      "report",
      collections({ tasks: [task({ id: "t1", title: "Report", listId: "l1", deletedAt: NOW })] }),
      LABELS,
    );
    expect(groups).toEqual([]);
  });

  it("keeps a completed Task, marked and ranked below (§10.29)", () => {
    const groups = searchAll(
      "report",
      collections({
        tasks: [
          task({ id: "done", title: "Report", listId: "l1", status: "done" }),
          task({ id: "open", title: "Report draft", listId: "l1" }),
        ],
      }),
      LABELS,
    );
    // "Report" is an exact match and "Report draft" only a prefix — yet the
    // unfinished one comes first.
    expect(groups[0].results.map((result) => result.id)).toEqual(["open", "done"]);
    expect(groups[0].results[1].completed).toBe(true);
  });

  it("does not list a subtask as a result of its own", () => {
    const groups = searchAll(
      "report",
      collections({ tasks: [task({ id: "child", title: "Report bit", listId: "l1", parentTaskId: "t1" })] }),
      LABELS,
    );
    expect(groups).toEqual([]);
  });

  it("says which List a Task is in, and carries the owner for the URL (§10.12/§10.17)", () => {
    const groups = searchAll(
      "report",
      collections({ tasks: [task({ id: "t1", title: "Report", listId: "l1" })] }),
      LABELS,
    );
    expect(groups[0].results[0]).toMatchObject({ subtitle: "Work notes", ownerListId: "l1" });
  });

  it("calls the Inbox by its own name rather than the stored one (§6.7)", () => {
    const groups = searchAll(
      "inbox",
      collections({ lists: [{ ...inboxList, name: "stored-inbox-name" }, workList] }),
      LABELS,
    );
    expect(groups[0].results[0].title).toBe("Inbox");
  });

  it("leaves out archived Lists and Tags", () => {
    const groups = searchAll(
      "old",
      collections({
        lists: [inboxList, { ...workList, name: "old list", archivedAt: NOW }],
        tags: [{ id: "tag-old", name: "old tag", archivedAt: NOW, createdAt: NOW, updatedAt: NOW }] as Tag[],
        folders: [{ id: "f1", projectId: "p1", name: "old folder", order: 0, archivedAt: NOW, createdAt: NOW, updatedAt: NOW }] as Folder[],
      }),
      LABELS,
    );
    expect(groups).toEqual([]);
  });

  it("answers nothing for an empty query rather than everything", () => {
    expect(searchAll("   ", collections({ tasks: [task()] }), LABELS)).toEqual([]);
  });

  it("cuts each group at the limit (§10.49)", () => {
    const many = Array.from({ length: 12 }, (_, index) => task({ id: `t${index}`, title: `Report ${index}`, listId: "l1" }));
    const groups = searchAll("report", collections({ tasks: many }), LABELS, PALETTE_LIMITS);
    expect(groups[0].results).toHaveLength(PALETTE_LIMITS.task);
    expect(flattenGroups(groups)).toHaveLength(PALETTE_LIMITS.task);
  });
});

describe("what lives above the Tasks Module (§10.16)", () => {
  const project = { id: "p1", name: "Drone research", createdAt: NOW, updatedAt: NOW } as Project;
  const space = { id: "s1", name: "Research", createdAt: NOW, updatedAt: NOW } as Space;

  it("answers with Projects and Spaces as their own kinds, last in group order", () => {
    const groups = searchAll(
      "res",
      collections({ projects: [project], spaces: [space] }),
      LABELS,
    );
    expect(groups.map((group) => group.kind)).toEqual(["project", "space"]);
    expect(groups[0].results[0].title).toBe("Drone research");
    expect(groups[1].results[0].title).toBe("Research");
  });

  it("leaves out an archived one, the same as every other container", () => {
    const groups = searchAll(
      "res",
      collections({ projects: [{ ...project, archivedAt: NOW }], spaces: [{ ...space, archivedAt: NOW }] }),
      LABELS,
    );
    expect(groups).toEqual([]);
  });
});

describe("per-group limits (§10.49)", () => {
  it("caps each kind on its own rather than sharing one budget", () => {
    const tasks = Array.from({ length: 9 }, (_, index) => task({ id: `t${index}`, title: `Report ${index}`, listId: "l1" }));
    const tags = Array.from({ length: 9 }, (_, index) => ({
      id: `tag-${index}`,
      name: `report ${index}`,
      createdAt: NOW,
      updatedAt: NOW,
    })) as Tag[];
    const groups = searchAll("report", collections({ tasks, tags }), LABELS, PALETTE_LIMITS);
    expect(groups.find((group) => group.kind === "task")?.results).toHaveLength(PALETTE_LIMITS.task);
    expect(groups.find((group) => group.kind === "tag")?.results).toHaveLength(PALETTE_LIMITS.tag);
  });
});
