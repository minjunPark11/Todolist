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
