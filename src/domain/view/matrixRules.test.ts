// The rules a box is made of (TICKTICK_MATRIX_DESIGN.md §23).
//
// The first describe is the one that matters most: it pins the new machinery
// to the OLD behaviour. 6a ships rules without a screen, and the whole claim
// of that phase is "nothing anyone sees changes" — which is only true if the
// default rules answer exactly what `quadrantOf` answers.
import { describe, expect, it } from "vitest";
import type { Task, TaskPriority, TaskStatus } from "../../types";
import { MATRIX_QUADRANTS, quadrantOf } from "../../utils/eisenhower";
import { normalizeAppSettings } from "../plannerData/normalize";
import {
  DEFAULT_MATRIX_RULES,
  EMPTY_MATRIX_RULE,
  TIME_AND_PRIORITY_MATRIX_RULES,
  draftForRule,
  matchesMatrixRule,
  matrixRulesOverlap,
  patchForRule,
  quadrantForTask,
  resolveMatrixRules,
  sanitizeMatrixRule,
  sanitizeMatrixRules,
  type MatrixQuadrantRule,
} from "./matrixRules";

const TODAY = "2026-08-28";
const YESTERDAY = "2026-08-27";
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

function rule(overrides: Partial<MatrixQuadrantRule> = {}): MatrixQuadrantRule {
  return { ...EMPTY_MATRIX_RULE, ...overrides };
}

describe("the default rules are the rule this app already had", () => {
  const priorities: TaskPriority[] = ["high", "medium", "low", "none"];

  it("answers exactly what quadrantOf answers, for every priority", () => {
    // D1, restated as data. If this ever disagrees, 6a has changed a screen it
    // promised not to touch.
    for (const priority of priorities) {
      const subject = task({ priority });
      expect(quadrantForTask(subject, DEFAULT_MATRIX_RULES, ctx)).toBe(quadrantOf(subject));
    }
  });

  it("is total — every task lands in exactly one box", () => {
    for (const priority of priorities) {
      const subject = task({ priority, dueDate: NEXT_WEEK, tags: ["x"] });
      const matched = MATRIX_QUADRANTS.filter((quadrant) =>
        matchesMatrixRule(subject, DEFAULT_MATRIX_RULES[quadrant], ctx),
      );
      expect(matched).toHaveLength(1);
    }
  });

  it("has no two boxes that can claim the same task", () => {
    for (const a of MATRIX_QUADRANTS) {
      for (const b of MATRIX_QUADRANTS) {
        if (a === b) continue;
        expect(matrixRulesOverlap(DEFAULT_MATRIX_RULES[a], DEFAULT_MATRIX_RULES[b])).toBe(false);
      }
    }
  });

  it("ignores dates and lists, the way the hard-coded rule did", () => {
    const late = task({ priority: "medium", dueDate: YESTERDAY });
    // The reference's combination 2 would call this urgent. Combination 1 —
    // ours — reads the priority and nothing else (§20.1).
    expect(quadrantForTask(late, DEFAULT_MATRIX_RULES, ctx)).toBe("II");
  });
});

describe("a task that matches nothing", () => {
  it("is null rather than quietly filed somewhere", () => {
    // The one answer the old function could not give. A caller that ignores it
    // is a screen with a task on no screen (§23.3).
    const rules = { ...DEFAULT_MATRIX_RULES, IV: rule({ priorities: ["low"] }) };
    expect(quadrantForTask(task({ priority: "none" }), rules, ctx)).toBeNull();
  });

  it("happens the moment a date condition is narrowed", () => {
    const rules = {
      ...DEFAULT_MATRIX_RULES,
      I: rule({ priorities: ["high"], dateBuckets: ["overdue", "today"] }),
    };
    expect(quadrantForTask(task({ priority: "high", dueDate: TODAY }), rules, ctx)).toBe("I");
    expect(quadrantForTask(task({ priority: "high", dueDate: NEXT_WEEK }), rules, ctx)).toBeNull();
  });
});

describe("a task that matches two boxes", () => {
  it("goes to the first in reading order", () => {
    // Ⅰ wins on purpose: work wrongly raised to "do first" is seen and fixed,
    // work wrongly dropped into "later" is not (§23.4).
    const rules = {
      I: rule({ priorities: ["high", "medium"] }),
      II: rule({ priorities: ["medium"] }),
      III: rule({ priorities: ["low"] }),
      IV: rule({ priorities: ["none"] }),
    };
    expect(quadrantForTask(task({ priority: "medium" }), rules, ctx)).toBe("I");
  });

  it("is detected exactly, dimension by dimension", () => {
    const overlapping = matrixRulesOverlap(
      rule({ priorities: ["high"], dateBuckets: ["today"] }),
      rule({ priorities: ["high", "low"], dateBuckets: ["today", "later"] }),
    );
    expect(overlapping).toBe(true);

    // One dimension failing to intersect is enough to separate two boxes.
    const separate = matrixRulesOverlap(
      rule({ priorities: ["high"], dateBuckets: ["today"] }),
      rule({ priorities: ["high"], dateBuckets: ["later"] }),
    );
    expect(separate).toBe(false);
  });

  it("treats an empty dimension as 전체, which intersects everything", () => {
    expect(matrixRulesOverlap(EMPTY_MATRIX_RULE, rule({ priorities: ["low"] }))).toBe(true);
  });
});

describe("what a rule asks of a task", () => {
  it("takes any one of the named tags, not all of them", () => {
    const tagged = rule({ tagIds: ["work", "urgent"] });
    expect(matchesMatrixRule(task({ tags: ["work"] }), tagged, ctx)).toBe(true);
    expect(matchesMatrixRule(task({ tags: ["home"] }), tagged, ctx)).toBe(false);
  });

  it("reads the List the caller resolved, not the field on the task", () => {
    const scoped = rule({ listIds: ["list-school"] });
    expect(matchesMatrixRule(task(), scoped, { today: TODAY, listId: "list-school" })).toBe(true);
    expect(matchesMatrixRule(task(), scoped, ctx)).toBe(false);
  });

  it("does not ask whether the task is finished", () => {
    // D2: a completed task keeps its box and lands in that box's 완료 group.
    // A rule that moved it would make ticking a card relocate it.
    const done = task({ priority: "high", status: "completed" as TaskStatus, completedAt: "2026-08-27T00:00:00.000Z" });
    expect(quadrantForTask(done, DEFAULT_MATRIX_RULES, ctx)).toBe("I");
  });
});

describe("dropping a card on a box", () => {
  it("writes nothing when the task already belongs there", () => {
    // The contract patchForQuadrant has always had: an empty patch is what
    // stops a no-op drop touching updatedAt.
    expect(patchForRule(task({ priority: "high" }), DEFAULT_MATRIX_RULES.I, ctx)).toEqual({});
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

  it("under the time-and-priority preset, writes both fields at once", () => {
    // The rule this app deleted in Phase 1, back as a choice. A drop DOES
    // write a date here — because the person chose a rule that says urgency
    // is the date (§20.7).
    const patch = patchForRule(
      task({ priority: "none", dueDate: NEXT_WEEK }),
      TIME_AND_PRIORITY_MATRIX_RULES.I,
      ctx,
    );
    expect(patch).toEqual({ priority: "high", dueDate: TODAY });
  });
});

describe("typing into a box", () => {
  it("gives the new task the box's priority and nothing else", () => {
    expect(draftForRule(DEFAULT_MATRIX_RULES.I, ctx)).toEqual({ priority: "high" });
  });

  it("does not invent a deadline for a box that accepts undated work", () => {
    expect(draftForRule(TIME_AND_PRIORITY_MATRIX_RULES.II, ctx)).toEqual({ priority: "high" });
  });

  it("dates it when the box will not take an undated task", () => {
    expect(draftForRule(TIME_AND_PRIORITY_MATRIX_RULES.I, ctx)).toEqual({
      priority: "high",
      dueDate: TODAY,
    });
  });

  it("files it where the box says — unlike a drop, there is no membership to lose", () => {
    const draft = draftForRule(rule({ listIds: ["list-work"], tagIds: ["urgent"] }), ctx);
    expect(draft).toEqual({ listId: "list-work", tags: ["urgent"] });
  });
});

describe("rules that came from somewhere else", () => {
  it("drops values this build does not know and keeps the ones it does", () => {
    const cleaned = sanitizeMatrixRule({
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
    expect(sanitizeMatrixRule({ listIds: ["list-deleted"] }).listIds).toEqual(["list-deleted"]);
  });

  it("stores nothing for boxes nobody has given rules", () => {
    expect(sanitizeMatrixRules({ I: { priorities: ["high"] } })).toEqual({
      I: { priorities: ["high"], dateBuckets: [], listIds: [], tagIds: [] },
    });
  });

  it("reads an untouched box as its default, not as 'no conditions'", () => {
    // An empty rule matches everything, so absence must NOT mean empty — Ⅰ
    // would swallow the account the moment one box was edited.
    const resolved = resolveMatrixRules({ I: rule({ priorities: ["high", "medium"] }) });

    expect(resolved.I.priorities).toEqual(["high", "medium"]);
    expect(resolved.II).toEqual(DEFAULT_MATRIX_RULES.II);
    expect(resolveMatrixRules()).toEqual(DEFAULT_MATRIX_RULES);
  });
});

describe("rules through the storage gate", () => {
  it("survives a round trip and comes back clean", () => {
    // The rules sync, so what a settings record holds has to be what this
    // build can act on — the same gate `matrixQuadrantViews` passes through.
    const settings = normalizeAppSettings({
      matrixQuadrantRules: {
        I: { priorities: ["high", "bogus"], dateBuckets: ["today"] },
      },
    } as never);

    expect(settings.matrixQuadrantRules).toEqual({
      I: { priorities: ["high"], dateBuckets: ["today"], listIds: [], tagIds: [] },
    });
  });

  it("stores nothing for an account that never opened the editor", () => {
    // Absent, not four default rules written out: a preference nobody
    // expressed is not a preference.
    expect(normalizeAppSettings({}).matrixQuadrantRules).toBeUndefined();
  });
});
