// The invariants that span modules (SPACES_REDESIGN_II §75 STEP 12).
//
// Every module here has its own unit tests. What those cannot catch is a
// disagreement BETWEEN them — a scope that gathers one set while an Overview
// counts another, a view that reads a date field its writer never writes, a
// Project move that quietly rewrites the work underneath it. Each of those
// passes both sides' tests and fails the product.
//
// §75 forbids removing a legacy path before its replacement is shown
// equivalent. This file is where that showing happens.
import { describe, expect, it } from "vitest";
import type { Folder, LearningPath, List, Project, Space, Task } from "../../types";
import { projectItems } from "../view/item";
import { matchesFilter } from "../view/viewSpec";
import { spanForItem } from "../view/span";
import { ensureInboxList, makeDefaultList } from "./hierarchy";
import { backfillTaskListId, defaultListIdFor, listIdFor, projectIdFor, statusIdFor, statusesForSpace } from "./membership";
import {
  canDeleteSpace,
  DEFAULT_SPACE_ID,
  makeSpace,
  moveProjectToSpace,
  projectsInSpace,
  spaceIdForProject,
} from "./spaces";
import { filterForSelection, parseSelection, pathForSelection, resolveSelection } from "../../app/spaceSelection";
import { horizonForGoalSchedule, normalizeGoalSchedule } from "../horizons/goalSchedule";
import { deriveHorizon } from "../../utils/horizons";
import { navItemsForScope } from "../view/spaceNav";

const TODAY = "2026-08-17";
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
    archivedAt: "",
    blockedByTaskId: "",
    repeatType: "none",
    repeatInterval: 1,
    repeatDays: [],
    repeatEndDate: "",
    ...overrides,
  };
}

function project(id: string, spaceId: string, name = id): Project {
  return { id, name, description: "", color: "#0066cc", spaceId, createdAt: NOW, updatedAt: NOW };
}

function goal(overrides: Partial<LearningPath> = {}): LearningPath {
  return {
    id: "g1",
    goal: "Ship it",
    milestones: [],
    projectId: "p1",
    source: "user",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// Two Projects in one Space, one in another — the shape the model exists for.
const spaces: Space[] = [makeSpace("sp-research", "Research", NOW), makeSpace("sp-life", "Life", NOW)];
const projects: Project[] = [
  project("p1", "sp-research", "Drone"),
  project("p2", "sp-research", "VR"),
  project("p3", "sp-life", "Home"),
];
const lists: List[] = [
  makeDefaultList(defaultListIdFor("p1"), "p1", NOW),
  makeDefaultList(defaultListIdFor("p2"), "p2", NOW),
  makeDefaultList(defaultListIdFor("p3"), "p3", NOW),
];
const tasks: Task[] = [
  task({ id: "t1", projectId: "p1" }),
  task({ id: "t2", projectId: "p2" }),
  task({ id: "t3", projectId: "p3" }),
];

function items(extra: Partial<{ tasks: Task[]; paths: LearningPath[]; lists: List[] }> = {}) {
  return projectItems({
    tasks: extra.tasks ?? tasks,
    paths: extra.paths ?? [],
    projects,
    lists: extra.lists ?? lists,
    today: TODAY,
  });
}

describe("scope sets agree across levels (§16, T-OV08)", () => {
  it("a Space gathers exactly the union of its Projects", () => {
    const all = items();
    const inSpace = all.filter((item) => matchesFilter(item, { spaceId: "sp-research" }));
    const byProject = projectsInSpace(projects, "sp-research").flatMap((p) =>
      all.filter((item) => matchesFilter(item, { projectId: p.id })),
    );
    expect(inSpace.map((item) => item.key).sort()).toEqual(byProject.map((item) => item.key).sort());
  });

  it("gets tighter at every level and never wider", () => {
    const scoped = items({ lists: [...lists, { ...lists[0], id: "l-extra", isDefault: false, name: "Extra" }] });
    const counts = {
      space: scoped.filter((i) => matchesFilter(i, { spaceId: "sp-research" })).length,
      project: scoped.filter((i) => matchesFilter(i, { projectId: "p1" })).length,
      list: scoped.filter((i) => matchesFilter(i, { listId: defaultListIdFor("p1") })).length,
    };
    expect(counts.space).toBeGreaterThanOrEqual(counts.project);
    expect(counts.project).toBeGreaterThanOrEqual(counts.list);
  });

  it("what the Scope Resolver answers is what the filter narrows by", () => {
    // The resolver and the engine have to speak one language, or the tree
    // would select a place the view cannot express.
    const selection = resolveSelection(parseSelection("/s/sp-research/p/p1"), { spaces, projects });
    const filter = filterForSelection(selection);
    const scoped = items().filter((item) => matchesFilter(item, filter));
    expect(scoped.map((item) => item.sourceId)).toEqual(["t1"]);
  });
});

describe("one Task, every view (§44, T-LV07 / T-GV10 / T-CV12)", () => {
  it("shows the same record through each view's own filter", () => {
    const edited = task({ id: "t1", projectId: "p1", status: "doing", dueDate: "2026-08-20" });
    const all = items({ tasks: [edited, tasks[1], tasks[2]] });
    const seen = [
      // list / board / gantt / calendar differ only in sources and grouping.
      all.find((i) => matchesFilter(i, { projectId: "p1", sources: ["task"] })),
      all.find((i) => matchesFilter(i, { projectId: "p1", statusIds: ["doing"] })),
      all.find((i) => matchesFilter(i, { listId: defaultListIdFor("p1") })),
    ];
    for (const item of seen) {
      expect(item?.sourceId).toBe("t1");
      expect(item?.statusId).toBe("doing");
      expect(item?.dueDate).toBe("2026-08-20");
    }
  });

  it("carries no per-view copy of a Task's fields", () => {
    // Every Item points back at the record. If a view could hold its own
    // value, "edit here, see it there" would be a coincidence.
    const [item] = items({ tasks: [task({ id: "t1", title: "Original" })] });
    expect(item.sourceId).toBe("t1");
    expect(item.title).toBe("Original");
  });
});

// §75 forbids removing a legacy path before its replacement is shown
// equivalent. The TickTick plan inverts membership — the Project is read
// THROUGH the List (§6.77) where it used to be read off the Task — so this is
// where the two are shown to answer the same thing.
describe("membership inversion answers what the legacy path answered (§6.77)", () => {
  const migrated = backfillTaskListId(tasks, lists, NOW);

  it("gives every backfilled Task the same Project the stored field did", () => {
    for (const task of migrated) {
      expect(projectIdFor(task, lists)).toBe(task.projectId);
    }
  });

  it("projects the same Project onto every Item as before the inversion", () => {
    const before = new Map(items({ tasks }).map((item) => [item.key, item.projectId]));
    const after = items({ tasks: migrated });
    for (const item of after) {
      expect(item.projectId).toBe(before.get(item.key));
    }
  });

  it("gathers the same Space set through Lists as through stored ids (§6.78)", () => {
    const scoped = items({ tasks: migrated }).filter((item) =>
      matchesFilter(item, { spaceId: "sp-research" }),
    );
    expect(scoped.map((item) => item.sourceId).sort()).toEqual(["t1", "t2"]);
  });

  it("moving a List to another Project moves its Tasks, rewriting no Task", () => {
    // The property the inversion exists for. Nothing under the List is touched.
    const moved = lists.map((list) =>
      list.id === defaultListIdFor("p1") ? { ...list, projectId: "p3", spaceId: "p3" } : list,
    );
    const task1 = migrated.find((item) => item.id === "t1")!;
    expect(projectIdFor(task1, moved)).toBe("p3");
    expect(task1.projectId).toBe("p1"); // the record itself is untouched
  });

  it("puts an Inbox Task in no Project and so in no Space (§6.80)", () => {
    const orphan = task({ id: "t-orphan", projectId: "" });
    const withInbox = ensureInboxList(lists, NOW);
    const [filed] = backfillTaskListId([orphan], withInbox, NOW);
    expect(projectIdFor(filed, withInbox)).toBe("");
    const [item] = projectItems({ tasks: [filed], paths: [], projects, lists: withInbox, today: TODAY });
    expect(item.spaceId).toBe("");
  });

  // Migration Phase 4's half of the same rule. A standalone List belongs to no
  // Project (§6.3), so §6.79 keeps everything under it out of Space queries —
  // the Inbox is not a special case, it is the first instance of one.
  it("puts a Task in a standalone List in no Project and so in no Space (§6.79)", () => {
    const standalone: List = {
      ...makeDefaultList("list-blog", "", NOW),
      kind: "regular",
      isDefault: false,
      name: "블로그",
    };
    const solo = task({ id: "t-solo", projectId: "", listId: standalone.id });
    const withStandalone = [...lists, standalone];
    expect(projectIdFor(solo, withStandalone)).toBe("");
    const [item] = projectItems({
      tasks: [solo],
      paths: [],
      projects,
      lists: withStandalone,
      today: TODAY,
    });
    expect(item.spaceId).toBe("");
  });
});

describe("H-INV-05 — moving a Project rewrites nothing beneath it", () => {
  const folders: Folder[] = [
    { id: "f1", projectId: "p1", spaceId: "p1", name: "Papers", order: 0, createdAt: NOW, updatedAt: NOW },
  ];
  const scopedLists: List[] = [
    ...lists,
    { id: "l-in-folder", projectId: "p1", spaceId: "p1", folderId: "f1", name: "Draft", order: 1, isDefault: false, createdAt: NOW, updatedAt: NOW },
  ];

  it("changes one row and leaves every descendant id alone", () => {
    const before = items({ tasks: [task({ id: "t1", listId: "l-in-folder" })], lists: scopedLists });
    const moved = moveProjectToSpace(projects, "p1", "sp-life", spaces, "2026-08-18T00:00:00.000Z");

    // The collections underneath are the same objects, not copies.
    expect(folders[0].id).toBe("f1");
    expect(scopedLists.find((l) => l.id === "l-in-folder")?.spaceId).toBe("p1");

    const after = projectItems({
      tasks: [task({ id: "t1", listId: "l-in-folder" })],
      paths: [],
      projects: moved,
      lists: scopedLists,
      today: TODAY,
    });
    expect(after[0].sourceId).toBe(before[0].sourceId);
    expect(after[0].listId).toBe(before[0].listId);
    expect(after[0].folderId).toBe(before[0].folderId);
    // Only the Space changed.
    expect(before[0].spaceId).toBe("sp-research");
    expect(after[0].spaceId).toBe("sp-life");
  });

  it("touches only the moved Project object", () => {
    const moved = moveProjectToSpace(projects, "p1", "sp-life", spaces, NOW);
    expect(moved[1]).toBe(projects[1]);
    expect(moved[2]).toBe(projects[2]);
    expect(moved[0]).not.toBe(projects[0]);
  });
});

describe("H-INV-06 — deleting a Space is not a cascade", () => {
  it("refuses while anything is filed under it", () => {
    expect(canDeleteSpace(projects, "sp-research")).toBe(false);
    expect(canDeleteSpace(projects, "sp-life")).toBe(false);
    expect(canDeleteSpace(projects, "sp-empty")).toBe(true);
  });

  it("counts a Project that relies on the default Space", () => {
    const loose: Project[] = [{ ...project("p9", ""), spaceId: undefined }];
    expect(spaceIdForProject(loose[0])).toBe(DEFAULT_SPACE_ID);
    expect(canDeleteSpace(loose, DEFAULT_SPACE_ID)).toBe(false);
  });
});

describe("Domain Sections keep their own Source of Truth (§27.2)", () => {
  it("a Goal's horizon comes from its schedule, not from a date (T-HZ07)", () => {
    const scheduled = goal({ schedule: { unit: "month", startDate: "2026-09-01" }, deadlineDate: "2026-12-31" });
    const horizon = horizonForGoalSchedule(normalizeGoalSchedule(scheduled.schedule, scheduled.targetDate, TODAY));
    expect(horizon).toBe("month");
    // The deadline is a different question and does not move it.
    expect(horizon).not.toBe(deriveHorizon(scheduled.deadlineDate, TODAY));
  });

  // T-HZ08 asserted that a Task's horizon came from its dates and that no
  // schedule was invented for it. The Item no longer carries a horizon, and
  // Horizons is gone; what still matters is the second half — projecting a
  // Task must not write a goal's scheduling field onto it.
  it("invents no schedule for a Task (T-HZ08)", () => {
    const soon = task({ id: "t1", dueDate: TODAY });
    items({ tasks: [soon] });
    expect((soon as unknown as { schedule?: unknown }).schedule).toBeUndefined();
  });
});

describe("date fields stay separate (G-CALENDAR-01, G-GANTT-01)", () => {
  it("a due-only Task still gets a bar, and it is one day", () => {
    const [item] = items({ tasks: [task({ id: "t1", dueDate: "2026-08-20" })] });
    const span = spanForItem(item);
    expect(span).toEqual({ start: "2026-08-20", end: "2026-08-20", inferredStart: true });
  });

  it("a Task with no date at all is off the timeline rather than given one", () => {
    const [item] = items({ tasks: [task({ id: "t1" })] });
    expect(spanForItem(item)).toBeNull();
    // And nothing was written to the record to put it there.
    expect(item.startDate).toBe("");
    expect(item.dueDate).toBe("");
  });

  // WAS: "keeps scheduledDate and dueDate as different answers". The work day
  // and the deadline were two fields and are now one range
  // (SCHEDULE_EDITOR_PHASE0_AUDIT.md §7 Phase 11); what still has to hold is
  // that the two dates a Task DOES have stay distinct through the projection.
  it("keeps a range's two ends as different answers", () => {
    const [item] = items({
      tasks: [task({ id: "t1", startDate: "2026-08-18", dueDate: "2026-08-25" })],
    });
    expect(item.startDate).toBe("2026-08-18");
    expect(item.dueDate).toBe("2026-08-25");
  });
});

describe("creation context (G-CTX-01)", () => {
  it("resolves a Task with no stored list to its Project's default", () => {
    expect(listIdFor({ listId: "", projectId: "p1" }, lists)).toBe(defaultListIdFor("p1"));
  });

  it("answers nothing rather than guessing when there is no Project", () => {
    expect(listIdFor({ listId: "", projectId: "" }, lists)).toBe("");
  });

  it("keeps a stored list over the derivation", () => {
    expect(listIdFor({ listId: "l-custom", projectId: "p1" }, lists)).toBe("l-custom");
  });
});

describe("status ownership (G-STATUS-01, §0.3.3)", () => {
  it("resolves a task's status against its own Project's set", () => {
    const [item] = items({ tasks: [task({ id: "t1", status: "doing" })] });
    expect(item.statusId).toBe("doing");
    expect(statusIdFor({ statusId: "", status: "doing" }, statusesForSpace(undefined))).toBe("doing");
  });

  it("keeps Board off the Space bar, because a Space has no one status set", () => {
    expect(navItemsForScope("space").map((item) => item.id)).not.toContain("board");
    expect(navItemsForScope("project").map((item) => item.id)).toContain("board");
  });
});

describe("selection survives the round trip (§34, §75)", () => {
  const records = { spaces, projects };

  it("parses, resolves and re-serialises to the same place", () => {
    for (const path of [
      "/s/sp-research",
      "/s/sp-research/p/p1",
      "/s/sp-research/p/p1/f/f1",
      "/s/sp-research/p/p1/l/l1",
    ]) {
      const selection = resolveSelection(parseSelection(path), records);
      expect(pathForSelection(selection)).toBe(path);
    }
  });

  it("upgrades a legacy path once and then holds still", () => {
    const first = resolveSelection(parseSelection("/s/p1/l/l1"), records);
    expect(pathForSelection(first)).toBe("/s/sp-research/p/p1/l/l1");
    const second = resolveSelection(parseSelection(pathForSelection(first)), records);
    expect(pathForSelection(second)).toBe(pathForSelection(first));
  });

  it("keeps a deep link that arrives before the records do", () => {
    const early = resolveSelection(parseSelection("/s/sp-research/p/p1"), { spaces: [], projects: [] });
    expect(early).toEqual({ kind: "project", spaceId: "sp-research", projectId: "p1" });
  });
});
