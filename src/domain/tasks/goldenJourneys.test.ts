// The twelve P0 Golden Journeys (TickTick plan §16.21, Gate 11).
//
// §16.21 calls these the merge gate: "이 12개가 깨지면 MVP core experience가
// 깨진 것으로 본다". They are written here at the DOMAIN level — the same
// functions the screens call, in the order a user causes them — and that is a
// deliberate limit worth stating: this repository has no browser harness, so
// these check that the rules compose, not that a button is clickable. Each
// journey has also been walked in the running app, phase by phase, and those
// runs are recorded in TICKTICK_MIGRATION_PHASE0_AUDIT.md.
//
// Written against §12.4's matrix and §9.35's undo rule rather than against the
// implementation, so a refactor that changes how these are computed still has
// to keep what they mean.
import { describe, expect, it } from "vitest";
import type { List, ListSection, Task, TaskDailyPlan } from "../../types";
import { canonicalizeTaskUrl, parseTaskUrl, taskUrlFor } from "../../app/taskScopeUrl";
import { canCommit, resolveCreateContext } from "./createResolver";
import { matchesScope, queryScopeCount, queryScopeTasks, type ScopeContext } from "./scopeQuery";
import {
  applyPatch,
  completeTask,
  leavesScope,
  moveTaskToList,
  moveTaskToSection,
  reopenTask,
  restoreTask,
  trashTask,
} from "./mutations";
import { inboxBucketOf, moveToInboxBucket } from "./board";
import { responsiveModeFor, taskDetailPresentationFor } from "./responsive";
import { tagIdFor } from "../tags/tags";

const TODAY = "2026-08-18";
const NOW = `${TODAY}T09:00:00.000Z`;
const INBOX = "list-inbox";

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
  id: INBOX,
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
const doingSection: ListSection = { id: "sec1", listId: "l1", name: "Doing", createdAt: NOW, updatedAt: NOW };

function ctx(overrides: Partial<ScopeContext> = {}): ScopeContext {
  return { tasks: [], lists: [inboxList, workList], dailyPlans: [], taskTags: [], today: TODAY, ...overrides };
}

describe("G1 — app entry lands on Today, canonically", () => {
  it("sends the front door to /today and nowhere else", () => {
    expect(canonicalizeTaskUrl("/")).toBe("/today");
    expect(canonicalizeTaskUrl("/today?view=list")).toBe("/today");
    expect(parseTaskUrl("/today")).toEqual({ scope: { kind: "today" }, view: "list", taskId: "" });
  });

  it("renders the day the plan defines, not a status", () => {
    const overdue = task({ id: "a", listId: "l1", dueDate: "2026-08-01" });
    const dueToday = task({ id: "b", listId: "l1", dueDate: TODAY });
    const planned = task({ id: "c", listId: "l1" });
    const started = task({ id: "d", listId: "l1", status: "doing" });
    const plans: TaskDailyPlan[] = [
      { id: "p1", taskId: "c", planDate: TODAY, createdAt: NOW, updatedAt: NOW },
    ];
    const context = ctx({ tasks: [overdue, dueToday, planned, started], dailyPlans: plans });
    expect(queryScopeTasks({ kind: "today" }, context).map((item) => item.id)).toEqual(["a", "b", "c"]);
    // §12.5.1 is about the day. Having been started is not a date.
    expect(matchesScope(started, { kind: "today" }, context)).toBe(false);
  });
});

describe("G2 — capture goes to the Inbox", () => {
  it("resolves to the Inbox with nothing else decided for it", () => {
    const resolution = resolveCreateContext({ kind: "inbox" }, { inboxListId: INBOX, today: TODAY });
    expect(resolution.targetListId).toBe(INBOX);
    expect(resolution.patch).toEqual({});
    expect(canCommit(resolution)).toBe(true);
  });
});

describe("G3 — adding on Today files it in the Inbox and plans the day", () => {
  it("plans the day without inventing a deadline", () => {
    const resolution = resolveCreateContext({ kind: "today" }, { inboxListId: INBOX, today: TODAY });
    expect(resolution.targetListId).toBe(INBOX);
    expect(resolution.dailyPlan).toEqual({ planDate: TODAY });
    expect(resolution.patch.dueDate).toBeUndefined();

    // And the task it describes is then on Today, by the plan record alone.
    const made = task({ id: "new", listId: INBOX });
    const plans: TaskDailyPlan[] = [{ id: "p", taskId: "new", planDate: TODAY, createdAt: NOW, updatedAt: NOW }];
    expect(matchesScope(made, { kind: "today" }, ctx({ tasks: [made], dailyPlans: plans }))).toBe(true);
  });
});

describe("G4 — triage out of the Inbox, then undo", () => {
  it("moves the task, takes it out of the Inbox, and puts it back exactly", () => {
    const moving = task({ id: "t1", listId: INBOX });
    const context = ctx({ tasks: [moving] });
    expect(matchesScope(moving, { kind: "inbox" }, context)).toBe(true);

    const mutation = moveTaskToList(moving, "l1", []);
    const after = applyPatch(moving, mutation.patch);
    expect(after.listId).toBe("l1");
    expect(leavesScope(moving, after, { kind: "inbox" }, context)).toBe(true);
    expect(matchesScope(after, { kind: "list", id: "l1" }, ctx({ tasks: [after] }))).toBe(true);

    // §9.35: undo restores the state, not the reverse of the action.
    const undone = applyPatch(after, mutation.undo);
    expect(undone.listId).toBe(INBOX);
    expect(matchesScope(undone, { kind: "inbox" }, context)).toBe(true);
  });
});

describe("G5 — a List, its Sections and its Board", () => {
  it("creates into the List it was pressed in, then moves between columns", () => {
    const resolution = resolveCreateContext({ kind: "list", id: "l1" }, { inboxListId: INBOX, today: TODAY });
    expect(resolution.targetListId).toBe("l1");

    const made = task({ id: "t1", listId: "l1" });
    const mutation = moveTaskToSection(made, "sec1", [inboxList, workList], [doingSection]);
    expect(mutation?.patch).toEqual({ sectionId: "sec1" });
    // Gate 7: a List Board drag says nothing about dates.
    expect(mutation && "dueDate" in mutation.patch).toBe(false);
    // And a column belonging to another List is refused rather than defaulted.
    expect(moveTaskToSection(made, "elsewhere", [inboxList, workList], [doingSection])).toBeNull();
  });
});

describe("G6 — a task made under a Tag carries it", () => {
  it("lands in the Inbox and applies the Tag it was created under", () => {
    const tagId = tagIdFor("work");
    const resolution = resolveCreateContext({ kind: "tag", id: tagId }, { inboxListId: INBOX, today: TODAY });
    expect(resolution.targetListId).toBe(INBOX);
    expect(resolution.applyTagIds).toEqual([tagId]);
    // The id is not written into `Task.tags`, which holds names (§12.16).
    expect(resolution.patch.tags).toBeUndefined();

    const made = task({ id: "t1", listId: INBOX, tags: ["work"] });
    expect(matchesScope(made, { kind: "tag", id: tagId }, ctx({ tasks: [made] }))).toBe(true);
  });
});

describe("G7 — the Drawer is in the URL, so reload and Back both work", () => {
  it("survives the round trip and closes by removing one query key", () => {
    const open = taskUrlFor({ scope: { kind: "list", id: "l1" }, view: "list", taskId: "t1" });
    expect(open).toBe("/list/l1?task=t1");
    // A reload is a parse of the same string.
    expect(parseTaskUrl(open)).toEqual({ scope: { kind: "list", id: "l1" }, view: "list", taskId: "t1" });
    // Back is the URL without the Task — the Scope behind it is unchanged.
    const closed = taskUrlFor({ scope: { kind: "list", id: "l1" }, view: "list", taskId: "" });
    expect(closed).toBe("/list/l1");
    expect(canonicalizeTaskUrl(open)).toBe(open);
  });
});

describe("G8 — complete, find it in Completed, reopen", () => {
  it("moves between the two Scopes and comes back to the status it had", () => {
    const doing = task({ id: "t1", listId: "l1", status: "doing", dueDate: TODAY });
    const context = ctx({ tasks: [doing] });

    const done = applyPatch(doing, completeTask(doing, NOW).patch);
    expect(leavesScope(doing, done, { kind: "today" }, context)).toBe(true);
    expect(matchesScope(done, { kind: "completed" }, ctx({ tasks: [done] }))).toBe(true);
    expect(queryScopeCount({ kind: "completed" }, ctx({ tasks: [done] }))).toBe(1);

    // `previousStatus` is what makes reopen exact rather than "todo".
    const reopened = applyPatch({ ...done, previousStatus: "doing" }, reopenTask({ ...done, previousStatus: "doing" }).patch);
    expect(reopened.status).toBe("doing");
    expect(reopened.completedAt).toBe("");
    expect(matchesScope(reopened, { kind: "today" }, ctx({ tasks: [reopened] }))).toBe(true);
  });
});

describe("G9 — trash and restore", () => {
  it("is soft in both directions, and leaves no third state behind", () => {
    const alive = task({ id: "t1", listId: "l1", dueDate: TODAY });
    const context = ctx({ tasks: [alive] });

    const trashed = applyPatch(alive, trashTask(alive, NOW).patch);
    expect(matchesScope(trashed, { kind: "trash" }, ctx({ tasks: [trashed] }))).toBe(true);
    expect(leavesScope(alive, trashed, { kind: "today" }, context)).toBe(true);

    const restored = applyPatch(trashed, restoreTask(trashed).patch);
    expect(matchesScope(restored, { kind: "today" }, ctx({ tasks: [restored] }))).toBe(true);
    expect(matchesScope(restored, { kind: "trash" }, ctx({ tasks: [restored] }))).toBe(false);
  });
});

describe("G10 — a failed write rolls back to exactly what was there", () => {
  it("restores the prior state from the undo patch, absent fields included", () => {
    // The field is optional, so "never deleted" and "deleted then emptied" are
    // different values — §9.35 asks for the state, not something like it.
    const before = task({ id: "t1", listId: "l1" });
    const mutation = trashTask(before, NOW);
    const optimistic = applyPatch(before, mutation.patch);
    expect(optimistic.deletedAt).toBe(NOW);

    const rolledBack = applyPatch(optimistic, mutation.undo);
    expect(rolledBack.deletedAt).toBeUndefined();
    expect(rolledBack).toEqual(before);
  });

  it("rolls a Board move back to both of the fields it changed", () => {
    const before = task({ id: "t1", listId: INBOX, dueDate: "2026-08-20" });
    const mutation = moveToInboxBucket(before, "someday");
    const optimistic = applyPatch(before, mutation!.patch);
    expect(inboxBucketOf(optimistic)).toBe("someday");
    expect(applyPatch(optimistic, mutation!.undo)).toEqual(before);
  });
});

describe("G11 — resizing with the Drawer open changes nothing but the drawing", () => {
  it("keeps Scope, view and open Task identical at every width", () => {
    const url = "/list/l1?view=board&task=t1";
    const state = parseTaskUrl(url)!;
    for (const width of [1440, 900, 390]) {
      // The presentation differs...
      expect(taskDetailPresentationFor(responsiveModeFor(width))).toBeTruthy();
      // ...and nothing else does.
      expect(parseTaskUrl(url)).toEqual(state);
      expect(taskUrlFor(state)).toBe(url);
    }
    expect(new Set([1440, 900, 390].map((w) => taskDetailPresentationFor(responsiveModeFor(w)))).size).toBe(3);
  });
});

describe("G12 — creating on a phone lands where it lands on a desktop", () => {
  it("resolves identically, because the resolver cannot see the viewport", () => {
    for (const scope of [{ kind: "today" }, { kind: "inbox" }, { kind: "list", id: "l1" }] as const) {
      const desktop = resolveCreateContext(scope, { inboxListId: INBOX, today: TODAY });
      const phone = resolveCreateContext(scope, { inboxListId: INBOX, today: TODAY });
      expect(phone).toEqual(desktop);
    }
  });
});
