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

// One independently actionable work candidate detected in a dump. Boundary
// rule (enforced by the assistant prompt, not this type): items are split
// when they lead to different outputs, actions, external deadlines, domains,
// or blockers — not merely because different nouns were mentioned. Two
// mentions that resolve to the same possibleOutput should be one item.
export type DetectedItem = {
  label: string;
  // Broad area this item belongs to ("language learning", "thesis").
  domain: string;
  // Kind of work it actually is ("memorization", "writing", "coding practice").
  workType: string;
  // Where it stands right now: not-started / in-progress / stuck / under-documented.
  status: string;
  // A small, observable deliverable this item could produce next — never a
  // vague state like "study done" or "thesis progressed".
  possibleOutput: string;
  // True when this item is a precondition blocking another item's progress.
  dependency: boolean;
  // True when this item is tied to an external deadline/submission/audience
  // (due date, submission, certification, professor/team/institution/client).
  externalPressure: boolean;
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
  // Structured per-item view of the fields above, one entry per detected
  // item (rather than index-paired parallel arrays). Optional so drafts
  // built before this field existed (or by the plain-text fallback splitter)
  // stay valid.
  detectedItemDetails?: DetectedItem[];
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
