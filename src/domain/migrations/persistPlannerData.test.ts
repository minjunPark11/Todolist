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
  LEGACY_LEARNING_PATHS_KEY,
  LEGACY_LEARNING_PATHS_MIGRATED_KEY,
} from "../../lib/ai/learningPaths/store";
import type { LearningPath } from "../../lib/ai/learningPaths/types";
import type { PlannerData } from "../../types";
import { persistPlannerData, PLANNER_STORAGE_KEY } from "./persistPlannerData";

function goal(): LearningPath {
  return {
    id: "goal-1",
    goal: "Learn Korean",
    milestones: [],
    source: "user",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

function plannerData(path: LearningPath): PlannerData {
  return {
    tasks: [],
    projects: [],
    spaces: [],
    subtasks: [],
    dailyPlans: [],
    focusSessions: [],
    activeSessionId: "",
    learningPaths: [path],
    folders: [],
    lists: [],
    settings: {} as PlannerData["settings"],
    appSettings: {} as PlannerData["appSettings"],
  };
}

describe("persistPlannerData", () => {
  beforeEach(() => {
    storage.clear();
    failPlannerWrite = false;
  });

  it("marks the legacy goal only after the planner snapshot is written", () => {
    const path = goal();
    storage.set(LEGACY_LEARNING_PATHS_KEY, JSON.stringify([path]));
    persistPlannerData(plannerData(path));
    expect(storage.has(PLANNER_STORAGE_KEY)).toBe(true);
    expect(storage.get(LEGACY_LEARNING_PATHS_MIGRATED_KEY)).toBe("1");
  });

  it("leaves the legacy source retryable when the planner write fails", () => {
    const path = goal();
    storage.set(LEGACY_LEARNING_PATHS_KEY, JSON.stringify([path]));
    failPlannerWrite = true;
    expect(() => persistPlannerData(plannerData(path))).toThrow("disk full");
    expect(storage.has(LEGACY_LEARNING_PATHS_MIGRATED_KEY)).toBe(false);
    expect(storage.has(LEGACY_LEARNING_PATHS_KEY)).toBe(true);
  });
});
