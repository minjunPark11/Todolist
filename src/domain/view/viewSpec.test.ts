import { describe, expect, it } from "vitest";
import type { LearningPath, List, Project, Task } from "../../types";
import { getMatrixPosition } from "../../utils/eisenhower";
import { collectTodayEntries } from "../../utils/todayView";
import { makeDefaultList } from "../spaces/hierarchy";
import { defaultListIdFor } from "../spaces/membership";
import { projectItems } from "./item";
import {
  applyView,
  axisGroupIds,
  compareItems,
  matchesFilter,
  PRESET_PLANNING,
  presetSpaceHorizons,
  presetTodayQueue,
  type GroupContext,
  type ViewSpec,
} from "./viewSpec";

const TODAY = "2026-08-15";
const NOW = `${TODAY}T00:00:00.000Z`;

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Task",
    description: "",
    status: "todo",
    priority: "none",
    dueDate: "",
    scheduledDate: TODAY,
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

function goal(overrides: Partial<LearningPath> = {}): LearningPath {
  return {
    id: "goal-1",
    goal: "Ship it",
    milestones: [],
    projectId: "space-1",
    source: "user",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const projects: Project[] = [
  { id: "space-1", name: "Career", description: "", color: "#0066cc", createdAt: NOW, updatedAt: NOW },
  { id: "space-2", name: "Health", description: "", color: "#34c759", createdAt: NOW, updatedAt: NOW },
];
const lists: List[] = [
  makeDefaultList(defaultListIdFor("space-1"), "space-1", NOW),
  makeDefaultList(defaultListIdFor("space-2"), "space-2", NOW),
];

function build(tasks: Task[], paths: LearningPath[] = []) {
  const items = projectItems({ tasks, paths, projects, lists, today: TODAY });
  const context: GroupContext = { today: TODAY, taskById: new Map(tasks.map((t) => [t.id, t])) };
  return { items, context };
}

describe("projectItems", () => {
  it("folds tasks, goals and milestones into one shape", () => {
    const { items } = build(
      [task()],
      [goal({ milestones: [{ id: "m-1", title: "First", doneCriteria: "", cardIds: [] }] })],
    );
    expect(items.map((item) => item.source).sort()).toEqual(["goal", "milestone", "task"]);
    expect(items.every((item) => item.key && item.spaceId === "space-1")).toBe(true);
  });

  it("resolves the list without any task having been rewritten", () => {
    const { items } = build([task()]);
    expect(items[0].listId).toBe(defaultListIdFor("space-1"));
  });

  it("takes its colour from the space", () => {
    const { items } = build([task({ projectId: "space-2" })]);
    expect(items[0].color).toBe("#34c759");
  });

  it("gives a milestone its goal's period when it has none of its own", () => {
    // Otherwise a freshly written goal scatters its parts across the horizons.
    const { items } = build(
      [],
      [
        goal({
          schedule: { unit: "year", startDate: "2026-01-01" },
          milestones: [{ id: "m-1", title: "First", doneCriteria: "", cardIds: [] }],
        }),
      ],
    );
    const milestone = items.find((item) => item.source === "milestone");
    expect(milestone?.horizon).toBe("year");
  });

  it("omits deleted tasks", () => {
    expect(build([task({ deletedAt: NOW })]).items).toEqual([]);
  });

  it("can be narrowed to tasks, which is what the calendar wants", () => {
    const items = projectItems({ tasks: [task()], paths: [goal()], projects, lists, today: TODAY, sources: ["task"] });
    expect(items).toHaveLength(1);
  });

  it("marks a blocked task", () => {
    const { items } = build([task({ id: "a", blockedByTaskId: "b" }), task({ id: "b" })]);
    expect(items.find((item) => item.sourceId === "a")?.blocked).toBe(true);
  });
});

describe("matchesFilter", () => {
  const [item] = build([task({ tags: ["deep", "writing"], priority: "high" })]).items;

  it("matches on space, list, source, status and priority", () => {
    expect(matchesFilter(item, { spaceId: "space-1" })).toBe(true);
    expect(matchesFilter(item, { spaceId: "space-2" })).toBe(false);
    expect(matchesFilter(item, { sources: ["task"] })).toBe(true);
    expect(matchesFilter(item, { sources: ["goal"] })).toBe(false);
    expect(matchesFilter(item, { statusIds: ["todo"] })).toBe(true);
    expect(matchesFilter(item, { priorities: ["high"] })).toBe(true);
    expect(matchesFilter(item, { priorities: ["low"] })).toBe(false);
  });

  it("requires every named tag, not any of them", () => {
    expect(matchesFilter(item, { tags: ["deep"] })).toBe(true);
    expect(matchesFilter(item, { tags: ["deep", "writing"] })).toBe(true);
    expect(matchesFilter(item, { tags: ["deep", "absent"] })).toBe(false);
  });

  it("lets either date put an item in the window", () => {
    // A task planned for Tuesday and one due Tuesday are both this week's work.
    const [due] = build([task({ scheduledDate: "", dueDate: TODAY })]).items;
    expect(matchesFilter(due, { from: TODAY, to: TODAY })).toBe(true);
    const [scheduled] = build([task({ scheduledDate: TODAY, dueDate: "" })]).items;
    expect(matchesFilter(scheduled, { from: TODAY, to: TODAY })).toBe(true);
  });

  it("excludes an item with no date at all from a windowed view", () => {
    const [undated] = build([task({ scheduledDate: "", dueDate: "" })]).items;
    expect(matchesFilter(undated, { from: TODAY, to: TODAY })).toBe(false);
  });
});

describe("applyView grouping", () => {
  it("orders columns by the axis, not by what happens to be in them", () => {
    const { items, context } = build([
      task({ id: "low", priority: "low" }),
      task({ id: "high", priority: "high" }),
    ]);
    const spec: ViewSpec = {
      id: "v", name: "v", filter: {}, groupBy: "priority", sort: { key: "title" }, layout: "list",
    };
    expect(applyView(items, spec, context).map((group) => group.id)).toEqual(["high", "low"]);
  });

  it("sorts an unknown group last so the catch-all never displaces a column", () => {
    const { items, context } = build([task()], [goal()]);
    // A goal has no quadrant, so it lands in "".
    const groups = applyView(items, { ...PRESET_PLANNING, filter: {} }, context);
    expect(groups[groups.length - 1].id).toBe("");
  });

  it("exposes the columns a view must draw even when empty", () => {
    expect(axisGroupIds("horizon")).toEqual(["life", "year", "month", "week", "day"]);
    expect(axisGroupIds("bucket")).toEqual(["now", "next", "later"]);
    expect(axisGroupIds("space")).toBeUndefined();
  });

  it("breaks sort ties by key, so two runs cannot disagree", () => {
    const { items } = build([task({ id: "b" }), task({ id: "a" })]);
    const sorted = [...items].sort((x, y) => compareItems(x, y, { key: "manual" }));
    expect(sorted.map((item) => item.sourceId)).toEqual(["a", "b"]);
  });
});

// The point of the engine: a view must answer exactly what the screen it
// replaces answers, while both still exist. If these drift, the migration in
// P6 would silently move items between columns.
describe("equivalence with the screens it replaces", () => {
  const tasks = [
    task({ id: "overdue", dueDate: "2026-08-01", priority: "high" }),
    task({ id: "doing", status: "doing" }),
    task({ id: "high-today", priority: "high", dueDate: TODAY }),
    task({ id: "waiting", status: "waiting" }),
    task({ id: "idle", priority: "none" }),
    task({ id: "blocked", blockedByTaskId: "idle" }),
    task({ id: "medium", priority: "medium", dueDate: TODAY }),
  ];

  it("groups by quadrant exactly as the Planning page does", () => {
    const { items, context } = build(tasks);
    const groups = applyView(items, PRESET_PLANNING, context);
    for (const group of groups) {
      for (const item of group.items) {
        const source = tasks.find((candidate) => candidate.id === item.sourceId)!;
        expect(group.id).toBe(getMatrixPosition(source, TODAY).quadrant);
      }
    }
  });

  it("buckets today's queue exactly as the Today page does", () => {
    const { items, context } = build(tasks);
    const groups = applyView(items, presetTodayQueue(TODAY), context);
    const fromView = new Map<string, string>();
    for (const group of groups) {
      for (const item of group.items) fromView.set(item.sourceId, group.id);
    }

    let compared = 0;
    for (const entry of collectTodayEntries(tasks, {}, TODAY)) {
      // The queue includes overdue work regardless of date, which a windowed
      // view does not; compare only the tasks both actually contain.
      if (!fromView.has(entry.task.id)) continue;
      expect(fromView.get(entry.task.id)).toBe(entry.defaultBucket);
      compared += 1;
    }
    // Without this the loop could skip everything and still pass, proving
    // nothing about the two agreeing.
    expect(compared).toBeGreaterThan(3);
  });

  it("narrows Horizons to one board, which is what SpaceHorizons.tsx does by hand", () => {
    const { items, context } = build(
      [task({ id: "here" }), task({ id: "elsewhere", projectId: "space-2" })],
      [goal()],
    );
    const groups = applyView(items, presetSpaceHorizons("space-1"), context);
    const ids = groups.flatMap((group) => group.items.map((item) => item.sourceId));
    expect(ids).toContain("here");
    expect(ids).not.toContain("elsewhere");
  });
});
