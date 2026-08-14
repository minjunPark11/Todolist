import { describe, expect, it } from "vitest";
import type { LearningPath, Milestone } from "../../lib/ai/learningPaths/types";
import {
  addMilestone,
  addPath,
  dropMilestone,
  dropPath,
  linkCardToMilestone,
  patchMilestone,
  patchPath,
  MAX_MILESTONES,
  MAX_PATHS,
} from "./pathMutations";

const NOW = "2026-08-14T10:00:00.000Z";

function path(overrides: Partial<LearningPath> = {}): LearningPath {
  return {
    id: "p1",
    goal: "HSK4",
    milestones: [],
    source: "user",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function milestone(overrides: Partial<Milestone> = {}): Milestone {
  return { id: "m1", title: "800 words", doneCriteria: "", cardIds: [], ...overrides };
}

describe("path mutations", () => {
  it("keeps the newest-updated path first", () => {
    const older = path({ id: "old", updatedAt: "2026-08-01T00:00:00.000Z" });
    const newer = path({ id: "new", updatedAt: "2026-08-13T00:00:00.000Z" });
    expect(addPath([older], newer).map((p) => p.id)).toEqual(["new", "old"]);
  });

  it("caps the list rather than growing without bound", () => {
    const many = Array.from({ length: MAX_PATHS }, (_, i) =>
      path({ id: `p${i}`, updatedAt: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z` }),
    );
    expect(addPath(many, path({ id: "fresh", updatedAt: NOW })).length).toBe(MAX_PATHS);
  });

  it("bumps updatedAt on every write, and only on the touched path", () => {
    const paths = [path({ id: "a" }), path({ id: "b" })];
    const next = patchPath(paths, "a", { goal: "HSK5" }, NOW);
    expect(next.find((p) => p.id === "a")?.updatedAt).toBe(NOW);
    expect(next.find((p) => p.id === "b")?.updatedAt).toBe("2026-08-01T00:00:00.000Z");
  });

  it("dual-writes a schedule patch to the legacy representative date", () => {
    const next = patchPath(
      [path({ deadlineDate: "2026-09-25" })],
      "p1",
      { schedule: { unit: "year", startDate: "2027-08-20" } },
      NOW,
      "2026-08-14",
    );
    expect(next[0]).toMatchObject({
      schedule: { unit: "year", startDate: "2027-01-01" },
      deadlineDate: "2026-09-25",
      targetDate: "2027-01-01",
    });
  });

  it("converts a legacy target patch without changing the saved deadline", () => {
    const next = patchPath(
      [path({ schedule: { unit: "month", startDate: "2026-09-01" }, deadlineDate: "2026-09-25" })],
      "p1",
      { targetDate: "2027-03-01" },
      NOW,
      "2026-08-14",
    );
    expect(next[0]).toMatchObject({
      schedule: { unit: "year", startDate: "2027-01-01" },
      deadlineDate: "2026-09-25",
      targetDate: "2027-01-01",
    });
  });

  it("refuses to let a patch rewrite the id", () => {
    const next = patchPath([path()], "p1", { goal: "x", id: "hacked" } as never, NOW);
    expect(next[0].id).toBe("p1");
  });

  it("adds, patches and drops milestones", () => {
    let paths = addMilestone([path()], "p1", milestone(), NOW);
    expect(paths[0].milestones).toHaveLength(1);

    paths = patchMilestone(paths, "p1", "m1", { completedAt: NOW }, NOW);
    expect(paths[0].milestones[0].completedAt).toBe(NOW);

    paths = dropMilestone(paths, "p1", "m1", NOW);
    expect(paths[0].milestones).toHaveLength(0);
  });

  it("caps milestones per path", () => {
    let paths = [path()];
    for (let i = 0; i <= MAX_MILESTONES; i += 1) {
      paths = addMilestone(paths, "p1", milestone({ id: `m${i}` }), NOW);
    }
    expect(paths[0].milestones).toHaveLength(MAX_MILESTONES);
  });

  it("links a card at most once", () => {
    let paths = addMilestone([path()], "p1", milestone(), NOW);
    paths = linkCardToMilestone(paths, "p1", "m1", "card-1", NOW);
    paths = linkCardToMilestone(paths, "p1", "m1", "card-1", NOW);
    expect(paths[0].milestones[0].cardIds).toEqual(["card-1"]);
  });

  it("leaves the list alone when the target does not exist", () => {
    const paths = [path()];
    expect(patchPath(paths, "missing", { goal: "x" }, NOW)).toEqual(paths);
    expect(dropMilestone(paths, "missing", "m1", NOW)).toEqual(paths);
    expect(dropPath(paths, "missing")).toEqual(paths);
  });
});
