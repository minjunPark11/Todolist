import { describe, expect, it } from "vitest";
import type { LearningPath, List, Project, Task } from "../../types";
import { getMatrixPosition } from "../../utils/eisenhower";
import { collectTodayEntries } from "../../utils/todayView";
import { makeDefaultList } from "../spaces/hierarchy";
import { defaultListIdFor, statusesWithCustom } from "../spaces/membership";
import { DEFAULT_SPACE_ID } from "../spaces/spaces";
import { statusPatch } from "./board";
import { projectItems } from "./item";
import {
  applyView,
  axisGroupIds,
  compareItems,
  groupRank,
  matchesFilter,
  PRESET_ARCHIVE,
  PRESET_PLANNING,
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
    startDate: "",
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
    expect(items.every((item) => item.key && item.projectId === "space-1")).toBe(true);
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
    // The milestone inherits its goal's placement; it used to be asserted
    // through the Item's `horizon`, which the Horizons removal took with it.
    expect(milestone?.parentId).toBe("goal-1");
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

  it("matches on project, list, source, status and priority", () => {
    expect(matchesFilter(item, { projectId: "space-1" })).toBe(true);
    expect(matchesFilter(item, { projectId: "space-2" })).toBe(false);
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
    expect(axisGroupIds("bucket")).toEqual(["now", "next", "later"]);
    expect(axisGroupIds("space")).toBeUndefined();
  });

  it("orders Project groups by the user's arrangement, not the alphabet (D10)", () => {
    // "Career" sorts before "Health" by name; the user put Health first.
    const arranged = [
      { ...projects[0], order: 1 },
      { ...projects[1], order: 0 },
    ];
    const { items, context } = build([task({ id: "a" }), task({ id: "b", projectId: "space-2" })]);
    const spec: ViewSpec = {
      id: "v", name: "v", filter: {}, groupBy: "project", sort: { key: "title" }, layout: "list",
    };
    const ranked = { ...context, groupRank: groupRank("project", { projects: arranged }) };
    expect(applyView(items, spec, ranked).map((group) => group.id)).toEqual(["space-2", "space-1"]);
    // Without a rank it falls back to name order, which is id order here.
    expect(applyView(items, spec, context).map((group) => group.id)).toEqual(["space-1", "space-2"]);
  });

  it("sorts a Project the user never arranged after the ones they did", () => {
    const partly = [{ ...projects[1], order: 5 }, projects[0]];
    const rank = groupRank("project", { projects: partly })!;
    expect(rank.get("space-2")).toBeLessThan(rank.get("space-1")!);
  });

  it("has no rank to give for an axis the user does not own", () => {
    expect(groupRank("status", { projects })).toBeUndefined();
    expect(groupRank("project", { projects: [] })).toBeUndefined();
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

  it("filters the archive exactly as the Archive page did", () => {
    const archive = [
      task({ id: "archived", status: "archived", archivedAt: NOW }),
      task({ id: "done", status: "done", completedAt: NOW }),
      task({ id: "open" }),
    ];
    const { items, context } = build(archive);
    const fromView = applyView(items, PRESET_ARCHIVE, context).flatMap((group) =>
      group.items.map((item) => item.sourceId),
    );
    // The screen's own filter, verbatim.
    const fromScreen = archive.filter((t) => t.status === "archived" || t.archivedAt).map((t) => t.id);
    expect(fromView).toEqual(fromScreen);
  });

  it("drops a tombstoned task the Archive page used to show", () => {
    // The one place the two deliberately disagree. `planner.tasks` carries
    // soft-deleted rows that arrived from another device, and the screen's
    // filter never looked at deletedAt; projectItems does.
    const { items, context } = build([
      task({ id: "gone", status: "archived", archivedAt: NOW, deletedAt: NOW }),
    ]);
    expect(applyView(items, PRESET_ARCHIVE, context)).toEqual([]);
  });

  // This asserted the same narrowing through `presetSpaceHorizons`, which went
  // with Horizons. The property is the filter's, not that preset's, so it is
  // checked through one that still exists.
  it("narrows a preset to one Project", () => {
    const { items, context } = build(
      [task({ id: "here" }), task({ id: "elsewhere", projectId: "space-2" })],
      [goal()],
    );
    const groups = applyView(items, { ...PRESET_PLANNING, filter: { projectId: "space-1" } }, context);
    const ids = groups.flatMap((group) => group.items.map((item) => item.sourceId));
    expect(ids).toContain("here");
    expect(ids).not.toContain("elsewhere");
  });
});

// The seam the unit tests each side of this were passing over: the board draws
// its columns from `statusesWithCustom` while the projection resolved
// against `statusesForSpace`, so a column the user named was rendered and then
// could never hold anything.
describe("columns the user named", () => {
  const review = { id: "bl-review", name: "In review", order: 0 };
  const spaces: Project[] = [{ ...projects[0], boardLists: [review] }, projects[1]];
  const columnStatuses = statusesWithCustom(spaces[0]);

  function project(tasks: Task[], paths: LearningPath[] = []) {
    return projectItems({ tasks, paths, projects: spaces, lists, today: TODAY });
  }

  it("keeps a task on the column it was filed under", () => {
    expect(project([task({ statusId: review.id })])[0].statusId).toBe(review.id);
  });

  it("survives the drop that put it there", () => {
    // The round trip. Patch the record the way the board does, project it
    // again, and it must land on the column it was dragged to — the assertion
    // whose absence let the two sides drift.
    const dragged = task({ status: "inbox" });
    const patch = statusPatch(dragged, review.id, columnStatuses);
    expect(project([{ ...dragged, ...patch }])[0].statusId).toBe(review.id);
  });

  it("falls back when the column is gone", () => {
    expect(project([task({ statusId: "bl-deleted" })])[0].statusId).toBe("todo");
  });

  it("reads a goal's board column as its status", () => {
    const items = project([], [goal({ boardListId: review.id })]);
    expect(items.find((item) => item.source === "goal")?.statusId).toBe(review.id);
  });

  it("lets completion outrank the column", () => {
    const items = project([], [goal({ boardListId: review.id, completedAt: NOW })]);
    const item = items.find((entry) => entry.source === "goal");
    expect(item?.statusId).toBe("done");
    expect(item?.done).toBe(true);
  });

  it("falls back when a goal's column is gone", () => {
    const items = project([], [goal({ boardListId: "bl-deleted" })]);
    expect(items.find((item) => item.source === "goal")?.statusId).toBe("todo");
  });

  it("puts the goal and the task in one column, not two answers", () => {
    const items = project([task({ statusId: review.id })], [goal({ boardListId: review.id })]);
    const spec: ViewSpec = {
      id: "columns",
      name: "",
      filter: {},
      groupBy: "status",
      sort: { key: "title" },
      layout: "board",
    };
    const context: GroupContext = { today: TODAY, taskById: new Map() };
    const column = applyView(items, spec, context).find((group) => group.id === review.id);
    expect(column?.items.map((item) => item.source).sort()).toEqual(["goal", "task"]);
  });
});

// §16-§18: the same view opened at four depths.
// Space -> Project -> Folder -> List, and the filter language says which by
// naming one field.
describe("query — search as a filter predicate (§50A.15)", () => {
  const [item] = build([task({ title: "Contingency Theory 정리" })]).items;

  it("matches part of a title, ignoring case", () => {
    expect(matchesFilter(item, { query: "contingency" })).toBe(true);
    expect(matchesFilter(item, { query: "THEORY" })).toBe(true);
    expect(matchesFilter(item, { query: "정리" })).toBe(true);
    expect(matchesFilter(item, { query: "drone" })).toBe(false);
  });

  it("narrows nothing when it is empty or blank", () => {
    expect(matchesFilter(item, { query: "" })).toBe(true);
    expect(matchesFilter(item, { query: "   " })).toBe(true);
  });

  it("composes with the scope rather than replacing it", () => {
    // Search must not reach outside the place the user is standing: the scope
    // narrows first and this narrows what is left.
    expect(matchesFilter(item, { projectId: "space-2", query: "contingency" })).toBe(false);
    expect(matchesFilter(item, { projectId: "space-1", query: "contingency" })).toBe(true);
  });
});

describe("the Space scope (STEP 7)", () => {
  // Two Projects filed under one Space, and a third somewhere else. This is
  // the case a single id could not express before the level existed.
  const research: Project[] = [
    { ...projects[0], spaceId: "space-research" },
    { ...projects[1], spaceId: "space-research" },
    { id: "p-3", name: "Blog", description: "", color: "#ff9500", spaceId: "space-personal", createdAt: NOW, updatedAt: NOW },
  ];
  const spread = [
    ...lists,
    makeDefaultList(defaultListIdFor("p-3"), "p-3", NOW),
  ];
  const items = projectItems({
    tasks: [task({ id: "a" }), task({ id: "b", projectId: "space-2" }), task({ id: "c", projectId: "p-3" })],
    paths: [],
    projects: research,
    lists: spread,
    today: TODAY,
  });

  it("gathers every Project under it", () => {
    const inSpace = items.filter((item) => matchesFilter(item, { spaceId: "space-research" }));
    expect(inSpace.map((item) => item.sourceId).sort()).toEqual(["a", "b"]);
  });

  it("still narrows to one Project when asked for one", () => {
    const inProject = items.filter((item) => matchesFilter(item, { projectId: "space-1" }));
    expect(inProject.map((item) => item.sourceId)).toEqual(["a"]);
  });

  it("resolves the Space through the Project rather than storing it (§43)", () => {
    // Every Item carries both, and the Space half is derived. Moving a
    // Project between Spaces has to stay one row (H-INV-05), which it cannot
    // if each Item keeps its own copy.
    const item = items.find((entry) => entry.sourceId === "c");
    expect(item).toMatchObject({ projectId: "p-3", spaceId: "space-personal" });
  });

  it("files a Project that predates the backfill under the default Space", () => {
    // `projects` here have no spaceId at all.
    const legacy = projectItems({ tasks: [task({ id: "a" })], paths: [], projects, lists, today: TODAY });
    expect(legacy[0].spaceId).toBe(DEFAULT_SPACE_ID);
  });

  it("groups by Space, which is a different axis from Project", () => {
    const spec: ViewSpec = {
      id: "v", name: "v", filter: {}, groupBy: "space", sort: { key: "title" }, layout: "list",
    };
    const context: GroupContext = { today: TODAY, taskById: new Map() };
    const groups = applyView(items, spec, context);
    expect(groups.map((group) => group.id)).toEqual(["space-personal", "space-research"]);
    expect(groups.find((group) => group.id === "space-research")?.items).toHaveLength(2);
  });
});

describe("view scope", () => {
  const inFolder: List = {
    id: "list-experiment",
    spaceId: "space-1",
    folderId: "folder-drone",
    name: "Experiment",
    order: 1,
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const alsoInFolder: List = { ...inFolder, id: "list-writing", name: "Writing", order: 2 };
  const scoped = [...lists, inFolder, alsoInFolder];

  function build(tasks: Task[]) {
    return projectItems({ tasks, paths: [], projects, lists: scoped, today: TODAY });
  }

  it("derives the Folder from the List the Item is in", () => {
    const [item] = build([task({ listId: inFolder.id })]);
    expect(item.folderId).toBe("folder-drone");
  });

  it("leaves a Folderless List with no Folder", () => {
    // D4: a List can hang straight off the Space, and "" is that answer — not
    // a missing value.
    const [item] = build([task()]);
    expect(item.listId).toBe(defaultListIdFor("space-1"));
    expect(item.folderId).toBe("");
  });

  it("narrows to a Folder across every List inside it", () => {
    const items = build([
      task({ id: "a", listId: inFolder.id }),
      task({ id: "b", listId: alsoInFolder.id }),
      task({ id: "c" }),
    ]);
    const matched = items.filter((item) => matchesFilter(item, { folderId: "folder-drone" }));
    expect(matched.map((item) => item.sourceId).sort()).toEqual(["a", "b"]);
  });

  it("treats the Folderless Lists as a scope of their own", () => {
    // `folderId: ""` is a real question — "what is not in a folder" — and has
    // to be answerable, which is why the field is "" rather than undefined.
    const items = build([task({ id: "a", listId: inFolder.id }), task({ id: "c" })]);
    const matched = items.filter((item) => matchesFilter(item, { folderId: "" }));
    expect(matched.map((item) => item.sourceId)).toEqual(["c"]);
  });

  it("gets tighter at each level", () => {
    const items = build([
      task({ id: "a", listId: inFolder.id }),
      task({ id: "b", listId: alsoInFolder.id }),
      task({ id: "c" }),
    ]);
    const count = (filter: Parameters<typeof matchesFilter>[1]) =>
      items.filter((item) => matchesFilter(item, filter)).length;
    expect(count({ projectId: "space-1" })).toBe(3);
    expect(count({ folderId: "folder-drone" })).toBe(2);
    expect(count({ listId: inFolder.id })).toBe(1);
  });

  it("groups by Folder, with the Folderless items in the catch-all", () => {
    const items = build([task({ id: "a", listId: inFolder.id }), task({ id: "c" })]);
    const context: GroupContext = { today: TODAY, taskById: new Map() };
    const spec: ViewSpec = {
      id: "by-folder",
      name: "",
      filter: {},
      groupBy: "folder",
      sort: { key: "title" },
      layout: "columns",
    };
    const groups = applyView(items, spec, context);
    expect(groups.map((group) => group.id)).toEqual(["folder-drone", ""]);
  });
});
