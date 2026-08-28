import { describe, expect, it } from "vitest";
import type { Task, TaskStatus } from "../../types";
import {
  DEFAULT_MATRIX_VIEW,
  MATRIX_GROUP_ORDER,
  MATRIX_LABEL_MAX,
  dateBucketOf,
  groupMatrixTasks,
  matrixComparator,
  matrixGroupOf,
  matrixQuadrantLabels,
  sanitizeMatrixView,
} from "./matrixGroups";

const TODAY = "2026-08-28";
const YESTERDAY = "2026-08-27";
const TOMORROW = "2026-08-29";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "A task",
    status: "todo" as TaskStatus,
    priority: "none",
    dueDate: "",
    projectId: "",
    tags: [],
    notes: "",
    ...overrides,
  } as Task;
}

describe("dateBucketOf", () => {
  it("sorts a deadline by which side of today it falls on", () => {
    expect(dateBucketOf(YESTERDAY, TODAY)).toBe("overdue");
    expect(dateBucketOf(TODAY, TODAY)).toBe("today");
    expect(dateBucketOf(TOMORROW, TODAY)).toBe("tomorrow");
    expect(dateBucketOf("2026-09-15", TODAY)).toBe("later");
    expect(dateBucketOf("", TODAY)).toBe("none");
  });

  it("crosses a month boundary without arithmetic of its own", () => {
    expect(dateBucketOf("2026-09-01", "2026-08-31")).toBe("tomorrow");
  });
});

describe("matrixGroupOf", () => {
  it("puts a finished task under completed, whatever its date said", () => {
    // A task finished last week is not "overdue" — it is done, and the date it
    // carried has stopped being a claim on anybody's time.
    const done = task({ status: "completed" as TaskStatus, dueDate: YESTERDAY });
    expect(matrixGroupOf(done, TODAY)).toBe("completed");
  });

  it("leaves unfinished work to its date", () => {
    expect(matrixGroupOf(task({ dueDate: YESTERDAY }), TODAY)).toBe("overdue");
  });
});

describe("groupMatrixTasks", () => {
  const tasks = [
    task({ id: "later", dueDate: "2026-09-30" }),
    task({ id: "done", status: "completed" as TaskStatus, dueDate: YESTERDAY }),
    task({ id: "undated" }),
    task({ id: "late", dueDate: YESTERDAY }),
    task({ id: "now", dueDate: TODAY }),
    task({ id: "soon", dueDate: TOMORROW }),
  ];

  it("returns the groups in reading order", () => {
    expect(groupMatrixTasks(tasks, TODAY).map((group) => group.id)).toEqual([
      "overdue",
      "today",
      "tomorrow",
      "later",
      "none",
      "completed",
    ]);
  });

  it("drops groups nothing fell into", () => {
    // "오늘 0" costs a line of the box and answers a question nobody asked.
    const groups = groupMatrixTasks([task({ id: "only", dueDate: YESTERDAY })], TODAY);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: "overdue" });
  });

  it("answers nothing for an empty box", () => {
    expect(groupMatrixTasks([], TODAY)).toEqual([]);
  });

  it("keeps every task, exactly once", () => {
    const seen = groupMatrixTasks(tasks, TODAY).flatMap((group) => group.tasks.map((entry) => entry.id));
    expect(seen.sort()).toEqual(["done", "late", "later", "now", "soon", "undated"]);
  });

  it("orders inside a group the way the view asks", () => {
    const unsorted = [task({ id: "b", title: "b" }), task({ id: "a", title: "a" })];
    const view = { ...DEFAULT_MATRIX_VIEW, sortKey: "title" as const };
    expect(groupMatrixTasks(unsorted, TODAY, view)[0].tasks.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(
      groupMatrixTasks(unsorted, TODAY, { ...view, sortOrder: "desc" })[0].tasks.map((entry) => entry.id),
    ).toEqual(["b", "a"]);
  });

  it("does not sort the caller's array underneath it", () => {
    const original = [task({ id: "b", title: "b" }), task({ id: "a", title: "a" })];
    groupMatrixTasks(original, TODAY, { ...DEFAULT_MATRIX_VIEW, sortKey: "title" });
    expect(original.map((entry) => entry.id)).toEqual(["b", "a"]);
  });
});

describe("the completed group's own order", () => {
  const done = (id: string, completedAt: string, dueDate = "") =>
    task({ id, status: "completed" as TaskStatus, completedAt, dueDate });

  it("puts what was just ticked at the top", () => {
    // The box caps this group at five, so a task sorted to the bottom is a
    // task that is not on screen — and seeing what you just ticked is the
    // whole reason finished work is drawn here instead of vanishing.
    const tasks = [
      done("old", "2026-08-01T09:00:00.000Z"),
      done("newest", "2026-08-28T09:00:00.000Z"),
      done("middle", "2026-08-14T09:00:00.000Z"),
    ];
    const group = groupMatrixTasks(tasks, TODAY)[0];
    expect(group.tasks.map((entry) => entry.id)).toEqual(["newest", "middle", "old"]);
  });

  it("ignores the comparator the other groups use", () => {
    // Sorting finished work by its deadline puts a task completed a moment ago
    // below work completed last month. Every deadline in here is settled.
    const tasks = [done("late-due", "2026-08-01T09:00:00.000Z", "2026-12-31"), done("early-due", "2026-08-28T09:00:00.000Z", "2026-01-01")];
    const group = groupMatrixTasks(tasks, TODAY, DEFAULT_MATRIX_VIEW)[0];
    expect(group.tasks.map((entry) => entry.id)).toEqual(["early-due", "late-due"]);
  });

  it("falls back to updatedAt for a record with no completion stamp", () => {
    const legacy = task({ id: "legacy", status: "completed" as TaskStatus, updatedAt: "2026-08-28T09:00:00.000Z" });
    const group = groupMatrixTasks([done("stamped", "2026-08-01T09:00:00.000Z"), legacy], TODAY)[0];
    expect(group.tasks.map((entry) => entry.id)).toEqual(["legacy", "stamped"]);
  });
});

describe("MATRIX_GROUP_ORDER", () => {
  it("ends with completed", () => {
    expect(MATRIX_GROUP_ORDER[MATRIX_GROUP_ORDER.length - 1]).toBe("completed");
  });
});

describe("sanitizeMatrixView", () => {
  it("keeps what it recognises", () => {
    expect(sanitizeMatrixView({ groupBy: "none", sortKey: "title", sortOrder: "desc" })).toEqual({
      groupBy: "none",
      sortKey: "title",
      sortOrder: "desc",
    });
  });

  it("folds anything else to the default", () => {
    // These sync, so a value written by another version must not be able to
    // leave a box unable to draw itself.
    expect(sanitizeMatrixView({ groupBy: "constellation", sortKey: 7, sortOrder: null })).toEqual(
      DEFAULT_MATRIX_VIEW,
    );
    expect(sanitizeMatrixView(undefined)).toEqual(DEFAULT_MATRIX_VIEW);
    expect(sanitizeMatrixView("nonsense")).toEqual(DEFAULT_MATRIX_VIEW);
  });

  it("does not offer priority as a sort", () => {
    // Every task in a box has the box's priority (D1), so sorting by it would
    // be a control that visibly does nothing.
    expect(sanitizeMatrixView({ sortKey: "priority" }).sortKey).toBe("dueDate");
  });
});

describe("grouping turned off", () => {
  it("puts everything unfinished in one group, and keeps completed apart", () => {
    // "Finished" is the one division that is never noise.
    const groups = groupMatrixTasks(
      [
        task({ id: "a", dueDate: YESTERDAY }),
        task({ id: "b" }),
        task({ id: "c", status: "completed" as TaskStatus, completedAt: "2026-08-27T09:00:00.000Z" }),
      ],
      TODAY,
      { ...DEFAULT_MATRIX_VIEW, groupBy: "none" },
    );

    expect(groups.map((group) => group.id)).toEqual(["all", "completed"]);
    expect(groups[0].tasks.map((entry) => entry.id)).toEqual(["a", "b"]);
  });
});

describe("matrixComparator", () => {
  const compare = (view: Partial<typeof DEFAULT_MATRIX_VIEW>, a: Task, b: Task) =>
    matrixComparator({ ...DEFAULT_MATRIX_VIEW, ...view })(a, b);

  it("sinks undated work under a deadline sort", () => {
    // Sorting "" as a string would float it above every real date.
    expect(compare({}, task({ dueDate: "" }), task({ dueDate: "2099-12-31" }))).toBeGreaterThan(0);
  });

  it("is total and stable — the id breaks the last tie", () => {
    const twins = [task({ id: "b", dueDate: TODAY, title: "same" }), task({ id: "a", dueDate: TODAY, title: "same" })];
    expect(compare({}, twins[0], twins[1])).toBeGreaterThan(0);
    expect(compare({}, twins[1], twins[0])).toBeLessThan(0);
    expect(compare({}, twins[0], twins[0])).toBe(0);
  });

  it("reverses everything, ties included", () => {
    const [b, a] = [task({ id: "b", title: "b" }), task({ id: "a", title: "a" })];
    expect(compare({ sortKey: "title" }, a, b)).toBeLessThan(0);
    expect(compare({ sortKey: "title", sortOrder: "desc" }, a, b)).toBeGreaterThan(0);
  });
});

describe("what a box is called (§20.6)", () => {
  const base = { groupBy: "dueDate", sortKey: "dueDate", sortOrder: "asc" } as const;

  it("stores nothing for a box nobody has named", () => {
    // Absent and "" have to be the same state, or "cleared" would be a
    // preference the account carries around forever.
    const view = sanitizeMatrixView({ ...base, name: "   ", hint: "", color: "" });

    expect("name" in view).toBe(false);
    expect("hint" in view).toBe(false);
    expect("color" in view).toBe(false);
  });

  it("trims what was typed and caps how long it can be", () => {
    const view = sanitizeMatrixView({ ...base, name: "  화요일 마감  ", hint: "x".repeat(80) });

    expect(view.name).toBe("화요일 마감");
    expect(view.hint).toHaveLength(MATRIX_LABEL_MAX);
  });

  it("keeps a colour it knows and drops one it does not", () => {
    expect(sanitizeMatrixView({ ...base, color: "indigo" }).color).toBe("indigo");
    // A value from another build folds to the box's own colour rather than
    // painting something this one cannot resolve.
    expect(sanitizeMatrixView({ ...base, color: "chartreuse" }).color).toBeUndefined();
    expect(sanitizeMatrixView({ ...base, color: "#ff0000" }).color).toBeUndefined();
  });

  it("falls back to the built-in words, field by field", () => {
    expect(matrixQuadrantLabels(undefined, "Do first", "Important and urgent")).toEqual({
      name: "Do first",
      hint: "Important and urgent",
    });
    // Naming a box does not silently rename its second line too.
    expect(matrixQuadrantLabels({ ...base, name: "Tuesday" }, "Do first", "Important and urgent")).toEqual({
      name: "Tuesday",
      hint: "Important and urgent",
    });
  });
});
