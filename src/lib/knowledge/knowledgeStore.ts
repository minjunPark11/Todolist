// Local-only SQLite index for Full mode (KNOWLEDGE_BASE_DESIGN.md §4.7, §5).
// No network code path exists here — this module only ever talks to the
// on-disk sqlite file opened via Database.load(). Never sent to Supabase/any
// remote server (design principles 4-5).
import Database from "@tauri-apps/plugin-sql";
import { platform } from "../../platform";

const SCHEMA_VERSION = "1";

// Bound to the plugin's own bind-value handling: a JS array/object value
// passed through db.execute()'s `values` array arrives on the Rust side as
// serde_json::Value and, for anything that isn't null/string/number, gets
// bound via sqlx's blanket Encode<Sqlite> for JsonValue — which serializes it
// as JSON TEXT, not a raw binary BLOB. Verified empirically against sqlx
// 0.8 (the version tauri-plugin-sql 2.4.0 depends on) before relying on it
// here. So `embedding`/`tags`/`aliases`/`wiki_links` are declared TEXT and
// hold JSON-encoded arrays, not the BLOB the original design draft assumed.
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY,
    relative_path TEXT NOT NULL UNIQUE,
    content_hash TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    modified_at INTEGER NOT NULL,
    indexed_at INTEGER NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    aliases TEXT NOT NULL DEFAULT '[]',
    wiki_links TEXT NOT NULL DEFAULT '[]'
  )`,
  `CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    heading_path TEXT NOT NULL DEFAULT '',
    start_offset INTEGER NOT NULL,
    text TEXT NOT NULL,
    embedding TEXT NOT NULL,
    UNIQUE (file_id, chunk_index)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_files_path ON files(relative_path)`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id)`,
];

export interface FileHashRecord {
  relativePath: string;
  contentHash: string;
  modifiedAt: number;
}

export interface FileIndexInput {
  relativePath: string;
  contentHash: string;
  sizeBytes: number;
  modifiedAt: number;
  tags: string[];
  aliases: string[];
  wikiLinks: string[];
}

export interface ChunkIndexInput {
  headingPath: string;
  startOffset: number;
  text: string;
  embedding: number[];
}

export interface IndexStats {
  fileCount: number;
  chunkCount: number;
  lastIndexedAt: string;
}

export interface StoredChunk {
  filePath: string;
  headingPath: string;
  text: string;
  embedding: number[];
}

async function resolveAndOpenDb(dbPath: string): Promise<{ db: Database; resolvedPath: string; usedFallback: boolean }> {
  const customPath = dbPath.trim();
  if (customPath) {
    try {
      const db = await Database.load(`sqlite:${customPath}`);
      return { db, resolvedPath: customPath, usedFallback: false };
    } catch {
      // Falls through to the default path below (design's dbPath fallback rule).
    }
  }

  await platform.files.ensureKnowledgeDbDir();
  const defaultPath = await platform.files.getDefaultKnowledgeDbPath();
  const db = await Database.load(`sqlite:${defaultPath}`);
  return { db, resolvedPath: defaultPath, usedFallback: Boolean(customPath) };
}

export class KnowledgeStore {
  private db: Database;
  readonly resolvedPath: string;
  readonly usedFallback: boolean;

  private constructor(db: Database, resolvedPath: string, usedFallback: boolean) {
    this.db = db;
    this.resolvedPath = resolvedPath;
    this.usedFallback = usedFallback;
  }

  static async open(dbPath: string): Promise<KnowledgeStore> {
    const { db, resolvedPath, usedFallback } = await resolveAndOpenDb(dbPath);
    const store = new KnowledgeStore(db, resolvedPath, usedFallback);
    await store.init();
    return store;
  }

  private async init() {
    // SQLite disables foreign-key enforcement per connection by default; the
    // chunks table's ON DELETE CASCADE relies on it being on.
    await this.db.execute("PRAGMA foreign_keys = ON");
    for (const statement of SCHEMA_STATEMENTS) {
      await this.db.execute(statement);
    }
    await this.setMeta("schema_version", SCHEMA_VERSION);
  }

  async close() {
    await this.db.close();
  }

  async getMeta(key: string): Promise<string | null> {
    const rows = await this.db.select<Array<{ value: string }>>("SELECT value FROM meta WHERE key = $1", [key]);
    return rows[0]?.value ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.db.execute(
      "INSERT INTO meta (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, value],
    );
  }

  async listFileHashes(): Promise<FileHashRecord[]> {
    const rows = await this.db.select<Array<{ relative_path: string; content_hash: string; modified_at: number }>>(
      "SELECT relative_path, content_hash, modified_at FROM files",
    );
    return rows.map((row) => ({
      relativePath: row.relative_path,
      contentHash: row.content_hash,
      modifiedAt: row.modified_at,
    }));
  }

  // For Full retrieval's cosine ranking (Phase 3). `embedding` comes back as
  // a TEXT column — sqlx/tauri-plugin-sql decodes non-scalar SQLite values as
  // their raw stored string, not parsed JSON, so it must be JSON.parse()'d
  // here (same reason indexFile() stores it via JSON-serializing bind, not a
  // real BLOB — see the schema comment above).
  async getAllChunks(): Promise<StoredChunk[]> {
    const rows = await this.db.select<
      Array<{ relative_path: string; heading_path: string; text: string; embedding: string }>
    >(
      `SELECT f.relative_path as relative_path, c.heading_path as heading_path, c.text as text, c.embedding as embedding
       FROM chunks c JOIN files f ON f.id = c.file_id`,
    );
    return rows.map((row) => ({
      filePath: row.relative_path,
      headingPath: row.heading_path,
      text: row.text,
      embedding: JSON.parse(row.embedding) as number[],
    }));
  }

  // Inserts or updates the file row and replaces all of its chunks. Returns
  // the file id (needed by callers only for logging/debugging).
  async indexFile(file: FileIndexInput, chunks: ChunkIndexInput[]): Promise<number> {
    const now = Date.now();
    await this.db.execute(
      `INSERT INTO files (relative_path, content_hash, size_bytes, modified_at, indexed_at, tags, aliases, wiki_links)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT(relative_path) DO UPDATE SET
         content_hash = excluded.content_hash,
         size_bytes = excluded.size_bytes,
         modified_at = excluded.modified_at,
         indexed_at = excluded.indexed_at,
         tags = excluded.tags,
         aliases = excluded.aliases,
         wiki_links = excluded.wiki_links`,
      [file.relativePath, file.contentHash, file.sizeBytes, file.modifiedAt, now, file.tags, file.aliases, file.wikiLinks],
    );

    const rows = await this.db.select<Array<{ id: number }>>("SELECT id FROM files WHERE relative_path = $1", [
      file.relativePath,
    ]);
    const fileId = rows[0]?.id;
    if (fileId === undefined) {
      throw new Error(`Failed to resolve file id for ${file.relativePath} after upsert.`);
    }

    await this.db.execute("DELETE FROM chunks WHERE file_id = $1", [fileId]);
    for (const [index, chunk] of chunks.entries()) {
      await this.db.execute(
        `INSERT INTO chunks (file_id, chunk_index, heading_path, start_offset, text, embedding)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [fileId, index, chunk.headingPath, chunk.startOffset, chunk.text, chunk.embedding],
      );
    }

    return fileId;
  }

  async deleteFileByPath(relativePath: string): Promise<void> {
    await this.db.execute("DELETE FROM files WHERE relative_path = $1", [relativePath]);
  }

  // Clears all indexed content (files/chunks/meta) without dropping the
  // schema, for the "disconnect vault" flow's opt-in index deletion
  // (KNOWLEDGE_BASE_DESIGN.md §8 — default is to delete on disconnect).
  async wipeAll(): Promise<void> {
    await this.db.execute("DELETE FROM chunks");
    await this.db.execute("DELETE FROM files");
    await this.db.execute("DELETE FROM meta");
  }

  async getStats(): Promise<IndexStats> {
    const [fileRows, chunkRows, lastIndexedAt] = await Promise.all([
      this.db.select<Array<{ count: number }>>("SELECT COUNT(*) as count FROM files"),
      this.db.select<Array<{ count: number }>>("SELECT COUNT(*) as count FROM chunks"),
      this.getMeta("last_indexed_at"),
    ]);
    return {
      fileCount: fileRows[0]?.count ?? 0,
      chunkCount: chunkRows[0]?.count ?? 0,
      lastIndexedAt: lastIndexedAt ?? "",
    };
  }
}
