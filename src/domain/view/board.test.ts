import { describe, expect, it } from "vitest";
import type { Task } from "../../types";
import { dateMutation, patchForSpanDrag, patchForTrayDrop } from "./board";
import { dateAtColumnOffset, timelineWindow } from "./timeline";

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
    const patch = patchForSpanDrag(inferred, { kind: "move", days: 3 });
    expect(patch).toEqual({ dueDate: "2026-08-23" });
    expect("startDate" in patch).toBe(false);
  });

  it("moves every date the record actually holds, together", () => {
    const spanned = task({ startDate: "2026-08-10", dueDate: "2026-08-14" });
    expect(patchForSpanDrag(spanned, { kind: "move", days: 2 })).toEqual({
      startDate: "2026-08-12",
      dueDate: "2026-08-16",
    });
  });

  // §13. A move is DAYS now, and the zoom is gone from it entirely. It used
  // to be a column delta, so the smallest move at the default zoom was a whole
  // week — the view reads the day under the pointer and hands the distance
  // down, and a day is a day wherever it was measured.
  it("moves by days, and by the same days at every zoom", () => {
    const march = task({ startDate: "2026-03-03", dueDate: "2026-03-20" });

    // One day is a possible move now. It was not: no column was ever a day
    // except at the shortest window.
    expect(patchForSpanDrag(march, { kind: "move", days: 1 })).toEqual({
      startDate: "2026-03-04",
      dueDate: "2026-03-21",
    });

    // And a distance that crosses a month keeps the span's length rather than
    // landing on the same day-of-month.
    expect(patchForSpanDrag(march, { kind: "move", days: 31 })).toEqual({
      startDate: "2026-04-03",
      dueDate: "2026-04-20",
    });
  });

  // Backwards too — the pointer can travel either way.
  it("moves backwards on a negative distance", () => {
    expect(
      patchForSpanDrag(task({ startDate: "2026-03-03", dueDate: "2026-03-20" }), {
        kind: "move",
        days: -2,
      }),
    ).toEqual({ startDate: "2026-03-01", dueDate: "2026-03-18" });
  });

  it("writes nothing when the drag changes nothing", () => {
    const t = task({ startDate: "2026-08-10", dueDate: "2026-08-14" });
    expect(patchForSpanDrag(t, { kind: "move", days: 0 })).toEqual({});
    expect(patchForSpanDrag(t, { kind: "resizeStart", date: "2026-08-10" })).toEqual({});
    expect(patchForSpanDrag(t, { kind: "resizeEnd", date: "2026-08-14" })).toEqual({});
    expect(patchForSpanDrag(t, { kind: "resizeStart", date: "" })).toEqual({});
  });

  it("leaves an undated task alone — it is not on the timeline to drag", () => {
    const undated = task({ startDate: "", dueDate: "" });
    expect(patchForSpanDrag(undated, { kind: "move", days: 5 })).toEqual({});
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
    expect(patchForTrayDrop(task(), "2026-09-04")).toEqual({ dueDate: "2026-09-04" });
  });

  // §13: the day comes from the pointer, so this rule no longer decides what
  // a column means — `dateAtColumnOffset` does, and it is tested where it
  // lives. What is left here is that whatever day arrives is what gets written.
  it("writes whatever day the pointer named, mid-column included", () => {
    const weeks = timelineWindow("month", "2026-09-02");
    // The Wednesday inside a week column, not the Sunday it starts on.
    const midWeek = dateAtColumnOffset(weeks, 1, 0.5);
    expect(midWeek).not.toBe(weeks.edges[1]);
    expect(patchForTrayDrop(task(), midWeek)).toEqual({ dueDate: midWeek });
  });

  it("writes nothing when the drop lands where the Task already is", () => {
    // Not a no-op for its own sake: an empty patch still costs an `updatedAt`
    // and a row on the wire, which is why the resize branches guard too.
    expect(patchForTrayDrop(task({ dueDate: "2026-09-04" }), "2026-09-04")).toEqual({});
  });

  it("writes nothing when the pointer named no day at all", () => {
    // A drop outside the track, which the view reports as an empty date.
    expect(patchForTrayDrop(task(), "")).toEqual({});
  });

  // The start stays derived. `spanForItem` makes a one-day bar out of a lone
  // deadline, and `patchForSpanDrag`'s move branch already refuses to freeze
  // an inferred start into the record — this must not do it either.
  it("leaves an absent start absent", () => {
    expect(patchForTrayDrop(task(), "2026-09-10")).not.toHaveProperty("startDate");
  });
});

// §3.4 (phase 4). The timeline's two drags used to write straight through and
// could not be taken back.
describe("dateMutation", () => {
  const week = timelineWindow("week", "2026-09-02");

  it("carries the field's previous value back", () => {
    const before = task({ dueDate: "2026-08-01" });
    const mutation = dateMutation(before, patchForTrayDrop(before, "2026-09-14"));

    expect(mutation?.patch).toEqual({ dueDate: "2026-09-14" });
    expect(mutation?.undo).toEqual({ dueDate: "2026-08-01" });
    expect(mutation?.labelKey).toBe("tasks.undoDateChanged");
  });

  // §9.35: the undo is the state, not the reverse verb. Undoing a drop has to
  // put the Task back among the dateless, which means writing the empty string
  // the field actually held.
  it("puts a Task that had no deadline back without one", () => {
    const before = task();
    expect(dateMutation(before, patchForTrayDrop(before, "2026-09-07"))?.undo).toEqual({ dueDate: "" });
  });

  // Moving a bar writes both fields, so both have to come back.
  it("carries every field the patch touches, and no others", () => {
    const before = task({ startDate: "2026-08-10", dueDate: "2026-08-12" });
    const mutation = dateMutation(before, patchForSpanDrag(before, { kind: "move", days: 3 }));

    expect(Object.keys(mutation?.patch ?? {}).sort()).toEqual(["dueDate", "startDate"]);
    expect(mutation?.undo).toEqual({ startDate: "2026-08-10", dueDate: "2026-08-12" });
  });

  // A toast offering to undo nothing is worse than no toast.
  it("is null for a drag that changed nothing", () => {
    const before = task({ dueDate: "2026-09-14" });
    expect(dateMutation(before, patchForTrayDrop(before, "2026-09-14"))).toBeNull();
    expect(dateMutation(before, patchForSpanDrag(before, { kind: "move", days: 0 }))).toBeNull();
  });
});
