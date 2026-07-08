// Single retrieval entry point over the Lite/Full knowledge sources.
// OllamaChat uses searchKnowledge today; the AI Assistant MVP should reuse
// the same functions rather than instantiating context sources directly.
import { createKnowledgeContextSource } from "../knowledgeContextSource";
import type { KnowledgeSettings } from "../types";
import type { KnowledgeContextResult, KnowledgeRetriever, KnowledgeSearchRequest } from "./types";

export function createKnowledgeRetriever(getSettings: () => KnowledgeSettings): KnowledgeRetriever {
  const source = createKnowledgeContextSource(getSettings);
  return {
    isReady: () => source.isReady(),
    async search({ query, budgetChars }: KnowledgeSearchRequest) {
      if (budgetChars <= 0) return null;
      if (!(await source.isReady())) return null;
      return source.buildContext(query, budgetChars);
    },
  };
}

// One-shot convenience for callers that hold a settings snapshot rather than
// a live getter (e.g. a chat submit handler).
export async function searchKnowledge(
  query: string,
  settings: KnowledgeSettings,
  budgetChars: number = settings.knowledgeBudgetChars,
): Promise<KnowledgeContextResult | null> {
  return createKnowledgeRetriever(() => settings).search({ query, budgetChars });
}
