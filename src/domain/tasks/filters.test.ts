import { describe, expect, it } from "vitest";
import type { List, SavedFilter, Task, TaskTag } from "../../types";
import {
  activeSavedFilters,
  matchesFilterSpec,
  resolveFilterCreatePatch,
  sanitizeFilterSpec,
  sanitizeSavedFilter,
} from "./filters";

const TODAY = "2026-08-18";
const NOW = `${TODAY}T09:00:00.000Z`;

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

const lists: List[] = [
  { id: "l1", projectId: "p1", name: "Work", order: 0, isDefault: true, createdAt: NOW, updatedAt: NOW },
  { id: "l2", projectId: "p1", name: "Home", order: 1, isDefault: false, createdAt: NOW, updatedAt: NOW },
];
const links: TaskTag[] = [{ id: "tasktag-t1--tag-work", taskId: "t1", tagId: "tag-work", createdAt: NOW }];
const ctx = { lists, taskTags: links, today: TODAY };

function spec(all: SavedFilter["spec"]["all"]): SavedFilter["spec"] {
  return { version: 1, all };
}

describe("sanitizeFilterSpec", () => {
  it("keeps conditions it can evaluate and drops ones it cannot", () => {
    const kept = sanitizeFilterSpec({
      version: 1,
      all: [
        { field: "tag", op: "includes", value: " tag-work " },
        { field: "invented", op: "eq", value: "x" },
        { field: "due", op: "on", value: "" },
        { field: "list", op: "eq", value: "l1", not: true },
      ],
    });
    expect(kept?.all).toEqual([
      { field: "tag", op: "includes", value: "tag-work" },
      { field: "list", op: "eq", value: "l1", not: true },
    ]);
  });

  it("refuses a spec a newer client wrote, whole (§6.51)", () => {
    expect(sanitizeFilterSpec({ version: 2, all: [{ field: "list", op: "eq", value: "l1" }] })).toBeNull();
    expect(sanitizeFilterSpec({ all: [] })).toBeNull();
  });

  it("keeps a sort it knows and ignores one it does not", () => {
    expect(sanitizeFilterSpec({ version: 1, all: [], sort: "due" })?.sort).toBe("due");
    expect(sanitizeFilterSpec({ version: 1, all: [], sort: "vibes" })?.sort).toBeUndefined();
  });
});

describe("sanitizeSavedFilter", () => {
  it("drops a Filter with no readable spec rather than showing an inexplicable empty screen", () => {
    expect(sanitizeSavedFilter({ id: "f1", name: "Mine", spec: { version: 2, all: [] } })).toBeNull();
    expect(sanitizeSavedFilter({ id: "f1", name: "  ", spec: { version: 1, all: [] } })).toBeNull();
  });

  it("keeps one it can read, and carries unknown fields (M0)", () => {
    const kept = sanitizeSavedFilter({
      id: "f1",
      name: " Due today ",
      spec: { version: 1, all: [{ field: "due", op: "on", value: "today" }] },
      icon: "star",
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(kept).toMatchObject({ id: "f1", name: "Due today" });
    expect((kept as unknown as { icon: string }).icon).toBe("star");
  });

  it("orders by key then name", () => {
    const one = sanitizeSavedFilter({ id: "f1", name: "B", spec: { version: 1, all: [] }, createdAt: NOW }) as SavedFilter;
    const two = sanitizeSavedFilter({ id: "f2", name: "A", spec: { version: 1, all: [] }, createdAt: NOW }) as SavedFilter;
    expect(activeSavedFilters([one, two]).map((filter) => filter.id)).toEqual(["f2", "f1"]);
  });
});

describe("matchesFilterSpec", () => {
  it("ANDs its conditions", () => {
    const both = spec([
      { field: "tag", op: "includes", value: "tag-work" },
      { field: "priority", op: "eq", value: "high" },
    ]);
    expect(matchesFilterSpec(task({ priority: "high" }), both, ctx)).toBe(true);
    expect(matchesFilterSpec(task({ priority: "none" }), both, ctx)).toBe(false);
  });

  it("reads the List through the same resolver membership uses", () => {
    const inL1 = spec([{ field: "list", op: "eq", value: "l1" }]);
    // No stored listId: the owner is still the Project's default List.
    expect(matchesFilterSpec(task({ projectId: "p1" }), inL1, ctx)).toBe(true);
    expect(matchesFilterSpec(task({ listId: "l2" }), inL1, ctx)).toBe(false);
  });

  it("reads a tag from the record or the string it was written as", () => {
    const tagged = spec([{ field: "tag", op: "includes", value: "tag-home" }]);
    expect(matchesFilterSpec(task({ id: "t2", tags: ["Home"] }), tagged, ctx)).toBe(true);
    expect(matchesFilterSpec(task({ id: "t2" }), tagged, ctx)).toBe(false);
  });

  it("resolves `today` in the user's own day", () => {
    const dueToday = spec([{ field: "due", op: "on", value: "today" }]);
    expect(matchesFilterSpec(task({ dueDate: TODAY }), dueToday, ctx)).toBe(true);
    expect(matchesFilterSpec(task({ dueDate: "2026-08-19" }), dueToday, ctx)).toBe(false);
  });

  it("leaves an undated Task out of every date condition", () => {
    expect(matchesFilterSpec(task(), spec([{ field: "due", op: "before", value: "2030-01-01" }]), ctx)).toBe(false);
    expect(matchesFilterSpec(task(), spec([{ field: "due", op: "after", value: "2000-01-01" }]), ctx)).toBe(false);
  });

  it("negates one condition without negating the rest", () => {
    const notWork = spec([
      { field: "tag", op: "includes", value: "tag-work", not: true },
      { field: "priority", op: "eq", value: "high" },
    ]);
    expect(matchesFilterSpec(task({ id: "t2", priority: "high" }), notWork, ctx)).toBe(true);
    expect(matchesFilterSpec(task({ id: "t1", priority: "high" }), notWork, ctx)).toBe(false);
  });

  it("matches a title case-insensitively", () => {
    const contains = spec([{ field: "title", op: "contains", value: "REPORT" }]);
    expect(matchesFilterSpec(task({ title: "Quarterly report" }), contains, ctx)).toBe(true);
  });

  it("matches nothing while the Filter defines nothing", () => {
    expect(matchesFilterSpec(task(), spec([]), ctx)).toBe(false);
  });
});

describe("resolveFilterCreatePatch — §12.11's allowlist", () => {
  it("takes the single positive List as the owner", () => {
    const plan = resolveFilterCreatePatch(spec([{ field: "list", op: "eq", value: "l1" }]), TODAY);
    expect(plan.targetListId).toBe("l1");
  });

  it("refuses to pick when two Lists are named", () => {
    const plan = resolveFilterCreatePatch(
      spec([
        { field: "list", op: "eq", value: "l1" },
        { field: "list", op: "eq", value: "l2" },
      ]),
      TODAY,
    );
    expect(plan.targetListId).toBe("");
  });

  it("applies tag, concrete due date and priority", () => {
    const plan = resolveFilterCreatePatch(
      spec([
        { field: "tag", op: "includes", value: "tag-work" },
        { field: "due", op: "on", value: "today" },
        { field: "priority", op: "eq", value: "high" },
      ]),
      TODAY,
    );
    expect(plan.applyTagIds).toEqual(["tag-work"]);
    expect(plan.patch).toEqual({ dueDate: TODAY, priority: "high" });
  });

  it("applies nothing a Task cannot simply carry", () => {
    const plan = resolveFilterCreatePatch(
      spec([
        { field: "title", op: "contains", value: "report" },
        { field: "due", op: "before", value: "2030-01-01" },
        { field: "tag", op: "includes", value: "tag-work", not: true },
        { field: "list", op: "eq", value: "l1", not: true },
      ]),
      TODAY,
    );
    expect(plan).toEqual({ targetListId: "", patch: {}, applyTagIds: [] });
  });
});
