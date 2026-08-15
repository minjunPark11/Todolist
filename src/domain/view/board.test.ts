import { describe, expect, it } from "vitest";
import type { Status, Task } from "../../types";
import { DEFAULT_STATUSES } from "../spaces/hierarchy";
import { getMatrixPosition } from "../../utils/eisenhower";
import { isDroppableAxis, patchForColumn, patchForSpanDrag, statusPatch } from "./board";

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
    scheduledDate: TODAY,
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

// A Space that invented two columns of its own, one of them a second `active`
// column — the case where a naive group->status mapping does damage.
const REVIEW: Status = { id: "col-review", label: "In Review", color: "#af52de", order: 6, group: "active" };
const SHIPPED: Status = { id: "col-shipped", label: "Shipped", color: "#34c759", order: 7, group: "done" };
const CUSTOM: Status[] = [...DEFAULT_STATUSES, REVIEW, SHIPPED];

describe("statusPatch", () => {
  it("writes the status a default column stands for", () => {
    expect(statusPatch(task({ status: "todo" }), "doing", DEFAULT_STATUSES)).toEqual({
      status: "doing",
      statusId: "",
    });
  });

  it("clears a stored statusId when moving back to a default column", () => {
    // Otherwise statusIdFor keeps answering with the custom column and the
    // card snaps straight back to where it was dragged from.
    const moved = task({ status: "todo", statusId: "col-review" });
    expect(statusPatch(moved, "done", CUSTOM)).toEqual({ status: "done", statusId: "" });
  });

  it("writes statusId for a column the Space invented", () => {
    expect(statusPatch(task({ status: "todo" }), "col-review", CUSTOM)).toEqual({ statusId: "col-review" });
  });

  it("does not demote a task moved between two columns of the same group", () => {
    // "doing" and "In Review" are both active; rewriting status here would
    // silently knock the task back to "todo".
    expect(statusPatch(task({ status: "doing" }), "col-review", CUSTOM)).toEqual({ statusId: "col-review" });
  });

  it("rewrites status when the column belongs to a different group", () => {
    expect(statusPatch(task({ status: "todo" }), "col-shipped", CUSTOM)).toEqual({
      statusId: "col-shipped",
      status: "done",
    });
  });

  it("returns nothing when the card is already in that column", () => {
    expect(statusPatch(task({ status: "doing" }), "doing", DEFAULT_STATUSES)).toEqual({});
    expect(statusPatch(task({ statusId: "col-review" }), "col-review", CUSTOM)).toEqual({});
  });

  it("ignores a column the Space does not have", () => {
    expect(statusPatch(task(), "col-ghost", DEFAULT_STATUSES)).toEqual({});
    expect(statusPatch(task(), "", DEFAULT_STATUSES)).toEqual({});
  });
});

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
    const inferred = task({ startDate: "", scheduledDate: "", dueDate: "2026-08-20" });
    const patch = patchForSpanDrag(inferred, { kind: "move", zoom: "day", steps: 3 });
    expect(patch).toEqual({ dueDate: "2026-08-23" });
    expect("startDate" in patch).toBe(false);
  });

  it("moves every date the record actually holds, together", () => {
    const spanned = task({ startDate: "2026-08-10", scheduledDate: "2026-08-12", dueDate: "2026-08-14" });
    expect(patchForSpanDrag(spanned, { kind: "move", zoom: "day", steps: 2 })).toEqual({
      startDate: "2026-08-12",
      scheduledDate: "2026-08-14",
      dueDate: "2026-08-16",
    });
  });

  it("moves by columns, not by days, at coarse zooms", () => {
    // One column right at month zoom is next month, whatever its length.
    const march = task({ startDate: "2026-03-03", scheduledDate: "", dueDate: "2026-03-20" });
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
    const undated = task({ startDate: "", scheduledDate: "", dueDate: "" });
    expect(patchForSpanDrag(undated, { kind: "move", zoom: "day", steps: 5 })).toEqual({});
  });
});

describe("patchForColumn", () => {
  const context = { today: TODAY, statuses: DEFAULT_STATUSES };

  it("lands a task in the quadrant it was dropped on", () => {
    // The rule is eisenhower.ts's; this only has to reach it. Proving the
    // result by re-deriving the quadrant catches a wrong delegation.
    const dragged = task({ priority: "none", dueDate: "" });
    const patch = patchForColumn("quadrant", dragged, "I", context);
    expect(getMatrixPosition({ ...dragged, ...patch }, TODAY).quadrant).toBe("I");
  });

  it("sets the priority a priority column stands for", () => {
    expect(patchForColumn("priority", task({ priority: "none" }), "high", context)).toEqual({ priority: "high" });
  });

  it("refuses axes with no inverse rather than inventing a value", () => {
    // A Today bucket or a due-date column would have to choose a date the user
    // never picked.
    expect(patchForColumn("bucket", task(), "now", context)).toEqual({});
    expect(patchForColumn("dueDate", task(), TODAY, context)).toEqual({});
    expect(patchForColumn("space", task(), "space-2", context)).toEqual({});
    expect(isDroppableAxis("bucket")).toBe(false);
    expect(isDroppableAxis("status")).toBe(true);
  });
});
