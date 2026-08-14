// Learning Path validation + the legacy local blob.
//
// Paths used to live here entirely: a device-local key-value blob, outside the
// synced dataset. That was right while they were a by-product of the chat, and
// the original comment said so — "swappable for a DB-backed store later
// without touching callers". The Horizons page made them ordinary user data,
// and a goal you cannot see on your other device is not a goal, so ownership
// moved to PlannerData (HORIZONS_DESIGN.md D3).
//
// What is left here: the sanitizer (one validator for both the blob and the
// synced rows) and a one-way drain of the old blob. Array operations live in
// domain/horizons/pathMutations.ts; writes go through usePlannerData.
import { platform } from "../../../platform";
import type { InfoSlot } from "../contextCards/types";
import type { LearningPath, Milestone } from "./types";
import { MAX_MILESTONES } from "../../../domain/horizons/pathMutations";
import { normalizeGoalTiming } from "../../../domain/horizons/goalSchedule";
import { todayValue } from "../../../utils/date";
import { sanitizeGoalDetailFields } from "../../../domain/horizons/goalDetails";

export const LEGACY_LEARNING_PATHS_KEY = "focusflow.learningPaths.v1";
// Set once the blob has been folded into planner data. Kept as a separate
// marker rather than relying on an emptied blob so that deleting every goal
// afterwards cannot resurrect the old copy.
export const LEGACY_LEARNING_PATHS_MIGRATED_KEY = "focusflow.learningPaths.migrated.v1";

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

function sanitizeMilestone(value: unknown, today: string): Milestone | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  if (typeof record.title !== "string" || !record.title.trim()) return null;
  const hasTiming = "schedule" in record || "targetDate" in record || "deadlineDate" in record;
  const timing = hasTiming ? normalizeGoalTiming(record, today) : undefined;
  return {
    id: record.id,
    title: record.title.trim(),
    doneCriteria: typeof record.doneCriteria === "string" ? record.doneCriteria : "",
    cardIds: asStringArray(record.cardIds),
    ...(timing ?? {}),
    taskIds: asStringArray(record.taskIds).length > 0 ? asStringArray(record.taskIds) : undefined,
    completedAt: typeof record.completedAt === "string" && record.completedAt ? record.completedAt : undefined,
    // status is derived at read time (progress.ts), never restored from disk.
  };
}

export function sanitizeLearningPath(value: unknown, today = todayValue()): LearningPath | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  if (typeof record.goal !== "string" || !record.goal.trim()) return null;
  const milestones = Array.isArray(record.milestones)
    ? record.milestones
        .map((milestone) => sanitizeMilestone(milestone, today))
        .filter((milestone): milestone is Milestone => milestone !== null)
        .slice(0, MAX_MILESTONES)
    : [];
  // A path with no milestones used to be dropped, because the only author was
  // the assistant and an empty proposal meant a malformed one. The Horizons
  // page lets a person write the goal down first and break it up later, so an
  // empty milestone list is now a legitimate state rather than corruption.
  const timing = normalizeGoalTiming(record, today);
  return {
    id: record.id,
    goal: record.goal.trim(),
    ...sanitizeGoalDetailFields(record),
    milestones,
    schedule: timing.schedule,
    deadlineDate: timing.deadlineDate,
    targetDate: timing.targetDate,
    projectId: typeof record.projectId === "string" && record.projectId ? record.projectId : undefined,
    completedAt: typeof record.completedAt === "string" && record.completedAt ? record.completedAt : undefined,
    infoSlots: asOptionalInfoSlots(record.infoSlots),
    source: record.source === "user" ? "user" : "assistant",
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
  };
}


// --- Legacy blob migration --------------------------------------------------
// Reading and marking are deliberately separate calls.
//
// They were one function at first, and it lost data: React StrictMode invokes
// a useState initialiser twice, so the first call drained the blob and set the
// marker while the *second* — whose result React actually keeps — saw the
// marker and returned nothing. The same hole opens without StrictMode whenever
// a remote load lands before the local read has been persisted.
//
// So the read below is pure and repeatable, and the marker is only set once
// the adopted data is committed to the PlannerData storage key.
// The blob itself is left in place for one release as a safety net — a few
// kilobytes against the chance that a migration went wrong somewhere.

export function hasMigratedLegacyLearningPaths(): boolean {
  try {
    return platform.storage.getSync(LEGACY_LEARNING_PATHS_MIGRATED_KEY) === "1";
  } catch {
    // No storage means no blob to migrate either; treat it as already done so
    // the caller never blocks on it.
    return true;
  }
}

export type LegacyLearningPathsSnapshot =
  | { status: "migrated" | "absent" | "invalid"; paths: [] }
  | { status: "valid"; paths: LearningPath[] };

/** Pure inspection — safe to call any number of times, with no side effects. */
export function inspectLegacyLearningPaths(): LegacyLearningPathsSnapshot {
  if (hasMigratedLegacyLearningPaths()) return { status: "migrated", paths: [] };
  try {
    const raw = platform.storage.getSync(LEGACY_LEARNING_PATHS_KEY);
    if (!raw) return { status: "absent", paths: [] };
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { status: "invalid", paths: [] };
    const sanitized = parsed.map((path) => sanitizeLearningPath(path));
    if (sanitized.some((path) => path === null)) return { status: "invalid", paths: [] };
    const paths = (sanitized as LearningPath[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { status: "valid", paths };
  } catch {
    return { status: "invalid", paths: [] };
  }
}

/** Compatibility helper used by the adoption path. */
export function readLegacyLearningPaths(): LearningPath[] {
  return inspectLegacyLearningPaths().paths;
}

// Called only after the new planner snapshot has been persisted. A corrupt
// source or a partial adoption stays retryable and never consumes the marker.
export function markLegacyLearningPathsMigratedIfAdopted(current: LearningPath[]): boolean {
  const snapshot = inspectLegacyLearningPaths();
  if (snapshot.status === "migrated") return true;
  if (snapshot.status === "invalid") return false;
  if (snapshot.status === "valid") {
    const adoptedIds = new Set(current.map((path) => path.id));
    if (!snapshot.paths.every((path) => adoptedIds.has(path.id))) return false;
  }
  markLegacyLearningPathsMigrated();
  return hasMigratedLegacyLearningPaths();
}

export function markLegacyLearningPathsMigrated() {
  try {
    platform.storage.setSync(LEGACY_LEARNING_PATHS_MIGRATED_KEY, "1");
  } catch {
    // Marker unavailable: the read repeats next start. Adoption merges by id,
    // so a repeat is a no-op rather than a duplicate.
  }
}
