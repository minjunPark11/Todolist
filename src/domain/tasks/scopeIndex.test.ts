import { describe, expect, it } from "vitest";
import type { List, Task, TaskDailyPlan, TaskTag } from "../../types";
import { listsById, planDatesByTask, tagIdsByTask } from "./scopeIndex";
import { queryScopeCount, type ScopeContext } from "./scopeQuery";

const TODAY = "2026-08-18";
const NOW = `${TODAY}T09:00:00.000Z`;

const list = (id: string, over: Partial<List> = {}): List =>
  ({ id, projectId: "", kind: "regular", name: id, order: 0, isDefault: false, createdAt: NOW, updatedAt: NOW, ...over }) as List;

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({
    id, title: id, description: "", status: "todo", priority: "none", dueDate: "", scheduledDate: "",
    startDate: "", startTime: "", endTime: "", projectId: "", categoryId: "", parentTaskId: "", tags: [],
    notes: "", estimatedMinutes: 0, actualSeconds: 0, activeSessionId: "", lastFocusedAt: "", isSomeday: false,
    waitingReason: "", waitingFollowUpDate: "", order: 0, createdAt: NOW, updatedAt: NOW, completedAt: "",
    blockedByTaskId: "", repeatType: "none", repeatInterval: 0, repeatDays: [], repeatEndDate: "",
    listId: "l1", ...over,
  }) as Task;

describe("scopeIndex", () => {
  it("reuses the index for the same array", () => {
    const lists = [list("l1"), list("l2")];
    expect(listsById(lists)).toBe(listsById(lists));
  });

  // The whole cache rests on this: reducers rebuild only the collection they
  // touched, so a NEW array must never be answered from the old one's index.
  it("builds a fresh index for a new array, even with equal contents", () => {
    const first = [list("l1")];
    const second = [list("l1")];
    expect(listsById(second)).not.toBe(listsById(first));

    const changed = [list("l1", { archivedAt: NOW })];
    expect(listsById(changed).get("l1")?.archivedAt).toBe(NOW);
    expect(listsById(first).get("l1")?.archivedAt).toBeUndefined();
  });

  it("collects every tag a task carries", () => {
    const links: TaskTag[] = [
      { id: "1", taskId: "t1", tagId: "a", createdAt: NOW },
      { id: "2", taskId: "t1", tagId: "b", createdAt: NOW },
      { id: "3", taskId: "t2", tagId: "a", createdAt: NOW },
    ] as TaskTag[];

    expect([...(tagIdsByTask(links).get("t1") ?? [])].sort()).toEqual(["a", "b"]);
    expect(tagIdsByTask(links).get("t3")).toBeUndefined();
  });

  it("collects every date a task is planned for", () => {
    const plans: TaskDailyPlan[] = [
      { id: "1", taskId: "t1", planDate: TODAY, createdAt: NOW, updatedAt: NOW },
      { id: "2", taskId: "t1", planDate: "2026-08-19", createdAt: NOW, updatedAt: NOW },
    ] as TaskDailyPlan[];

    expect(planDatesByTask(plans).get("t1")?.has(TODAY)).toBe(true);
    expect(planDatesByTask(plans).get("t1")?.has("2026-08-20")).toBe(false);
  });

  // The point of the indexes is that they change nothing about the answers.
  it("leaves the Scope counts exactly where they were", () => {
    const lists = [list("l1"), list("l2", { archivedAt: NOW })];
    const tasks = [
      task("t1", { listId: "l1", dueDate: TODAY }),
      task("t2", { listId: "l1" }),
      task("t3", { listId: "l2", dueDate: TODAY }),
    ];
    const taskTags = [{ id: "1", taskId: "t1", tagId: "tag-a", createdAt: NOW }] as TaskTag[];
    const dailyPlans = [
      { id: "1", taskId: "t2", planDate: TODAY, createdAt: NOW, updatedAt: NOW },
    ] as TaskDailyPlan[];
    const ctx: ScopeContext = { tasks, lists, dailyPlans, taskTags, today: TODAY };

    // t1 by its date, t2 by its plan; t3's List is archived, so §13.19 takes it out.
    expect(queryScopeCount({ kind: "today" }, ctx)).toBe(2);
    expect(queryScopeCount({ kind: "list", id: "l1" }, ctx)).toBe(2);
    expect(queryScopeCount({ kind: "list", id: "l2" }, ctx)).toBe(0);
    expect(queryScopeCount({ kind: "tag", id: "tag-a" }, ctx)).toBe(1);
  });
});
