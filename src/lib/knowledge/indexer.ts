// Full-mode indexing pipeline (KNOWLEDGE_BASE_DESIGN.md §3.2-§3.3, §9). Builds
// and maintains the local sqlite index; does not perform retrieval (Phase 3).
import { platform } from "../../platform";
import { chunkMarkdownNote } from "./chunker";
import { createEmbeddingProvider } from "./embeddingProvider";
import { KnowledgeStore } from "./knowledgeStore";
import { parseMarkdownNote } from "./markdownParser";
import { clearVaultScanCache, scanVault } from "./obsidianScanner";

export class EmbeddingModelUnavailableError extends Error {
  constructor(readonly modelName: string) {
    super(`Local AI embedding backend "${modelName}" is not ready. Install a Local AI model and try again.`);
    this.name = "EmbeddingModelUnavailableError";
  }
}

export type IndexPhase = "scanning" | "indexing" | "done";

export interface IndexProgress {
  phase: IndexPhase;
  processed: number;
  total: number;
  currentFile?: string;
}

export interface RunIndexOptions {
  vaultPath: string;
  excludedFolders: string[];
  embeddingModel: string;
  // Skips the hash/mtime shortcuts and re-embeds every scanned file. Also
  // applied automatically when the configured embedding model differs from
  // the one recorded in the store's meta (stale embeddings are useless for
  // cosine similarity once the model — and therefore vector space — changes).
  forceFull?: boolean;
  onProgress?: (progress: IndexProgress) => void;
  shouldCancel?: () => boolean;
}

export interface RunIndexResult {
  filesIndexed: number;
  filesDeleted: number;
  filesUnchanged: number;
  cancelled: boolean;
  modelChanged: boolean;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function runIndexing(store: KnowledgeStore, options: RunIndexOptions): Promise<RunIndexResult> {
  const provider = createEmbeddingProvider(options.embeddingModel);
  if (!(await provider.isAvailable())) {
    throw new EmbeddingModelUnavailableError(options.embeddingModel);
  }

  const providerModel = provider.modelName();
  const storedModel = await store.getMeta("embedding_model");
  const modelChanged = Boolean(storedModel) && storedModel !== providerModel;
  const forceFull = Boolean(options.forceFull) || modelChanged;

  options.onProgress?.({ phase: "scanning", processed: 0, total: 0 });
  clearVaultScanCache();
  const entries = await scanVault(options.vaultPath, options.excludedFolders);
  const entryByPath = new Map(entries.map((entry) => [entry.relativePath, entry]));
  const existingHashes = new Map((await store.listFileHashes()).map((file) => [file.relativePath, file]));

  let filesDeleted = 0;
  for (const relativePath of existingHashes.keys()) {
    if (!entryByPath.has(relativePath)) {
      await store.deleteFileByPath(relativePath);
      filesDeleted++;
    }
  }

  let filesIndexed = 0;
  let filesUnchanged = 0;
  let processed = 0;
  const total = entries.length;

  for (const entry of entries) {
    if (options.shouldCancel?.()) {
      return { filesIndexed, filesDeleted, filesUnchanged, cancelled: true, modelChanged };
    }
    processed++;
    options.onProgress?.({ phase: "indexing", processed, total, currentFile: entry.relativePath });

    const existing = existingHashes.get(entry.relativePath);
    if (!forceFull && existing && existing.modifiedAt === entry.modifiedAt) {
      filesUnchanged++;
      continue;
    }

    let content: string;
    try {
      content = await platform.files.readTextFile(entry.path);
    } catch {
      continue;
    }

    const hash = await sha256Hex(content);
    if (!forceFull && existing && existing.contentHash === hash) {
      filesUnchanged++;
      continue;
    }

    const parsed = parseMarkdownNote(content);
    const chunks = chunkMarkdownNote(content, parsed);
    const embeddings = chunks.length ? await provider.embed(chunks.map((chunk) => chunk.text)) : [];

    await store.indexFile(
      {
        relativePath: entry.relativePath,
        contentHash: hash,
        sizeBytes: entry.size,
        modifiedAt: entry.modifiedAt,
        tags: parsed.tags,
        aliases: parsed.aliases,
        wikiLinks: parsed.wikiLinks,
      },
      chunks.map((chunk, index) => ({
        headingPath: chunk.headingPath,
        startOffset: chunk.startOffset,
        text: chunk.text,
        embedding: embeddings[index] ?? [],
      })),
    );
    filesIndexed++;
  }

  await store.setMeta("vault_path", options.vaultPath);
  await store.setMeta("embedding_model", provider.modelName());
  if (provider.dimensions() !== null) {
    await store.setMeta("embedding_dimensions", String(provider.dimensions()));
  }
  await store.setMeta("last_indexed_at", new Date().toISOString());

  options.onProgress?.({ phase: "done", processed: total, total });

  return { filesIndexed, filesDeleted, filesUnchanged, cancelled: false, modelChanged };
}
