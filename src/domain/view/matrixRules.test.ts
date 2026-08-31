// The four boxes, as rules (TICKTICK_MATRIX_DESIGN.md §23).
//
// The first describe is the one that matters most: it pins the machinery to
// the OLD behaviour. 6a shipped rules without a screen, and the whole claim of
// that phase is "nothing anyone sees changes" — which is only true if the
// default rules answer exactly what `quadrantOf` answers.
//
// What a rule can SAY is not asserted here; that is shared with the Board and
// lives in `viewRules.test.ts`. What is here is what the matrix does with one:
// four defaults, two presets, reading order, and the storage gate.
import { describe, expect, it } from "vitest";
import type { Task, TaskPriority, TaskStatus } from "../../types";
import { MATRIX_QUADRANTS, quadrantOf } from "../../utils/eisenhower";
import { normalizeAppSettings } from "../plannerData/normalize";
import {
  DEFAULT_MATRIX_RULES,
  TIME_AND_PRIORITY_MATRIX_RULES,
  quadrantForTask,
  resolveMatrixRules,
  sanitizeMatrixRules,
} from "./matrixRules";
import { EMPTY_RULE, draftForRule, matchesRule, patchForRule, rulesOverlap, type ViewRule } from "./viewRules";

const TODAY = "2026-08-28";
const YESTERDAY = "2026-08-27";
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
        matchesRule(subject, DEFAULT_MATRIX_RULES[quadrant], ctx),
      );
      expect(matched).toHaveLength(1);
    }
  });

  it("has no two boxes that can claim the same task", () => {
    for (const a of MATRIX_QUADRANTS) {
      for (const b of MATRIX_QUADRANTS) {
        if (a === b) continue;
        expect(rulesOverlap(DEFAULT_MATRIX_RULES[a], DEFAULT_MATRIX_RULES[b])).toBe(false);
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
});

describe("a box a finished task is in", () => {
  it("is the box its fields put it in, not one the tick moved it to", () => {
    // D2: a completed task keeps its box and lands in that box's 완료 group.
    const done = task({
      priority: "high",
      status: "completed" as TaskStatus,
      completedAt: "2026-08-27T00:00:00.000Z",
    });
    expect(quadrantForTask(done, DEFAULT_MATRIX_RULES, ctx)).toBe("I");
  });
});

describe("the time-and-priority preset", () => {
  it("writes both fields on a drop — because the rule says urgency is the date", () => {
    // The rule this app deleted in Phase 1, back as a choice. A drop DOES
    // write a date here, and that is a promise kept rather than the accident
    // §4.2 was written about (§20.7).
    const patch = patchForRule(
      task({ priority: "none", dueDate: NEXT_WEEK }),
      TIME_AND_PRIORITY_MATRIX_RULES.I,
      ctx,
    );
    expect(patch).toEqual({ priority: "high", dueDate: TODAY });
  });

  it("dates a task typed into a box that will not take an undated one", () => {
    expect(draftForRule(TIME_AND_PRIORITY_MATRIX_RULES.I, ctx)).toEqual({
      priority: "high",
      dueDate: TODAY,
    });
    // Ⅱ accepts "none", so nothing is invented.
    expect(draftForRule(TIME_AND_PRIORITY_MATRIX_RULES.II, ctx)).toEqual({ priority: "high" });
  });
});

describe("the four boxes, stored", () => {
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
