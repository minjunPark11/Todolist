// Deterministic position derivation for Learning Paths. Same rule as
// resolveCardStage (assistant/infoSlots.ts): the model never decides where
// the user is on a path — these pure functions do, from the linked cards'
// stages. In slice A every milestone has cardIds === [], so the first
// milestone is always "current"; slice B feeds real cards through the same
// signatures without touching callers.
import type { CardStage, ContextCard } from "../contextCards/types";
import type { LearningPath, Milestone, MilestoneStatus } from "./types";

// Card stages that count as "this work is moving": anything past
// goal_captured means scoping/gathering/planning/executing has begun.
const IN_PROGRESS_STAGES: readonly CardStage[] = ["scoping", "info_gathering", "planned", "executing"];

/** Minimal task shape this module needs; avoids pulling the planner types in. */
export type MilestoneTask = { id: string; status: string };

/**
 * Where a milestone stands, in one place so no two screens can disagree.
 *
 * Order matters:
 *   1. The user said so. `completedAt` outranks everything below
 *      (HORIZONS_DESIGN.md D10). The "never trust the status" contract this
 *      module opens with is about the *model* asserting progress — a person
 *      ticking their own goal is the authority, not a source to second-guess.
 *      Before this existed the Horizons page read completedAt directly while
 *      the assistant breadcrumb read only card stages, and a milestone ticked
 *      on one screen stayed "current" on the other.
 *   2. Tasks materialised from the milestone, once they are all done.
 *   3. Linked Context Cards' stages, the original signal.
 */
export function resolveMilestoneStatus(
  milestone: Milestone,
  cards: ContextCard[],
  tasks: MilestoneTask[] = [],
): MilestoneStatus {
  if (milestone.completedAt) return "done";

  const linkedTaskIds = milestone.taskIds ?? [];
  if (linkedTaskIds.length > 0) {
    const linkedTasks = tasks.filter((task) => linkedTaskIds.includes(task.id));
    if (linkedTasks.length > 0) {
      if (linkedTasks.every((task) => task.status === "done")) return "done";
      return "current";
    }
  }

  const linked = cards.filter((card) => milestone.cardIds.includes(card.id));
  if (linked.length === 0) return "upcoming";
  if (linked.every((card) => card.stage === "executing")) return "done";
  if (linked.some((card) => card.stage && IN_PROGRESS_STAGES.includes(card.stage))) return "current";
  return "upcoming";
}

// The path's current position: the first milestone that isn't done. Falls
// back to the last milestone when everything is done (the path is finished
// but still needs a stable position to render).
export function currentMilestoneIndex(
  path: LearningPath,
  cards: ContextCard[],
  tasks: MilestoneTask[] = [],
): number {
  const index = path.milestones.findIndex(
    (milestone) => resolveMilestoneStatus(milestone, cards, tasks) !== "done",
  );
  return index === -1 ? Math.max(path.milestones.length - 1, 0) : index;
}

// Which milestone (by index) a card is linked to, or null when unlinked.
// Drives the panel's rolling-wave render: only cards on the current
// milestone expand to full detail, later-milestone cards stay title-only.
export function milestoneIndexForCard(path: LearningPath, cardId: string): number | null {
  const index = path.milestones.findIndex((milestone) => milestone.cardIds.includes(cardId));
  return index === -1 ? null : index;
}

export type PathBreadcrumb = {
  goal: string;
  // 1-based "N/M" position string, ready to render.
  position: string;
  milestoneTitle: string;
};

// Single source for the breadcrumb line the panel renders — UI never
// re-derives position on its own.
export function formatBreadcrumb(
  path: LearningPath,
  cards: ContextCard[],
  tasks: MilestoneTask[] = [],
): PathBreadcrumb | null {
  if (path.milestones.length === 0) return null;
  const index = currentMilestoneIndex(path, cards, tasks);
  return {
    goal: path.goal,
    position: `${index + 1}/${path.milestones.length}`,
    milestoneTitle: path.milestones[index].title,
  };
}
