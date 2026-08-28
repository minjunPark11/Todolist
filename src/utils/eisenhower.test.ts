import { describe, expect, it } from "vitest";
import type { Task, TaskPriority, TaskStatus } from "../types";
import {
  MATRIX_QUADRANTS,
  draftForQuadrant,
  getDraftMatrixQuadrant,
  patchForQuadrant,
  priorityForQuadrant,
  quadrantOf,
  type MatrixQuadrant,
} from "./eisenhower";

const TODAY = "2026-08-14";
const YESTERDAY = "2026-08-13";

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

describe("quadrantOf", () => {
  it("is the priority, one box each", () => {
    expect(quadrantOf(task({ priority: "high" }))).toBe("I");
    expect(quadrantOf(task({ priority: "medium" }))).toBe("II");
    expect(quadrantOf(task({ priority: "low" }))).toBe("III");
    expect(quadrantOf(task({ priority: "none" }))).toBe("IV");
  });

  it("ignores the due date entirely", () => {
    // The change D1 made. A deadline that has already passed used to drag a
    // task into an "urgent" box regardless of what the user thought of it;
    // now the user's judgement is the only thing the box reports.
    for (const dueDate of ["", TODAY, YESTERDAY, "2099-01-01"]) {
      expect(quadrantOf(task({ priority: "medium", dueDate }))).toBe("II");
    }
  });

  it("keeps a finished task in its own box", () => {
    // D2: completion is a question about a task, not a fifth quadrant. The
    // matrix groups finished work under "완료" INSIDE the box its priority
    // names — it does not sweep it into Ⅳ.
    expect(quadrantOf(task({ priority: "high", status: "completed" as TaskStatus }))).toBe("I");
    expect(quadrantOf(task({ priority: "low", status: "completed" as TaskStatus }))).toBe("III");
  });

  it("reads a priority it does not know as unjudged", () => {
    expect(quadrantOf({ priority: "urgent!!" as TaskPriority })).toBe("IV");
  });
});

describe("priorityForQuadrant", () => {
  it("is the exact inverse of quadrantOf", () => {
    for (const quadrant of MATRIX_QUADRANTS) {
      expect(quadrantOf({ priority: priorityForQuadrant(quadrant) })).toBe(quadrant);
    }
  });
});

describe("patchForQuadrant", () => {
  it("writes the priority the box names", () => {
    expect(patchForQuadrant(task({ priority: "none" }), "I")).toEqual({ priority: "high" });
    expect(patchForQuadrant(task({ priority: "high" }), "IV")).toEqual({ priority: "none" });
  });

  it("never touches a date", () => {
    // The bug D1 removes. Dragging a card out of an "urgent" box used to
    // CLEAR its due date, so one drag silently deleted a deadline the user
    // had chosen. There is no code path here that can write one.
    const dated = task({ priority: "high", dueDate: YESTERDAY, startDate: "2026-08-01" });
    for (const quadrant of MATRIX_QUADRANTS) {
      const patch = patchForQuadrant(dated, quadrant);
      expect(patch.dueDate).toBeUndefined();
      expect(patch.startDate).toBeUndefined();
    }
  });

  it("answers nothing for a card dropped where it already was", () => {
    // An empty patch is what stops a no-op drop touching `updatedAt` and
    // putting a row on the wire.
    expect(patchForQuadrant(task({ priority: "medium" }), "II")).toEqual({});
  });

  it("lands the card in the box it was dropped on", () => {
    for (const quadrant of MATRIX_QUADRANTS) {
      const next = { ...task({ priority: "none" }), ...patchForQuadrant(task({ priority: "none" }), quadrant) };
      expect(quadrantOf(next)).toBe(quadrant);
    }
  });
});

describe("draftForQuadrant", () => {
  it("is born in the box it was typed into", () => {
    for (const quadrant of MATRIX_QUADRANTS) {
      const born = task(draftForQuadrant(quadrant));
      expect(quadrantOf(born)).toBe(quadrant);
    }
  });

  it("sets a priority and nothing else", () => {
    // A task typed into Ⅰ must not acquire today's date as a side effect —
    // that would be the screen inventing a deadline nobody asked for.
    expect(draftForQuadrant("I")).toEqual({ priority: "high" });
    expect(Object.keys(draftForQuadrant("III"))).toEqual(["priority"]);
  });
});

describe("getDraftMatrixQuadrant", () => {
  it("previews where a half-written task would land", () => {
    expect(getDraftMatrixQuadrant({ priority: "medium" })).toBe("II");
  });

  it("reads a draft that has said nothing as unjudged", () => {
    expect(getDraftMatrixQuadrant({})).toBe("IV");
  });
});

describe("MATRIX_QUADRANTS", () => {
  it("is the four boxes in reading order", () => {
    expect(MATRIX_QUADRANTS).toEqual(["I", "II", "III", "IV"] satisfies MatrixQuadrant[]);
  });
});
