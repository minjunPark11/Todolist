import type { ConceptNote, FocusSession, Task } from "../types";
import type {
  SpaceActivity,
  SpaceCustomConfig,
  SpaceHubType,
  SpaceNote,
  SpaceSignalStatus,
} from "./spaceHubTypes";
import { addDays, todayValue } from "../utils/date";

// A space collects tasks either through its source project or through an
// explicit `space:<id>` tag (used by study/local spaces that have no project).
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
  reviewNotes: ConceptNote[],
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

  if (type === "study") {
    const dueReviews = reviewNotes.filter((note) => note.nextReviewDate && note.nextReviewDate <= today).length;
    const behindReviews = reviewNotes.filter((note) => note.nextReviewDate && note.nextReviewDate <= addDays(today, -2)).length;
    const studiedToday = spaceSessions.some((session) => session.status === "completed" && session.startAt.slice(0, 10) === today);
    if (behindReviews > 0) return { status: "needs_attention", label: "Falling Behind", detail: `${behindReviews} reviews overdue by 2+ days` };
    if (dueReviews > 0) return { status: "review_due", label: "Review Due", detail: `${dueReviews} reviews waiting` };
    if (!recentActivity) return { status: "inactive", label: "Inactive", detail: "No study records in the last 7 days" };
    if (studiedToday) return { status: "on_track", label: "On Track", detail: "Studied today and reviews are clear" };
    return { status: "on_track", label: "On Track", detail: "Reviews are clear" };
  }

  if (type === "personal") {
    if (counts.overdue > 0) return { status: "deadline_risk", label: "Overdue", detail: `${counts.overdue} life tasks past due` };
    if (counts.unscheduled > 0) return { status: "pending_items", label: "Pending Items", detail: `${counts.unscheduled} personal tasks unhandled` };
    if (!recentActivity) return { status: "inactive", label: "Inactive", detail: "No activity in the last 7 days" };
    return { status: "on_track", label: "On Track", detail: "Routines and tasks are under control" };
  }

  // project / research / custom share the base rules.
  if (blocked > 0) return { status: "blocked", label: "Blocked", detail: `${blocked} blocked or waiting tasks` };
  if (dueSoon > 0) return { status: "deadline_risk", label: "Deadline Risk", detail: `${dueSoon} tasks due within 48h are unscheduled` };
  if (!recentActivity && counts.open > 0) return { status: "inactive", label: "Inactive", detail: "No activity in the last 7 days" };
  if (counts.open > 0 && recentSessions.length === 0)
    return { status: "needs_attention", label: "Needs Attention", detail: `${counts.unscheduled} unscheduled · no recent focus` };
  if (counts.overdue > 0) return { status: "needs_attention", label: "Needs Attention", detail: `${counts.overdue} overdue tasks` };
  return { status: "on_track", label: "On Track", detail: "Recent activity and no overdue tasks" };
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
  kind: "deadline" | "scheduled" | "review";
  taskId?: string;
  noteId?: string;
}

export function getUpcomingSpaceItems(
  spaceTasks: Task[],
  reviewNotes: ConceptNote[],
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
  for (const note of reviewNotes) {
    if (note.nextReviewDate && note.nextReviewDate <= horizon) {
      items.push({ id: `rev-${note.id}`, title: note.title, when: note.nextReviewDate, kind: "review", noteId: note.id });
    }
  }

  return items.sort((a, b) => a.when.localeCompare(b.when)).slice(0, limit);
}

export interface SpaceCalendarItem {
  id: string;
  date: string;
  time: string;
  title: string;
  kind: "deadline" | "scheduled" | "review";
  taskId?: string;
  noteId?: string;
}

export function getSpaceCalendarItems(
  spaceTasks: Task[],
  reviewNotes: ConceptNote[],
  rangeStart: string,
  rangeEnd: string,
): SpaceCalendarItem[] {
  const items: SpaceCalendarItem[] = [];
  for (const task of spaceTasks) {
    if (task.scheduledDate && task.scheduledDate >= rangeStart && task.scheduledDate <= rangeEnd) {
      items.push({
        id: `sch-${task.id}`,
        date: task.scheduledDate,
        time: task.startTime,
        title: task.title,
        kind: "scheduled",
        taskId: task.id,
      });
    }
    if (task.dueDate && task.dueDate >= rangeStart && task.dueDate <= rangeEnd && !isTaskDone(task)) {
      items.push({ id: `due-${task.id}`, date: task.dueDate, time: "", title: `${task.title} due`, kind: "deadline", taskId: task.id });
    }
  }
  for (const note of reviewNotes) {
    if (note.nextReviewDate && note.nextReviewDate >= rangeStart && note.nextReviewDate <= rangeEnd) {
      items.push({ id: `rev-${note.id}`, date: note.nextReviewDate, time: "", title: `${note.title} review`, kind: "review", noteId: note.id });
    }
  }
  return items.sort((a, b) => `${a.date}${a.time || "99:99"}`.localeCompare(`${b.date}${b.time || "99:99"}`));
}

// Task -> configured group. Falls back on status heuristics so preset groups
// fill up without the user assigning every task manually.
export function resolveTaskGroupLabel(task: Task, groupLabels: string[]): string {
  const explicit = task.tags.find((tag) => tag.startsWith("group:"))?.slice("group:".length);
  if (explicit && groupLabels.includes(explicit)) return explicit;

  const has = (label: string) => groupLabels.includes(label);
  if (isTaskDone(task)) return has("Done") ? "Done" : has("Completed") ? "Completed" : groupLabels[groupLabels.length - 1];
  if (task.status === "waiting") {
    if (has("Blocked")) return "Blocked";
    if (has("Waiting")) return "Waiting";
  }
  if (task.status === "doing" && has("In Progress")) return "In Progress";
  if (isTaskUnscheduled(task) && has("To Schedule")) return "To Schedule";
  return groupLabels[0];
}

// Activity timeline (§16): derived from real records + stored manual entries.
export function deriveSpaceActivities(
  spaceId: string,
  spaceTasks: Task[],
  spaceSessions: FocusSession[],
  spaceNotes: SpaceNote[],
  storedActivities: SpaceActivity[],
  limit = 30,
): SpaceActivity[] {
  const derived: SpaceActivity[] = [];

  for (const task of spaceTasks) {
    derived.push({
      id: `act-created-${task.id}`,
      spaceId,
      type: "task_created",
      title: `Task created: ${task.title}`,
      description: "",
      relatedTaskId: task.id,
      relatedSessionId: "",
      relatedNoteId: "",
      createdAt: task.createdAt,
    });
    if (task.completedAt) {
      derived.push({
        id: `act-done-${task.id}`,
        spaceId,
        type: "task_completed",
        title: `Task completed: ${task.title}`,
        description: "",
        relatedTaskId: task.id,
        relatedSessionId: "",
        relatedNoteId: "",
        createdAt: task.completedAt,
      });
    }
  }
  for (const session of spaceSessions) {
    if (session.status === "completed") {
      derived.push({
        id: `act-focus-${session.id}`,
        spaceId,
        type: "focus_completed",
        title: `Focus completed: ${session.title || "Untitled"}`,
        description: `${Math.max(1, Math.round(sessionSeconds(session) / 60))}m`,
        relatedTaskId: session.taskId,
        relatedSessionId: session.id,
        relatedNoteId: "",
        createdAt: session.endAt || session.createdAt,
      });
    } else if (session.status === "running" || session.status === "paused") {
      derived.push({
        id: `act-focus-start-${session.id}`,
        spaceId,
        type: "focus_started",
        title: `Focus started: ${session.title || "Untitled"}`,
        description: "",
        relatedTaskId: session.taskId,
        relatedSessionId: session.id,
        relatedNoteId: "",
        createdAt: session.startedAt || session.createdAt,
      });
    }
  }
  for (const note of spaceNotes) {
    derived.push({
      id: `act-note-${note.id}`,
      spaceId,
      type: "note_created",
      title: `Note added: ${note.title}`,
      description: note.type,
      relatedTaskId: "",
      relatedSessionId: "",
      relatedNoteId: note.id,
      createdAt: note.createdAt,
    });
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

export function relativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
