import { describe, expect, it } from "vitest";
import type { List, ListSection, Task, TaskDailyPlan, TaskTag } from "../../types";
import type { TaskScopeRef } from "./scopeRegistry";
import { matchesScope, type ScopeContext } from "./scopeQuery";
import {
  applyPatch,
  completeTask,
  leavesScope,
  moveTaskToList,
  moveTaskToSection,
  reopenTask,
  restoreTask,
  setTaskDueDate,
  setTaskSomeday,
  trashTask,
} from "./mutations";
import { taskTagIdFor } from "../tags/tags";

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
const projectList: List = {
  id: "l1",
  projectId: "p1",
  name: "List",
  order: 0,
  isDefault: true,
  createdAt: NOW,
  updatedAt: NOW,
};

function context(overrides: Partial<ScopeContext> = {}): ScopeContext {
  return { tasks: [], lists: [inboxList, projectList], dailyPlans: [], taskTags: [], today: TODAY, ...overrides };
}

// §9.35: Undo restores a state. The inverse of "complete" in general is not
// "set to todo" — it is "set back to what THIS task was".
describe("every mutation carries the way back", () => {
  it("reopens to the status the task actually had", () => {
    const waiting = task({ status: "waiting" });
    const done = applyPatch(waiting, completeTask(waiting, NOW).patch);
    expect(done.status).toBe("done");
    expect(applyPatch(done, completeTask(waiting, NOW).undo).status).toBe("waiting");
  });

  it("writes both halves of completion, which are stored twice", () => {
    const result = completeTask(task(), NOW);
    expect(result.patch).toEqual({ status: "done", completedAt: NOW });
    expect(result.undo).toEqual({ status: "todo", completedAt: "" });
  });

  it("reopening prefers the status the store remembered", () => {
    const done = task({ status: "done", previousStatus: "doing", completedAt: NOW });
    expect(reopenTask(done).patch.status).toBe("doing");
    // A task whose remembered status was itself `done` falls back rather than
    // reopening into completion.
    expect(reopenTask(task({ status: "done", previousStatus: "done" })).patch.status).toBe("todo");
  });

  it("round-trips trash, dates and someday", () => {
    const original = task({ dueDate: "2026-08-20", isSomeday: true });
    for (const mutation of [
      trashTask(original, NOW),
      setTaskDueDate(original, "2026-09-01"),
      setTaskSomeday(original, false),
    ]) {
      const changed = applyPatch(original, mutation.patch);
      expect(applyPatch(changed, mutation.undo)).toEqual(original);
    }
  });

  it("restores out of the trash", () => {
    const gone = task({ deletedAt: NOW });
    expect(applyPatch(gone, restoreTask(gone).patch).deletedAt).toBe("");
  });
});

// §12.21's table. Each row is a mutation that takes a Task out of the Scope it
// was made in — which is what closes the Drawer and removes the row.
describe("leavesScope — §12.21", () => {
  // The plan lives in a record, not on the Task, so this row of §12.21 shows
  // up as the same Task read against a context that no longer holds it.
  it("Today: losing the plan, with no due date to fall back on", () => {
    const plans: TaskDailyPlan[] = [
      { id: `plan-${TODAY}-t1`, taskId: "t1", planDate: TODAY, createdAt: NOW, updatedAt: NOW },
    ];
    const planned = task({ listId: "l1" });
    expect(matchesScope(planned, { kind: "today" }, context({ dailyPlans: plans }))).toBe(true);
    expect(matchesScope(planned, { kind: "today" }, context())).toBe(false);
  });

  it("Today: keeps a task whose due date still says today", () => {
    const due = task({ listId: "l1", dueDate: TODAY });
    expect(matchesScope(due, { kind: "today" }, context())).toBe(true);
  });

  it("Inbox: moving to another List", () => {
    const inInbox = task({ listId: "list-inbox", projectId: "" });
    const moved = applyPatch(inInbox, { listId: "l1", projectId: "p1" });
    expect(leavesScope(inInbox, moved, { kind: "inbox" }, context())).toBe(true);
  });

  it("Tag: dropping the tag the screen is filtered by", () => {
    const links: TaskTag[] = [
      { id: taskTagIdFor("t1", "tag-work"), taskId: "t1", tagId: "tag-work", createdAt: NOW },
    ];
    const tagged = task({ listId: "l1", tags: ["Work"] });
    const scope: TaskScopeRef = { kind: "tag", id: "tag-work" };
    const untagged = applyPatch(tagged, { tags: [] });
    // The link is gone too — otherwise the record still answers for it.
    expect(leavesScope(tagged, untagged, scope, context({ taskTags: links }))).toBe(false);
    expect(leavesScope(tagged, untagged, scope, context())).toBe(true);
  });

  it("Completed: reopening", () => {
    const done = task({ listId: "l1", status: "done", completedAt: NOW });
    const open = applyPatch(done, reopenTask(done).patch);
    expect(leavesScope(done, open, { kind: "completed" }, context())).toBe(true);
    // And it lands somewhere active — §12.21 asks for the other Scopes to be
    // re-evaluated, not just the one it left.
    expect(leavesScope(done, open, { kind: "list", id: "l1" }, context())).toBe(false);
  });

  it("Trash: restoring", () => {
    const gone = task({ listId: "l1", deletedAt: NOW });
    const back = applyPatch(gone, restoreTask(gone).patch);
    expect(leavesScope(gone, back, { kind: "trash" }, context())).toBe(true);
  });

  // A row that was never showing cannot be removed, and pretending otherwise
  // is a list that flickers for no reason.
  it("says nothing left when the Task was not there to begin with", () => {
    const elsewhere = task({ listId: "l1" });
    const trashed = applyPatch(elsewhere, trashTask(elsewhere, NOW).patch);
    expect(leavesScope(elsewhere, trashed, { kind: "inbox" }, context())).toBe(false);
  });
});


describe("moving between Lists and Sections", () => {
  const sectionOfL1: ListSection = { id: "s1", listId: "l1", name: "Doing", createdAt: NOW, updatedAt: NOW };
  const sectionOfL2: ListSection = { id: "s2", listId: "l2", name: "Doing", createdAt: NOW, updatedAt: NOW };
  const otherList: List = { id: "l2", projectId: "p1", name: "Other", order: 1, isDefault: false, createdAt: NOW, updatedAt: NOW };

  it("clears the Section when the Task changes List (§6.29)", () => {
    const moving = task({ listId: "l1", sectionId: "s1" });
    const mutation = moveTaskToList(moving, "l2", [sectionOfL1, sectionOfL2]);
    expect(mutation.patch).toEqual({ listId: "l2", sectionId: "" });
    expect(mutation.undo).toEqual({ listId: "l1", sectionId: "s1" });
  });

  it("keeps a Section the user chose IN the target List", () => {
    const moving = task({ listId: "l1", sectionId: "s1" });
    expect(moveTaskToList(moving, "l2", [sectionOfL1, sectionOfL2], "s2").patch).toEqual({
      listId: "l2",
      sectionId: "s2",
    });
  });

  it("refuses a Section that is not in the target List", () => {
    const moving = task({ listId: "l1", sectionId: "" });
    expect(moveTaskToList(moving, "l2", [sectionOfL1, sectionOfL2], "s1").patch).toEqual({
      listId: "l2",
      sectionId: "",
    });
  });

  it("moves between columns of the Task's own List", () => {
    const moving = task({ listId: "l1" });
    const mutation = moveTaskToSection(moving, "s1", [projectList, otherList], [sectionOfL1]);
    expect(mutation?.patch).toEqual({ sectionId: "s1" });
    expect(mutation?.undo).toEqual({ sectionId: undefined });
  });

  it("answers null rather than silently defaulting when the column is another List's (§6.28)", () => {
    const moving = task({ listId: "l1", sectionId: "s1" });
    expect(moveTaskToSection(moving, "s2", [projectList, otherList], [sectionOfL1, sectionOfL2])).toBeNull();
  });

  it("always allows the default column", () => {
    const moving = task({ listId: "l1", sectionId: "s1" });
    expect(moveTaskToSection(moving, "", [projectList, otherList], [sectionOfL1])?.patch).toEqual({ sectionId: "" });
  });
});
