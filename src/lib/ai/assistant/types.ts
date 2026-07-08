// Type draft for the AI Assistant MVP surface. Nothing implements these yet —
// they document how the pieces refactored ahead of the MVP are meant to snap
// together:
//   context: selectRelevantAppContext/summarizeContextForPrompt (lib/ai/context)
//   data:    domain selectors + buildAiContextInput (src/domain)
//   search:  createKnowledgeRetriever (lib/knowledge/retrieval)
//   actions: AiSafeAction proposals (lib/ai/actions/types.ts)
//   memory:  AiMemoryStore (lib/ai/memory/types.ts)
//   cards:   ContextCard (lib/ai/contextCards/types.ts)
import type { AiSafeAction } from "../actions/types";
import type { AiMessage } from "../types";
import type { AgentIntent } from "../agent/intent";

// One user→assistant exchange. The assistant loop should stay provider-
// agnostic: it builds context, calls the gateway, and returns proposals —
// never mutates app data itself (that's the safe-action executor's job).
export type AssistantTurnRequest = {
  messages: AiMessage[];
  intent?: AgentIntent;
  // Prompt-ready app context (buildAiContextText output or a future
  // per-intent context pack summary).
  contextText?: string;
  // Retrieved knowledge excerpts; stripped for non-local providers by the
  // gateway, same as today.
  knowledgeContext?: string;
};

export type AssistantTurnResult = {
  content: string;
  intent: AgentIntent;
  // Proposals only — nothing here has been applied.
  suggestedActions: AiSafeAction[];
};

// Brain Dump flow draft: free-form text in, structured triage out. The
// parse step is an AI call; accepting items funnels through safe actions
// (create_task / save_context_card), never direct writes.
export type BrainDumpItemKind = "task" | "note" | "context_card" | "unknown";

export type BrainDumpItem = {
  id: string;
  kind: BrainDumpItemKind;
  // Original fragment of the dump this item was extracted from.
  sourceText: string;
  proposedAction?: AiSafeAction;
};

export type BrainDumpResult = {
  rawText: string;
  items: BrainDumpItem[];
};
