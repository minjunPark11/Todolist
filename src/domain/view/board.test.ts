import { describe, expect, it } from "vitest";
import type { Task } from "../../types";
import { patchForSpanDrag, patchForTrayDrop } from "./board";
import { timelineWindow } from "./timeline";

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

// TIMELINE_ARRANGE_TASKS_DESIGN.md §3.2, §3.3 (phase 2). What a chip from
// `Arrange tasks`, dropped on a column, means as a change to the record.
describe("patchForTrayDrop", () => {
  // A Wednesday, so the week window starts on the Sunday before it and the
  // difference between "the column" and "its first day" is visible.
  const week = timelineWindow("week", "2026-09-02");

  it("writes the deadline and nothing else", () => {
    // `startDate` is a declaration; dropping a chip on a day declares one day.
    expect(patchForTrayDrop(task(), week, 0)).toEqual({ dueDate: week.edges[0] });
  });

  it("uses the column's first day at a zoom where a column is not a day", () => {
    const month = timelineWindow("month", "2026-09-02");
    const patch = patchForTrayDrop(task(), month, 1);

    expect(patch.dueDate).toBe(month.edges[1]);
    // The same rule `columnLabel` reads: a column is identified by where it
    // begins, not by the day the pointer happened to be over.
    expect(patch.dueDate?.slice(8)).toBe("01");
  });

  it("writes nothing when the drop lands where the Task already is", () => {
    // Not a no-op for its own sake: an empty patch still costs an `updatedAt`
    // and a row on the wire, which is why the resize branches guard too.
    expect(patchForTrayDrop(task({ dueDate: week.edges[2] }), week, 2)).toEqual({});
  });

  it("writes nothing for a column past the end of the window", () => {
    expect(patchForTrayDrop(task(), week, 99)).toEqual({});
  });

  // The start stays derived. `spanForItem` makes a one-day bar out of a lone
  // deadline, and `patchForSpanDrag`'s move branch already refuses to freeze
  // an inferred start into the record — this must not do it either.
  it("leaves an absent start absent", () => {
    expect(patchForTrayDrop(task(), week, 3)).not.toHaveProperty("startDate");
  });
});
