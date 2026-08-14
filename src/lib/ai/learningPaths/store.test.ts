import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
vi.mock("../../../platform", () => ({
  platform: {
    storage: {
      getSync: (key: string) => storage.get(key) ?? null,
      setSync: (key: string, value: string) => void storage.set(key, value),
    },
  },
}));

import {
  inspectLegacyLearningPaths,
  LEGACY_LEARNING_PATHS_KEY,
  LEGACY_LEARNING_PATHS_MIGRATED_KEY,
  markLegacyLearningPathsMigratedIfAdopted,
  readLegacyLearningPaths,
  sanitizeLearningPath,
} from "./store";
import type { LearningPath } from "./types";

function goal(id = "goal-1"): LearningPath {
  return {
    id,
    goal: "Learn Korean",
    milestones: [],
    source: "user",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

describe("legacy learning-path migration", () => {
  beforeEach(() => storage.clear());

  it("distinguishes an absent source from a corrupt one", () => {
    expect(inspectLegacyLearningPaths().status).toBe("absent");
    storage.set(LEGACY_LEARNING_PATHS_KEY, "{broken json");
    expect(inspectLegacyLearningPaths().status).toBe("invalid");
  });

  it("returns a valid legacy goal with its identity and a migrated life schedule", () => {
    const path = goal();
    storage.set(LEGACY_LEARNING_PATHS_KEY, JSON.stringify([path]));
    const snapshot = inspectLegacyLearningPaths();
    expect(snapshot.status).toBe("valid");
    expect(snapshot.paths[0]).toMatchObject({ id: path.id, goal: path.goal, schedule: { unit: "life" } });
    expect(storage.has(LEGACY_LEARNING_PATHS_MIGRATED_KEY)).toBe(false);
  });

  it("treats a partly invalid array as corrupt instead of silently dropping goals", () => {
    storage.set(LEGACY_LEARNING_PATHS_KEY, JSON.stringify([goal(), { id: "broken" }]));
    expect(inspectLegacyLearningPaths()).toEqual({ status: "invalid", paths: [] });
    expect(readLegacyLearningPaths()).toEqual([]);
  });

  it("does not consume a corrupt source", () => {
    storage.set(LEGACY_LEARNING_PATHS_KEY, "not-json");
    expect(markLegacyLearningPathsMigratedIfAdopted([])).toBe(false);
    expect(storage.has(LEGACY_LEARNING_PATHS_MIGRATED_KEY)).toBe(false);
  });

  it("does not mark a valid source until every goal is present in planner data", () => {
    storage.set(LEGACY_LEARNING_PATHS_KEY, JSON.stringify([goal("goal-1"), goal("goal-2")]));
    expect(markLegacyLearningPathsMigratedIfAdopted([goal("goal-1")])).toBe(false);
    expect(storage.has(LEGACY_LEARNING_PATHS_MIGRATED_KEY)).toBe(false);
  });

  it("marks a fully adopted source and remains safe when StrictMode repeats the effect", () => {
    const path = goal();
    storage.set(LEGACY_LEARNING_PATHS_KEY, JSON.stringify([path]));
    expect(markLegacyLearningPathsMigratedIfAdopted([path])).toBe(true);
    expect(markLegacyLearningPathsMigratedIfAdopted([path])).toBe(true);
    expect(storage.get(LEGACY_LEARNING_PATHS_MIGRATED_KEY)).toBe("1");
    expect(inspectLegacyLearningPaths().status).toBe("migrated");
  });
});

describe("sanitizeLearningPath schedule compatibility", () => {
  it("migrates a legacy target into schedule, deadline, and representative target", () => {
    expect(sanitizeLearningPath({ ...goal(), targetDate: "2026-09-25" }, "2026-08-14")).toMatchObject({
      schedule: { unit: "month", startDate: "2026-09-01" },
      deadlineDate: "2026-09-25",
      targetDate: "2026-09-01",
    });
  });

  it("keeps an undated milestone inheritable while normalizing an explicitly dated one", () => {
    const path = sanitizeLearningPath(
      {
        ...goal(),
        targetDate: "2027-03-01",
        milestones: [
          { id: "inherit", title: "Inherited", doneCriteria: "", cardIds: [] },
          { id: "dated", title: "Dated", doneCriteria: "", cardIds: [], targetDate: "2026-09-25" },
        ],
      },
      "2026-08-14",
    );
    expect(path?.milestones[0]).not.toHaveProperty("schedule");
    expect(path?.milestones[1]).toMatchObject({
      schedule: { unit: "month", startDate: "2026-09-01" },
      deadlineDate: "2026-09-25",
      targetDate: "2026-09-01",
    });
  });
});
