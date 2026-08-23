// Eisenhower matrix derivation (FOCUSFLOW_EISENHOWER_CALENDAR_DRAG_SPEC).
// The quadrant is never stored — it is derived from the task's existing
// fields so it can't drift out of sync:
//   important = priority is high or medium
//   urgent    = due today, or overdue
// The work day used to be a second date, excluded from urgency so that moving
// a task into Q2 did not wipe today's plan. It folded into `dueDate`
// (SCHEDULE_EDITOR_PHASE0_AUDIT.md §7 Phase 11), so urgency now reads the only
// date there is.
// Quadrant IV carries the unsorted / completed sub-groups. An `onHold` one
// sat beside them, fed by the `waiting` status — that was workflow, and it is
// a List's Section now (Ch. 26 §26.3.4).
import type { Task, TaskDraft } from "../types";
import { isCompleted, LIFECYCLE } from "../domain/tasks/taskState";

export type MatrixQuadrant = "I" | "II" | "III" | "IV";
// Q4 does two jobs: the classic "neither important nor urgent" quadrant and
// this app's inbox for work nobody has judged. Keeping both under one group
// filed a task the user had deliberately marked Low next to tasks they had
// never opened (PLANNING_PRIORITY_DESIGN.md D3).
export type MatrixGroup = "neither" | "unclassified" | "completed";

export interface MatrixPosition {
  quadrant: MatrixQuadrant;
  group?: MatrixGroup;
}

// "medium" counts (PLANNING_PRIORITY_DESIGN.md D2). Reading a four-valued
// field as a single boolean sent every judged-but-not-high task to Q4, whose
// label reads "not judged yet" — so the matrix told the user they had not
// classified work they had in fact classified. Only "none" is unjudged.
export function isMatrixImportant(task: Pick<Task, "priority">): boolean {
  return task.priority === "high" || task.priority === "medium";
}

export function isMatrixUrgent(
  task: Pick<Task, "dueDate">,
  today: string,
): boolean {
  return task.dueDate === today || Boolean(task.dueDate && task.dueDate < today);
}

export function getMatrixPosition(
  task: Pick<Task, "status" | "priority" | "dueDate">,
  today: string,
): MatrixPosition {
  // Finished work always lives in IV, regardless of its fields.
  //
  // `waiting` used to land here too, as an "on hold" group. That was a
  // workflow status reading as a judgement about importance and urgency —
  // it is a List's Section now (Ch. 26 §26.3.4), and a Section is not
  // something the matrix can or should read.
  if (isCompleted(task)) return { quadrant: "IV", group: "completed" };

  const important = isMatrixImportant(task);
  const urgent = isMatrixUrgent(task, today);
  if (important && urgent) return { quadrant: "I" };
  if (important) return { quadrant: "II" };
  if (urgent) return { quadrant: "III" };
  // "low" is a verdict, "none" is the absence of one.
  return { quadrant: "IV", group: task.priority === "low" ? "neither" : "unclassified" };
}

// Preview helper for the add-task panel: where would a draft land?
export function getDraftMatrixPosition(
  draft: Pick<TaskDraft, "priority" | "dueDate">,
  today: string,
): MatrixPosition {
  return getMatrixPosition(
    {
      status: LIFECYCLE.open,
      priority: draft.priority ?? "none",
      dueDate: draft.dueDate ?? "",
    },
    today,
  );
}

// Reverse mapping for quadrant changes: moving a card into a quadrant mutates
// the priority/dueDate fields the position is derived from. Nothing stores the
// quadrant itself, so the two can never disagree.
export function patchForQuadrant(task: Task, quadrant: MatrixQuadrant, today: string): Partial<Task> {
  const patch: Partial<Task> = {};
  const urgent = isMatrixUrgent(task, today);

  // Leaving IV used to re-activate the task, because `waiting` and `inbox`
  // were what put it there. Neither is lifecycle any more (Ch. 26 §26.3.2),
  // so a task dragged between boxes is already open and the drag writes only
  // the two fields the box is read from.

  if (quadrant === "I" || quadrant === "II") {
    if (task.priority !== "high") patch.priority = "high";
  } else if (isMatrixImportant(task)) {
    // Demote to "low", not "medium" (PLANNING_PRIORITY_DESIGN.md D4). The old
    // rule dropped high->medium to keep "somewhat important" alive, but medium
    // is now important itself, so that would leave the card in the quadrant it
    // was just dragged out of — a move that visibly does nothing. Dragging out
    // of an important quadrant *is* the judgement "not important", and that
    // is what low means.
    patch.priority = "low";
  }

  if (quadrant === "I" || quadrant === "III") {
    if (!urgent) patch.dueDate = today;
  } else if (urgent) {
    // De-urgentize: clearing today's/overdue deadline is what moves the card
    // out of the urgent column.
    //
    // This used to re-pin the task to today's plan through the second date
    // field, so that leaving the urgent column never dropped it off Today.
    // With one date that compensation contradicts itself — a task dated today
    // IS urgent — so the date simply goes, and the task leaves Today with it.
    // Keeping the card visible by inventing a deadline the user never chose
    // would be the worse of the two surprises.
    if (task.dueDate && task.dueDate <= today) patch.dueDate = "";
  }

  return patch;
}

// The four quadrants in reading order, so a screen that draws all of them
// does not keep its own copy of the union's members.
export const MATRIX_QUADRANTS: readonly MatrixQuadrant[] = ["I", "II", "III", "IV"];

/**
 * The fields a task typed straight INTO a quadrant is born with.
 *
 * `patchForQuadrant` is the same rule for a task that already exists, and it
 * cannot be reused here: it reads the record it is moving. A draft has no
 * record yet, so the two-field answer is written out once, and stays the
 * inverse of `getMatrixPosition` — otherwise a task added to Q2 would appear
 * in Q4 the moment it was saved.
 */
export function draftForQuadrant(
  quadrant: MatrixQuadrant,
  today: string,
): { priority: Task["priority"]; dueDate: string } {
  const important = quadrant === "I" || quadrant === "II";
  const urgent = quadrant === "I" || quadrant === "III";
  return {
    // "low" rather than "none" for the two unimportant quadrants: dropping a
    // task there is a judgement, and `none` is the absence of one — a task
    // born `none` in Q3 reads back as unjudged.
    priority: important ? "high" : "low",
    dueDate: urgent ? today : "",
  };
}
