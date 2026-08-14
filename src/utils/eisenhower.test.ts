import { describe, expect, it } from "vitest";
import type { Task, TaskPriority, TaskStatus } from "../types";
import { getMatrixPosition, isMatrixImportant, isMatrixUrgent, patchForQuadrant } from "./eisenhower";

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
    scheduledDate: "",
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

  it("ignores scheduledDate — planning a day is not a deadline", () => {
    expect(isMatrixUrgent(task({ scheduledDate: TODAY }), TODAY)).toBe(false);
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

  it("pins a de-urgentised task to today so it cannot vanish from Today", () => {
    // Clearing the deadline is what moves it out of the urgent column, but the
    // deadline may have been its only tie to the Today list.
    const patch = patchForQuadrant(task({ priority: "high", dueDate: TODAY }), "II", TODAY);
    expect(patch.dueDate).toBe("");
    expect(patch.scheduledDate).toBe(TODAY);
  });

  it("leaves an existing scheduled day alone when de-urgentising", () => {
    const patch = patchForQuadrant(
      task({ priority: "high", dueDate: TODAY, scheduledDate: TOMORROW }),
      "II",
      TODAY,
    );
    expect(patch.scheduledDate).toBeUndefined();
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
