// Full retrieval: embed the query, cosine-rank stored chunks, take top-k
// (KNOWLEDGE_BASE_DESIGN.md §3.4, §4.8). This is the Lite→Full swap point —
// it implements the exact same KnowledgeContextSource interface and produces
// the same [KNOWLEDGE] block format via the shared assembler.
import { platform } from "../../platform";
import { assembleKnowledgeContext } from "./contextFormat";
import { createEmbeddingProvider, resolveEmbeddingStoreModelName } from "./embeddingProvider";
import { KnowledgeStore, type StoredChunk } from "./knowledgeStore";
import type { KnowledgeContextSource, KnowledgeSettings } from "./types";

// "top-k / 예산: k=6 유지" — §11 decision #5. The design calls for "유사도
// 하한 적용" without specifying a value; 0.15 is a conservative heuristic
// floor that filters clearly-unrelated chunks without needing per-model
// calibration data we don't have.
const TOP_K = 6;
const MIN_SIMILARITY = 0.15;

let cachedStore: { dbPath: string; store: KnowledgeStore } | null = null;

async function getStore(dbPath: string): Promise<KnowledgeStore> {
  if (cachedStore && cachedStore.dbPath === dbPath) return cachedStore.store;
  if (cachedStore) {
    await cachedStore.store.close().catch(() => undefined);
    cachedStore = null;
  }
  const store = await KnowledgeStore.open(dbPath);
  cachedStore = { dbPath, store };
  return store;
}

export type RankedChunk = StoredChunk & { score: number };

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Pure so it can be unit-tested without a live KnowledgeStore/Tauri runtime.
export function rankChunksBySimilarity(chunks: StoredChunk[], queryEmbedding: number[]): RankedChunk[] {
  return chunks
    .map((chunk) => ({ ...chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
    .filter((chunk) => chunk.score >= MIN_SIMILARITY)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);
}

// True only when the store's recorded embedding model still matches the
// configured one — otherwise the stored vectors live in a different vector
// space than a freshly-embedded query, and cosine scores would be meaningless.
async function getUsableStoredModel(store: KnowledgeStore, settings: KnowledgeSettings): Promise<string | null> {
  const storedModel = await store.getMeta("embedding_model");
  const expectedModel = await resolveEmbeddingStoreModelName();
  if (!storedModel || !expectedModel || storedModel !== expectedModel) return null;
  return storedModel;
}

export function createRagRetrieverContextSource(getSettings: () => KnowledgeSettings): KnowledgeContextSource {
  return {
    async isReady() {
      const settings = getSettings();
      if (!settings.enabled || !settings.vaultPath || !platform.files.supported()) return false;

      try {
        const store = await getStore(settings.dbPath);
        const storedModel = await getUsableStoredModel(store, settings);
        if (!storedModel) return false;
        const stats = await store.getStats();
        return stats.chunkCount > 0;
      } catch {
        return false;
      }
    },

    async buildContext(query, budgetChars) {
      const settings = getSettings();
      if (!settings.enabled || !settings.vaultPath || !platform.files.supported()) return null;

      let store: KnowledgeStore;
      try {
        store = await getStore(settings.dbPath);
      } catch {
        return null;
      }

      const storedModel = await getUsableStoredModel(store, settings);
      if (!storedModel) return null;

      const provider = createEmbeddingProvider(storedModel);
      if (!(await provider.isAvailable())) return null;

      let queryEmbedding: number[] | undefined;
      try {
        [queryEmbedding] = await provider.embed([query]);
      } catch {
        return null;
      }
      if (!queryEmbedding) return null;

      const chunks = await store.getAllChunks();
      if (!chunks.length) return null;

      const ranked = rankChunksBySimilarity(chunks, queryEmbedding);
      if (!ranked.length) return null;

      return assembleKnowledgeContext(
        ranked.map((chunk) => ({ filePath: chunk.filePath, headingPath: chunk.headingPath, text: chunk.text, score: chunk.score })),
        budgetChars,
      );
    },
  };
}
