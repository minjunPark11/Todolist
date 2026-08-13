// Derivations for the redesigned Today page (TODAY_PAGE_IMPLEMENTATION_SPEC).
// Maps the existing Task/Project/ConceptNote model onto the spec's
// TodayTask / TimeBlock / SpaceSignal concepts without changing stored data.
import type { ConceptNote, Project, Task } from "../types";
import { platform } from "../platform";
import { todayValue } from "./date";
import { getDueReviewCount } from "./planner";

export type TodayBucketId = "now" | "next" | "later";

export type TodayReason =
  | "overdue"
  | "progress"
  | "focus"
  | "waiting"
  | "high"
  | "medium"
  | "low"
  // No badge earned: the task carries no priority and nothing else about it
  // is noteworthy. Distinct from "low", which is a choice the user made.
  | "none";

export interface TodayEntry {
  task: Task;
  bucket: TodayBucketId;
  defaultBucket: TodayBucketId;
  reason: TodayReason;
  completed: boolean;
}

export type BucketOverrides = Record<string, TodayBucketId>;

const OVERRIDES_STORAGE_KEY = "todayPage.bucketOverrides.v1";

export function loadBucketOverrides(today = todayValue()): BucketOverrides {
  try {
    const raw = platform.storage.getSync(OVERRIDES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { date?: string; overrides?: BucketOverrides };
    // Overrides are a per-day decision; a new day starts from the rule-based default.
    if (parsed.date !== today || !parsed.overrides) return {};
    return parsed.overrides;
  } catch {
    return {};
  }
}

export function saveBucketOverrides(overrides: BucketOverrides, today = todayValue()) {
  try {
    platform.storage.setSync(
      OVERRIDES_STORAGE_KEY,
      JSON.stringify({ date: today, overrides }),
    );
  } catch {
    // Storage may be unavailable (private mode); overrides then live for the session only.
  }
}

export function parseTimeToMinutes(value: string): number | undefined {
  if (!/^\d{1,2}:\d{2}/.test(value)) return undefined;
  const [h, m] = value.split(":").map((part) => Number(part));
  if (Number.isNaN(h) || Number.isNaN(m)) return undefined;
  return h * 60 + m;
}

function isTodayTask(task: Task, today: string): boolean {
  if (task.deletedAt || task.status === "archived" || task.status === "inbox") return false;
  if (task.completedAt && task.completedAt.slice(0, 10) === today) return true;
  if (task.status === "done") return false;
  return (
    Boolean(task.dueDate && task.dueDate < today) ||
    task.status === "doing" ||
    task.status === "waiting" ||
    task.dueDate === today ||
    task.scheduledDate === today
  );
}

export function defaultBucketFor(task: Task, today: string): TodayBucketId {
  if (task.dueDate && task.dueDate < today) return "now";
  if (task.status === "doing") return "now";
  if (task.priority === "high" && task.dueDate === today) return "now";
  if (task.status === "waiting") return "later";
  if ((task.priority === "low" || task.priority === "none") && task.dueDate !== today) {
    return "later";
  }
  return "next";
}

function reasonFor(task: Task, today: string): TodayReason {
  if (task.dueDate && task.dueDate < today && task.status !== "done") return "overdue";
  if (task.status === "doing") return "progress";
  if (task.status === "waiting") return "waiting";
  if (task.priority === "high") return "high";
  if (task.priority === "medium") return "medium";
  if (task.priority === "low") return "low";
  return "none";
}

const NO_DUE_DATE = "9999-12-31";

// Every row in the Focus Queue renders its start time, so the list has to
// agree with what it shows: timed tasks in clock order first, then untimed
// ones by deadline and age.
//
// This comparison used to lead with `task.order`, but nothing in the app ever
// assigned that field — every task carried 0, so the sort silently fell
// through to createdAt and a task labelled 17:00 could sit above one labelled
// 09:00. (`order` is still normalized and persisted; it just isn't a sort key
// until something can actually set it.)
function compareTodayEntries(a: TodayEntry, b: TodayEntry): number {
  const aStart = parseTimeToMinutes(a.task.startTime);
  const bStart = parseTimeToMinutes(b.task.startTime);
  if (aStart !== undefined && bStart !== undefined && aStart !== bStart) return aStart - bStart;
  if (aStart !== undefined && bStart === undefined) return -1;
  if (aStart === undefined && bStart !== undefined) return 1;

  const aDue = a.task.dueDate || NO_DUE_DATE;
  const bDue = b.task.dueDate || NO_DUE_DATE;
  if (aDue !== bDue) return aDue < bDue ? -1 : 1;

  return a.task.createdAt.localeCompare(b.task.createdAt);
}

export function collectTodayEntries(
  tasks: Task[],
  overrides: BucketOverrides,
  today = todayValue(),
): TodayEntry[] {
  const entries: TodayEntry[] = [];
  for (const task of tasks) {
    if (!isTodayTask(task, today)) continue;
    const defaultBucket = defaultBucketFor(task, today);
    entries.push({
      task,
      defaultBucket,
      bucket: overrides[task.id] ?? defaultBucket,
      reason: reasonFor(task, today),
      completed: task.status === "done",
    });
  }
  entries.sort(compareTodayEntries);
  return entries;
}

// === Time Rail (spec §31) ===

export const TIME_RAIL_START = 8 * 60; // 8 AM
export const TIME_RAIL_END = 19 * 60; // 7 PM
const MIN_FREE_SLOT = 30;

export interface TodayTimeBlock {
  id: string;
  type: "task" | "free";
  taskId?: string;
  title: string;
  startMin: number;
  endMin: number;
  color?: string;
}

export interface TodayTimeRail {
  blocks: TodayTimeBlock[];
  earlierCount: number;
  laterCount: number;
  scheduledCount: number;
}

export function buildTimeRail(
  tasks: Task[],
  projects: Project[],
  today = todayValue(),
): TodayTimeRail {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const scheduled: TodayTimeBlock[] = [];
  let earlierCount = 0;
  let laterCount = 0;

  for (const task of tasks) {
    if (task.deletedAt || task.status === "archived") continue;
    if (task.scheduledDate !== today) continue;
    const startMin = parseTimeToMinutes(task.startTime);
    const endMinRaw = parseTimeToMinutes(task.endTime);
    if (startMin === undefined) continue;
    const endMin = endMinRaw !== undefined && endMinRaw > startMin ? endMinRaw : startMin + 60;
    if (endMin <= TIME_RAIL_START) {
      earlierCount += 1;
      continue;
    }
    if (startMin >= TIME_RAIL_END) {
      laterCount += 1;
      continue;
    }
    scheduled.push({
      id: `task:${task.id}`,
      type: "task",
      taskId: task.id,
      title: task.title,
      startMin: Math.max(startMin, TIME_RAIL_START),
      endMin: Math.min(endMin, TIME_RAIL_END),
      color: projectById.get(task.projectId)?.color,
    });
  }

  scheduled.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const blocks: TodayTimeBlock[] = [];
  let cursor = TIME_RAIL_START;
  for (const block of scheduled) {
    if (block.startMin - cursor >= MIN_FREE_SLOT) {
      blocks.push({
        id: `free:${cursor}`,
        type: "free",
        title: "",
        startMin: cursor,
        endMin: block.startMin,
      });
    }
    blocks.push(block);
    cursor = Math.max(cursor, block.endMin);
  }
  if (TIME_RAIL_END - cursor >= MIN_FREE_SLOT) {
    blocks.push({ id: `free:${cursor}`, type: "free", title: "", startMin: cursor, endMin: TIME_RAIL_END });
  }

  return { blocks, earlierCount, laterCount, scheduledCount: scheduled.length };
}

// === Attention from Spaces (spec §32) ===

export type SignalSeverity = "low" | "medium" | "high";

export interface TodaySpaceSignal {
  id: string;
  kind: "project" | "study";
  refId: string;
  name: string;
  color?: string;
  severity: SignalSeverity;
  messageKey: string;
  messageVars?: Record<string, string | number>;
}

export function buildSpaceSignals(
  tasks: Task[],
  projects: Project[],
  conceptNotes: ConceptNote[],
  today = todayValue(),
): TodaySpaceSignal[] {
  const signals: TodaySpaceSignal[] = [];

  for (const project of projects) {
    if (project.status === "archived" || project.status === "completed") continue;
    const overdue = tasks.filter(
      (task) =>
        task.projectId === project.id &&
        !task.deletedAt &&
        task.status !== "done" &&
        task.status !== "archived" &&
        Boolean(task.dueDate) &&
        task.dueDate < today,
    );
    if (overdue.length > 0) {
      signals.push({
        id: `overdue:${project.id}`,
        kind: "project",
        refId: project.id,
        name: project.name,
        color: project.color,
        severity: "high",
        messageKey: "todayv.signalOverdue",
        messageVars: { n: overdue.length },
      });
    }
    if (project.dueDate && project.dueDate >= today) {
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysLeft = Math.round(
        (new Date(`${project.dueDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) /
          msPerDay,
      );
      if (daysLeft <= 2) {
        signals.push({
          id: `deadline:${project.id}`,
          kind: "project",
          refId: project.id,
          name: project.name,
          color: project.color,
          severity: "high",
          messageKey: daysLeft === 0 ? "todayv.signalDeadlineToday" : "todayv.signalDeadline",
          messageVars: { n: daysLeft },
        });
      }
    }
  }

  const dueReviews = getDueReviewCount(conceptNotes, today);
  if (dueReviews > 0) {
    signals.push({
      id: "study:reviews",
      kind: "study",
      refId: "study",
      name: "Study",
      severity: dueReviews >= 5 ? "high" : "medium",
      messageKey: "todayv.signalReviews",
      messageVars: { n: dueReviews },
    });
  }

  const severityRank: Record<SignalSeverity, number> = { high: 0, medium: 1, low: 2 };
  signals.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  return signals;
}

// === Plan Today (spec §30, rule-based mock planner) ===

/** The three id lists "Plan today" writes into the bucket overrides. */
export interface TodayPlanResult {
  nowTaskIds: string[];
  nextTaskIds: string[];
  laterTaskIds: string[];
}

export function buildTodayPlan(entries: TodayEntry[], today = todayValue()): TodayPlanResult {
  const now: string[] = [];
  const next: string[] = [];
  const later: string[] = [];

  for (const entry of entries) {
    if (entry.completed) continue;
    const { task } = entry;
    if (entry.reason === "overdue" || task.status === "doing" || task.priority === "high") {
      now.push(task.id);
    } else if (task.dueDate === today) {
      next.push(task.id);
    } else if (task.status === "waiting" || task.priority === "low" || task.priority === "none") {
      later.push(task.id);
    } else {
      next.push(task.id);
    }
  }

  return { nowTaskIds: now, nextTaskIds: next, laterTaskIds: later };
}

// === Formatting helpers ===

export function formatMinuteOfDay(minute: number, locale: "ko" | "en"): string {
  const date = new Date();
  date.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return new Intl.DateTimeFormat(locale === "ko" ? "ko" : "en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatHourLabel(minute: number, locale: "ko" | "en"): string {
  const date = new Date();
  date.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return new Intl.DateTimeFormat(locale === "ko" ? "ko" : "en", {
    hour: "numeric",
  }).format(date);
}
