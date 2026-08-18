import { describe, expect, it } from "vitest";
import type { List, Task, TaskDailyPlan, TaskTag } from "../../types";
import type { TaskScopeRef } from "./scopeRegistry";
import { scopeRegistry, TASK_SCOPE_KINDS } from "./scopeRegistry";
import {
  effectiveDueDate,
  hasTodayPlan,
  isTaskActive,
  matchesScope,
  queryScopeCount,
  queryScopeTasks,
  type ScopeContext,
} from "./scopeQuery";
import { taskTagIdFor } from "../tags/tags";

const TODAY = "2026-08-18";
const NOW = `${TODAY}T00:00:00.000Z`;

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
    projectId: "p1",
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

function list(overrides: Partial<List> = {}): List {
  return {
    id: "l1",
    projectId: "p1",
    name: "List",
    order: 0,
    isDefault: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const inboxList = list({ id: "list-inbox", projectId: "", kind: "inbox", name: "Inbox", isDefault: false });
const projectList = list({ id: "l1", projectId: "p1", folderId: "f1" });

function context(overrides: Partial<ScopeContext> = {}): ScopeContext {
  return {
    tasks: [],
    lists: [inboxList, projectList],
    dailyPlans: [],
    taskTags: [],
    today: TODAY,
    ...overrides,
  };
}

function plan(taskId: string, planDate = TODAY): TaskDailyPlan {
  return { id: `plan-${planDate}-${taskId}`, taskId, planDate, bucket: "now", createdAt: NOW, updatedAt: NOW };
}

describe("the shared precondition (§12.19)", () => {
  it("drops a deleted task, and an archived one the plan has no word for", () => {
    expect(isTaskActive(task({ deletedAt: NOW }), [projectList])).toBe(false);
    expect(isTaskActive(task({ status: "archived" }), [projectList])).toBe(false);
    expect(isTaskActive(task({ listId: "l1" }), [projectList])).toBe(true);
  });

  it("drops a task whose owning List was archived", () => {
    const archived = list({ id: "l1", archivedAt: NOW });
    expect(isTaskActive(task({ listId: "l1" }), [archived])).toBe(false);
  });
});

// §12.5.1 is the section the plan wrote because this meaning drifts. Today is
// NOT "due today".
describe("Today membership (§12.5.1)", () => {
  const scope: TaskScopeRef = { kind: "today" };

  it("takes overdue, due-today, and explicitly planned", () => {
    const ctx = context({ dailyPlans: [plan("t-planned")] });
    expect(matchesScope(task({ id: "t-over", dueDate: "2026-08-01", listId: "l1" }), scope, ctx)).toBe(true);
    expect(matchesScope(task({ id: "t-due", dueDate: TODAY, listId: "l1" }), scope, ctx)).toBe(true);
    expect(matchesScope(task({ id: "t-planned", listId: "l1" }), scope, ctx)).toBe(true);
  });

  it("takes a FUTURE task planned for today, and leaves its due date alone", () => {
    const future = task({ id: "t-planned", dueDate: "2026-09-01", listId: "l1" });
    const ctx = context({ dailyPlans: [plan("t-planned")] });
    expect(matchesScope(future, scope, ctx)).toBe(true);
    expect(effectiveDueDate(future)).toBe("2026-09-01");
  });

  it("leaves out a future task with no plan, and a completed one", () => {
    const ctx = context();
    expect(matchesScope(task({ dueDate: "2026-09-01", listId: "l1" }), scope, ctx)).toBe(false);
    expect(matchesScope(task({ dueDate: TODAY, status: "done", listId: "l1" }), scope, ctx)).toBe(false);
  });

  it("reads a plan for another day as another day", () => {
    expect(hasTodayPlan(task(), [plan("t1", "2026-08-17")], TODAY)).toBe(false);
  });
});

describe("Upcoming horizon (§12.6)", () => {
  const scope: TaskScopeRef = { kind: "upcoming" };
  const ctx = context({ dailyPlans: [plan("t-planned")] });

  it("covers today through today+6", () => {
    expect(matchesScope(task({ dueDate: TODAY, listId: "l1" }), scope, ctx)).toBe(true);
    expect(matchesScope(task({ dueDate: "2026-08-24", listId: "l1" }), scope, ctx)).toBe(true);
    expect(matchesScope(task({ dueDate: "2026-08-25", listId: "l1" }), scope, ctx)).toBe(false);
  });

  it("leaves overdue to Today", () => {
    expect(matchesScope(task({ dueDate: "2026-08-01", listId: "l1" }), scope, ctx)).toBe(false);
  });

  it("does not let a plan alone put a task on a horizon made of dates", () => {
    expect(matchesScope(task({ id: "t-planned", listId: "l1" }), scope, ctx)).toBe(false);
  });
});

describe("the Scopes that name a container", () => {
  const ctx = context();

  // §12.7: the owning List's kind, not `status === "inbox"` — that status is
  // the leg Migration Phase 2 replaced.
  it("reads Inbox from the List that owns the task", () => {
    const inboxTask = task({ id: "t-in", listId: "list-inbox", projectId: "" });
    expect(matchesScope(inboxTask, { kind: "inbox" }, ctx)).toBe(true);
    expect(matchesScope(task({ listId: "l1" }), { kind: "inbox" }, ctx)).toBe(false);
  });

  it("reads a List scope through the same resolver everything else uses", () => {
    // No stored listId: membership still resolves through the Project's default.
    expect(matchesScope(task({ projectId: "p1" }), { kind: "list", id: "l1" }, ctx)).toBe(true);
    expect(matchesScope(task({ listId: "l1" }), { kind: "list", id: "other" }, ctx)).toBe(false);
  });

  it("reads a Folder through the List that hangs under it", () => {
    expect(matchesScope(task({ listId: "l1" }), { kind: "folder", id: "f1" }, ctx)).toBe(true);
    expect(matchesScope(task({ listId: "list-inbox" }), { kind: "folder", id: "f1" }, ctx)).toBe(false);
  });

  it("follows the List into a sidebar group, and out of the domain Folder (§12.4)", () => {
    const grouped = { ...projectList, sidebarFolderId: "sf1" };
    const moved = context({ lists: [inboxList, grouped] });
    expect(matchesScope(task({ listId: "l1" }), { kind: "folder", id: "sf1" }, moved)).toBe(true);
    // The List still records the Folder it belongs to — the sidebar placement
    // is presentation only (D19) — but the Scope shows it in one place.
    expect(grouped.folderId).toBe("f1");
    expect(matchesScope(task({ listId: "l1" }), { kind: "folder", id: "f1" }, moved)).toBe(false);
  });

});

describe("Tag membership", () => {
  const scope: TaskScopeRef = { kind: "tag", id: "tag-work" };

  it("reads the link record", () => {
    const links: TaskTag[] = [
      { id: taskTagIdFor("t1", "tag-work"), taskId: "t1", tagId: "tag-work", createdAt: NOW },
    ];
    expect(matchesScope(task({ listId: "l1" }), scope, context({ taskTags: links }))).toBe(true);
  });

  // Creation still writes strings, so a task tagged since the last load has no
  // link yet. §6.74 retires this leg once creation writes links itself.
  it("falls back to the string a task was tagged with a moment ago", () => {
    expect(matchesScope(task({ listId: "l1", tags: ["Work"] }), scope, context())).toBe(true);
  });

  it("does not mistake a legacy membership marker for a tag", () => {
    const legacy: TaskScopeRef = { kind: "tag", id: "tag-space:abc" };
    expect(matchesScope(task({ listId: "l1", tags: ["space:abc"] }), legacy, context())).toBe(false);
  });
});

describe("the two system Scopes (§12.12, §12.13)", () => {
  const ctx = context();

  it("shows exactly what active excludes", () => {
    const done = task({ id: "t-done", status: "done", completedAt: NOW, listId: "l1" });
    const gone = task({ id: "t-gone", deletedAt: NOW, listId: "l1" });
    expect(matchesScope(done, { kind: "completed" }, ctx)).toBe(true);
    expect(matchesScope(gone, { kind: "trash" }, ctx)).toBe(true);
  });

  it("keeps a deleted-and-completed task in Trash only", () => {
    const both = task({ status: "done", completedAt: NOW, deletedAt: NOW, listId: "l1" });
    expect(matchesScope(both, { kind: "trash" }, ctx)).toBe(true);
    expect(matchesScope(both, { kind: "completed" }, ctx)).toBe(false);
  });
});

// A Filter is a stored spec and there are no SavedFilter records yet. Empty is
// the honest answer; every row would look like a working screen showing the
// wrong thing.
describe("Filter before there are filters", () => {
  it("answers with nothing rather than everything", () => {
    expect(matchesScope(task({ listId: "l1" }), { kind: "filter", id: "flt_1" }, context())).toBe(false);
  });
});

// Gate 2 (§16.25): over one fixture, the query, the predicate and the count
// must be about the same rows. They agree because there is one rule and the
// other two are derived from it — this checks nobody has added a shortcut.
describe("Gate 2 — one rule, three readers", () => {
  const tasks = [
    task({ id: "a", dueDate: "2026-08-01", listId: "l1" }),
    task({ id: "b", dueDate: TODAY, listId: "list-inbox", projectId: "" }),
    task({ id: "c", dueDate: "2026-08-20", listId: "l1", tags: ["Work"] }),
    task({ id: "d", status: "done", completedAt: NOW, listId: "l1" }),
    task({ id: "e", deletedAt: NOW, listId: "l1" }),
    task({ id: "f", listId: "l1" }),
  ];
  const ctx = context({ tasks, dailyPlans: [plan("f")] });

  const REFS: TaskScopeRef[] = TASK_SCOPE_KINDS.map((kind) =>
    scopeRegistry[kind].hasId
      ? ({ kind, id: kind === "tag" ? "tag-work" : kind === "folder" ? "f1" : "l1" } as TaskScopeRef)
      : ({ kind } as TaskScopeRef),
  );

  it("returns the same ids the predicate accepts, and counts exactly those", () => {
    for (const scope of REFS) {
      const queried = queryScopeTasks(scope, ctx).map((entry) => entry.id);
      const matched = tasks.filter((entry) => matchesScope(entry, scope, ctx)).map((entry) => entry.id);
      expect(queried).toEqual(matched);
      expect(queryScopeCount(scope, ctx)).toBe(matched.length);
    }
  });

  it("puts the fixture where the plan says it goes", () => {
    const ids = (scope: TaskScopeRef) => queryScopeTasks(scope, ctx).map((entry) => entry.id).sort();
    expect(ids({ kind: "today" })).toEqual(["a", "b", "f"]);
    expect(ids({ kind: "upcoming" })).toEqual(["b", "c"]);
    expect(ids({ kind: "inbox" })).toEqual(["b"]);
    expect(ids({ kind: "list", id: "l1" })).toEqual(["a", "c", "f"]);
    expect(ids({ kind: "folder", id: "f1" })).toEqual(["a", "c", "f"]);
    expect(ids({ kind: "tag", id: "tag-work" })).toEqual(["c"]);
    expect(ids({ kind: "completed" })).toEqual(["d"]);
    expect(ids({ kind: "trash" })).toEqual(["e"]);
    expect(ids({ kind: "filter", id: "flt_1" })).toEqual([]);
  });
});

// §13.3's prediction, made concrete: `addSubtask` writes a child Task, so
// without this a subtask appears as a top-level row in its parent's List and
// is counted there. The plan refuses the self-reference for exactly this.
describe("a subtask is not a row in any Scope (§13.3)", () => {
  const parent = task({ id: "p", listId: "l1", dueDate: TODAY });
  const child = task({ id: "c", listId: "l1", dueDate: TODAY, parentTaskId: "p" });
  const ctx = context({ tasks: [parent, child] });

  it("keeps the child out of every Scope, and out of the count", () => {
    for (const scope of [
      { kind: "today" } as const,
      { kind: "upcoming" } as const,
      { kind: "list", id: "l1" } as const,
      { kind: "folder", id: "f1" } as const,
    ]) {
      expect(queryScopeTasks(scope, ctx).map((entry) => entry.id)).toEqual(["p"]);
      expect(queryScopeCount(scope, ctx)).toBe(1);
    }
  });

  it("keeps a deleted child out of Trash too, where it would also be a row", () => {
    const gone = task({ id: "c", parentTaskId: "p", deletedAt: NOW });
    expect(matchesScope(gone, { kind: "trash" }, ctx)).toBe(false);
  });
});
