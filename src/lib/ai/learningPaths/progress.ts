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

// A milestone is done only when every linked card reached "executing" —
// slice A has no card links, so nothing is done yet. (A finer-grained
// completion signal — task done / user confirmation — is slice B/C work.)
export function resolveMilestoneStatus(milestone: Milestone, cards: ContextCard[]): MilestoneStatus {
  const linked = cards.filter((card) => milestone.cardIds.includes(card.id));
  if (linked.length === 0) return "upcoming";
  if (linked.every((card) => card.stage === "executing")) return "done";
  if (linked.some((card) => card.stage && IN_PROGRESS_STAGES.includes(card.stage))) return "current";
  return "upcoming";
}

// The path's current position: the first milestone that isn't done. Falls
// back to the last milestone when everything is done (the path is finished
// but still needs a stable position to render).
export function currentMilestoneIndex(path: LearningPath, cards: ContextCard[]): number {
  const index = path.milestones.findIndex((milestone) => resolveMilestoneStatus(milestone, cards) !== "done");
  return index === -1 ? Math.max(path.milestones.length - 1, 0) : index;
}

export type PathBreadcrumb = {
  goal: string;
  // 1-based "N/M" position string, ready to render.
  position: string;
  milestoneTitle: string;
};

// Single source for the breadcrumb line the panel renders — UI never
// re-derives position on its own.
export function formatBreadcrumb(path: LearningPath, cards: ContextCard[]): PathBreadcrumb | null {
  if (path.milestones.length === 0) return null;
  const index = currentMilestoneIndex(path, cards);
  return {
    goal: path.goal,
    position: `${index + 1}/${path.milestones.length}`,
    milestoneTitle: path.milestones[index].title,
  };
}
