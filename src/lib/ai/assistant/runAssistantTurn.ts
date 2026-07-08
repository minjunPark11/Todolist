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
import { buildAssistantContextPack } from "./buildAssistantContext";
import { ASSISTANT_SYSTEM_PROMPT } from "./prompts";
import { buildFallbackContextCardDraft, parseAssistantResponse } from "./schema";
import type { AssistantTurn } from "./types";

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

  const userFacingText = analysis?.userFacingResponse || response.content.trim();

  return {
    id: `aturn-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    provider: response.provider,
    mode: analysis?.mode ?? "needs_more_context",
    userFacingText,
    contextCardDraft: draft,
    usedFallbackDraft,
    followUpQuestions: analysis?.followUpQuestions ?? [],
    recommendedNextAction: analysis?.recommendedNextAction ?? null,
    relatedCards: pack.relatedCards,
    knowledgeSources: pack.knowledgeSources,
  };
}
