// What a drag on a timeline bar MEANS as a change to the record.
//
// This file used to answer that for board COLUMNS too, across three axes —
// status, quadrant and priority. All three went with the screens that drew
// them: the Matrix asks `patchForQuadrant` directly, and a List's board
// groups by its Sections through `domain/tasks/board.ts`, which is a
// different file with a different question. What is left is the one drag
// whose meaning still lives here.
import type { Task } from "../../types";
import { addDays, addMonths } from "../../utils/date";
import { columnStartDate, type TimelineWindow } from "./timeline";
import type { TaskMutation } from "../tasks/mutations";
import type { TimelineZoom } from "./timeline";

/**
 * `move` is expressed in COLUMNS, not days, because a column is a month at
 * month zoom. Dragging a March bar one column right means April, and a
 * day-count delta would land it on the 31st of the wrong month.
 */
export type SpanDrag =
  | { kind: "move"; zoom: TimelineZoom; steps: number }
  | { kind: "resizeStart"; date: string }
  | { kind: "resizeEnd"; date: string };

function shiftDate(date: string, zoom: TimelineZoom, steps: number): string {
  if (!date) return date;
  if (zoom === "day") return addDays(date, steps);
  if (zoom === "week") return addDays(date, steps * 7);
  if (zoom === "month") return addMonths(date, steps);
  return addMonths(date, steps * 12);
}

/**
 * What dragging a bar means as a change to the record.
 *
 * Resizing an edge WRITES the field that edge is read from, including when it
 * was empty — dragging the left handle to a date is the user saying "it starts
 * here", which is exactly the declaration `startDate` exists to hold.
 *
 * Moving the whole bar shifts ONLY the dates already stored. A bar whose start
 * was inferred (`spanForItem` fell back to the deadline) must not gain a
 * `startDate` from being dragged: that date is one the user never chose, and
 * writing it would freeze an inference into the record as if they had. The
 * start keeps being derived, and moves because the stored dates moved.
 */
/**
 * A date patch as something that can be taken back
 * (TIMELINE_ARRANGE_TASKS_DESIGN.md §3.4, phase 4).
 *
 * Both timeline drags produced a bare patch and went out through
 * `planner.updateTask`, so neither could be undone — while the row menu one
 * screen over says of itself that "everything on it goes through `mutate`,
 * so everything on it can be undone". Dropping a chip is the change that
 * most wants taking back: it puts a date on work that had none, and the way
 * back is to know which field to empty.
 *
 * The undo is the PREVIOUS VALUE of exactly the fields the patch writes, not
 * the opposite verb (§9.35). That matters here because both fields are
 * optional: a Task that never had a start and one whose start was cleared
 * are different records, and putting back `""` where `undefined` was would
 * be a change of its own dressed as an undo.
 *
 * Null for an empty patch. The two rules below already refuse a drag that
 * lands where the bar was and a column past the end of the window; a
 * mutation for those would be a toast offering to undo nothing.
 */
export function dateMutation(task: Task, patch: Partial<Task>): TaskMutation | null {
  const keys = Object.keys(patch) as Array<"startDate" | "dueDate">;
  if (keys.length === 0) return null;

  const undo: Partial<Task> = {};
  for (const key of keys) undo[key] = task[key];
  return { patch, undo, labelKey: "tasks.undoDateChanged" };
}

/**
 * What dropping a dateless Task on a column means as a change to the record
 * (TIMELINE_ARRANGE_TASKS_DESIGN.md §3.2, §3.3, phase 2).
 *
 * `Arrange tasks` holds exactly the Items `spanForItem` could not place. A
 * chip dropped on a column is one sentence — "this happens on that day" —
 * and the field that sentence writes is `dueDate`. `spanForItem` turns a lone
 * deadline into a one-day bar, so the chip leaves the panel and appears on
 * the grid in the same render.
 *
 * NOT `startDate` as well. A start is a DECLARATION — it is why
 * `resizeStart` writes that field even when it was empty — and someone who
 * dropped a chip on a day declared one day, not a beginning. The bar's start
 * stays inferred, which is the state `patchForSpanDrag`'s move branch already
 * refuses to freeze.
 *
 * The column's FIRST day, at every zoom. A week column is seven days and a
 * month column is a month, so "which day" needs a rule; `columnLabel` picked
 * the same one ("Day and week columns are both identified by their first
 * day") and two rules for one question is one too many.
 */
export function patchForTrayDrop(task: Task, window: TimelineWindow, columnIndex: number): Partial<Task> {
  const date = columnStartDate(window, columnIndex);
  // A column off the end of the window has no date, and a drop that lands
  // where the Task already is writes nothing — the same two guards the resize
  // branches keep, and for the same reason: an empty patch still costs an
  // `updatedAt` and a row on the wire.
  if (!date || date === task.dueDate) return {};
  return { dueDate: date };
}

export function patchForSpanDrag(task: Task, drag: SpanDrag): Partial<Task> {
  if (drag.kind === "resizeStart") {
    if (!drag.date || drag.date === task.startDate) return {};
    return { startDate: drag.date };
  }

  if (drag.kind === "resizeEnd") {
    if (!drag.date || drag.date === task.dueDate) return {};
    return { dueDate: drag.date };
  }

  if (drag.steps === 0) return {};
  const patch: Partial<Task> = {};
  // Only what is already there. An absent field stays absent.
  if (task.startDate) patch.startDate = shiftDate(task.startDate, drag.zoom, drag.steps);
  if (task.dueDate) patch.dueDate = shiftDate(task.dueDate, drag.zoom, drag.steps);
  return patch;
}
