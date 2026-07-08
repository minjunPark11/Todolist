// Context Cards: durable, user-approved snapshots of "what this piece of work
// is and why it's stuck", produced by the AI Assistant's brain-dump analysis.
// Privacy rule (assistant prompt enforces it, reviewers keep it): cards store
// execution blockers ("task is large and fuzzy, no clear starting point"),
// NEVER psychological assessments of the user.
export type ContextCardSource = "user" | "assistant" | "brain_dump";

export type NextActionDifficulty = "low" | "medium" | "high";

export type RecommendedNextAction = {
  title: string;
  reason: string;
  completionCriteria: string;
  estimatedDifficulty?: NextActionDifficulty;
};

export type ContextCard = {
  id: string;
  title: string;
  // The brain-dump text the card was distilled from, verbatim.
  rawInput: string;
  // Work items the assistant detected in the dump ("중국어 공부", "졸업논문").
  detectedItems: string[];
  // Broad domains inferred from the items ("language learning", "thesis").
  inferredDomains: string[];
  // Kind of work each item is ("memorization", "writing", "coding practice").
  workTypes: string[];
  // Where things stand right now, as stated or safely inferred.
  currentStatus: string[];
  // Execution blockers only — never psychological diagnoses.
  likelyBlockers: string[];
  // What the assistant still needs to know (drives follow-up questions).
  missingInfo: string[];
  // Concrete deliverables this work could produce.
  possibleOutputs: string[];
  recommendedNextAction?: RecommendedNextAction;
  relatedTaskIds: string[];
  relatedProjectIds: string[];
  relatedNotePaths: string[];
  source: ContextCardSource;
  createdAt: string;
  updatedAt: string;
};

// What the assistant proposes before the user confirms; the store stamps
// id/source/timestamps on save.
export type ContextCardDraft = Omit<ContextCard, "id" | "source" | "createdAt" | "updatedAt">;
