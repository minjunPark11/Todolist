import { describe, expect, it } from "vitest";
import type { List, Task } from "../../types";
import { getMatrixPosition } from "../../utils/eisenhower";
import { collectTodayEntries } from "../../utils/todayView";
import { makeDefaultList } from "../spaces/hierarchy";
import { defaultListIdFor } from "../spaces/membership";
import { projectItems } from "./item";
import {
  applyView,
  axisGroupIds,
  compareItems,
  groupRank,
  matchesFilter,
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
    // Dated today by default. The fixture used to carry a separate work day
    // here; with one date (SCHEDULE_EDITOR_PHASE0_AUDIT.md §7 Phase 11) that
    // default has to live on `dueDate`, or the windowed views below have
    // almost nothing to compare against.
    dueDate: TODAY,
    startDate: "",
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

const lists: List[] = [
  makeDefaultList(defaultListIdFor("space-1"), "space-1", NOW),
  makeDefaultList(defaultListIdFor("space-2"), "space-2", NOW),
];

function build(tasks: Task[]) {
  const items = projectItems({ tasks, lists, today: TODAY });
  const context: GroupContext = { today: TODAY, taskById: new Map(tasks.map((t) => [t.id, t])) };
  return { items, context };
}

describe("projectItems", () => {
  it("folds tasks into one shape", () => {
    // Goals and milestones were the other two sources; both went with the
    // Goals feature, so this is a Task projection now.
    const { items } = build([task()]);
    expect(items.map((item) => item.source)).toEqual(["task"]);
    expect(items.every((item) => item.key)).toBe(true);
  });

  it("resolves the list without any task having been rewritten", () => {
    const { items } = build([task()]);
    expect(items[0].listId).toBe(defaultListIdFor("space-1"));
  });

  it("omits deleted tasks", () => {
    expect(build([task({ deletedAt: NOW })]).items).toEqual([]);
  });

  it("marks a blocked task", () => {
    const { items } = build([task({ id: "a", blockedByTaskId: "b" }), task({ id: "b" })]);
    expect(items.find((item) => item.sourceId === "a")?.blocked).toBe(true);
  });
});

describe("matchesFilter", () => {
  const [item] = build([task({ tags: ["deep", "writing"], priority: "high" })]).items;

  it("matches on list, source and priority", () => {
    expect(matchesFilter(item, { listId: defaultListIdFor("space-1") })).toBe(true);
    expect(matchesFilter(item, { listId: "list-other" })).toBe(false);
    expect(matchesFilter(item, { sources: ["task"] })).toBe(true);
    expect(matchesFilter(item, { priorities: ["high"] })).toBe(true);
    expect(matchesFilter(item, { priorities: ["low"] })).toBe(false);
  });

  it("requires every named tag, not any of them", () => {
    expect(matchesFilter(item, { tags: ["deep"] })).toBe(true);
    expect(matchesFilter(item, { tags: ["deep", "writing"] })).toBe(true);
    expect(matchesFilter(item, { tags: ["deep", "absent"] })).toBe(false);
  });

  it("puts a single-day item in a window on its own day", () => {
    const [due] = build([task({ dueDate: TODAY })]).items;
    expect(matchesFilter(due, { from: TODAY, to: TODAY })).toBe(true);
  });

  // Overlap, not containment: a window inside the range matches even though
  // neither endpoint falls in it.
  it("puts a range in every window it overlaps", () => {
    const [running] = build([task({ startDate: "2026-08-10", dueDate: "2026-08-20" })]).items;
    expect(matchesFilter(running, { from: "2026-08-14", to: "2026-08-15" })).toBe(true);
    expect(matchesFilter(running, { from: "2026-08-21", to: "2026-08-25" })).toBe(false);
  });

  it("excludes an item with no date at all from a windowed view", () => {
    const [undated] = build([task({ dueDate: "" })]).items;
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

  it("exposes the columns a view must draw even when empty", () => {
    expect(axisGroupIds("bucket")).toEqual(["now", "next", "later"]);
    expect(axisGroupIds("list")).toBeUndefined();
  });

  // D10. The axis was `project` while Projects existed; the rule is the
  // same one level down — the order the user arranged Lists in outranks the
  // alphabet, and the sidebar and the board have to agree about it.
  it("orders List groups by the user's arrangement, not the alphabet", () => {
    const arranged = [
      { ...lists[0], name: "Career", order: 1 },
      { ...lists[1], name: "Health", order: 0 },
    ];
    const { items, context } = build([
      task({ id: "a" }),
      task({ id: "b", listId: lists[1].id, projectId: "space-2" }),
    ]);
    const spec: ViewSpec = {
      id: "v", name: "v", filter: {}, groupBy: "list", sort: { key: "title" }, layout: "list",
    };
    const ranked = { ...context, groupRank: groupRank("list", { lists: arranged }) };
    expect(applyView(items, spec, ranked).map((group) => group.id)).toEqual([lists[1].id, lists[0].id]);
  });

  it("falls back to name order where the user never said", () => {
    // `order` is what they arranged; the name is the tie-break, so two Lists
    // left at the same order are not ranked by which one loaded first.
    const tied = [{ ...lists[1], name: "Health", order: 0 }, { ...lists[0], name: "Career", order: 0 }];
    const rank = groupRank("list", { lists: tied })!;
    expect(rank.get(lists[0].id)).toBeLessThan(rank.get(lists[1].id)!);
  });

  it("has no rank to give for an axis the user does not own", () => {
    expect(groupRank("dueDate", { lists })).toBeUndefined();
    expect(groupRank("list", { lists: [] })).toBeUndefined();
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
    for (const entry of collectTodayEntries({ tasks, lists: [], dailyPlans: [], taskTags: [], today: TODAY }, {})) {
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

  // Two tests pinned `PRESET_ARCHIVE` against the Archive screen's own
  // filter. The screen went first and the preset followed it (Ch. 26
  // §26.3.3): "given up on" is `isWontDo`, a predicate, and the status axis
  // the preset filtered on no longer exists.

  // This asserted the same narrowing through `presetSpaceHorizons`, which
  // went with Horizons, and then through a Project scope, which went with
  // Projects. The property is the filter's, not any one preset's or level's.
  it("narrows a preset to one List", () => {
    const { items, context } = build([
      task({ id: "here" }),
      task({ id: "elsewhere", listId: lists[1].id, projectId: "space-2" }),
    ]);
    const groups = applyView(items, { ...PRESET_PLANNING, filter: { listId: lists[0].id } }, context);
    const ids = groups.flatMap((group) => group.items.map((item) => item.sourceId));
    expect(ids).toContain("here");
    expect(ids).not.toContain("elsewhere");
  });
});

// A `columns` block sat here, pinning the round trip through `statusPatch`
// and `Item.statusId`. Both are gone (Ch. 26 §26.3.3) — a List's board groups
// by its Sections, which `domain/tasks/board.ts` answers for.

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
    expect(matchesFilter(item, { listId: "list-elsewhere", query: "contingency" })).toBe(false);
    expect(matchesFilter(item, { listId: defaultListIdFor("space-1"), query: "contingency" })).toBe(true);
  });
});

// A Space and a Project were two levels above a List, and this block was the
// pair of scopes they added to the filter language. Both records went with
// the Projects feature; a List is the top of the area axis now, and the
// Folder scope below covers what is left of the idea.

describe("view scope", () => {
  const inFolder: List = {
    id: "list-experiment",
    projectId: "space-1",
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
    return projectItems({ tasks, lists: scoped, today: TODAY });
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
    expect(count({})).toBe(3);
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
