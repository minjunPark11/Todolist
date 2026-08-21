import { describe, expect, it } from "vitest";
import type { Task, TaskPriority, TaskStatus } from "../types";
import {
  MATRIX_QUADRANTS,
  draftForQuadrant,
  getMatrixPosition,
  isMatrixImportant,
  isMatrixUrgent,
  patchForQuadrant,
} from "./eisenhower";

const TODAY = "2026-08-14";
const YESTERDAY = "2026-08-13";
const TOMORROW = "2026-08-15";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "A task",
    status: "todo" as TaskStatus,
    priority: "none" as TaskPriority,
    dueDate: "",
    projectId: "",
    tags: [],
    notes: "",
    ...overrides,
  } as Task;
}

describe("isMatrixImportant", () => {
  // The heart of PLANNING_PRIORITY_DESIGN D2: a judgement the user made must
  // not be reported back to them as "not judged yet".
  it("counts high and medium, but not low or none", () => {
    expect(isMatrixImportant({ priority: "high" })).toBe(true);
    expect(isMatrixImportant({ priority: "medium" })).toBe(true);
    expect(isMatrixImportant({ priority: "low" })).toBe(false);
    expect(isMatrixImportant({ priority: "none" })).toBe(false);
  });
});

describe("isMatrixUrgent", () => {
  it("is due today or overdue, and nothing else", () => {
    expect(isMatrixUrgent({ dueDate: TODAY }, TODAY)).toBe(true);
    expect(isMatrixUrgent({ dueDate: YESTERDAY }, TODAY)).toBe(true);
    expect(isMatrixUrgent({ dueDate: TOMORROW }, TODAY)).toBe(false);
    expect(isMatrixUrgent({ dueDate: "" }, TODAY)).toBe(false);
  });

  // The work day was a second date, excluded from urgency. It folded into
  // `dueDate` (SCHEDULE_EDITOR_PHASE0_AUDIT.md §7 Phase 11), so a task planned
  // for today IS urgent now — there is no longer a way to say "today, but not
  // due today".
  it("treats a range that is already running as urgent from its end date", () => {
    expect(isMatrixUrgent(task({ startDate: "2026-08-10", dueDate: TOMORROW }), TODAY)).toBe(false);
    expect(isMatrixUrgent(task({ startDate: "2026-08-10", dueDate: TODAY }), TODAY)).toBe(true);
  });
});

describe("getMatrixPosition", () => {
  it("places each importance/urgency combination", () => {
    expect(getMatrixPosition(task({ priority: "high", dueDate: TODAY }), TODAY).quadrant).toBe("I");
    expect(getMatrixPosition(task({ priority: "high" }), TODAY).quadrant).toBe("II");
    expect(getMatrixPosition(task({ priority: "medium" }), TODAY).quadrant).toBe("II");
    expect(getMatrixPosition(task({ priority: "low", dueDate: TODAY }), TODAY).quadrant).toBe("III");
  });

  it("keeps an untouched task in the unjudged group — that is what none means", () => {
    expect(getMatrixPosition(task(), TODAY)).toEqual({ quadrant: "IV", group: "unclassified" });
  });

  // D3: "low" is a verdict the user reached, "none" is the absence of one.
  it("separates a task judged unimportant from one never judged", () => {
    expect(getMatrixPosition(task({ priority: "low" }), TODAY)).toEqual({ quadrant: "IV", group: "neither" });
  });

  it("parks finished and waiting work in IV whatever its fields say", () => {
    const urgentAndImportant = { priority: "high" as TaskPriority, dueDate: TODAY };
    expect(getMatrixPosition(task({ ...urgentAndImportant, status: "done" }), TODAY)).toEqual({
      quadrant: "IV",
      group: "completed",
    });
    expect(getMatrixPosition(task({ ...urgentAndImportant, status: "waiting" }), TODAY)).toEqual({
      quadrant: "IV",
      group: "onHold",
    });
  });
});

describe("patchForQuadrant", () => {
  it("makes a task important when it moves into I or II", () => {
    expect(patchForQuadrant(task(), "II", TODAY).priority).toBe("high");
    expect(patchForQuadrant(task(), "I", TODAY).dueDate).toBe(TODAY);
  });

  // D4: with medium counting as important, demoting to medium would leave the
  // card exactly where it was — a drag that appears to do nothing.
  it("demotes a medium task out of the important quadrants, not back into them", () => {
    const medium = task({ priority: "medium" });
    const patch = patchForQuadrant(medium, "IV", TODAY);
    expect(patch.priority).toBe("low");
    expect(getMatrixPosition({ ...medium, ...patch }, TODAY).quadrant).toBe("IV");
  });

  it("demotes a high task out of the important quadrants", () => {
    const high = task({ priority: "high" });
    const patch = patchForQuadrant(high, "IV", TODAY);
    expect(getMatrixPosition({ ...high, ...patch }, TODAY).quadrant).toBe("IV");
  });

  it("keeps an unimportant task unimportant when it moves to III", () => {
    expect(patchForQuadrant(task({ priority: "none" }), "III", TODAY).priority).toBeUndefined();
  });

  it("reactivates parked work that leaves IV", () => {
    expect(patchForQuadrant(task({ status: "waiting" }), "II", TODAY).status).toBe("todo");
    expect(patchForQuadrant(task({ status: "inbox" }), "II", TODAY).status).toBe("todo");
    expect(patchForQuadrant(task({ status: "waiting" }), "IV", TODAY).status).toBeUndefined();
  });

  // WAS: the patch also pinned the task to today through the second date
  // field, so leaving the urgent column never dropped it off Today. With one
  // date that would put it straight back in the urgent column, so the date
  // simply goes — and the task leaves Today with it.
  it("clears the deadline when de-urgentising, and nothing else", () => {
    const patch = patchForQuadrant(task({ priority: "high", dueDate: TODAY }), "II", TODAY);
    expect(patch.dueDate).toBe("");
    expect(Object.keys(patch)).toEqual(["dueDate"]);
  });

  it("leaves a future deadline alone, since it was never urgent", () => {
    const patch = patchForQuadrant(task({ priority: "high", dueDate: TOMORROW }), "II", TODAY);
    expect(patch.dueDate).toBeUndefined();
  });

  // Every quadrant the UI offers must actually be reachable from every other:
  // a control that silently no-ops is worse than one that is not there.
  it("actually lands the task in the quadrant asked for", () => {
    const starts = [
      task({ priority: "none" }),
      task({ priority: "low" }),
      task({ priority: "medium" }),
      task({ priority: "high", dueDate: TODAY }),
    ];
    for (const start of starts) {
      for (const quadrant of ["I", "II", "III", "IV"] as const) {
        const next = { ...start, ...patchForQuadrant(start, quadrant, TODAY) };
        expect(getMatrixPosition(next, TODAY).quadrant).toBe(quadrant);
      }
    }
  });
});

// A task typed into a box on the matrix page (MatrixPage). Same requirement as
// the drag above, one step earlier: the box the user typed in is the box the
// card has to appear in, or the screen argues with itself the moment the task
// is saved.
describe("draftForQuadrant", () => {
  it("births the task in the quadrant it was typed into", () => {
    for (const quadrant of MATRIX_QUADRANTS) {
      const draft = draftForQuadrant(quadrant, TODAY);
      const born = task({ status: "todo", ...draft });
      expect(getMatrixPosition(born, TODAY).quadrant).toBe(quadrant);
    }
  });

  it("dates only the urgent halves, and judges rather than leaving unjudged", () => {
    expect(draftForQuadrant("I", TODAY)).toEqual({ priority: "high", dueDate: TODAY });
    expect(draftForQuadrant("II", TODAY)).toEqual({ priority: "high", dueDate: "" });
    expect(draftForQuadrant("III", TODAY)).toEqual({ priority: "low", dueDate: TODAY });
    // "low", not "none": choosing the box IS the judgement, and a task born
    // `none` reads back as one nobody has looked at yet.
    expect(draftForQuadrant("IV", TODAY)).toEqual({ priority: "low", dueDate: "" });
  });
});
