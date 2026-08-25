import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
let failPlannerWrite = false;
vi.mock("../../platform", () => ({
  platform: {
    storage: {
      getSync: (key: string) => storage.get(key) ?? null,
      setSync: (key: string, value: string) => {
        if (failPlannerWrite && key === "focusflow.appData.v1") throw new Error("disk full");
        storage.set(key, value);
      },
      removeSync: (key: string) => void storage.delete(key),
    },
  },
}));

import {
  LEGACY_LOCAL_SPACES_KEY,
  LEGACY_LOCAL_SPACES_MIGRATED_KEY,
} from "../../lib/spaces/legacyLocalSpaces";
import type { PlannerData } from "../../types";
import { persistPlannerData, PLANNER_STORAGE_KEY } from "./persistPlannerData";

function plannerData(): PlannerData {
  return {
    tasks: [],
    projects: [],
    spaces: [],
    subtasks: [],
    checkItems: [],
    dailyPlans: [],
    tags: [],
    taskTags: [],
    reminders: [],
    taskTemplates: [],
    focusSessions: [],
    activeSessionId: "",
    learningPaths: [],
    folders: [],
    lists: [],
    sidebarFolders: [],
    listSections: [],
    savedFilters: [],
    settings: {} as PlannerData["settings"],
    appSettings: {} as PlannerData["appSettings"],
  };
}

describe("persistPlannerData", () => {
  beforeEach(() => {
    storage.clear();
    failPlannerWrite = false;
  });

  // This was written for the legacy GOAL blob, which went with the Goals
  // feature. The ordering it pins is not about which blob: a legacy source is
  // marked migrated only once the snapshot that adopted it is safely written,
  // so a failed write leaves the source available for the next launch.
  it("marks the legacy source only after the planner snapshot is written", () => {
    storage.set(LEGACY_LOCAL_SPACES_KEY, JSON.stringify([]));
    persistPlannerData(plannerData());
    expect(storage.has(PLANNER_STORAGE_KEY)).toBe(true);
    expect(storage.get(LEGACY_LOCAL_SPACES_MIGRATED_KEY)).toBe("1");
  });

  it("leaves the legacy source retryable when the planner write fails", () => {
    storage.set(LEGACY_LOCAL_SPACES_KEY, JSON.stringify([]));
    failPlannerWrite = true;
    expect(() => persistPlannerData(plannerData())).toThrow("disk full");
    expect(storage.has(LEGACY_LOCAL_SPACES_MIGRATED_KEY)).toBe(false);
    expect(storage.has(LEGACY_LOCAL_SPACES_KEY)).toBe(true);
  });
});
