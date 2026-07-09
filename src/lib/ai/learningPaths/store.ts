// Learning Path persistence. Same deliberate choice as contextCards/store.ts:
// a plain local key-value blob (platform.storage), device-local, outside the
// Supabase-synced dataset — no schema change, no migration, swappable for a
// DB-backed store later without touching callers.
import { platform } from "../../../platform";
import type { InfoSlot } from "../contextCards/types";
import type { LearningPath, LearningPathDraft, Milestone } from "./types";

const STORAGE_KEY = "focusflow.learningPaths.v1";
// Paths are few by nature (one per long-running goal); oldest-updated are
// pruned past this cap so the blob stays small.
const MAX_PATHS = 50;
const MAX_MILESTONES = 8;

const INFO_SLOT_KINDS = new Set(["done_criteria", "deadline", "blocked_point", "prerequisite", "time_budget", "scope_boundary"]);

function asStringArray(value: unknown, maxItems = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .map((item) => item.trim())
    .slice(0, maxItems);
}

function asOptionalInfoSlots(value: unknown): InfoSlot[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const slots = value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .filter((entry) => typeof entry.kind === "string" && INFO_SLOT_KINDS.has(entry.kind))
    .map((entry): InfoSlot => {
      const source = entry.source;
      return {
        kind: entry.kind as InfoSlot["kind"],
        question: typeof entry.question === "string" ? entry.question : "",
        answer: typeof entry.answer === "string" ? entry.answer : "",
        source: source === "user_answer" || source === "derived" || source === "assumed_default" ? source : undefined,
      };
    })
    .slice(0, 6);
  return slots.length > 0 ? slots : undefined;
}

function sanitizeMilestone(value: unknown): Milestone | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  if (typeof record.title !== "string" || !record.title.trim()) return null;
  return {
    id: record.id,
    title: record.title.trim(),
    doneCriteria: typeof record.doneCriteria === "string" ? record.doneCriteria : "",
    cardIds: asStringArray(record.cardIds),
    // status is derived at read time (progress.ts), never restored from disk.
  };
}

function sanitizePath(value: unknown): LearningPath | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  if (typeof record.goal !== "string" || !record.goal.trim()) return null;
  const milestones = Array.isArray(record.milestones)
    ? record.milestones
        .map(sanitizeMilestone)
        .filter((milestone): milestone is Milestone => milestone !== null)
        .slice(0, MAX_MILESTONES)
    : [];
  if (milestones.length === 0) return null;
  return {
    id: record.id,
    goal: record.goal.trim(),
    milestones,
    infoSlots: asOptionalInfoSlots(record.infoSlots),
    source: record.source === "user" ? "user" : "assistant",
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
  };
}

// Newest-updated first, so [0] is the path the breadcrumb shows.
export function loadLearningPaths(): LearningPath[] {
  try {
    const raw = platform.storage.getSync(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizePath)
      .filter((path): path is LearningPath => path !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

function persist(paths: LearningPath[]) {
  const bounded = [...paths]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_PATHS);
  try {
    platform.storage.setSync(STORAGE_KEY, JSON.stringify(bounded));
  } catch {
    // Storage may be unavailable (private mode / quota); the path stays
    // usable in memory for this session and the app keeps working.
  }
}

export function saveLearningPath(draft: LearningPathDraft, source: LearningPath["source"] = "assistant"): LearningPath {
  const now = new Date().toISOString();
  const path: LearningPath = {
    ...draft,
    id: `lpath-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    source,
    createdAt: now,
    updatedAt: now,
  };
  persist([path, ...loadLearningPaths()]);
  return path;
}

export function updateLearningPath(id: string, patch: Partial<LearningPathDraft>): LearningPath | null {
  const paths = loadLearningPaths();
  const existing = paths.find((path) => path.id === id);
  if (!existing) return null;
  const updated: LearningPath = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
  persist(paths.map((path) => (path.id === id ? updated : path)));
  return updated;
}

export function removeLearningPath(id: string) {
  persist(loadLearningPaths().filter((path) => path.id !== id));
}
