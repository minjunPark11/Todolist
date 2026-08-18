import { describe, expect, it } from "vitest";
import type { List, ListSection, Task } from "../../types";
import {
  addListSection,
  removeListSection,
  renameListSection,
  sanitizeListSection,
  sectionIdFor,
  sectionsForList,
  tasksInSection,
} from "./sections";

const NOW = "2026-08-18T09:00:00.000Z";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Task",
    description: "",
    status: "todo",
    priority: "none",
    dueDate: "",
    scheduledDate: "",
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

const listA: List = { id: "l1", projectId: "p1", name: "A", order: 0, isDefault: true, createdAt: NOW, updatedAt: NOW };
const listB: List = { id: "l2", projectId: "p1", name: "B", order: 1, isDefault: false, createdAt: NOW, updatedAt: NOW };
const lists = [listA, listB];

function section(overrides: Partial<ListSection> = {}): ListSection {
  return { id: "s1", listId: "l1", name: "Doing", createdAt: NOW, updatedAt: NOW, ...overrides };
}

describe("sanitizeListSection", () => {
  it("keeps a section that names a List and has a name", () => {
    expect(sanitizeListSection({ id: "s1", listId: "l1", name: " Doing ", createdAt: NOW, updatedAt: NOW })).toMatchObject({
      id: "s1",
      listId: "l1",
      name: "Doing",
    });
  });

  it("drops a section that could never be rendered", () => {
    expect(sanitizeListSection({ id: "s1", name: "Doing" })).toBeNull();
    expect(sanitizeListSection({ id: "s1", listId: "l1", name: "  " })).toBeNull();
    expect(sanitizeListSection({ listId: "l1", name: "Doing" })).toBeNull();
    expect(sanitizeListSection(null)).toBeNull();
  });

  it("carries fields this build has never heard of (M0)", () => {
    const kept = sanitizeListSection({ id: "s1", listId: "l1", name: "Doing", wipLimit: 3, createdAt: NOW, updatedAt: NOW });
    expect((kept as unknown as { wipLimit: number }).wipLimit).toBe(3);
  });
});

describe("sectionsForList", () => {
  it("orders by sortKey and breaks ties by name, not by clock", () => {
    const sections = [
      section({ id: "s3", name: "Done", sortKey: 1, createdAt: "2026-01-01T00:00:00.000Z" }),
      section({ id: "s2", name: "Blocked" }),
      section({ id: "s1", name: "Doing" }),
      section({ id: "s9", listId: "l2", name: "Other list" }),
    ];
    expect(sectionsForList("l1", sections).map((item) => item.id)).toEqual(["s2", "s1", "s3"]);
  });

  it("answers nothing for no List", () => {
    expect(sectionsForList("", [section()])).toEqual([]);
  });
});

describe("sectionIdFor — the §6.28 invariant", () => {
  it("answers the Section when it belongs to the Task's own List", () => {
    expect(sectionIdFor(task({ listId: "l1", sectionId: "s1" }), lists, [section()])).toBe("s1");
  });

  it("answers unsectioned when the Section belongs to another List", () => {
    const foreign = section({ id: "s1", listId: "l2" });
    expect(sectionIdFor(task({ listId: "l1", sectionId: "s1" }), lists, [foreign])).toBe("");
  });

  it("answers unsectioned when the Section is gone", () => {
    expect(sectionIdFor(task({ listId: "l1", sectionId: "s1" }), lists, [])).toBe("");
  });

  it("answers unsectioned when nothing is stored", () => {
    expect(sectionIdFor(task({ listId: "l1" }), lists, [section()])).toBe("");
    expect(sectionIdFor(task({ listId: "l1", sectionId: "  " }), lists, [section()])).toBe("");
  });

  it("resolves the owner List the same way membership does", () => {
    // No `listId` written yet — the owner is still derived from the Project's
    // default List, and the Section has to be checked against THAT.
    expect(sectionIdFor(task({ sectionId: "s1", projectId: "p1" }), lists, [section()])).toBe("s1");
  });
});

describe("tasksInSection", () => {
  it("collects a column, and puts a Task with an invalid Section in the default one", () => {
    const sections = [section({ id: "s1", listId: "l1" })];
    const tasks = [
      task({ id: "t1", listId: "l1", sectionId: "s1" }),
      task({ id: "t2", listId: "l1", sectionId: "gone" }),
      task({ id: "t3", listId: "l1" }),
    ];
    expect(tasksInSection("s1", tasks, lists, sections).map((item) => item.id)).toEqual(["t1"]);
    expect(tasksInSection("", tasks, lists, sections).map((item) => item.id)).toEqual(["t2", "t3"]);
  });
});

describe("editing columns", () => {
  it("appends after the last column of that List only", () => {
    const sections = [section({ id: "s1", sortKey: 0 }), section({ id: "s9", listId: "l2", sortKey: 7 })];
    const next = addListSection(sections, "l1", " Review ", "s2", NOW);
    expect(next[2]).toMatchObject({ id: "s2", listId: "l1", name: "Review", sortKey: 1 });
  });

  it("refuses a column with no name and returns the same array", () => {
    const sections = [section()];
    expect(addListSection(sections, "l1", "   ", "s2", NOW)).toBe(sections);
    expect(addListSection(sections, "", "Review", "s2", NOW)).toBe(sections);
  });

  it("deleting a column leaves its Tasks in the default one", () => {
    const sections = [section({ id: "s1" })];
    const tasks = [task({ id: "t1", listId: "l1", sectionId: "s1" })];
    const next = removeListSection(sections, "s1");
    expect(next).toEqual([]);
    expect(tasksInSection("", tasks, lists, next).map((item) => item.id)).toEqual(["t1"]);
  });

  it("renames in place, and keeps identity when nothing changed", () => {
    const sections = [section({ id: "s1", name: "Doing" })];
    expect(renameListSection(sections, "s1", "In progress", NOW)[0]).toMatchObject({ name: "In progress" });
    expect(renameListSection(sections, "s1", "Doing", NOW)).toBe(sections);
    expect(renameListSection(sections, "s1", "  ", NOW)).toBe(sections);
    expect(removeListSection(sections, "nope")).toBe(sections);
  });
});
