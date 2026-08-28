import { describe, expect, it } from "vitest";
import type { Task } from "../../types";
import { patchForSpanDrag } from "./board";

const TODAY = "2026-08-15";
const NOW = `${TODAY}T00:00:00.000Z`;

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Task",
    description: "",
    status: "todo",
    priority: "none",
    dueDate: "",
    startDate: "",
    startTime: "",
    endTime: "",
    projectId: "space-1",
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
    archivedAt: "",
    blockedByTaskId: "",
    repeatType: "none",
    repeatInterval: 1,
    repeatDays: [],
    repeatEndDate: "",
    ...overrides,
  };
}

// `statusPatch` and `patchForColumn` were tested here, across the status,
// quadrant and priority axes. All three went with the screens that drew board
// columns (Ch. 26 §26.3.3): the Matrix calls `patchForQuadrant` directly and a
// List's board groups by its Sections. What is left in this file is the one
// drag whose meaning still lives in board.ts.

describe("patchForSpanDrag", () => {
  it("writes the start when the left edge is dragged, even if it had none", () => {
    // Dragging the left handle IS the declaration `startDate` exists to hold.
    expect(patchForSpanDrag(task({ startDate: "" }), { kind: "resizeStart", date: "2026-08-10" })).toEqual({
      startDate: "2026-08-10",
    });
  });

  it("writes the deadline when the right edge is dragged", () => {
    expect(patchForSpanDrag(task({ dueDate: "" }), { kind: "resizeEnd", date: "2026-08-20" })).toEqual({
      dueDate: "2026-08-20",
    });
  });

  it("does NOT invent a start when a bar with an inferred start is moved", () => {
    // The whole point of D6. This bar's start came from its deadline; moving
    // it must not freeze that guess into the record as a user decision.
    const inferred = task({ startDate: "", dueDate: "2026-08-20" });
    const patch = patchForSpanDrag(inferred, { kind: "move", zoom: "day", steps: 3 });
    expect(patch).toEqual({ dueDate: "2026-08-23" });
    expect("startDate" in patch).toBe(false);
  });

  it("moves every date the record actually holds, together", () => {
    const spanned = task({ startDate: "2026-08-10", dueDate: "2026-08-14" });
    expect(patchForSpanDrag(spanned, { kind: "move", zoom: "day", steps: 2 })).toEqual({
      startDate: "2026-08-12",
      dueDate: "2026-08-16",
    });
  });

  it("moves by columns, not by days, at coarse zooms", () => {
    // One column right at month zoom is next month, whatever its length.
    const march = task({ startDate: "2026-03-03", dueDate: "2026-03-20" });
    expect(patchForSpanDrag(march, { kind: "move", zoom: "month", steps: 1 })).toEqual({
      startDate: "2026-04-03",
      dueDate: "2026-04-20",
    });
    expect(patchForSpanDrag(march, { kind: "move", zoom: "week", steps: 2 })).toEqual({
      startDate: "2026-03-17",
      dueDate: "2026-04-03",
    });
  });

  it("writes nothing when the drag changes nothing", () => {
    const t = task({ startDate: "2026-08-10", dueDate: "2026-08-14" });
    expect(patchForSpanDrag(t, { kind: "move", zoom: "day", steps: 0 })).toEqual({});
    expect(patchForSpanDrag(t, { kind: "resizeStart", date: "2026-08-10" })).toEqual({});
    expect(patchForSpanDrag(t, { kind: "resizeEnd", date: "2026-08-14" })).toEqual({});
    expect(patchForSpanDrag(t, { kind: "resizeStart", date: "" })).toEqual({});
  });

  it("leaves an undated task alone — it is not on the timeline to drag", () => {
    const undated = task({ startDate: "", dueDate: "" });
    expect(patchForSpanDrag(undated, { kind: "move", zoom: "day", steps: 5 })).toEqual({});
  });
});
