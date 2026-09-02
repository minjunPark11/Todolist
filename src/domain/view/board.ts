// What a drag on a timeline bar MEANS as a change to the record.
//
// This file used to answer that for board COLUMNS too, across three axes —
// status, quadrant and priority. All three went with the screens that drew
// them: the Matrix asks `patchForQuadrant` directly, and a List's board
// groups by its Sections through `domain/tasks/board.ts`, which is a
// different file with a different question. What is left is the one drag
// whose meaning still lives here.
import type { Task } from "../../types";
import { addDays } from "../../utils/date";
import type { TaskMutation } from "../tasks/mutations";
import type { TimelineZoom } from "./timeline";

/**
 * `move` is expressed in COLUMNS, not days, because a column is a month at
 * month zoom. Dragging a March bar one column right means April, and a
 * day-count delta would land it on the 31st of the wrong month.
 */
export type SpanDrag =
  /**
   * How far the POINTER moved, in days (§13).
   *
   * It used to be a column delta, which meant the smallest move at the default
   * zoom was a whole week — a column there is a week. Days are what a reader
   * means by "push it back a bit", and the view works them out from where the
   * pointer fell inside a column rather than from the column alone.
   *
   * The zoom is gone with it: a day is a day at every zoom.
   */
  | { kind: "move"; minutes: number }
  /**
   * An edge dropped on an instant (§16).
   *
   * `time` is "" where the column was too long to name one, which is every
   * zoom above `1일` — and there the write is the date alone, exactly as
   * before.
   */
  | { kind: "resizeStart"; date: string; time: string }
  | { kind: "resizeEnd"; date: string; time: string };

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
export function patchForTrayDrop(task: Task, date: string): Partial<Task> {
  // The caller reads the date off the pointer (§13), so a drop outside the
  // track gives an empty one — and a drop that lands where the Task already is
  // writes nothing, the same guard the resize branches keep and for the same
  // reason: an empty patch still costs an `updatedAt` and a row on the wire.
  if (!date || date === task.dueDate) return {};
  return { dueDate: date };
}

export function patchForSpanDrag(task: Task, drag: SpanDrag): Partial<Task> {
  if (drag.kind === "resizeStart") {
    return edgePatch(drag, task.startDate, task.startTime, "startDate", "startTime");
  }

  if (drag.kind === "resizeEnd") {
    return edgePatch(drag, task.dueDate, task.endTime, "dueDate", "endTime");
  }

  if (drag.minutes === 0) return {};
  const patch: Partial<Task> = {};
  // Only what is already there. An absent field stays absent — which is how a
  // bar whose start was inferred keeps deriving it instead of freezing it, and
  // now also how a Task with no clock survives being dragged across one.
  //
  // A Task WITHOUT times moves in whole days, because that is all it has to
  // move by: it occupies its days entirely, so half an hour is no distance at
  // all and rounding it to a day would move it further than the pointer went.
  const days = Math.round(drag.minutes / MINUTES_PER_DAY);
  if (task.startTime || task.endTime) {
    // NOT guarded on `startDate`: a one-day Task keeps only `dueDate` — the
    // store normalises the other away [실측] — so a Task with a `startTime`
    // and no `startDate` is the ordinary case, and guarding on the date left
    // the start where it was while the end moved (`09:00 → 13:30`).
    shiftEnd(patch, drag.minutes, task.startDate, task.dueDate, task.startTime, "startDate", "startTime");
    shiftEnd(patch, drag.minutes, task.dueDate, task.dueDate, task.endTime, "dueDate", "endTime");
    if (!task.startTime && task.startDate && days !== 0) {
      patch.startDate = addDays(task.startDate, days);
    }
    if (!task.endTime && task.dueDate && days !== 0) patch.dueDate = addDays(task.dueDate, days);
    return patch;
  }
  if (days === 0) return {};
  if (task.startDate) patch.startDate = addDays(task.startDate, days);
  if (task.dueDate) patch.dueDate = addDays(task.dueDate, days);
  return patch;
}

const MINUTES_PER_DAY = 1440;

/**
 * One edge, written including the field it was empty in (§16).
 *
 * The rule this extends is the one already on `resizeStart`: dragging a handle
 * onto a date is the user SAYING it starts there, so the field is written even
 * when nothing was in it. A handle dropped on 09:30 says the same about the
 * clock, so `startTime` is written on a Task that had none.
 *
 * A column that cannot name a time leaves the stored one alone rather than
 * clearing it: dragging a bar's edge at week zoom is a statement about days,
 * and silently dropping the hour someone set in the Calendar would be a change
 * they did not ask for.
 */
function edgePatch(
  drag: { date: string; time: string },
  currentDate: string,
  currentTime: string,
  dateField: "startDate" | "dueDate",
  timeField: "startTime" | "endTime",
): Partial<Task> {
  if (!drag.date) return {};
  const sameDate = drag.date === currentDate;
  const sameTime = !drag.time || drag.time === currentTime;
  if (sameDate && sameTime) return {};

  const patch: Partial<Task> = {};
  if (!sameDate) patch[dateField] = drag.date;
  if (drag.time && drag.time !== currentTime) patch[timeField] = drag.time;
  return patch;
}

/**
 * Moves one end of a Task that keeps a clock (§16).
 *
 * The DATE field is written only when the record already held one. A Task with
 * no `startDate` derives its start from the deadline, so the deadline moving is
 * what carries that end across midnight — writing a `startDate` here would
 * freeze a derivation into the record, which is the rule `move` has kept since
 * D6.
 */
function shiftEnd(
  patch: Partial<Task>,
  minutes: number,
  storedDate: string,
  fallbackDate: string,
  time: string,
  dateField: "startDate" | "dueDate",
  timeField: "startTime" | "endTime",
): void {
  if (!time) return;
  const on = storedDate || fallbackDate;
  if (!on) return;
  const moved = new Date(new Date(`${on}T${time}:00`).getTime() + minutes * 60000);
  const pad = (value: number) => String(value).padStart(2, "0");
  const nextDate = `${moved.getFullYear()}-${pad(moved.getMonth() + 1)}-${pad(moved.getDate())}`;
  const nextTime = `${pad(moved.getHours())}:${pad(moved.getMinutes())}`;
  if (nextTime !== time) patch[timeField] = nextTime;
  if (storedDate && nextDate !== storedDate) patch[dateField] = nextDate;
}
