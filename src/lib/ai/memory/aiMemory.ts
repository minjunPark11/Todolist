// AI Memory store (User Patterns slice C.1): durable, user-approved facts the
// assistant may recall across sessions — preferences, routines, stable facts,
// intervention outcomes. This fills the AiMemoryStore seam declared in
// types.ts. Same device-local KV pattern as contextCards/turnLog: never
// synced, user-inspectable and deletable, and (via the full-app dataScope of
// the context pack it feeds) never sent to a non-local provider.
//
// The store holds only APPROVED memories. Slice C.2's proposal flow keeps
// candidates transient until the user confirms, then calls saveMemory here —
// so anything in this store is already user-approved by construction.
import { platform } from "../../../platform";
import type { AiMemoryEntry, AiMemoryKind } from "./types";

const STORAGE_KEY = "focusflow.aiMemory.v1";
// Memories are few by nature (one per stable preference/routine); oldest-
// updated are pruned past this cap so the blob stays small.
const MAX_ENTRIES = 60;

const KINDS: readonly AiMemoryKind[] = ["preference", "fact", "routine", "intervention_outcome"];

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0.3;
  return Math.min(1, Math.max(0, value));
}

function sanitizeEntry(value: unknown): AiMemoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  if (typeof record.content !== "string" || !record.content.trim()) return null;
  if (!KINDS.includes(record.kind as AiMemoryKind)) return null;
  const now = new Date().toISOString();
  return {
    id: record.id,
    kind: record.kind as AiMemoryKind,
    content: record.content.trim(),
    confidence: clampConfidence(record.confidence),
    sourceRef: typeof record.sourceRef === "string" ? record.sourceRef : undefined,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : now,
    expiresAt: typeof record.expiresAt === "string" ? record.expiresAt : "",
  };
}

// Non-expired memories, newest-updated first.
export function loadMemories(): AiMemoryEntry[] {
  try {
    const raw = platform.storage.getSync(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = new Date().toISOString();
    return parsed
      .map(sanitizeEntry)
      .filter((entry): entry is AiMemoryEntry => entry !== null)
      // "" never expires; otherwise drop once the ISO expiry has passed.
      .filter((entry) => entry.expiresAt === "" || entry.expiresAt > now)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

function persist(entries: AiMemoryEntry[]) {
  const bounded = [...entries]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_ENTRIES);
  try {
    platform.storage.setSync(STORAGE_KEY, JSON.stringify(bounded));
  } catch {
    // Storage unavailable — best-effort, must never block the assistant flow.
  }
}

export type NewMemory = {
  kind: AiMemoryKind;
  content: string;
  // Inferred memories start low and grow on reconfirmation (slice C.2).
  confidence?: number;
  sourceRef?: string;
  expiresAt?: string;
};

export function saveMemory(memory: NewMemory): AiMemoryEntry {
  const now = new Date().toISOString();
  const entry: AiMemoryEntry = {
    id: `mem-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    kind: memory.kind,
    content: memory.content.trim(),
    confidence: clampConfidence(memory.confidence ?? 0.3),
    sourceRef: memory.sourceRef,
    createdAt: now,
    updatedAt: now,
    expiresAt: memory.expiresAt ?? "",
  };
  persist([entry, ...loadMemories()]);
  return entry;
}

export function updateMemory(
  id: string,
  patch: Partial<Pick<AiMemoryEntry, "content" | "confidence" | "kind" | "expiresAt">>,
): AiMemoryEntry | null {
  const entries = loadMemories();
  const existing = entries.find((entry) => entry.id === id);
  if (!existing) return null;
  const updated: AiMemoryEntry = {
    ...existing,
    ...patch,
    confidence: patch.confidence === undefined ? existing.confidence : clampConfidence(patch.confidence),
    id,
    updatedAt: new Date().toISOString(),
  };
  persist(entries.map((entry) => (entry.id === id ? updated : entry)));
  return updated;
}

export function removeMemory(id: string) {
  persist(loadMemories().filter((entry) => entry.id !== id));
}

export function clearMemories() {
  try {
    platform.storage.setSync(STORAGE_KEY, JSON.stringify([]));
  } catch {
    // Nothing stored anyway.
  }
}

export function memoryCount(): number {
  return loadMemories().length;
}
