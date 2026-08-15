import type { FocusSession, Task } from "../types";
import type {
  SpaceActivity,
  SpaceCustomConfig,
  SpaceHubType,
  SpaceSignalStatus,
} from "./spaceHubTypes";
import { addDays, todayValue } from "../utils/date";

type TFn = (key: string, vars?: Record<string, string | number>) => string;

// A space collects tasks either through its source project or through an
// explicit `space:<id>` tag (used by spaces that have no project).
export function spaceTaskTag(spaceId: string): string {
  return `space:${spaceId}`;
}

export function getSpaceTasks(tasks: Task[], spaceId: string, sourceProjectId?: string): Task[] {
  const tag = spaceTaskTag(spaceId);
  return tasks.filter(
    (task) =>
      task.status !== "archived" &&
      !task.deletedAt &&
      ((sourceProjectId && task.projectId === sourceProjectId) || task.tags.includes(tag)),
  );
}

export function getSpaceSessions(sessions: FocusSession[], spaceTasks: Task[], sourceProjectId?: string): FocusSession[] {
  const taskIds = new Set(spaceTasks.map((task) => task.id));
  return sessions.filter(
    (session) => taskIds.has(session.taskId) || (sourceProjectId ? session.projectId === sourceProjectId : false),
  );
}

export function isTaskDone(task: Task): boolean {
  return task.status === "done";
}

export function isTaskScheduled(task: Task): boolean {
  return Boolean(task.scheduledDate) && !isTaskDone(task);
}

export function isTaskUnscheduled(task: Task): boolean {
  return !task.scheduledDate && !isTaskDone(task) && task.status !== "waiting";
}

export function isTaskOverdue(task: Task, today = todayValue()): boolean {
  return Boolean(task.dueDate) && task.dueDate < today && !isTaskDone(task);
}

export interface SpaceTaskCounts {
  total: number;
  open: number;
  scheduled: number;
  overdue: number;
  unscheduled: number;
  done: number;
}

export function getSpaceTaskCounts(spaceTasks: Task[], today = todayValue()): SpaceTaskCounts {
  const open = spaceTasks.filter((task) => !isTaskDone(task));
  return {
    total: spaceTasks.length,
    open: open.length,
    scheduled: spaceTasks.filter(isTaskScheduled).length,
    overdue: spaceTasks.filter((task) => isTaskOverdue(task, today)).length,
    unscheduled: spaceTasks.filter(isTaskUnscheduled).length,
    done: spaceTasks.filter(isTaskDone).length,
  };
}

// Next action selection order (§9.6): pinned > overdue > due today > high
// priority > scheduled today > recently focused > recently updated.
export function getNextActionTask(spaceTasks: Task[], config: SpaceCustomConfig, today = todayValue()): Task | null {
  const open = spaceTasks.filter((task) => !isTaskDone(task) && task.status !== "waiting");
  if (open.length === 0) return null;

  const pinned = open.find((task) => task.id === config.pinnedNextActionTaskId);
  if (pinned) return pinned;

  const byRecency = (a: Task, b: Task) => (b.updatedAt || "").localeCompare(a.updatedAt || "");
  const overdue = open.filter((task) => isTaskOverdue(task, today)).sort(byRecency);
  if (overdue[0]) return overdue[0];
  const dueToday = open.filter((task) => task.dueDate === today).sort(byRecency);
  if (dueToday[0]) return dueToday[0];
  const highPriority = open.filter((task) => task.priority === "high").sort(byRecency);
  if (highPriority[0]) return highPriority[0];
  const scheduledToday = open.filter((task) => task.scheduledDate === today).sort(byRecency);
  if (scheduledToday[0]) return scheduledToday[0];
  const recentlyFocused = open
    .filter((task) => Boolean(task.lastFocusedAt))
    .sort((a, b) => (b.lastFocusedAt || "").localeCompare(a.lastFocusedAt || ""));
  if (recentlyFocused[0]) return recentlyFocused[0];
  return [...open].sort(byRecency)[0] ?? null;
}

export interface SpaceSignal {
  status: SpaceSignalStatus;
  label: string;
  detail: string;
}

// Signal rules per space type (§10.6), computed from real space data.
export function getSpaceSignal(
  type: SpaceHubType,
  spaceTasks: Task[],
  spaceSessions: FocusSession[],
  t: TFn,
  today = todayValue(),
): SpaceSignal {
  const counts = getSpaceTaskCounts(spaceTasks, today);
  const blocked = spaceTasks.filter((task) => task.status === "waiting" && !isTaskDone(task)).length;
  const weekAgo = addDays(today, -7);
  const recentSessions = spaceSessions.filter((session) => session.status === "completed" && session.startAt.slice(0, 10) >= weekAgo);
  const recentActivity = recentSessions.length > 0 || spaceTasks.some((task) => (task.updatedAt || "").slice(0, 10) >= weekAgo);
  const dueSoon = spaceTasks.filter(
    (task) => !isTaskDone(task) && task.dueDate && task.dueDate <= addDays(today, 2) && !task.scheduledDate,
  ).length;

  if (type === "personal") {
    if (counts.overdue > 0) return { status: "deadline_risk", label: t("spaceHub.signal.overdue"), detail: t("spaceHub.signal.overdueDetail", { n: counts.overdue }) };
    if (counts.unscheduled > 0) return { status: "pending_items", label: t("spaceHub.signal.pendingItems"), detail: t("spaceHub.signal.pendingItemsDetail", { n: counts.unscheduled }) };
    if (!recentActivity) return { status: "inactive", label: t("spaceHub.signal.inactive"), detail: t("spaceHub.signal.inactiveDetail") };
    return { status: "on_track", label: t("spaceHub.signal.onTrack"), detail: t("spaceHub.signal.onTrackPersonalDetail") };
  }

  // project / custom share the base rules.
  if (blocked > 0) return { status: "blocked", label: t("spaceHub.signal.blocked"), detail: t("spaceHub.signal.blockedDetail", { n: blocked }) };
  if (dueSoon > 0) return { status: "deadline_risk", label: t("spaceHub.signal.deadlineRisk"), detail: t("spaceHub.signal.deadlineRiskDetail", { n: dueSoon }) };
  if (!recentActivity && counts.open > 0) return { status: "inactive", label: t("spaceHub.signal.inactive"), detail: t("spaceHub.signal.inactiveDetail") };
  if (counts.open > 0 && recentSessions.length === 0)
    return { status: "needs_attention", label: t("spaceHub.signal.needsAttention"), detail: t("spaceHub.signal.needsAttentionUnscheduledDetail", { n: counts.unscheduled }) };
  if (counts.overdue > 0) return { status: "needs_attention", label: t("spaceHub.signal.needsAttention"), detail: t("spaceHub.signal.needsAttentionOverdueDetail", { n: counts.overdue }) };
  return { status: "on_track", label: t("spaceHub.signal.onTrack"), detail: t("spaceHub.signal.onTrackBaseDetail") };
}

export function sessionSeconds(session: FocusSession): number {
  return session.accumulatedSeconds;
}

export function getTodaySpaceFocusSeconds(spaceSessions: FocusSession[], today = todayValue()): number {
  return spaceSessions
    .filter((session) => session.status === "completed" && session.startAt.slice(0, 10) === today)
    .reduce((sum, session) => sum + sessionSeconds(session), 0);
}

export function getWeekSpaceFocusSeconds(spaceSessions: FocusSession[], weekStart: string): number {
  return spaceSessions
    .filter((session) => session.status === "completed" && session.startAt.slice(0, 10) >= weekStart)
    .reduce((sum, session) => sum + sessionSeconds(session), 0);
}

export function getRecentSpaceFocusSessions(spaceSessions: FocusSession[], limit = 3): FocusSession[] {
  return spaceSessions
    .filter((session) => session.status === "completed")
    .sort((a, b) => (b.endAt || b.createdAt).localeCompare(a.endAt || a.createdAt))
    .slice(0, limit);
}

export interface UpcomingItem {
  id: string;
  title: string;
  when: string;
  kind: "deadline" | "scheduled";
  taskId?: string;
}

export function getUpcomingSpaceItems(
  spaceTasks: Task[],
  today = todayValue(),
  limit = 4,
): UpcomingItem[] {
  const horizon = addDays(today, 7);
  const items: UpcomingItem[] = [];

  for (const task of spaceTasks) {
    if (isTaskDone(task)) continue;
    if (task.dueDate && task.dueDate >= today && task.dueDate <= horizon) {
      items.push({ id: `due-${task.id}`, title: task.title, when: task.dueDate, kind: "deadline", taskId: task.id });
    } else if (task.scheduledDate && task.scheduledDate >= today && task.scheduledDate <= horizon) {
      items.push({ id: `sch-${task.id}`, title: task.title, when: task.scheduledDate, kind: "scheduled", taskId: task.id });
    }
  }

  return items.sort((a, b) => a.when.localeCompare(b.when)).slice(0, limit);
}


// Activity timeline (§16): derived from real records + stored manual entries.
export function deriveSpaceActivities(
  spaceId: string,
  spaceTasks: Task[],
  spaceSessions: FocusSession[],
  storedActivities: SpaceActivity[],
  t: TFn,
  limit = 30,
): SpaceActivity[] {
  const derived: SpaceActivity[] = [];
  const untitled = t("spaceHub.untitled");

  for (const task of spaceTasks) {
    derived.push({
      id: `act-created-${task.id}`,
      spaceId,
      type: "task_created",
      title: t("spaceHub.activity.taskCreated", { title: task.title }),
      description: "",
      relatedTaskId: task.id,
      relatedSessionId: "",      createdAt: task.createdAt,
    });
    if (task.completedAt) {
      derived.push({
        id: `act-done-${task.id}`,
        spaceId,
        type: "task_completed",
        title: t("spaceHub.activity.taskCompleted", { title: task.title }),
        description: "",
        relatedTaskId: task.id,
        relatedSessionId: "",        createdAt: task.completedAt,
      });
    }
  }
  for (const session of spaceSessions) {
    if (session.status === "completed") {
      derived.push({
        id: `act-focus-${session.id}`,
        spaceId,
        type: "focus_completed",
        title: t("spaceHub.activity.focusCompleted", { title: session.title || untitled }),
        description: `${Math.max(1, Math.round(sessionSeconds(session) / 60))}m`,
        relatedTaskId: session.taskId,
        relatedSessionId: session.id,        createdAt: session.endAt || session.createdAt,
      });
    } else if (session.status === "running" || session.status === "paused") {
      derived.push({
        id: `act-focus-start-${session.id}`,
        spaceId,
        type: "focus_started",
        title: t("spaceHub.activity.focusStarted", { title: session.title || untitled }),
        description: "",
        relatedTaskId: session.taskId,
        relatedSessionId: session.id,        createdAt: session.startedAt || session.createdAt,
      });
    }
  }
  const manual = storedActivities.filter((activity) => activity.spaceId === spaceId);
  return [...derived, ...manual]
    .filter((activity) => Boolean(activity.createdAt))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function formatSeconds(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function relativeTime(iso: string, t: TFn): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return t("spaces.time.justNow");
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t("spaces.time.justNow");
  if (minutes < 60) return t("spaces.time.minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("spaces.time.hoursAgo", { n: hours });
  return t("spaces.time.daysAgo", { n: Math.floor(hours / 24) });
}
