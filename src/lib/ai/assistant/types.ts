// Shared types for the AI Assistant brain-dump flow (MVP 2). The pipeline:
//   buildAssistantContextPack — limited app/knowledge/card context (no dumps)
//   runAssistantTurn          — gateway call + safe parse into AssistantTurn
//   AssistantPanel (UI)       — user confirms card save / task save; every
//                               proposal outcome lands in memory/outcomeLog.
import type { RetrievedChunk } from "../../knowledge/types";
import type { ContextCard, ContextCardDraft, DetectedItem, RecommendedNextAction } from "../contextCards/types";
import type { AiProviderName } from "../types";

export type AssistantMode = "needs_more_context" | "ready_for_next_action";

// Coarse-grained signal strength, used instead of booleans so a single weak
// mention can't by itself trigger overwhelm handling (see InputSignals).
export type SignalStrength = "none" | "weak" | "strong";

// Judgment signals the model reports about the raw input, independent of how
// many items were detected. None of these alone decides the response mode —
// selectResponseMode combines them (see overwhelmHeuristics.ts).
export type InputSignals = {
  decisionSignal: SignalStrength; // user asks for order/start point/choice/priority
  frictionSignal: SignalStrength; // overwhelm, dread, avoidance, fatigue, "it's all a mess"
  lowActionabilitySignal: SignalStrength; // named work with no visible next step/output
  blockerSignal: SignalStrength; // one item is stuck or is blocking another
  externalPressureSignal: SignalStrength; // deadline/submission/external audience involved
  unscopedProjectSignal: SignalStrength; // item is large/fuzzy, no executable unit visible yet
};

// Which handling strategy applies to this turn. Scope-gated domain requests
// (code/debugging, LeetCode/algorithms, translation/rewriting/summarizing, a
// single direct question, an explicit file/task edit, a concept explanation)
// all collapse into "domain_specific": the assistant answers in that mode
// instead of running overwhelm handling. See prompts.ts §Scope Gate.
export type ResponseMode =
  | "domain_specific"
  | "normal_task_request"
  | "single_task_blocker"
  | "planning_request"
  | "learning_request"
  | "overwhelm"
  | "clarification_needed";

export type ResponseValidationResult = {
  ok: boolean;
  failures: string[];
};

export type { DetectedItem };

// Parsed safe_action_proposals entries. MVP 2 only understands create_task;
// unknown types are dropped at parse time.
export type AssistantSafeActionProposal = {
  type: "create_task";
  title: string;
  description: string;
  linkedContextCardId: string;
};

// Normalized (camelCase) form of the model's JSON reply. null draft/action
// means the model omitted or malformed that part — callers fall back rather
// than fail.
export type AssistantAnalysis = {
  mode: AssistantMode;
  responseMode: ResponseMode;
  inputSignals: InputSignals;
  contextCardDraft: ContextCardDraft | null;
  followUpQuestions: string[];
  recommendedNextAction: RecommendedNextAction | null;
  safeActionProposals: AssistantSafeActionProposal[];
  userFacingResponse: string;
};

// One completed assistant exchange, ready for the UI. contextCardDraft is
// always present: when the model returned free text only, it's a heuristic
// fallback draft (usedFallbackDraft = true) so saving still works.
export type AssistantTurn = {
  id: string;
  provider: AiProviderName;
  mode: AssistantMode;
  responseMode: ResponseMode;
  inputSignals: InputSignals;
  userFacingText: string;
  // True for the light "just answer it" modes (domain_specific /
  // learning_request): the model's Scope Gate handled it directly, so the UI
  // shows only the reply bubble — no context card, next action, or plan.
  // Unified Chat slice 2: this is what lets one engine serve both a code/
  // translation/Q&A answer and a structured overwhelm breakdown.
  isDirectAnswer: boolean;
  contextCardDraft: ContextCardDraft;
  usedFallbackDraft: boolean;
  // True when the model's reply failed the generic-failure guard (see
  // validateAssistantResponse.ts) — including replies with no parseable
  // JSON at all — and userFacingText/recommendedNextAction were replaced
  // by the deterministic fallback built from the parsed/fallback items.
  usedGenericFailureFallback: boolean;
  validation: ResponseValidationResult;
  followUpQuestions: string[];
  recommendedNextAction: RecommendedNextAction | null;
  relatedCards: ContextCard[];
  knowledgeSources: RetrievedChunk[];
};
