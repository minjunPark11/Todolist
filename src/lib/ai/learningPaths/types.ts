// Learning Paths: a goal-level layer above Context Cards (Path slice A of
// the stuck-to-execution vision — see docs/Features/Learning_Path.md).
// A path is one long-running direction ("큰 방향") broken into ordered
// milestones ("중간 목표"); each milestone will link to the Context Cards
// that execute it (slice B — cardIds stays empty in slice A).
//
// Same contracts as Context Cards: the model only proposes drafts, every
// status/position is computed deterministically (progress.ts), and the user
// confirms every save in the UI.
import type { InfoSlot } from "../contextCards/types";

// Computed by resolveMilestoneStatus in progress.ts from the linked cards'
// stages — never trusted from the model or persisted as authoritative.
export type MilestoneStatus = "upcoming" | "current" | "done";

// One intermediate goal on the path. Like possibleOutput/completionCriteria
// on cards, doneCriteria must name something observable so "done" stays a
// yes/no question.
export type Milestone = {
  id: string;
  title: string;
  doneCriteria: string;
  // Context Cards executing this milestone. Always [] in slice A; slice B
  // links cards here and derives status from their stages.
  cardIds: string[];
  status?: MilestoneStatus;
};

export type LearningPathSource = "assistant" | "user";

export type LearningPath = {
  id: string;
  // The big direction, one sentence ("HSK4 수준 중국어").
  goal: string;
  // Order is the path: milestones progress by index.
  milestones: Milestone[];
  // Path-level info gathering, reusing the card slot kinds. Persisted for
  // slice B; slice A neither asks nor renders these.
  infoSlots?: InfoSlot[];
  source: LearningPathSource;
  createdAt: string;
  updatedAt: string;
};

// What the assistant proposes before the user confirms; the store stamps
// id/source/timestamps on save (same shape rule as ContextCardDraft).
export type LearningPathDraft = Omit<LearningPath, "id" | "source" | "createdAt" | "updatedAt">;
