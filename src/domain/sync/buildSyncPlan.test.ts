import { describe, expect, it } from "vitest";
import { buildSyncPlan, collectionTables, isEmptySyncPlan, optionalRemoteTables } from "./buildSyncPlan";
import type { AppSettings, PlannerData, PlannerSettings, Task } from "../../types";

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

const tableNamed = (plan: ReturnType<typeof buildSyncPlan>, table: string) =>
  plan.tables.find((operation) => operation.table === table);

describe("buildSyncPlan — first sync", () => {
  it("never deletes anything when the account contents are unknown", () => {
    // This is the case that could wipe an existing account: a device that has
    // not loaded yet must not conclude the account should be emptied.
    const plan = buildSyncPlan(data(), null);
    expect(plan.tables.every((operation) => operation.removeIds.length === 0)).toBe(true);
  });

  it("pushes every record it has", () => {
    const plan = buildSyncPlan(data({ tasks: [task("a"), task("b")] }), null);
    expect(tableNamed(plan, "tasks")?.upsert.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("always writes the settings rows, even with no records at all", () => {
    const plan = buildSyncPlan(data(), null);
    expect(plan.settings).not.toBeNull();
    expect(plan.appState).not.toBeNull();
    expect(isEmptySyncPlan(plan)).toBe(false);
  });
});

describe("a collection the product dropped", () => {
  // Space notes were removed. The danger is not that the table is missing —
  // it is that re-adding it with nothing local means "delete every note the
  // account holds", which is exactly what a diff against an empty collection
  // produces. This asserts the table is never in a plan at all.
  it("never appears in a plan, so a release cannot erase the rows", () => {
    const withBaseline = buildSyncPlan(data(), data({ tasks: [task("a")] }));
    const firstSync = buildSyncPlan(data(), null);
    for (const plan of [withBaseline, firstSync]) {
      expect(tableNamed(plan, "space_notes")).toBeUndefined();
    }
    expect(collectionTables.some(([, table]) => (table as string) === "space_notes")).toBe(false);
  });
});

describe("the spaces collection (SPACES_REDESIGN_II STEP 5)", () => {
  const space = (id: string) => ({
    id,
    name: id,
    description: "",
    color: "#8e8e93",
    order: 0,
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  });

  it("syncs like every other collection", () => {
    const plan = buildSyncPlan(data({ spaces: [space("s1")] }), null);
    expect(tableNamed(plan, "spaces")?.upsert.map((row) => row.id)).toEqual(["s1"]);
  });

  it("is optional, so an account whose project lacks the table keeps syncing", () => {
    // The table is skipped, and everything else still ships — the point of
    // optionalRemoteTables. A required table would fail the whole save.
    const plan = buildSyncPlan(
      data({ spaces: [space("s1")], tasks: [task("a")] }),
      null,
      new Set(["spaces"]),
    );
    expect(tableNamed(plan, "spaces")).toBeUndefined();
    expect(tableNamed(plan, "tasks")?.upsert.map((row) => row.id)).toEqual(["a"]);
    expect(optionalRemoteTables.has("spaces")).toBe(true);
  });
});

describe("buildSyncPlan — incremental saves", () => {
  it("writes nothing at all when the state is unchanged", () => {
    const baseline = data({ tasks: [task("a")] });
    const plan = buildSyncPlan(baseline, baseline);

    expect(isEmptySyncPlan(plan)).toBe(true);
    expect(plan.tables).toEqual([]);
    expect(plan.settings).toBeNull();
    expect(plan.appState).toBeNull();
  });

  it("sends only the edited record, and leaves other tables out entirely", () => {
    const a = task("a");
    const b = task("b");
    const baseline = data({ tasks: [a, b], projects: [] });
    // Mirrors a reducer: the untouched task comes back by reference.
    const next = { ...baseline, tasks: [a, { ...b, title: "edited" }] };

    const plan = buildSyncPlan(next, baseline);
    expect(plan.tables).toHaveLength(1);
    expect(plan.tables[0].table).toBe("tasks");
    expect(plan.tables[0].upsert.map((row) => row.id)).toEqual(["b"]);
    expect(plan.tables[0].removeIds).toEqual([]);
  });

  it("deletes exactly the record that was removed", () => {
    const a = task("a");
    const b = task("b");
    const baseline = data({ tasks: [a, b] });
    const plan = buildSyncPlan({ ...baseline, tasks: [a] }, baseline);

    expect(tableNamed(plan, "tasks")?.removeIds).toEqual(["b"]);
    expect(tableNamed(plan, "tasks")?.upsert).toEqual([]);
  });

  it("passes ids through as values so quoting can never corrupt a delete", () => {
    const hostile = task('we"ird,id');
    const baseline = data({ tasks: [hostile] });
    const plan = buildSyncPlan({ ...baseline, tasks: [] }, baseline);

    expect(tableNamed(plan, "tasks")?.removeIds).toEqual(['we"ird,id']);
  });

  it("does not touch settings when only a task changed", () => {
    // Settings used to be upserted twice on every single save.
    const baseline = data({ tasks: [task("a")] });
    const plan = buildSyncPlan({ ...baseline, tasks: [task("a")] }, baseline);

    expect(plan.settings).toBeNull();
    expect(plan.appState).toBeNull();
  });

  it("writes the app-state row when a preference changed", () => {
    const baseline = data();
    const next = { ...baseline, appSettings: { ...appSettings, language: "en" as const } };
    const plan = buildSyncPlan(next, baseline);

    expect(plan.appState?.appSettings.language).toBe("en");
    expect(plan.settings).toBeNull();
    expect(plan.tables).toEqual([]);
  });

  it("writes the app-state row when the active focus session changed", () => {
    const baseline = data();
    const plan = buildSyncPlan({ ...baseline, activeSessionId: "focus-1" }, baseline);
    expect(plan.appState?.activeSessionId).toBe("focus-1");
  });

  it("reports every id when the user cleared a collection", () => {
    const baseline = data({ tasks: [task("a"), task("b")] });
    const plan = buildSyncPlan({ ...baseline, tasks: [] }, baseline);
    expect(tableNamed(plan, "tasks")?.removeIds).toEqual(["a", "b"]);
  });
});

describe("buildSyncPlan — tables the account does not have", () => {
  it("omits skipped tables from the plan", () => {
    const plan = buildSyncPlan(
      data({ tasks: [task("a")] }),
      null,
      new Set(["learning_paths"]),
    );

    expect(tableNamed(plan, "learning_paths")).toBeUndefined();
    expect(tableNamed(plan, "tasks")).toBeDefined();
  });

  it("still refuses to delete from a skipped table's siblings", () => {
    const a = task("a");
    const baseline = data({ tasks: [a] });
    const plan = buildSyncPlan({ ...baseline, tasks: [] }, baseline, new Set(["tasks"]));
    expect(plan.tables).toEqual([]);
  });
});

describe("buildSyncPlan — every collection is covered", () => {
  it("maps each planner collection to its table", () => {
    const plan = buildSyncPlan(data(), null);
    // A new collection added to PlannerData without a table mapping would
    // silently never sync; this pins the current set.
    expect(plan.tables.map((operation) => operation.table).sort()).toEqual([]);

    const withRows = buildSyncPlan(
      data({
        tasks: [task("t")],
        projects: [{ id: "p" } as never],
        subtasks: [{ id: "s" } as never],
        focusSessions: [{ id: "f" } as never],
        learningPaths: [{ id: "lp" } as never],
      }),
      null,
    );
    expect(withRows.tables.map((operation) => operation.table).sort()).toEqual([
      "focus_sessions",
      "learning_paths",
      "projects",
      "subtasks",
      "tasks",
    ]);
  });
});
