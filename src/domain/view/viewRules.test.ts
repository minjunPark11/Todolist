// What a rule can say, and what a drop may write (TICKTICK_MATRIX_DESIGN.md
// §23, TICKTICK_INBOX_COLUMNS_DESIGN.md §4.1).
//
// These are the properties two screens depend on, so they are asserted here
// with rules written by hand rather than through either screen's presets. A
// test that reached for `DEFAULT_MATRIX_RULES` to check what a drop writes
// would be asking the Matrix a question the Board has to trust the same answer
// to.
import { describe, expect, it } from "vitest";
import type { Task, TaskStatus } from "../../types";
import {
  EMPTY_RULE,
  draftForRule,
  matchesRule,
  patchForRule,
  rulesOverlap,
  sanitizeRule,
  type ViewRule,
} from "./viewRules";

const TODAY = "2026-08-28";
const TOMORROW = "2026-08-29";
const NEXT_WEEK = "2026-09-04";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "A task",
    status: "todo" as TaskStatus,
    priority: "none",
    dueDate: "",
    tags: [],
    notes: "",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    completedAt: "",
    ...overrides,
  } as Task;
}

const ctx = { today: TODAY, listId: "list-inbox" };

function rule(overrides: Partial<ViewRule> = {}): ViewRule {
  return { ...EMPTY_RULE, ...overrides };
}

describe("what a rule asks of a task", () => {
  it("takes any one of the named tags, not all of them", () => {
    const tagged = rule({ tagIds: ["work", "urgent"] });
    expect(matchesRule(task({ tags: ["work"] }), tagged, ctx)).toBe(true);
    expect(matchesRule(task({ tags: ["home"] }), tagged, ctx)).toBe(false);
  });

  it("reads the List the caller resolved, not the field on the task", () => {
    const scoped = rule({ listIds: ["list-school"] });
    expect(matchesRule(task(), scoped, { today: TODAY, listId: "list-school" })).toBe(true);
    expect(matchesRule(task(), scoped, ctx)).toBe(false);
  });

  it("does not ask whether the task is finished", () => {
    // D2: a completed task keeps the box its fields put it in. A rule that
    // read `status` would make ticking a card relocate it.
    const done = task({
      priority: "high",
      status: "completed" as TaskStatus,
      completedAt: "2026-08-27T00:00:00.000Z",
    });
    expect(matchesRule(done, rule({ priorities: ["high"] }), ctx)).toBe(true);
  });

  it("treats an empty dimension as 전체", () => {
    expect(matchesRule(task({ priority: "low", tags: ["anything"] }), EMPTY_RULE, ctx)).toBe(true);
  });
});

describe("dropping a card on a box", () => {
  it("writes nothing when the task already belongs there", () => {
    // The contract patchForQuadrant has always had: an empty patch is what
    // stops a no-op drop touching updatedAt.
    expect(patchForRule(task({ priority: "high" }), rule({ priorities: ["high"] }), ctx)).toEqual({});
  });

  it("enters a box that takes two priorities as the stronger one", () => {
    const patch = patchForRule(task({ priority: "none" }), rule({ priorities: ["medium", "low"] }), ctx);
    expect(patch).toEqual({ priority: "medium" });
  });

  it("writes a date the box will accept, and leaves a date it already accepts alone", () => {
    const wantsSoon = rule({ dateBuckets: ["today", "tomorrow"] });
    expect(patchForRule(task({ dueDate: "" }), wantsSoon, ctx)).toEqual({ dueDate: TODAY });
    expect(patchForRule(task({ dueDate: TOMORROW }), wantsSoon, ctx)).toEqual({});
  });

  it("never erases a deadline to satisfy a box that wants undated work", () => {
    // §4.2's accident, which D1 was created to end. A box asking for "no date"
    // cannot be dropped on at all rather than deleting what the user chose.
    const undatedOnly = rule({ dateBuckets: ["none"] });
    expect(patchForRule(task({ dueDate: TOMORROW }), undatedOnly, ctx)).toBeNull();
    // A task that is already undated needs no write, so the drop is fine.
    expect(patchForRule(task({ dueDate: "" }), undatedOnly, ctx)).toEqual({});
  });

  it("refuses rather than moving a task between Lists", () => {
    // Dropping a card on a box cannot mean "file this under Work".
    expect(patchForRule(task(), rule({ listIds: ["list-work"] }), ctx)).toBeNull();
    expect(patchForRule(task(), rule({ listIds: ["list-inbox"] }), ctx)).toEqual({});
  });

  it("refuses rather than tagging a task", () => {
    expect(patchForRule(task({ tags: [] }), rule({ tagIds: ["work"] }), ctx)).toBeNull();
    expect(patchForRule(task({ tags: ["work"] }), rule({ tagIds: ["work"] }), ctx)).toEqual({});
  });

  it("writes both fields at once where the rule asks for both", () => {
    const patch = patchForRule(
      task({ priority: "none", dueDate: NEXT_WEEK }),
      rule({ priorities: ["high", "medium"], dateBuckets: ["overdue", "today", "tomorrow"] }),
      ctx,
    );
    expect(patch).toEqual({ priority: "high", dueDate: TODAY });
  });
});

describe("typing into a box", () => {
  it("gives the new task the box's priority and nothing else", () => {
    expect(draftForRule(rule({ priorities: ["high"] }), ctx)).toEqual({ priority: "high" });
  });

  it("does not invent a deadline for a box that accepts undated work", () => {
    const takesUndated = rule({ priorities: ["high"], dateBuckets: ["later", "none", "someday"] });
    expect(draftForRule(takesUndated, ctx)).toEqual({ priority: "high" });
  });

  it("dates it when the box will not take an undated task", () => {
    const wantsSoon = rule({ priorities: ["high"], dateBuckets: ["overdue", "today", "tomorrow"] });
    expect(draftForRule(wantsSoon, ctx)).toEqual({ priority: "high", dueDate: TODAY });
  });

  it("files it where the box says — unlike a drop, there is no membership to lose", () => {
    const draft = draftForRule(rule({ listIds: ["list-work"], tagIds: ["urgent"] }), ctx);
    expect(draft).toEqual({ listId: "list-work", tags: ["urgent"] });
  });
});

describe("when two boxes can claim the same task", () => {
  it("is detected exactly, dimension by dimension", () => {
    const overlapping = rulesOverlap(
      rule({ priorities: ["high"], dateBuckets: ["today"] }),
      rule({ priorities: ["high", "low"], dateBuckets: ["today", "later"] }),
    );
    expect(overlapping).toBe(true);

    // One dimension failing to intersect is enough to separate two boxes.
    const separate = rulesOverlap(
      rule({ priorities: ["high"], dateBuckets: ["today"] }),
      rule({ priorities: ["high"], dateBuckets: ["later"] }),
    );
    expect(separate).toBe(false);
  });

  it("treats an empty dimension as 전체, which intersects everything", () => {
    expect(rulesOverlap(EMPTY_RULE, rule({ priorities: ["low"] }))).toBe(true);
  });
});

describe("rules that came from somewhere else", () => {
  it("drops values this build does not know and keeps the ones it does", () => {
    const cleaned = sanitizeRule({
      priorities: ["high", "critical", 7],
      dateBuckets: ["today", "next-decade"],
      listIds: ["a", "a", "", "b"],
      tagIds: "not-an-array",
    });

    expect(cleaned).toEqual({
      priorities: ["high"],
      dateBuckets: ["today"],
      // Deduped, and the empty string is not an id.
      listIds: ["a", "b"],
      tagIds: [],
    });
  });

  it("keeps a List id it cannot resolve", () => {
    // This module has no List table. Deleting the condition would throw away
    // something another client can still resolve — the same choice
    // parseListColor makes for an unknown colour.
    expect(sanitizeRule({ listIds: ["list-deleted"] }).listIds).toEqual(["list-deleted"]);
  });
});
