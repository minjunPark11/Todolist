// Shared types for the AI Assistant brain-dump flow (MVP 2). The pipeline:
//   buildAssistantContextPack — limited app/knowledge/card context (no dumps)
//   runAssistantTurn          — gateway call + safe parse into AssistantTurn
//   AssistantPanel (UI)       — user confirms card save / task save; every
//                               proposal outcome lands in memory/outcomeLog.
import type { RetrievedChunk } from "../../knowledge/types";
import type { ContextCard, ContextCardDraft, RecommendedNextAction } from "../contextCards/types";
import type { AiProviderName } from "../types";

export type AssistantMode = "needs_more_context" | "ready_for_next_action";

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
  userFacingText: string;
  contextCardDraft: ContextCardDraft;
  usedFallbackDraft: boolean;
  followUpQuestions: string[];
  recommendedNextAction: RecommendedNextAction | null;
  relatedCards: ContextCard[];
  knowledgeSources: RetrievedChunk[];
};
