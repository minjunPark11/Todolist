import { describe, expect, it } from "vitest";
import type { List, ListSection, Task } from "../../types";
import { INBOX_COLUMNS, inboxBucketOf, listBoardColumns, moveToInboxBucket } from "./board";
import { moveTaskToSection } from "./mutations";

const NOW = "2026-08-18T09:00:00.000Z";

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

describe("inboxBucketOf — §6.24's virtual columns", () => {
  it("reads the three columns off the Task's own fields", () => {
    expect(inboxBucketOf(task())).toBe("unsorted");
    expect(inboxBucketOf(task({ dueDate: "2026-08-20" }))).toBe("scheduled");
    expect(inboxBucketOf(task({ isSomeday: true }))).toBe("someday");
  });

  it("puts a record holding both in exactly one column (§6.23)", () => {
    expect(inboxBucketOf(task({ isSomeday: true, dueDate: "2026-08-20" }))).toBe("someday");
  });
});

describe("moveToInboxBucket — §6.25's drag patches", () => {
  it("asks for a date rather than inventing one", () => {
    expect(moveToInboxBucket(task(), "scheduled")).toBeNull();
    expect(moveToInboxBucket(task(), "scheduled", "2026-08-20")?.patch).toEqual({
      isSomeday: false,
      dueDate: "2026-08-20",
    });
  });

  it("clears the date going back to unsorted", () => {
    const moving = task({ dueDate: "2026-08-20" });
    const mutation = moveToInboxBucket(moving, "unsorted");
    expect(mutation?.patch).toEqual({ isSomeday: false, dueDate: "" });
    expect(mutation?.undo).toEqual({ isSomeday: false, dueDate: "2026-08-20" });
  });

  it("someday takes the date with it, and undo brings it back", () => {
    const moving = task({ dueDate: "2026-08-20" });
    const mutation = moveToInboxBucket(moving, "someday");
    expect(mutation?.patch).toEqual({ isSomeday: true, dueDate: "" });
    expect(mutation?.undo).toEqual({ isSomeday: false, dueDate: "2026-08-20" });
  });

  it("leaving someday clears the flag", () => {
    expect(moveToInboxBucket(task({ isSomeday: true }), "unsorted")?.patch).toEqual({
      isSomeday: false,
      dueDate: "",
    });
  });

  // Gate 7, first two lines: the same drag is a different command per Board.
  it("never writes a sectionId", () => {
    for (const bucket of ["unsorted", "scheduled", "someday"] as const) {
      const mutation = moveToInboxBucket(task({ sectionId: "sec1" }), bucket, "2026-08-20");
      expect(mutation && "sectionId" in mutation.patch).toBe(false);
    }
  });
});

describe("the List Board", () => {
  const lists: List[] = [
    { id: "l1", projectId: "p1", name: "Work", order: 0, isDefault: true, createdAt: NOW, updatedAt: NOW },
  ];
  const sections: ListSection[] = [
    { id: "s2", listId: "l1", name: "Doing", sortKey: 1, createdAt: NOW, updatedAt: NOW },
    { id: "s1", listId: "l1", name: "Todo", sortKey: 0, createdAt: NOW, updatedAt: NOW },
    { id: "s9", listId: "l2", name: "Other list", createdAt: NOW, updatedAt: NOW },
  ];

  it("puts the unsectioned default first, then the List's own Sections in order", () => {
    expect(listBoardColumns("l1", sections).map((column) => column.id)).toEqual(["", "s1", "s2"]);
  });

  it("never writes a date or someday", () => {
    const moving = task({ listId: "l1", dueDate: "2026-08-20" });
    const mutation = moveTaskToSection(moving, "s1", lists, sections);
    expect(mutation?.patch).toEqual({ sectionId: "s1" });
    expect(mutation && "dueDate" in mutation.patch).toBe(false);
    expect(mutation && "isSomeday" in mutation.patch).toBe(false);
  });

  it("dropping back in the default column clears the Section instead of making one", () => {
    const moving = task({ listId: "l1", sectionId: "s1" });
    expect(moveTaskToSection(moving, "", lists, sections)?.patch).toEqual({ sectionId: "" });
  });
});

describe("the two Boards answer differently to the same drop", () => {
  const lists: List[] = [
    { id: "list-inbox", projectId: "", kind: "inbox", name: "Inbox", order: -1, isDefault: false, createdAt: NOW, updatedAt: NOW },
  ];

  it("Gate 7: one visual drag, two canonical commands", () => {
    const moving = task({ listId: "list-inbox" });
    const inbox = moveToInboxBucket(moving, "someday");
    const list = moveTaskToSection(moving, "", lists, []);
    expect(inbox?.patch).toEqual({ isSomeday: true, dueDate: "" });
    expect(list?.patch).toEqual({ sectionId: "" });
  });

  it("the Inbox columns are the three §6.24 names and are not records", () => {
    expect(INBOX_COLUMNS.map((column) => column.id)).toEqual(["unsorted", "scheduled", "someday"]);
    expect(INBOX_COLUMNS.find((column) => column.requiresDate)?.id).toBe("scheduled");
  });
});
