import { describe, expect, it } from "vitest";
import { buildMigrationUpload } from "./buildMigrationUpload";
import { buildSyncPlan } from "./buildSyncPlan";
import type { PlannerData } from "../../types";

function plannerData(overrides: Partial<PlannerData> = {}): PlannerData {
  return {
    tasks: [],
    projects: [],
    subtasks: [],
    checkItems: [],
    focusSessions: [],
    learningPaths: [],
    spaces: [],
    folders: [],
    lists: [],
    sidebarFolders: [],
    listSections: [],
    savedFilters: [],
    dailyPlans: [],
    tags: [],
    taskTags: [],
    settings: {} as PlannerData["settings"],
    appSettings: {} as PlannerData["appSettings"],
    activeSessionId: "",
    ...overrides,
  } as PlannerData;
}

const task = (id: string, title: string) => ({ id, title }) as PlannerData["tasks"][number];

describe("buildMigrationUpload", () => {
  it("adds records only this device has", () => {
    const local = plannerData({ tasks: [task("t1", "local only")] });
    const account = plannerData({ tasks: [task("t2", "already on the account")] });

    const merged = buildMigrationUpload(local, account);

    expect(merged.tasks.map((item) => item.id).sort()).toEqual(["t1", "t2"]);
  });

  it("never deletes what the account holds", () => {
    const local = plannerData({ tasks: [] });
    const account = plannerData({ tasks: [task("t1", "keep me"), task("t2", "keep me too")] });

    const merged = buildMigrationUpload(local, account);

    // The bug this replaces: an "upload" of an empty local device diffed to
    // "delete every id the account holds".
    expect(buildSyncPlan(merged, account).tables).toEqual([]);
    expect(merged.tasks).toHaveLength(2);
  });

  it("keeps the account's version of a record both sides have", () => {
    const local = plannerData({ tasks: [task("t1", "stale local copy")] });
    const account = plannerData({ tasks: [task("t1", "current")] });

    const merged = buildMigrationUpload(local, account);

    expect(merged.tasks).toHaveLength(1);
    expect(merged.tasks[0].title).toBe("current");
  });

  it("leaves untouched collections identical, so the merge uploads only additions", () => {
    const local = plannerData({ tasks: [task("t1", "local only")], projects: [] });
    const account = plannerData({
      tasks: [],
      projects: [{ id: "p1" } as PlannerData["projects"][number]],
    });

    const merged = buildMigrationUpload(local, account);
    const plan = buildSyncPlan(merged, account);

    expect(merged.projects).toBe(account.projects);
    expect(plan.tables).toEqual([{ table: "tasks", upsert: [local.tasks[0]], removeIds: [] }]);
  });

  it("keeps the account's settings rather than overwriting them from this device", () => {
    const accountSettings = { theme: "dark" } as unknown as PlannerData["settings"];
    const local = plannerData({ settings: { theme: "light" } as unknown as PlannerData["settings"] });
    const account = plannerData({ settings: accountSettings });

    expect(buildMigrationUpload(local, account).settings).toBe(accountSettings);
  });
});
