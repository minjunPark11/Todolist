import { describe, expect, it } from "vitest";
import type { PlannerData } from "../../types";
import { countPlannerDataItems } from "./plannerDataMigration";

function records(overrides: Partial<PlannerData> = {}) {
  return {
    tasks: [],
    projects: [],
    subtasks: [],
    focusSessions: [],
    learningPaths: [],
    ...overrides,
  } as Pick<PlannerData, "tasks" | "projects" | "subtasks" | "focusSessions" | "learningPaths">;
}

describe("countPlannerDataItems", () => {
  it("offers migration when the only local record is a goal", () => {
    expect(countPlannerDataItems(records({ learningPaths: [{ id: "goal-1" } as never] }))).toBe(1);
  });

  it("counts every synced user-record collection", () => {
    expect(
      countPlannerDataItems(
        records({
          tasks: [{} as never],
          projects: [{} as never],
          subtasks: [{} as never],
          focusSessions: [{} as never],
          learningPaths: [{} as never],
        }),
      ),
    ).toBe(5);
  });
});
