import { describe, expect, it } from "vitest";
import type { AppSettings, PlannerData, PlannerSettings, Task } from "../../types";
import { buildSyncPlan } from "./buildSyncPlan";
import { reapplyLocalEdits } from "./reapplyLocalEdits";

function task(id: string, title = id): Task {
  return {
    id,
    title,
    description: "",
    status: "todo",
    priority: "none",
    dueDate: "",
    startDate: "",
    startTime: "",
    endTime: "",
    projectId: "",
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
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-01T09:00:00.000Z",
    completedAt: "",
    archivedAt: "",
    blockedByTaskId: "",
    repeatType: "none",
    repeatInterval: 1,
    repeatDays: [],
    repeatEndDate: "",
  };
}

const settings: PlannerSettings = {
  id: "settings",
  theme: "system",
  createdAt: "2026-08-01T09:00:00.000Z",
  updatedAt: "2026-08-01T09:00:00.000Z",
};

const appSettings: AppSettings = {
  theme: "light",
  accentColor: "blue",
  fontSize: "medium",
  language: "ko",
  defaultView: "/today",
  showCompletedInToday: true,
  confirmBeforeDelete: true,
  timeFormat: "locale",
  weekStart: "sunday",
  showSidebarCounts: true,
  sidebarCollapsed: false,
  reduceMotion: false,
  aiModel: "",
};

function data(overrides: Partial<PlannerData> = {}): PlannerData {
  return {
    tasks: [],
    projects: [],
    spaces: [],
    subtasks: [],
    checkItems: [],
    reminders: [],
    taskTemplates: [],
    dailyPlans: [],
    tags: [],
    taskTags: [],
    focusSessions: [],
    activeSessionId: "",
    learningPaths: [],
    folders: [],
    lists: [],
    sidebarFolders: [],
    listSections: [],
    savedFilters: [],
    settings,
    appSettings,
    ...overrides,
  };
}

const titles = (state: PlannerData) => state.tasks.map((entry) => `${entry.id}:${entry.title}`);

describe("a load that lands on top of an edit (spec §24.24)", () => {
  it("keeps the loaded state when the user did nothing", () => {
    const local = data({ tasks: [task("a")] });
    const loaded = data({ tasks: [task("a", "From the account")] });

    // The same object, which is what an untouched store looks like — and the
    // result is the loaded state itself, so nothing is marked dirty.
    expect(reapplyLocalEdits(loaded, local, local)).toBe(loaded);
  });

  it("keeps an edit made while the fetch was in flight", () => {
    const before = data({ tasks: [task("a", "Old"), task("b", "Untouched")] });
    const during = data({ tasks: [task("a", "What the user typed"), before.tasks[1]] });
    const loaded = data({ tasks: [task("a", "Old"), task("b", "Untouched"), task("c", "From another device")] });

    const merged = reapplyLocalEdits(loaded, before, during);

    expect(titles(merged)).toEqual(["a:What the user typed", "b:Untouched", "c:From another device"]);
  });

  // The load answers with the same record the user was editing. Last write
  // wins is the wrong rule here: one side is a person typing right now.
  it("prefers the local edit over the account's version of the same record", () => {
    const before = data({ tasks: [task("a", "Old")] });
    const during = data({ tasks: [task("a", "Typed locally")] });
    const loaded = data({ tasks: [task("a", "Typed on the other device")] });

    expect(titles(reapplyLocalEdits(loaded, before, during))).toEqual(["a:Typed locally"]);
  });

  it("keeps a record created during the load, which the account cannot know about", () => {
    const before = data({ tasks: [] });
    const during = data({ tasks: [task("new", "Added mid-load")] });
    const loaded = data({ tasks: [task("a", "From the account")] });

    expect(titles(reapplyLocalEdits(loaded, before, during))).toEqual(["a:From the account", "new:Added mid-load"]);
  });

  it("carries an edit in any collection, not just tasks", () => {
    const tag = (id: string, name: string) => ({
      id,
      name,
      color: "",
      createdAt: "2026-08-01T09:00:00.000Z",
      updatedAt: "2026-08-01T09:00:00.000Z",
    });
    const before = data({ tags: [tag("t", "old")] });
    const during = data({ tags: [tag("t", "renamed")] });
    const loaded = data({ tags: [tag("t", "old")] });

    expect(reapplyLocalEdits(loaded, before, during).tags[0].name).toBe("renamed");
  });

  it("carries a setting toggled during the load", () => {
    const before = data();
    const during = data({ appSettings: { ...appSettings, theme: "dark" } });
    const loaded = data({ appSettings: { ...appSettings, accentColor: "purple" } });

    const merged = reapplyLocalEdits(loaded, before, during);

    expect(merged.appSettings.theme).toBe("dark");
    // And the whole settings record is the local one — it is a single row, so
    // there is no per-field merge to do.
    expect(merged.appSettings.accentColor).toBe("blue");
  });

  // A different reference holding equal contents is what a reducer produces
  // when it rebuilds an array without changing any record.
  it("does not treat an untouched record as an edit", () => {
    const before = data({ tasks: [task("a")] });
    const during = { ...before, tasks: [...before.tasks] };
    const loaded = data({ tasks: [task("a", "From the account")] });

    expect(reapplyLocalEdits(loaded, before, during)).toBe(loaded);
    expect(titles(reapplyLocalEdits(loaded, before, during))).toEqual(["a:From the account"]);
  });
});

// The trap in the naive version of this fix. Moving the synced baseline onto
// the merged state, or merging the OTHER way round, produces a state that is
// missing records the account holds — and the save that follows reads "missing
// locally" as "the user deleted it".
describe("what the save after the merge is allowed to do", () => {
  it("never deletes, because the merge only ever adds to what loaded", () => {
    const before = data({ tasks: [task("a", "Old"), task("gone", "Deleted locally")] });
    const during = data({ tasks: [task("a", "Typed locally")] });
    const loaded = data({ tasks: [task("a", "Old"), task("gone", "Deleted locally"), task("c")] });

    const merged = reapplyLocalEdits(loaded, before, during);
    const plan = buildSyncPlan(merged, loaded);

    expect(plan.tables.every((operation) => operation.removeIds.length === 0)).toBe(true);
  });

  it("pushes exactly the records the user touched", () => {
    const before = data({ tasks: [task("a", "Old"), task("b")] });
    const during = data({ tasks: [task("a", "Typed locally"), before.tasks[1]] });
    const loaded = data({ tasks: [task("a", "Old"), task("b"), task("c")] });

    const merged = reapplyLocalEdits(loaded, before, during);
    const plan = buildSyncPlan(merged, loaded);
    const tasks = plan.tables.find((operation) => operation.table === "tasks");

    expect(tasks?.upsert.map((row) => row.id)).toEqual(["a"]);
  });

  it("has nothing at all to push when the load raced nothing", () => {
    const local = data({ tasks: [task("a")] });
    const loaded = data({ tasks: [task("a", "From the account")] });

    const plan = buildSyncPlan(reapplyLocalEdits(loaded, local, local), loaded);

    // Not "an empty operation" — no operation at all. A plan that names the
    // table would still cost a round trip for a load that changed nothing.
    expect(plan.tables.find((operation) => operation.table === "tasks")).toBeUndefined();
  });
});
