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

// Where a card sits in the goal→execution pipeline. Computed by the
// deterministic resolver in assistant/infoSlots.ts — never trusted from the
// model. "planned"/"executing" become reachable as later slices land.
export type CardStage = "goal_captured" | "scoping" | "info_gathering" | "planned" | "executing";

// The kinds of information the assistant gathers before planning. Ordered by
// how much the answer changes the plan (see SLOT_PRIORITY in infoSlots.ts).
// Only information that changes the next action qualifies — preferences,
// feelings, and motivations are deliberately not slot kinds.
export type InfoSlotKind =
  | "done_criteria" // what artifact existing means "done"
  | "deadline" // submission/feedback date, external audience
  | "blocked_point" // last attempt and where it stopped
  | "prerequisite" // what must exist before this can proceed
  | "time_budget" // rough time available this week
  | "scope_boundary"; // the explicit "only up to here" line

export type InfoSlotSource =
  | "user_answer" // the user answered the question (strongest; never overwritten by weaker sources)
  | "derived" // filled from the dump, card fields, or app data
  | "assumed_default"; // safe default applied so info gathering never blocks execution

// One trackable question the assistant needs answered (or safely assumed)
// before the card can advance to planning. answer === "" means unresolved.
export type InfoSlot = {
  kind: InfoSlotKind;
  question: string;
  answer: string;
  source?: InfoSlotSource;
};

// One ordered execution unit of a planned card. The user-facing plan answers
// "what, why this order, how do I physically start, when is it done" — the
// SMART quality bar behind these fields lives in assistant/planSteps.ts as an
// internal validator and is never surfaced as terminology.
export type PlanStep = {
  // Small and concrete — startable within minutes, never a duration or a
  // stock phrase.
  title: string;
  // Why this step sits at this position, in natural language tied to the
  // priority reasoning (deadline, unblocking, ambiguity reduction).
  why: string;
  // Physical start trigger: what to open / where to be. Never a clock time —
  // the assistant must not invent schedules (see looksLikeTimetable guard).
  startCue: string;
  // Observable artifact that makes "done" a yes/no question.
  completionCriteria: string;
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
  // Structured info-gathering state, persisted across turns/sessions so
  // resolved questions are never re-asked. Optional: cards saved before this
  // field existed stay valid.
  infoSlots?: InfoSlot[];
  // Deterministically computed pipeline stage (see CardStage). Optional for
  // the same backward-compatibility reason.
  stage?: CardStage;
  // Ordered execution units, present only on planned cards (slice 3). Index
  // is the order; step 0 always corresponds to recommendedNextAction, so the
  // panel renders it once (on the action card) and lists steps 1+ as "what
  // comes after". Optional: cards saved before this field existed stay valid.
  plan?: PlanStep[];
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
