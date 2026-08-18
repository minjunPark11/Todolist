// Eisenhower matrix derivation (FOCUSFLOW_EISENHOWER_CALENDAR_DRAG_SPEC).
// The quadrant is never stored — it is derived from the task's existing
// fields so it can't drift out of sync:
//   important = priority is high or medium
//   urgent    = due today, or overdue
// The work day used to be a second date, excluded from urgency so that moving
// a task into Q2 did not wipe today's plan. It folded into `dueDate`
// (SCHEDULE_EDITOR_PHASE0_AUDIT.md §7 Phase 11), so urgency now reads the only
// date there is.
// Quadrant IV carries the unsorted / on-hold / completed sub-groups, mapped
// onto the existing statuses (inbox / waiting / done).
import type { Task, TaskDraft } from "../types";

export type MatrixQuadrant = "I" | "II" | "III" | "IV";
// Q4 does two jobs: the classic "neither important nor urgent" quadrant and
// this app's inbox for work nobody has judged. Keeping both under one group
// filed a task the user had deliberately marked Low next to tasks they had
// never opened (PLANNING_PRIORITY_DESIGN.md D3).
export type MatrixGroup = "neither" | "unclassified" | "onHold" | "completed";

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
  // Finished / parked work always lives in IV, regardless of its fields.
  if (task.status === "done") return { quadrant: "IV", group: "completed" };
  if (task.status === "waiting") return { quadrant: "IV", group: "onHold" };

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
      status: "todo",
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

  // Leaving IV's parked groups re-activates the task.
  if ((task.status === "waiting" || task.status === "inbox") && quadrant !== "IV") {
    patch.status = "todo";
  }

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
