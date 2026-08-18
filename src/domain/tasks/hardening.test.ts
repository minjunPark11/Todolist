import { describe, expect, it } from "vitest";
import type { List, Task, TaskDailyPlan } from "../../types";
import { canonicalizeTaskUrl, parseTaskScope, parseTaskUrl, taskUrlFor } from "../../app/taskScopeUrl";
import { queryScopeCount, queryScopeTasks, type ScopeContext } from "./scopeQuery";
import { TASK_SCOPE_KINDS, scopeRegistry } from "./scopeRegistry";
import { collectTodayEntries } from "../../utils/todayView";

const TODAY = "2026-08-18";
const NOW = `${TODAY}T09:00:00.000Z`;

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Task",
    description: "",
    status: "todo",
    priority: "none",
    dueDate: "",
    scheduledDate: "",
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
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: "",
    blockedByTaskId: "",
    repeatType: "none",
    repeatInterval: 0,
    repeatDays: [],
    repeatEndDate: "",
    ...overrides,
  };
}

const inboxList: List = {
  id: "list-inbox",
  projectId: "",
  kind: "inbox",
  name: "Inbox",
  order: -1,
  isDefault: false,
  createdAt: NOW,
  updatedAt: NOW,
};
const workList: List = {
  id: "l1",
  projectId: "p1",
  kind: "regular",
  name: "Work",
  order: 0,
  isDefault: true,
  createdAt: NOW,
  updatedAt: NOW,
};

// Gate 11: "query/count semantic mismatch 0". Today was the last place with
// two answers — the Tasks Module counted one thing and the Today screen listed
// another — and this is what pins them together.
describe("Today has one definition", () => {
  const plans: TaskDailyPlan[] = [{ id: "p", taskId: "planned", planDate: TODAY, createdAt: NOW, updatedAt: NOW }];
  const tasks = [
    task({ id: "overdue", listId: "l1", dueDate: "2026-08-01" }),
    task({ id: "due", listId: "l1", dueDate: TODAY }),
    task({ id: "planned", listId: "l1" }),
    task({ id: "scheduled", listId: "l1", scheduledDate: TODAY }),
    task({ id: "started", listId: "l1", status: "doing" }),
    task({ id: "later", listId: "l1", dueDate: "2026-09-01" }),
    task({ id: "done", listId: "l1", dueDate: TODAY, status: "done", completedAt: NOW }),
    task({ id: "trashed", listId: "l1", dueDate: TODAY, deletedAt: NOW }),
    task({ id: "put-away-list", listId: "gone", dueDate: TODAY }),
  ];
  const archivedElsewhere: List = { ...workList, id: "gone", name: "Gone", archivedAt: NOW };
  const ctx: ScopeContext = {
    tasks,
    lists: [inboxList, workList, archivedElsewhere],
    dailyPlans: plans,
    taskTags: [],
    today: TODAY,
  };

  it("the screen's open rows are exactly the Scope's rows", () => {
    const screen = collectTodayEntries(ctx, {})
      .filter((entry) => !entry.completed)
      .map((entry) => entry.task.id)
      .sort();
    const scope = queryScopeTasks({ kind: "today" }, ctx)
      .map((item) => item.id)
      .sort();
    expect(screen).toEqual(scope);
    expect(queryScopeCount({ kind: "today" }, ctx)).toBe(scope.length);
  });

  it("counts the day, not how the work is going", () => {
    const ids = queryScopeTasks({ kind: "today" }, ctx).map((item) => item.id);
    expect(ids.sort()).toEqual(["due", "overdue", "planned", "scheduled"]);
    // A started task with no date is not today's by virtue of being started —
    // this is the leg the Today screen used to have and the Scope never did.
    expect(ids).not.toContain("started");
    // And the ones with Scopes of their own stay in them.
    expect(ids).not.toContain("done");
    expect(ids).not.toContain("trashed");
    // §13.19: the owner List's lifecycle is part of membership.
    expect(ids).not.toContain("put-away-list");
  });

  it("still shows what was finished today, as its own thing", () => {
    const completed = collectTodayEntries(ctx, {}).filter((entry) => entry.completed);
    expect(completed.map((entry) => entry.task.id)).toEqual(["done"]);
  });
});

// Gate 11: "unsupported URL state 0". Every string either resolves to one
// canonical state of this module or is refused as not this module's.
describe("no URL can leave the module in a state it does not define", () => {
  it("canonicalizes anything it claims, and claims nothing else", () => {
    const junk = [
      "/",
      "/today",
      "/today?view=board",
      "/today?view=banana&task=",
      "/inbox?view=board&view=list",
      "/list/l1?task=t1&ignored=1",
      "/list/",
      "/completed/extra",
      "/tag/%ED%95%9C%EA%B8%80",
      "/spaces/s1",
      "/app",
      "/search?q=x",
    ];
    for (const url of junk) {
      const canonical = canonicalizeTaskUrl(url);
      if (canonical === null) {
        // Refused: it is another module's path, and the parser agrees.
        expect(parseTaskScope(url.split("?")[0])).toBeNull();
        continue;
      }
      // Claimed: it is one of the nine Scopes, it round-trips, and tidying it
      // again changes nothing.
      const state = parseTaskUrl(canonical)!;
      expect(TASK_SCOPE_KINDS).toContain(state.scope.kind);
      expect(taskUrlFor(state)).toBe(canonical);
      expect(canonicalizeTaskUrl(canonical)).toBe(canonical);
      // A view the Scope does not allow can never survive canonicalization.
      expect(scopeRegistry[state.scope.kind].allowedViews).toContain(state.view);
    }
  });

  it("writes no view the Scope forbids, for any Scope", () => {
    for (const kind of TASK_SCOPE_KINDS) {
      const policy = scopeRegistry[kind];
      const scope = (policy.hasId ? { kind, id: "x" } : { kind }) as Parameters<typeof taskUrlFor>[0]["scope"];
      for (const view of ["list", "board"] as const) {
        const written = taskUrlFor({ scope, view, taskId: "" });
        const parsed = parseTaskUrl(written)!;
        expect(policy.allowedViews).toContain(parsed.view);
      }
    }
  });
});
