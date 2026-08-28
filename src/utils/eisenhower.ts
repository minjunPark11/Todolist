// Which box of the matrix a task is in.
//
// The quadrant IS the priority (TICKTICK_MATRIX_DESIGN.md D1):
//
//   Ⅰ 중요하고 급한 일          priority "high"
//   Ⅱ 중요하지만 급하지 않은 일   priority "medium"
//   Ⅲ 중요하지 않지만 급한 일     priority "low"
//   Ⅳ 중요하지도 급하지도 않은 일 priority "none"
//
// It used to be derived from two axes — importance from the priority, urgency
// from the due date — which is the textbook Eisenhower and is not what this
// product does now. The change is not cosmetic, so the reasoning is worth
// keeping:
//
//   1. The reference app this one follows reads priority alone. A task due
//      three days ago with medium priority sits in Ⅱ there, and a task due
//      today with no priority sits in Ⅳ.
//   2. The old reverse mapping had to write the DUE DATE to move a card, and
//      moving a card out of an urgent box therefore ERASED a deadline the user
//      had chosen. One drag, one silently deleted date. A model where the box
//      is one field cannot do that.
//   3. "Not judged yet" and "judged unimportant" had to share box Ⅳ, because
//      the two-axis rule had nowhere else to put an unprioritised task. With
//      the quadrant reading the priority directly, Ⅳ *is* `none` — the absence
//      of a judgement, said plainly.
//
// What survives unchanged is the important part: the quadrant is NOT STORED.
// It is read from the record, so the box and the field cannot drift apart, and
// dragging a card writes the one field the box is read from.
//
// Completion is deliberately absent here. A finished task keeps the box its
// priority puts it in, and the matrix groups it under "완료" inside that box
// (D2) — completion is a question about a task, not a fifth quadrant.
import type { Task, TaskDraft, TaskPriority } from "../types";

export type MatrixQuadrant = "I" | "II" | "III" | "IV";

/** The four quadrants in reading order. */
export const MATRIX_QUADRANTS: readonly MatrixQuadrant[] = ["I", "II", "III", "IV"];

const QUADRANT_BY_PRIORITY: Record<TaskPriority, MatrixQuadrant> = {
  high: "I",
  medium: "II",
  low: "III",
  none: "IV",
};

const PRIORITY_BY_QUADRANT: Record<MatrixQuadrant, TaskPriority> = {
  I: "high",
  II: "medium",
  III: "low",
  IV: "none",
};

export function quadrantOf(task: Pick<Task, "priority">): MatrixQuadrant {
  // A record written by a client that knows a priority this one does not
  // reads as unjudged rather than crashing — the same forward-compatibility
  // rule the normalizers follow.
  return QUADRANT_BY_PRIORITY[task.priority] ?? "IV";
}

export function priorityForQuadrant(quadrant: MatrixQuadrant): TaskPriority {
  return PRIORITY_BY_QUADRANT[quadrant];
}

/** Where a draft would land, for the add form's preview. */
export function getDraftMatrixQuadrant(draft: Pick<TaskDraft, "priority">): MatrixQuadrant {
  return quadrantOf({ priority: draft.priority ?? "none" });
}

/**
 * Moving a card into a box, as a change to the record.
 *
 * One field, and only when it differs: an empty patch is what tells the caller
 * the drop changed nothing, so a card dropped back where it started does not
 * touch `updatedAt` or put a no-op row on the wire.
 *
 * Dates are not touched. That is the point of D1 — see the file comment.
 */
export function patchForQuadrant(task: Pick<Task, "priority">, quadrant: MatrixQuadrant): Partial<Task> {
  const priority = priorityForQuadrant(quadrant);
  return task.priority === priority ? {} : { priority };
}

/**
 * The fields a task typed straight INTO a box is born with.
 *
 * Kept separate from `patchForQuadrant` because a draft has no record to
 * compare against, and stays its exact inverse — otherwise a task added to Ⅱ
 * would appear in Ⅳ the moment it was saved.
 */
export function draftForQuadrant(quadrant: MatrixQuadrant): { priority: TaskPriority } {
  return { priority: priorityForQuadrant(quadrant) };
}
