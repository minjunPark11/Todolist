// Lite/Full mode switch — the actual "선택 로직" from
// KNOWLEDGE_BASE_DESIGN.md §4.8: "indexingMode === 'full' && store 준비됨
// 이면 RAG, 아니면 Lite." This is the single entry point OllamaChat should
// use instead of reaching for either concrete source directly.
import { createLiteFolderContextSource } from "./liteContextSource";
import { createRagRetrieverContextSource } from "./ragContextSource";
import type { KnowledgeContextSource, KnowledgeSettings } from "./types";

export function createKnowledgeContextSource(
  getSettings: () => KnowledgeSettings,
  // Overridable for tests; production callers always use the two real sources.
  lite: KnowledgeContextSource = createLiteFolderContextSource(getSettings),
  rag: KnowledgeContextSource = createRagRetrieverContextSource(getSettings),
): KnowledgeContextSource {
  return {
    async isReady() {
      const settings = getSettings();
      if (settings.indexingMode === "full" && (await rag.isReady())) return true;
      return lite.isReady();
    },

    async buildContext(query, budgetChars) {
      const settings = getSettings();
      if (settings.indexingMode === "full" && (await rag.isReady())) {
        // A ready index can still legitimately find nothing relevant to this
        // particular query (every chunk below the similarity floor) — fall
        // back to Lite's recent-notes context rather than answering with none.
        const result = await rag.buildContext(query, budgetChars);
        if (result) return result;
      }
      return lite.buildContext(query, budgetChars);
    },
  };
}
