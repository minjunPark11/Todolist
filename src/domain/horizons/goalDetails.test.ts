import { describe, expect, it } from "vitest";
import type { LearningPath, Task } from "../../types";
import { connectedGoalTasks, goalProgress, isAllowedGoalUrl, sanitizeGoalDetailFields } from "./goalDetails";

const path = (patch: Partial<LearningPath> = {}): LearningPath => ({
  id: "p1", goal: "Goal", milestones: [], source: "user",
  createdAt: "2026-08-14T00:00:00.000Z", updatedAt: "2026-08-14T00:00:00.000Z", ...patch,
});

const task = (id: string, status: Task["status"] = "todo") => ({ id, status }) as Task;

describe("goal detail fields", () => {
  it("deduplicates tags and accepts only safe link protocols", () => {
    expect(sanitizeGoalDetailFields({
      description: "  why  ",
      tags: ["Work", "work", " next "],
      links: [
        { id: "1", title: "Web", url: "https://example.com" },
        { id: "2", title: "Bad", url: "javascript:alert(1)" },
      ],
    })).toEqual({
      description: "why",
      successCriteria: undefined,
      tags: ["Work", "next"],
      links: [{ id: "1", title: "Web", url: "https://example.com" }],
    });
    expect(isAllowedGoalUrl("obsidian://open?vault=Goals")).toBe(true);
    expect(isAllowedGoalUrl("file:///secret")).toBe(false);
  });

  it("deduplicates connected tasks, ignores missing ids, and computes progress", () => {
    const goal = path({ milestones: [
      { id: "m1", title: "One", doneCriteria: "", cardIds: [], completedAt: "now", taskIds: ["t1", "missing"] },
      { id: "m2", title: "Two", doneCriteria: "", cardIds: [], taskIds: ["t1", "t2"] },
    ] });
    const tasks = [task("t1", "done"), task("t2")];
    expect(connectedGoalTasks(goal, tasks).map((item) => item.id)).toEqual(["t1", "t2"]);
    expect(goalProgress(goal, tasks)).toEqual({ milestonesDone: 1, milestonesTotal: 2, tasksDone: 1, tasksTotal: 2 });
  });
});
