// Orchestrates one brain-dump turn: limited context pack → gateway call
// (same local-first provider chain as chat) → safe JSON parse → AssistantTurn
// for the UI. This module never mutates app data; saving the card, creating
// the task, and logging outcomes all happen behind explicit user actions in
// the panel.
import { sendAiChat } from "../gateway";
import type { AiMessage } from "../types";
import type { KnowledgeSettings } from "../../knowledge/types";
import { loadContextCards } from "../contextCards/store";
import type { AiContextInput } from "../context/buildAiContext";
import type { DetectedItem } from "../contextCards/types";
import { buildAssistantContextPack } from "./buildAssistantContext";
import { deriveInfoSlots, mergeInfoSlots, resolveCardStage } from "./infoSlots";
import { resolveResponseMode } from "./overwhelmHeuristics";
import { ASSISTANT_SYSTEM_PROMPT } from "./prompts";
import { buildFallbackContextCardDraft, parseAssistantResponse } from "./schema";
import type { AssistantTurn, InputSignals } from "./types";
import { buildFallbackOverwhelmResponse, validateAssistantResponse } from "./validateAssistantResponse";

const NONE_SIGNALS: InputSignals = {
  decisionSignal: "none",
  frictionSignal: "none",
  lowActionabilitySignal: "none",
  blockerSignal: "none",
  externalPressureSignal: "none",
  unscopedProjectSignal: "none",
};

export type AssistantTurnInput = {
  brainDump: string;
  // Prior turns of this panel session (user dumps + assistant replies), so
  // follow-up answers refine the draft instead of restarting.
  history?: AiMessage[];
  appData: Omit<AiContextInput, "calendarContextText">;
  knowledgeSettings?: KnowledgeSettings;
  model?: string;
};

export async function runAssistantTurn(input: AssistantTurnInput): Promise<AssistantTurn> {
  const pack = await buildAssistantContextPack({
    brainDump: input.brainDump,
    appData: input.appData,
    contextCards: loadContextCards(),
    knowledgeSettings: input.knowledgeSettings,
  });

  const response = await sendAiChat({
    // App data in the pack ⇒ local-only providers, same rule as the chat tab.
    dataScope: "full-app",
    temperature: 0.2,
    model: input.model,
    knowledgeContext: pack.knowledgeContext,
    messages: [
      { role: "system", content: ASSISTANT_SYSTEM_PROMPT },
      { role: "system", content: pack.contextText },
      ...(input.history ?? []),
      { role: "user", content: input.brainDump },
    ],
  });

  const analysis = parseAssistantResponse(response.content, input.brainDump);

  const parsedDraft = analysis?.contextCardDraft ?? null;
  const usedFallbackDraft = parsedDraft === null;
  const draft = parsedDraft ?? buildFallbackContextCardDraft(input.brainDump);

  // Keep only references that actually appeared in the pack we sent — the
  // model must not be able to attach hallucinated ids/paths to stored cards.
  draft.relatedTaskIds = draft.relatedTaskIds.filter((id) => pack.knownTaskIds.has(id));
  draft.relatedProjectIds = draft.relatedProjectIds.filter((id) => pack.knownProjectIds.has(id));
  draft.relatedNotePaths = draft.relatedNotePaths.filter((path) => pack.knownNotePaths.has(path));
  if (draft.relatedNotePaths.length === 0 && pack.knowledgeSources.length > 0) {
    draft.relatedNotePaths = pack.knowledgeSources.slice(0, 5).map((source) => source.filePath);
  }
  if (analysis?.recommendedNextAction) {
    draft.recommendedNextAction = analysis.recommendedNextAction;
  }

  const items: DetectedItem[] = draft.detectedItemDetails ?? [];
  const responseMode = analysis?.responseMode ?? resolveResponseMode(undefined, NONE_SIGNALS, items.length);
  const inputSignals = analysis?.inputSignals ?? NONE_SIGNALS;

  // Info-gathering state (see infoSlots.ts): the deterministic derivation
  // from the items is the base; slots resolved by prior saved cards on the
  // same work stay resolved; the model's slots (which carry any follow-up
  // answers from this session's history) are merged on top. The stage is
  // always computed here — never taken from the model.
  const priorSlots = pack.relatedCards.flatMap((card) => card.infoSlots ?? []);
  draft.infoSlots = mergeInfoSlots(mergeInfoSlots(deriveInfoSlots(items), priorSlots), draft.infoSlots ?? []);

  // Generic Failure Guard (validateAssistantResponse.ts): overwhelm/planning
  // replies that re-offer a menu, miss the next action, use vague completion
  // criteria, or invent a schedule are replaced with the deterministic
  // fallback built from the same parsed items rather than shown broken.
  // A reply with no parseable JSON at all is itself a guard failure: free
  // text cannot carry the structured next action the contract requires, and
  // showing it raw is exactly how generic advice used to bypass the guard.
  const validation = analysis
    ? validateAssistantResponse(analysis, items)
    : { ok: false, failures: ["model reply contained no parseable JSON"] };
  const usedGenericFailureFallback = !validation.ok;

  let userFacingText = analysis?.userFacingResponse || response.content.trim();
  let followUpQuestions = analysis?.followUpQuestions ?? [];
  let recommendedNextAction = analysis?.recommendedNextAction ?? null;

  if (usedGenericFailureFallback) {
    const fallback = buildFallbackOverwhelmResponse(input.brainDump, items, draft.infoSlots ?? []);
    userFacingText = fallback.userFacingResponse;
    recommendedNextAction = fallback.recommendedNextAction;
    followUpQuestions = fallback.followUpQuestions;
    draft.recommendedNextAction = fallback.recommendedNextAction;
  }

  // Computed last so the stage reflects the final draft, including a next
  // action supplied by the fallback path above.
  draft.stage = resolveCardStage(draft);

  console.debug("[runAssistantTurn]", {
    rawContent: response.content,
    parsedAnalysis: analysis,
    responseMode,
    validation,
    usedGenericFailureFallback,
  });

  return {
    id: `aturn-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    provider: response.provider,
    mode: analysis?.mode ?? "needs_more_context",
    responseMode,
    inputSignals,
    userFacingText,
    contextCardDraft: draft,
    usedFallbackDraft,
    usedGenericFailureFallback,
    validation,
    followUpQuestions,
    recommendedNextAction,
    relatedCards: pack.relatedCards,
    knowledgeSources: pack.knowledgeSources,
  };
}
