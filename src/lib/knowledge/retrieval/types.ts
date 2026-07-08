// Retrieval facade types for the knowledge base (Obsidian vault). The AI
// Assistant MVP should depend on this narrow surface instead of the concrete
// Lite/RAG context sources, so retrieval internals can evolve (chunking,
// embeddings, ranking) without touching assistant code.
import type { KnowledgeContextResult, RetrievedChunk } from "../types";

export type { KnowledgeContextResult, RetrievedChunk };

export type KnowledgeSearchRequest = {
  query: string;
  // Max characters of retrieved context; requests with a non-positive budget
  // resolve to null without touching the vault.
  budgetChars: number;
};

// Reusable handle over the Lite/Full source selection. `search` returns null
// when the vault is unset/unreadable or nothing relevant clears the score
// floor — callers treat retrieval as a best-effort enhancement, never an
// error path.
export interface KnowledgeRetriever {
  isReady(): Promise<boolean>;
  search(request: KnowledgeSearchRequest): Promise<KnowledgeContextResult | null>;
}
