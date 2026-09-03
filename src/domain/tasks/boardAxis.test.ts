// The third Board's columns (TASK_VIEWS_EVERYWHERE_DESIGN.md §2), as rules
// rather than as a screen. What is pinned here is what the design promises and
// what a screen cannot check for itself: which Lists become columns, that no
// row can fall outside them, and that a drop writes the one existing command.
import { describe, expect, it } from "vitest";
import type { List, ListSection, Task } from "../../types";
import {
  boardAxisFor,
  createInListColumn,
  listAxisColumnOf,
  listAxisColumns,
  moveToListColumn,
} from "./boardAxis";
import type { CreateResolution } from "./createResolver";

const NOW = "2026-09-03T09:00:00.000Z";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: `t-${Math.random().toString(16).slice(2)}`,
    title: "Task",
    status: "todo",
    priority: "none",
    dueDate: "",
    projectId: "",
    listId: "list-work",
    sectionId: "",
    tags: [],
    notes: "",
    order: 0,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: "",
    ...overrides,
  } as Task;
}

function list(overrides: Partial<List> & { id: string }): List {
  return {
    projectId: "",
    kind: "regular",
    name: overrides.id,
    order: 0,
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as List;
}

const LABELS = { defaultList: "Tasks", inbox: "Inbox" };

// Work is second in the sidebar and Home first, so the columns can prove they
// follow that order rather than the array's.
const lists: List[] = [
  list({ id: "list-home", name: "Home", order: 0 }),
  list({ id: "list-work", name: "Work", order: 1 }),
  list({ id: "list-old", name: "Archived", order: 2, archivedAt: NOW }),
];

describe("which Board a Scope has", () => {
  it("keeps the two that already existed and gives every other Scope the List axis", () => {
    expect(boardAxisFor({ kind: "inbox" })).toBe("inboxRules");
    expect(boardAxisFor({ kind: "list", id: "list-work" })).toBe("sections");
    for (const scope of [
      { kind: "today" } as const,
      { kind: "upcoming" } as const,
      { kind: "folder", id: "f1" } as const,
      { kind: "tag", id: "t1" } as const,
      { kind: "filter", id: "s1" } as const,
    ]) {
      expect(boardAxisFor(scope)).toBe("lists");
    }
  });
});

describe("the columns of a List-axis Board", () => {
  it("draws only the Lists the rows are actually in, in sidebar order", () => {
    const columns = listAxisColumns(
      { kind: "today" },
      [task({ listId: "list-work" }), task({ listId: "list-home" }), task({ listId: "list-work" })],
      { lists },
      LABELS,
    );

    expect(columns.map((column) => column.id)).toEqual(["list-home", "list-work"]);
    expect(columns.map((column) => column.name)).toEqual(["Home", "Work"]);
  });

  it("leaves out a List with nothing in it — every Scope but the Folder", () => {
    const columns = listAxisColumns({ kind: "tag", id: "t1" }, [task({ listId: "list-work" })], { lists }, LABELS);
    expect(columns.map((column) => column.id)).toEqual(["list-work"]);
  });

  it("draws every List of a Folder, including the empty ones", () => {
    // The Folder IS the set of Lists, so an empty column there is the answer
    // to "where else could this go" rather than noise.
    const inFolder = [
      list({ id: "list-a", name: "A", order: 0, sidebarFolderId: "f1" }),
      list({ id: "list-b", name: "B", order: 1, sidebarFolderId: "f1" }),
      list({ id: "list-c", name: "C", order: 2 }),
    ];
    const columns = listAxisColumns(
      { kind: "folder", id: "f1" },
      [task({ listId: "list-a" })],
      { lists: inFolder },
      LABELS,
    );

    expect(columns.map((column) => column.id)).toEqual(["list-a", "list-b"]);
  });

  // FOLDER_TREE_AND_VIEW_DESIGN.md §5.2: a Folder read two ways must not be
  // two truths. `groupRank` sorted by `order` alone, so a Folder whose Lists
  // the user had dragged in the sidebar showed one order there and another
  // here.
  it("puts a Folder's columns in the order the sidebar puts them", () => {
    const dragged = [
      list({ id: "list-a", name: "A", order: 0, sidebarFolderId: "f1", sidebarSortKey: 2 }),
      list({ id: "list-b", name: "B", order: 1, sidebarFolderId: "f1", sidebarSortKey: 1 }),
    ];
    const columns = listAxisColumns({ kind: "folder", id: "f1" }, [], { lists: dragged }, LABELS);

    expect(columns.map((column) => column.id)).toEqual(["list-b", "list-a"]);
  });

  it("translates the Inbox and a default List, and leaves a chosen name alone", () => {
    const named = [
      list({ id: "list-inbox", kind: "inbox", name: "Inbox", order: 0 }),
      list({ id: "list-default", name: "Tasks", isDefault: true, order: 1 }),
      list({ id: "list-mine", name: "내 일", order: 2 }),
    ];
    const columns = listAxisColumns(
      { kind: "today" },
      [task({ listId: "list-inbox" }), task({ listId: "list-default" }), task({ listId: "list-mine" })],
      { lists: named },
      { defaultList: "할 일", inbox: "받은함" },
    );

    expect(columns.map((column) => column.name)).toEqual(["받은함", "할 일", "내 일"]);
  });

  it("adds the no-List column only when a row needs it", () => {
    const settled = listAxisColumns({ kind: "today" }, [task({ listId: "list-work" })], { lists }, LABELS);
    expect(settled.some((column) => column.id === "")).toBe(false);

    // Its List is archived, so it is in no column the board would otherwise
    // draw — and a card on no screen is the bug this column exists to prevent.
    const stranded = listAxisColumns(
      { kind: "today" },
      [task({ listId: "list-work" }), task({ listId: "list-old" })],
      { lists },
      LABELS,
    );
    expect(stranded.map((column) => column.id)).toEqual(["", "list-work"]);
    expect(stranded[0].labelKey).toBe("tasks.listAxisNone");
  });

  it("puts every row in exactly one of the columns it drew", () => {
    const rows = [
      task({ listId: "list-work" }),
      task({ listId: "list-home" }),
      task({ listId: "list-old" }),
      task({ listId: "list-gone" }),
    ];
    const columns = listAxisColumns({ kind: "today" }, rows, { lists }, LABELS);

    for (const row of rows) {
      const columnId = listAxisColumnOf(row, columns, lists);
      expect(columns.filter((column) => column.id === columnId)).toHaveLength(1);
    }
    expect(listAxisColumnOf(rows[2], columns, lists)).toBe("");
    expect(listAxisColumnOf(rows[3], columns, lists)).toBe("");
  });
});

describe("a card dropped on a List column", () => {
  const sections: ListSection[] = [
    { id: "s-work", listId: "list-work", name: "Doing", order: 0, createdAt: NOW, updatedAt: NOW } as ListSection,
  ];

  it("moves the Task and offers the move back", () => {
    const moving = task({ listId: "list-work", sectionId: "s-work" });
    const mutation = moveToListColumn(moving, "list-home", { lists, sections });

    expect(mutation?.patch).toEqual({ listId: "list-home", sectionId: "" });
    expect(mutation?.undo).toEqual({ listId: "list-work", sectionId: "s-work" });
    expect(mutation?.labelKey).toBe("tasks.undoMoved");
  });

  it("refuses the no-List column, which is a report and not a destination", () => {
    expect(moveToListColumn(task(), "", { lists, sections })).toBeNull();
  });

  it("refuses a List that is not live, however stale the column on screen is", () => {
    expect(moveToListColumn(task(), "list-old", { lists, sections })).toBeNull();
    expect(moveToListColumn(task(), "list-gone", { lists, sections })).toBeNull();
  });
});

describe("a task typed into a List column", () => {
  const base: CreateResolution = {
    targetListId: null,
    requiredBeforeCommit: ["list"],
    patch: { sectionId: "s-elsewhere" },
    enabled: true,
  };

  it("answers the Folder's own question rather than leaving it outstanding", () => {
    // `canCommit` reads `requiredBeforeCommit`, so a column that named the
    // List and left the requirement standing would refuse the create.
    const resolution = createInListColumn(base, "list-work");
    expect(resolution.targetListId).toBe("list-work");
    expect(resolution.requiredBeforeCommit).toEqual([]);
  });

  it("clears a Section the Scope's own patch was carrying", () => {
    expect(createInListColumn(base, "list-work").patch.sectionId).toBe("");
  });

  it("cannot create in the no-List column", () => {
    expect(createInListColumn(base, "").enabled).toBe(false);
  });
});
