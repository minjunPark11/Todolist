// How a box's tasks are divided and ordered (TICKTICK_MATRIX_DESIGN.md §2.2,
// TICKTICK_INBOX_COLUMNS_DESIGN.md §10).
//
// Both boards group the same way, so this is asserted against the grouping
// itself rather than through either of them. The one rule worth stating twice:
// completion outranks every axis, because a task finished last Tuesday is not
// overdue — the date it carried has stopped being a claim on anybody's time.
import { describe, expect, it } from "vitest";
import type { Task, TaskStatus } from "../../types";
import {
  DEFAULT_GROUP_VIEW,
  GROUP_ORDER,
  dateBucketOf,
  groupIdOf,
  groupTasks,
  taskComparator,
} from "./viewGroups";

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
  const on = (dueDate: string, isSomeday = false) => ({ dueDate, isSomeday });

  it("sorts a deadline by which side of today it falls on", () => {
    expect(dateBucketOf(on(YESTERDAY), TODAY)).toBe("overdue");
    expect(dateBucketOf(on(TODAY), TODAY)).toBe("today");
    expect(dateBucketOf(on(TOMORROW), TODAY)).toBe("tomorrow");
    expect(dateBucketOf(on("2026-09-15"), TODAY)).toBe("later");
    expect(dateBucketOf(on(""), TODAY)).toBe("none");
  });

  it("crosses a month boundary without arithmetic of its own", () => {
    expect(dateBucketOf(on("2026-09-01"), "2026-08-31")).toBe("tomorrow");
  });

  it("tells 'not decided when' apart from 'decided not to plan'", () => {
    // Both have no date (§6.23 makes someday and a deadline exclusive), and
    // before this they were one bucket. They are two different statements, and
    // the Inbox board's `언젠가` column is the second one.
    expect(dateBucketOf(on("", true), TODAY)).toBe("someday");
    expect(dateBucketOf(on(""), TODAY)).toBe("none");
  });

  it("lets someday outrank a date that should not be there", () => {
    // §6.23 forbids holding both. A record that has drifted into that state
    // has to land in exactly one bucket rather than in whichever the caller
    // asked about first.
    expect(dateBucketOf(on(YESTERDAY, true), TODAY)).toBe("someday");
  });
});

describe("groupIdOf", () => {
  it("puts a finished task under completed, whatever its date said", () => {
    // A task finished last week is not "overdue" — it is done, and the date it
    // carried has stopped being a claim on anybody's time.
    const done = task({ status: "completed" as TaskStatus, dueDate: YESTERDAY });
    expect(groupIdOf(done, TODAY)).toBe("completed");
  });

  it("leaves unfinished work to its date", () => {
    expect(groupIdOf(task({ dueDate: YESTERDAY }), TODAY)).toBe("overdue");
  });
});

describe("groupTasks", () => {
  const tasks = [
    task({ id: "later", dueDate: "2026-09-30" }),
    task({ id: "done", status: "completed" as TaskStatus, dueDate: YESTERDAY }),
    task({ id: "undated" }),
    task({ id: "late", dueDate: YESTERDAY }),
    task({ id: "now", dueDate: TODAY }),
    task({ id: "soon", dueDate: TOMORROW }),
  ];

  it("returns the groups in reading order", () => {
    expect(groupTasks(tasks, TODAY).map((group) => group.id)).toEqual([
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
    const groups = groupTasks([task({ id: "only", dueDate: YESTERDAY })], TODAY);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: "overdue" });
  });

  it("answers nothing for an empty box", () => {
    expect(groupTasks([], TODAY)).toEqual([]);
  });

  it("keeps every task, exactly once", () => {
    const seen = groupTasks(tasks, TODAY).flatMap((group) => group.tasks.map((entry) => entry.id));
    expect(seen.sort()).toEqual(["done", "late", "later", "now", "soon", "undated"]);
  });

  it("orders inside a group the way the view asks", () => {
    const unsorted = [task({ id: "b", title: "b" }), task({ id: "a", title: "a" })];
    const view = { ...DEFAULT_GROUP_VIEW, sortKey: "title" as const };
    expect(groupTasks(unsorted, TODAY, view)[0].tasks.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(
      groupTasks(unsorted, TODAY, { ...view, sortOrder: "desc" })[0].tasks.map((entry) => entry.id),
    ).toEqual(["b", "a"]);
  });

  it("does not sort the caller's array underneath it", () => {
    const original = [task({ id: "b", title: "b" }), task({ id: "a", title: "a" })];
    groupTasks(original, TODAY, { ...DEFAULT_GROUP_VIEW, sortKey: "title" });
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
    const group = groupTasks(tasks, TODAY)[0];
    expect(group.tasks.map((entry) => entry.id)).toEqual(["newest", "middle", "old"]);
  });

  it("ignores the comparator the other groups use", () => {
    // Sorting finished work by its deadline puts a task completed a moment ago
    // below work completed last month. Every deadline in here is settled.
    const tasks = [done("late-due", "2026-08-01T09:00:00.000Z", "2026-12-31"), done("early-due", "2026-08-28T09:00:00.000Z", "2026-01-01")];
    const group = groupTasks(tasks, TODAY, DEFAULT_GROUP_VIEW)[0];
    expect(group.tasks.map((entry) => entry.id)).toEqual(["early-due", "late-due"]);
  });

  it("falls back to updatedAt for a record with no completion stamp", () => {
    const legacy = task({ id: "legacy", status: "completed" as TaskStatus, updatedAt: "2026-08-28T09:00:00.000Z" });
    const group = groupTasks([done("stamped", "2026-08-01T09:00:00.000Z"), legacy], TODAY)[0];
    expect(group.tasks.map((entry) => entry.id)).toEqual(["legacy", "stamped"]);
  });
});

describe("GROUP_ORDER", () => {
  it("ends with completed", () => {
    expect(GROUP_ORDER[GROUP_ORDER.length - 1]).toBe("completed");
  });
});

describe("grouping turned off", () => {
  it("puts everything unfinished in one group, and keeps completed apart", () => {
    // "Finished" is the one division that is never noise.
    const groups = groupTasks(
      [
        task({ id: "a", dueDate: YESTERDAY }),
        task({ id: "b" }),
        task({ id: "c", status: "completed" as TaskStatus, completedAt: "2026-08-27T09:00:00.000Z" }),
      ],
      TODAY,
      { ...DEFAULT_GROUP_VIEW, groupBy: "none" },
    );

    expect(groups.map((group) => group.id)).toEqual(["all", "completed"]);
    expect(groups[0].tasks.map((entry) => entry.id)).toEqual(["a", "b"]);
  });
});

describe("taskComparator", () => {
  const compare = (view: Partial<typeof DEFAULT_GROUP_VIEW>, a: Task, b: Task) =>
    taskComparator({ ...DEFAULT_GROUP_VIEW, ...view })(a, b);

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
