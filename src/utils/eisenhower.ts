// Eisenhower matrix derivation (FOCUSFLOW_EISENHOWER_CALENDAR_DRAG_SPEC).
// The quadrant is never stored — it is derived from the task's existing
// fields so it can't drift out of sync:
//   important = priority === "high"
//   urgent    = scheduled today, due today, or overdue
// Quadrant IV carries the unsorted / on-hold / completed sub-groups, mapped
// onto the existing statuses (inbox / waiting / done).
import type { Task, TaskDraft } from "../types";

export type MatrixQuadrant = "I" | "II" | "III" | "IV";
export type MatrixGroup = "unclassified" | "onHold" | "completed";

export interface MatrixPosition {
  quadrant: MatrixQuadrant;
  group?: MatrixGroup;
}

export function isMatrixImportant(task: Pick<Task, "priority">): boolean {
  return task.priority === "high";
}

export function isMatrixUrgent(
  task: Pick<Task, "scheduledDate" | "dueDate">,
  today: string,
): boolean {
  return (
    task.scheduledDate === today ||
    task.dueDate === today ||
    Boolean(task.dueDate && task.dueDate < today)
  );
}

export function getMatrixPosition(
  task: Pick<Task, "status" | "priority" | "scheduledDate" | "dueDate">,
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
  return { quadrant: "IV", group: "unclassified" };
}

// Preview helper for the add-task panel: where would a draft land?
export function getDraftMatrixPosition(
  draft: Pick<TaskDraft, "priority" | "scheduledDate" | "dueDate">,
  today: string,
): MatrixPosition {
  return getMatrixPosition(
    {
      status: "todo",
      priority: draft.priority ?? "none",
      scheduledDate: draft.scheduledDate ?? "",
      dueDate: draft.dueDate ?? "",
    },
    today,
  );
}

// Reverse mapping for quadrant drag & drop: moving a card into a quadrant
// mutates the underlying fields so the derived position matches the drop
// target. Returns the minimal patch.
export function patchForQuadrant(task: Task, quadrant: MatrixQuadrant, today: string): Partial<Task> {
  const patch: Partial<Task> = {};
  const urgent = isMatrixUrgent(task, today);

  // Leaving IV's parked groups re-activates the task.
  if ((task.status === "waiting" || task.status === "inbox") && quadrant !== "IV") {
    patch.status = "todo";
  }

  if (quadrant === "I" || quadrant === "II") {
    if (task.priority !== "high") patch.priority = "high";
  } else if (task.priority === "high") {
    // Demote to medium (not none) so "somewhat important" survives the move.
    patch.priority = "medium";
  }

  if (quadrant === "I" || quadrant === "III") {
    if (!urgent) patch.scheduledDate = today;
  } else if (urgent) {
    // De-urgentize: only the fields that make it urgent today are touched.
    if (task.scheduledDate === today) patch.scheduledDate = "";
    if (task.dueDate && task.dueDate <= today) patch.dueDate = "";
  }

  return patch;
}
