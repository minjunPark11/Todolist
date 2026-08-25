import { describe, expect, it } from "vitest";
import { buildFromTemplate, sanitizeTaskTemplate, templateFromTask } from "./templates";
import type { CheckItem, Task, TaskTemplate } from "../../types";

const NOW = "2026-08-25T10:00:00.000Z";
const BEFORE = "2026-08-01T00:00:00.000Z";

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Weekly report",
    description: "The usual sections",
    status: "open",
    priority: "high",
    dueDate: "2026-08-26",
    startDate: "",
    startTime: "09:00",
    endTime: "",
    projectId: "p1",
    categoryId: "",
    parentTaskId: "",
    listId: "l1",
    tags: ["work"],
    notes: "",
    estimatedMinutes: 0,
    actualSeconds: 4200,
    activeSessionId: "focus-1",
    lastFocusedAt: BEFORE,
    isSomeday: false,
    waitingReason: "",
    waitingFollowUpDate: "",
    order: 1000,
    createdAt: BEFORE,
    updatedAt: BEFORE,
    completedAt: "",
    blockedByTaskId: "",
    repeatType: "none",
    repeatInterval: 1,
    repeatDays: [],
    repeatEndDate: "",
    ...over,
  } as Task;
}

function counter() {
  const seen = new Map<string, number>();
  return (prefix: string) => {
    const next = (seen.get(prefix) ?? 0) + 1;
    seen.set(prefix, next);
    return `${prefix}-${next}`;
  };
}

const TARGET = { listId: "l9", projectId: "p9", status: "open" as const };

describe("templateFromTask (§25.8)", () => {
  it("keeps what someone would type again", () => {
    const template = templateFromTask("t1", { tasks: [task()], checkItems: [] }, "tpl-1", NOW)!;
    expect(template.name).toBe("Weekly report");
    expect(template.items[0]).toMatchObject({
      title: "Weekly report",
      description: "The usual sections",
      priority: "high",
      tags: ["work"],
      parentIndex: -1,
    });
  });

  it("keeps nothing that belonged to that one Task", () => {
    const template = templateFromTask("t1", { tasks: [task()], checkItems: [] }, "tpl-1", NOW)!;
    const item = template.items[0] as unknown as Record<string, unknown>;
    // A date is the clearest case: a template saved in August and used in
    // March would make a Task due last August.
    expect(item.dueDate).toBeUndefined();
    expect(item.startTime).toBeUndefined();
    expect(item.listId).toBeUndefined();
    expect(item.id).toBeUndefined();
    expect(item.actualSeconds).toBeUndefined();
  });

  it("leaves the Task it was saved from alone (§25.8)", () => {
    const original = task();
    templateFromTask("t1", { tasks: [original], checkItems: [] }, "tpl-1", NOW);
    expect(original).toEqual(task());
  });

  it("takes the checklist as text, unticked", () => {
    const items: CheckItem[] = [
      { id: "c1", taskId: "t1", text: "Numbers", checked: true, sortKey: 1, completedAt: NOW, createdAt: BEFORE, updatedAt: NOW },
      { id: "c2", taskId: "t1", text: "Charts", checked: false, sortKey: 2, completedAt: "", createdAt: BEFORE, updatedAt: BEFORE },
    ];
    const template = templateFromTask("t1", { tasks: [task()], checkItems: items }, "tpl-1", NOW)!;
    expect(template.items[0].checkItems).toEqual(["Numbers", "Charts"]);
  });

  it("names parents by position, so the record stands on its own", () => {
    const tree = [
      task({ id: "task-parent", title: "Parent" }),
      task({ id: "task-child", title: "Child", parentTaskId: "task-parent" }),
    ];
    const template = templateFromTask("task-parent", { tasks: tree, checkItems: [] }, "tpl-1", NOW)!;
    expect(template.items.map((item) => item.parentIndex)).toEqual([-1, 0]);
    // No id from the original tree survives anywhere in the record — which is
    // what lets it be rebuilt with ids that do not exist yet.
    expect(JSON.stringify(template)).not.toContain("task-parent");
    expect(JSON.stringify(template)).not.toContain("task-child");
  });

  it("answers null for a Task that is not there", () => {
    expect(templateFromTask("gone", { tasks: [task()], checkItems: [] }, "tpl-1", NOW)).toBeNull();
  });
});

describe("buildFromTemplate (§25.8)", () => {
  const template = (): TaskTemplate =>
    templateFromTask(
      "A",
      {
        tasks: [task({ id: "A", title: "A" }), task({ id: "B", title: "B", parentTaskId: "A" })],
        checkItems: [
          { id: "c1", taskId: "A", text: "Numbers", checked: true, sortKey: 1, completedAt: NOW, createdAt: BEFORE, updatedAt: NOW },
        ],
      },
      "tpl-1",
      NOW,
    )!;

  it("makes the subtree, with the parents rebuilt from the positions", () => {
    const built = buildFromTemplate(template(), TARGET, counter(), NOW)!;
    expect(built.tasks.map((row) => row.title)).toEqual(["A", "B"]);
    expect(built.tasks[1].parentTaskId).toBe(built.tasks[0].id);
    expect(built.rootId).toBe(built.tasks[0].id);
  });

  it("puts the Tasks where the caller says, not where the original was", () => {
    const built = buildFromTemplate(template(), TARGET, counter(), NOW)!;
    // §12.16: the create resolver has already decided this, and a template
    // that overruled it would drop a Task into a List the user is not in.
    expect(built.tasks.every((row) => row.listId === "l9")).toBe(true);
    expect(built.tasks.every((row) => row.projectId === "p9")).toBe(true);
  });

  it("makes work not yet started", () => {
    const built = buildFromTemplate(template(), TARGET, counter(), NOW)!;
    expect(built.tasks.every((row) => row.status === "open")).toBe(true);
    expect(built.tasks.every((row) => row.dueDate === "" && row.completedAt === "")).toBe(true);
    expect(built.checkItems.every((item) => item.checked === false)).toBe(true);
  });

  it("gives the checklist lines an order to sit in", () => {
    const built = buildFromTemplate(template(), TARGET, counter(), NOW)!;
    expect(built.checkItems).toHaveLength(1);
    expect(built.checkItems[0]).toMatchObject({ text: "Numbers", taskId: built.rootId });
    expect(built.checkItems[0].sortKey).toBeGreaterThan(0);
  });

  it("can be used twice without the two sharing anything", () => {
    const source = template();
    const first = buildFromTemplate(source, TARGET, counter(), NOW)!;
    const second = buildFromTemplate(source, TARGET, counter(), NOW)!;
    first.tasks[0].tags.push("changed");
    expect(second.tasks[0].tags).toEqual(["work"]);
  });

  it("answers null for a template that would make nothing", () => {
    expect(buildFromTemplate({ ...template(), items: [] }, TARGET, counter(), NOW)).toBeNull();
  });
});

describe("sanitizeTaskTemplate", () => {
  it("drops an item with no title, which could not be made anyway (§9.21)", () => {
    const stored = {
      id: "tpl-1",
      name: "Weekly report",
      items: [{ title: "Weekly report" }, { title: "   " }],
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(sanitizeTaskTemplate(stored)?.items).toHaveLength(1);
  });

  it("drops a template left with nothing to make", () => {
    expect(sanitizeTaskTemplate({ id: "tpl-1", items: [] })).toBeNull();
    expect(sanitizeTaskTemplate({ id: "", items: [{ title: "x" }] })).toBeNull();
  });

  it("falls back to the first item's title when the name is gone", () => {
    expect(sanitizeTaskTemplate({ id: "tpl-1", items: [{ title: "Weekly report" }] })?.name).toBe(
      "Weekly report",
    );
  });

  it("repairs a value this build does not know", () => {
    const repaired = sanitizeTaskTemplate({
      id: "tpl-1",
      items: [{ title: "x", priority: "urgent", tags: ["a", 3], parentIndex: -4 }],
    })!;
    expect(repaired.items[0].priority).toBe("none");
    expect(repaired.items[0].tags).toEqual(["a"]);
    expect(repaired.items[0].parentIndex).toBe(-1);
  });
});
