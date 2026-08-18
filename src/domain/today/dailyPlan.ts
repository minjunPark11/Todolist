// What the user decided about a task on one particular day (TickTick plan §6.18).
//
// Today is a Query, not a container (§6.17): whether a task belongs there is
// derived from its dates and status, and nothing needs storing for that. Which
// bucket the user then MOVED it to is not derivable — and it is also not a
// fact about the task. §6.19 is explicit that now/next/later must not become a
// permanent field on Task; it is planning metadata for one date, so the same
// task appearing tomorrow starts from the rules again.
//
// It used to live in localStorage under one blob per device, which meant a
// plan made on the desktop was invisible on the laptop. These records sync
// like every other collection.
import type { DailyPlanBucket, TaskDailyPlan } from "../../types";
import { platform } from "../../platform";

const LEGACY_OVERRIDES_KEY = "todayPage.bucketOverrides.v1";

const BUCKETS: readonly DailyPlanBucket[] = ["now", "next", "later"];

function asBucket(value: unknown): DailyPlanBucket | undefined {
  return BUCKETS.find((bucket) => bucket === value);
}

/**
 * Deterministic, for the same reason `defaultListIdFor` is: a task has one
 * plan per date, so two devices deciding that independently have to arrive at
 * the same row instead of two rows that disagree about the same day.
 */
export function dailyPlanIdFor(planDate: string, taskId: string): string {
  return `plan-${planDate}-${taskId}`;
}

export function sanitizeDailyPlan(value: unknown): TaskDailyPlan | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const taskId = typeof record.taskId === "string" ? record.taskId.trim() : "";
  const planDate = typeof record.planDate === "string" ? record.planDate.trim() : "";
  const bucket = asBucket(record.bucket);
  // A plan that names no task, no date, or no bucket decides nothing. Keeping
  // it would leave a row that syncs forever and changes no screen.
  if (!taskId || !planDate || !bucket) return null;
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : "";
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : "";
  return {
    ...(record as Partial<TaskDailyPlan>), // M0 passthrough
    id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : dailyPlanIdFor(planDate, taskId),
    taskId,
    planDate,
    bucket,
    createdAt: createdAt || updatedAt,
    updatedAt: updatedAt || createdAt,
  };
}

/** The buckets chosen for one date, in the shape the Today page reads. */
export function bucketOverridesFor(
  plans: TaskDailyPlan[],
  planDate: string,
): Record<string, DailyPlanBucket> {
  const overrides: Record<string, DailyPlanBucket> = {};
  for (const plan of plans) {
    if (plan.planDate !== planDate) continue;
    overrides[plan.taskId] = plan.bucket;
  }
  return overrides;
}

/**
 * Make one date's plan say exactly `overrides`, and touch nothing else.
 *
 * Every caller — moving one task, planning the whole day, clearing it, undoing
 * any of those — hands over the whole map for that date, because the undo
 * toast restores a complete snapshot rather than replaying moves. That would
 * be a rewrite of every row if this replaced them, so a plan whose bucket did
 * not change keeps its object identity and `diffChangedRecords` leaves it
 * alone. Other dates are never even read.
 */
export function applyBucketOverrides(
  plans: TaskDailyPlan[],
  planDate: string,
  overrides: Record<string, DailyPlanBucket>,
  now: string,
): TaskDailyPlan[] {
  const next: TaskDailyPlan[] = [];
  const seen = new Set<string>();
  let touched = false;

  for (const plan of plans) {
    if (plan.planDate !== planDate) {
      next.push(plan);
      continue;
    }
    const bucket = overrides[plan.taskId];
    if (!bucket) {
      // Dropped from the plan: the task falls back to its rule-based default.
      touched = true;
      continue;
    }
    seen.add(plan.taskId);
    if (plan.bucket === bucket) {
      next.push(plan);
      continue;
    }
    touched = true;
    next.push({ ...plan, bucket, updatedAt: now });
  }

  for (const [taskId, bucket] of Object.entries(overrides)) {
    if (seen.has(taskId)) continue;
    touched = true;
    next.push({
      id: dailyPlanIdFor(planDate, taskId),
      taskId,
      planDate,
      bucket,
      createdAt: now,
      updatedAt: now,
    });
  }

  return touched ? next : plans;
}

/** Plans for days that have passed, which no screen reads any more. */
export function prunePlansBefore(plans: TaskDailyPlan[], planDate: string): TaskDailyPlan[] {
  const kept = plans.filter((plan) => plan.planDate >= planDate);
  return kept.length === plans.length ? plans : kept;
}

interface LegacyOverrides {
  planDate: string;
  overrides: Record<string, DailyPlanBucket>;
}

/**
 * The device-local blob this replaces. Read, never written: once adopted the
 * records are the answer, and a client old enough to still write the blob is
 * one whose plan for that day is already in it.
 */
export function readLegacyBucketOverrides(): LegacyOverrides | null {
  try {
    const raw = platform.storage.getSync(LEGACY_OVERRIDES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { date?: unknown; overrides?: unknown };
    const planDate = typeof parsed.date === "string" ? parsed.date.trim() : "";
    if (!planDate || !parsed.overrides || typeof parsed.overrides !== "object") return null;
    const overrides: Record<string, DailyPlanBucket> = {};
    for (const [taskId, value] of Object.entries(parsed.overrides as Record<string, unknown>)) {
      const bucket = asBucket(value);
      if (taskId && bucket) overrides[taskId] = bucket;
    }
    return Object.keys(overrides).length > 0 ? { planDate, overrides } : null;
  } catch {
    return null;
  }
}

/**
 * Merged by id rather than replacing, the same rule the other legacy adoptions
 * follow: if a synced plan for that day has already arrived, it wins, and a
 * repeated read (StrictMode, a failed save) adds nothing twice.
 */
export function adoptLegacyBucketOverrides(
  current: TaskDailyPlan[],
  now: string,
): TaskDailyPlan[] {
  const legacy = readLegacyBucketOverrides();
  if (!legacy) return current;
  const known = new Set(current.map((plan) => plan.id));
  const added: TaskDailyPlan[] = [];
  for (const [taskId, bucket] of Object.entries(legacy.overrides)) {
    const id = dailyPlanIdFor(legacy.planDate, taskId);
    if (known.has(id)) continue;
    added.push({ id, taskId, planDate: legacy.planDate, bucket, createdAt: now, updatedAt: now });
  }
  return added.length > 0 ? [...current, ...added] : current;
}
