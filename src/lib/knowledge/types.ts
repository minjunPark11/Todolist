// Obsidian knowledge-base settings. Deliberately NOT part of AppSettings:
// vaultPath/dbPath are device-specific filesystem paths and must never sync
// to Supabase (see KNOWLEDGE_BASE_DESIGN.md §1 principle 6, §2 sync table).
export type KnowledgeIndexingMode = "lite" | "full";

export interface KnowledgeSettings {
  enabled: boolean;
  vaultPath: string;
  // "" = use the platform default (app data dir). See getDefaultKnowledgeDbPath.
  dbPath: string;
  indexingMode: KnowledgeIndexingMode;
  // Full RAG only. Default favors Korean-language retrieval quality; the
  // lighter "nomic-embed-text" is offered as an alternative in settings.
  embeddingModel: string;
  excludedFolders: string[];
  // Lite selection scoring hook; no UI yet (Phase 0), kept for forward
  // compatibility so the scoring code doesn't need a schema change later.
  priorityFolders: string[];
  knowledgeBudgetChars: number;
  // ISO timestamp, Full mode only. "" = never indexed.
  lastIndexedAt: string;
}

export const DEFAULT_EMBEDDING_MODEL = "bge-m3";

export const DEFAULT_KNOWLEDGE_SETTINGS: KnowledgeSettings = {
  enabled: false,
  vaultPath: "",
  dbPath: "",
  indexingMode: "lite",
  embeddingModel: DEFAULT_EMBEDDING_MODEL,
  excludedFolders: [".obsidian", ".trash", "templates"],
  priorityFolders: [],
  knowledgeBudgetChars: 30_000,
  lastIndexedAt: "",
};

// One retrieved excerpt shown to the model and, as `sources`, to the user as
// a citation chip. Lite fills this at file granularity (headingPath = the
// note's first heading); Full (Phase 2+) will fill it at chunk granularity.
export interface RetrievedChunk {
  text: string;
  filePath: string;
  headingPath: string;
  score: number;
}

export interface KnowledgeContextResult {
  text: string; // "[KNOWLEDGE] ..." block, ready to send as a system message
  sources: RetrievedChunk[];
}

// Lite/Full share this interface so retrieval can be swapped later without
// touching call sites (see KNOWLEDGE_BASE_DESIGN.md §4.8).
export interface KnowledgeContextSource {
  isReady(): Promise<boolean>;
  buildContext(query: string, budgetChars: number): Promise<KnowledgeContextResult | null>;
}

export function normalizeKnowledgeSettings(raw: unknown): KnowledgeSettings {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<KnowledgeSettings>;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_KNOWLEDGE_SETTINGS.enabled,
    vaultPath: typeof value.vaultPath === "string" ? value.vaultPath : DEFAULT_KNOWLEDGE_SETTINGS.vaultPath,
    dbPath: typeof value.dbPath === "string" ? value.dbPath : DEFAULT_KNOWLEDGE_SETTINGS.dbPath,
    indexingMode: value.indexingMode === "full" ? "full" : "lite",
    embeddingModel:
      typeof value.embeddingModel === "string" && value.embeddingModel.trim()
        ? value.embeddingModel
        : DEFAULT_KNOWLEDGE_SETTINGS.embeddingModel,
    excludedFolders: Array.isArray(value.excludedFolders)
      ? value.excludedFolders.filter((item): item is string => typeof item === "string")
      : DEFAULT_KNOWLEDGE_SETTINGS.excludedFolders,
    priorityFolders: Array.isArray(value.priorityFolders)
      ? value.priorityFolders.filter((item): item is string => typeof item === "string")
      : DEFAULT_KNOWLEDGE_SETTINGS.priorityFolders,
    knowledgeBudgetChars:
      typeof value.knowledgeBudgetChars === "number" && value.knowledgeBudgetChars > 0
        ? value.knowledgeBudgetChars
        : DEFAULT_KNOWLEDGE_SETTINGS.knowledgeBudgetChars,
    lastIndexedAt: typeof value.lastIndexedAt === "string" ? value.lastIndexedAt : DEFAULT_KNOWLEDGE_SETTINGS.lastIndexedAt,
  };
}
