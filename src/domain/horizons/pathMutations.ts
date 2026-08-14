// Learning Path array operations, pure so the planner reducer stays a thin
// wrapper and the rules are testable without React or storage.
//
// These used to live in learningPaths/store.ts, writing straight to a local
// blob. Paths became synced planner data with the Horizons page (Phase 2), so
// the *rules* moved here and the store kept only the legacy blob it now just
// migrates away from.
import type { LearningPath, Milestone } from "../../lib/ai/learningPaths/types";
import { applyGoalTimingPatch, normalizeGoalTiming } from "./goalSchedule";
import { todayValue } from "../../utils/date";

// A path per long-running goal, so the list stays short by nature. The caps
// are the same ones the blob enforced.
export const MAX_PATHS = 50;
export const MAX_MILESTONES = 8;

function stamp(path: LearningPath, now: string): LearningPath {
  return { ...path, updatedAt: now };
}

/** Newest-updated first: [0] is the path the assistant breadcrumb follows. */
export function sortPaths(paths: LearningPath[]): LearningPath[] {
  return [...paths].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function addPath(paths: LearningPath[], path: LearningPath, today = todayValue()): LearningPath[] {
  const milestones = path.milestones.map((milestone) => {
    const hasTiming = "schedule" in milestone || "targetDate" in milestone || "deadlineDate" in milestone;
    return hasTiming ? { ...milestone, ...normalizeGoalTiming(milestone, today) } : milestone;
  });
  return sortPaths([{ ...path, ...normalizeGoalTiming(path, today), milestones }, ...paths]).slice(0, MAX_PATHS);
}

export function patchPath(
  paths: LearningPath[],
  id: string,
  patch: Partial<Omit<LearningPath, "id">>,
  now: string,
  today = todayValue(),
): LearningPath[] {
  const hasTiming = "schedule" in patch || "targetDate" in patch || "deadlineDate" in patch;
  return paths.map((path) =>
    path.id === id
      ? stamp({ ...path, ...patch, ...(hasTiming ? applyGoalTimingPatch(path, patch, today) : {}), id }, now)
      : path,
  );
}

export function dropPath(paths: LearningPath[], id: string): LearningPath[] {
  return paths.filter((path) => path.id !== id);
}

function withMilestones(
  paths: LearningPath[],
  pathId: string,
  next: (milestones: Milestone[]) => Milestone[],
  now: string,
): LearningPath[] {
  return paths.map((path) =>
    path.id === pathId ? stamp({ ...path, milestones: next(path.milestones).slice(0, MAX_MILESTONES) }, now) : path,
  );
}

export function addMilestone(
  paths: LearningPath[],
  pathId: string,
  milestone: Milestone,
  now: string,
  today = todayValue(),
): LearningPath[] {
  const hasTiming = "schedule" in milestone || "targetDate" in milestone || "deadlineDate" in milestone;
  const normalized = hasTiming ? { ...milestone, ...normalizeGoalTiming(milestone, today) } : milestone;
  return withMilestones(paths, pathId, (milestones) => [...milestones, normalized], now);
}

export function patchMilestone(
  paths: LearningPath[],
  pathId: string,
  milestoneId: string,
  patch: Partial<Omit<Milestone, "id">>,
  now: string,
  today = todayValue(),
): LearningPath[] {
  const hasTiming = "schedule" in patch || "targetDate" in patch || "deadlineDate" in patch;
  return withMilestones(
    paths,
    pathId,
    (milestones) =>
      milestones.map((milestone) =>
        milestone.id === milestoneId
          ? { ...milestone, ...patch, ...(hasTiming ? applyGoalTimingPatch(milestone, patch, today) : {}), id: milestone.id }
          : milestone,
      ),
    now,
  );
}

export function dropMilestone(
  paths: LearningPath[],
  pathId: string,
  milestoneId: string,
  now: string,
): LearningPath[] {
  return withMilestones(paths, pathId, (milestones) => milestones.filter((m) => m.id !== milestoneId), now);
}

/**
 * Attach a saved Context Card to one milestone. Idempotent — a card is added
 * at most once, and updatedAt bumps so the touched path sorts first and
 * becomes the one the breadcrumb shows.
 */
export function linkCardToMilestone(
  paths: LearningPath[],
  pathId: string,
  milestoneId: string,
  cardId: string,
  now: string,
): LearningPath[] {
  return withMilestones(
    paths,
    pathId,
    (milestones) =>
      milestones.map((milestone) =>
        milestone.id === milestoneId && !milestone.cardIds.includes(cardId)
          ? { ...milestone, cardIds: [...milestone.cardIds, cardId] }
          : milestone,
      ),
    now,
  );
}
