// What a drag between board columns MEANS as a change to the record.
//
// Every board column is a group key (viewSpec.groupKeyFor), and every group
// key is derived rather than stored: a quadrant comes from priority x date, a
// status column from the task's status. So dropping a card cannot "set the
// column" — it has to write the fields the column was read from. The Planning
// page already states this rule for its own axis ("the quadrant is derived,
// never stored"); this is the same rule for every axis a board can offer.
//
// Only axes with an inverse appear here. Dropping onto a Today bucket or a due
// date would have to invent a date the user did not choose, so those axes
// return no patch instead of guessing.
import type { LearningPath, Status, StatusGroup, Task, TaskStatus } from "../../types";
import { statusFor } from "../spaces/membership";
import { patchForQuadrant, type MatrixQuadrant } from "../../utils/eisenhower";
import { addDays, addMonths } from "../../utils/date";
import type { TimelineZoom } from "./timeline";
import type { GroupAxis } from "./viewSpec";

/**
 * The TaskStatus a status group means. Needed because the rest of the app
 * reads `task.status` — Today buckets by it, Planning filters by it, Archive
 * is defined by it — so a card dropped on a Space's own column has to leave
 * `status` in a state those screens can still read.
 */
const GROUP_STATUS: Record<StatusGroup, TaskStatus> = {
  notStarted: "inbox",
  active: "todo",
  done: "done",
  closed: "archived",
};

// TaskStatus is a union, not a value, so membership needs a runtime witness.
// Legacy members are absent on purpose: nothing should be dropped back onto a
// status the migration exists to move data away from.
const STATUS_VALUES: Record<string, true> = {
  inbox: true,
  todo: true,
  doing: true,
  waiting: true,
  done: true,
  archived: true,
};

/**
 * Moving a task onto a status column.
 *
 * A default column writes `status` and clears any stored `statusId` — leaving
 * it set would make `statusIdFor` keep answering with the old custom column,
 * and the card would snap straight back to where it was dragged from.
 *
 * A Space's own column writes `statusId`, and rewrites `status` only when the
 * column's group differs from the one the task is already in. Without that
 * guard, dragging a "doing" task onto a second active column would quietly
 * demote it to "todo" — a move the user did not ask for.
 */
export function statusPatch(task: Task, columnId: string, statuses: Status[]): Partial<Task> {
  if (!columnId || !statuses.some((status) => status.id === columnId)) return {};

  if (STATUS_VALUES[columnId]) {
    if (task.status === columnId && !task.statusId) return {};
    return { status: columnId as TaskStatus, statusId: "" };
  }

  const target = statuses.find((status) => status.id === columnId);
  if (!target) return {};
  const current = statusFor(task, statuses);
  if (current?.id === columnId) return {};

  const patch: Partial<Task> = { statusId: columnId };
  if (current?.group !== target.group) patch.status = GROUP_STATUS[target.group];
  return patch;
}

export interface BoardDropContext {
  today: string;
  statuses: Status[];
}

/**
 * The patch a drop means, for whichever axis the board is grouped by. Returns
 * an empty patch when the move would change nothing, so callers can skip the
 * write rather than touch `updatedAt` and put a no-op row on the wire.
 */
export function patchForColumn(
  axis: GroupAxis,
  task: Task,
  columnId: string,
  context: BoardDropContext,
): Partial<Task> {
  switch (axis) {
    case "status":
      return statusPatch(task, columnId, context.statuses);
    case "quadrant":
      return columnId === "I" || columnId === "II" || columnId === "III" || columnId === "IV"
        ? patchForQuadrant(task, columnId as MatrixQuadrant, context.today)
        : {};
    case "priority":
      return task.priority === columnId ? {} : { priority: columnId as Task["priority"] };
    default:
      return {};
  }
}

/** Whether a board grouped on this axis can accept a drop at all. */
export function isDroppableAxis(axis: GroupAxis): boolean {
  return axis === "status" || axis === "quadrant" || axis === "priority";
}

// === Goal drops ===

/**
 * What dropping a GOAL on a status column means.
 *
 * A goal has no `status` field. Its column is `boardListId`, with completion
 * overriding it — `item.goalStatusId` is the whole rule — so this is that
 * function read backwards, and it has to stay exactly its inverse. A drop that
 * writes a state the projection would not answer with sends the card straight
 * back, which reads as the app silently refusing the move.
 *
 * That leaves only the three columns a goal can actually occupy: `done`,
 * `todo` (filed nowhere), and a column the user named. `inbox`, `doing` and
 * `waiting` are workflow a goal does not have, so a drop there means nothing
 * rather than something invented — the same restraint the axes without an
 * inverse show above.
 */
export type GoalDrop =
  | { kind: "none" }
  | { kind: "complete" }
  | { kind: "file"; listId?: string };

export function goalDropFor(
  goal: Pick<LearningPath, "boardListId" | "completedAt">,
  columnId: string,
  statuses: Status[],
): GoalDrop {
  if (!columnId || !statuses.some((status) => status.id === columnId)) return { kind: "none" };

  if (columnId === "done") {
    return goal.completedAt ? { kind: "none" } : { kind: "complete" };
  }

  // Filing reopens. The column dropped on is not "done", and a goal left
  // completed projects back to "done" no matter where it is filed.
  const reopening = Boolean(goal.completedAt);

  if (columnId === "todo") {
    return goal.boardListId || reopening ? { kind: "file" } : { kind: "none" };
  }
  if (STATUS_VALUES[columnId]) return { kind: "none" };
  return goal.boardListId === columnId && !reopening
    ? { kind: "none" }
    : { kind: "file", listId: columnId };
}

// === Timeline drags (GANTT_TIMELINE_DESIGN D6) ===

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
  if (task.scheduledDate) patch.scheduledDate = shiftDate(task.scheduledDate, drag.zoom, drag.steps);
  if (task.dueDate) patch.dueDate = shiftDate(task.dueDate, drag.zoom, drag.steps);
  return patch;
}
