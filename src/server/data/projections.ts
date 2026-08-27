// Stored record → what an outside reader is allowed to see (§10.1, §16.1).
//
// Every tool answer goes through here, and that is the point: a projection is
// an allowlist written as code. Adding a field to `Task` does not add it to an
// AI's view of the account — someone has to come here and decide.
//
// What never leaves, and why:
//   order, sortKey, sectionId, categoryId, activeSessionId, previousStatus
//     — bookkeeping for screens that do not exist outside this app.
//   deletedAt, archivedAt
//     — a deleted task is simply absent; carrying the marker invites a reader
//       to reason about the deletion.
//   appSettings
//     — theme, font size and sidebar state answer no question anyone would
//       ask an assistant. `timezone` is used, never returned as settings.
//   an external event's description
//     — a meeting invitation body carries dial-in numbers, links and the
//       attendee list. Title, time and location answer the scheduling
//       question; the body only widens the blast radius.
import type { CheckItem, List, Project, Subtask, Task, TaskPriority } from "../../types";
import { isCompleted, isWontDo } from "../../domain/tasks/taskState";
import { isTaskBlocked } from "../../domain/tasks/dependencies";
import { childProgress, childrenOf } from "../../domain/tasks/children";
import { checkItemsForTask } from "../../domain/tasks/checkItems";
import { isOverdue as scheduleIsOverdue } from "../../domain/schedule/scheduleQueries";
import { scheduleFromTask } from "../../domain/schedule/taskSchedule";
import { daysBetween } from "../../utils/date";

/** §16.1: long text is only ever returned by the detail tool, and capped. */
export const TEXT_CAP = 4000;

export type PublicTaskStatus = "open" | "completed" | "wont_do";

export interface TaskSummary {
  id: string;
  title: string;
  status: PublicTaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  startDate?: string;
  startTime?: string;
  endTime?: string;
  estimatedMinutes?: number;
  isOverdue: boolean;
  isBlocked: boolean;
  /** Negative means the deadline has passed. */
  daysUntilDue?: number;
  listName?: string;
  projectName?: string;
  tags?: string[];
  progress?: { done: number; total: number };
}

export interface TaskDetail extends TaskSummary {
  description?: string;
  notes?: string;
  contentMode: "description" | "checklist";
  recurrence?: {
    type: "daily" | "weekly" | "monthly" | "yearly";
    interval: number;
    days?: number[];
    endDate?: string;
  };
  subtasks: Array<{ id: string; title: string; completed: boolean }>;
  checklist: Array<{ id: string; title: string; completed: boolean }>;
  blockedBy?: { id: string; title: string; resolved: boolean };
  blocking: Array<{ id: string; title: string }>;
  reminder?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  /** Set when `description` or `notes` hit TEXT_CAP. */
  textTruncated?: boolean;
}

/**
 * Everything a projection needs that a task cannot answer alone.
 *
 * Blocked-ness is a fact about another task; a list name is a fact about a
 * list. Passing them in keeps the projection a pure function of its inputs,
 * which is what makes the snapshot tests in §22-16 worth anything.
 */
export interface ProjectionContext {
  /** The user's today, not the machine's. */
  today: string;
  tasks: Task[];
  taskById: Map<string, Task>;
  listById: Map<string, List>;
  projectById: Map<string, Project>;
  subtasks: Subtask[];
  checkItems: CheckItem[];
}

export function projectionContext(input: {
  today: string;
  tasks?: Task[];
  lists?: List[];
  projects?: Project[];
  subtasks?: Subtask[];
  checkItems?: CheckItem[];
}): ProjectionContext {
  const tasks = input.tasks ?? [];
  return {
    today: input.today,
    tasks,
    taskById: new Map(tasks.map((task) => [task.id, task])),
    listById: new Map((input.lists ?? []).map((list) => [list.id, list])),
    projectById: new Map((input.projects ?? []).map((project) => [project.id, project])),
    subtasks: input.subtasks ?? [],
    checkItems: input.checkItems ?? [],
  };
}

/**
 * The three-value status, read as a predicate rather than as `task.status`.
 *
 * The stored field holds nine values, six of them legacy, and the lifecycle
 * moved off it in Ch. 26 — `domain/tasks/taskState` is where the app asks the
 * question, so it is where this asks too. A reader that switched on the raw
 * value would disagree with the screen for any record written before the
 * change.
 */
export function publicStatus(task: Task): PublicTaskStatus {
  if (isCompleted(task)) return "completed";
  if (isWontDo(task)) return "wont_do";
  return "open";
}

export function projectTask(task: Task, ctx: ProjectionContext): TaskSummary {
  const status = publicStatus(task);
  const schedule = scheduleFromTask(task);
  const listName = task.listId ? ctx.listById.get(task.listId)?.name : undefined;
  const projectName = task.projectId ? ctx.projectById.get(task.projectId)?.name : undefined;
  const progress = progressOf(task, ctx);

  const summary: TaskSummary = {
    id: task.id,
    title: task.title,
    status,
    priority: task.priority,
    // Overdue is a question about unfinished work: a task completed late is
    // not overdue, it is done.
    isOverdue: status === "open" && scheduleIsOverdue(schedule, ctx.today),
    isBlocked: isTaskBlocked(task, ctx.taskById),
  };

  // Unset fields are omitted rather than sent as null or "" (§10): every one
  // of them costs tokens in a context window, and "" is a sentinel this app
  // uses internally, not a fact about the task.
  if (task.dueDate) {
    summary.dueDate = task.dueDate;
    summary.daysUntilDue = daysBetween(ctx.today, task.dueDate);
  }
  if (task.startDate) summary.startDate = task.startDate;
  if (task.startTime) summary.startTime = task.startTime;
  if (task.endTime) summary.endTime = task.endTime;
  if (task.estimatedMinutes > 0) summary.estimatedMinutes = task.estimatedMinutes;
  if (listName) summary.listName = listName;
  if (projectName) summary.projectName = projectName;
  if (task.tags.length > 0) summary.tags = [...task.tags];
  if (progress) summary.progress = progress;

  return summary;
}

/**
 * How much of a task is done, from whichever of its two bodies it uses.
 *
 * A task in checklist mode is measured by its check items; anything else by
 * its children (child tasks and subtasks both, which `childrenOf` already
 * merges). Reporting a 0/0 would say "no progress" where the truth is "this
 * task has no parts", so an empty one is omitted.
 */
function progressOf(task: Task, ctx: ProjectionContext): { done: number; total: number } | undefined {
  if (task.contentMode === "checklist") {
    const items = checkItemsForTask(task.id, ctx.checkItems);
    if (items.length === 0) return undefined;
    return { done: items.filter((item) => item.checked).length, total: items.length };
  }
  const children = childrenOf(task.id, ctx.tasks, ctx.subtasks);
  if (children.length === 0) return undefined;
  const progress = childProgress(children);
  return { done: progress.done, total: progress.total };
}

export function projectTaskDetail(task: Task, ctx: ProjectionContext): TaskDetail {
  const summary = projectTask(task, ctx);
  const description = capText(task.description);
  const notes = capText(task.notes);
  const blocker = task.blockedByTaskId ? ctx.taskById.get(task.blockedByTaskId) : undefined;

  const detail: TaskDetail = {
    ...summary,
    contentMode: task.contentMode === "checklist" ? "checklist" : "description",
    subtasks: ctx.subtasks
      .filter((subtask) => subtask.taskId === task.id)
      .map((subtask) => ({ id: subtask.id, title: subtask.title, completed: subtask.completed })),
    checklist: checkItemsForTask(task.id, ctx.checkItems).map((item) => ({
      id: item.id,
      title: item.text,
      completed: item.checked,
    })),
    blocking: ctx.tasks
      .filter((other) => other.blockedByTaskId === task.id)
      .map((other) => ({ id: other.id, title: other.title })),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };

  if (description.text) detail.description = description.text;
  if (notes.text) detail.notes = notes.text;
  if (description.truncated || notes.truncated) detail.textTruncated = true;
  if (task.repeatType && task.repeatType !== "none") {
    detail.recurrence = {
      type: task.repeatType,
      interval: task.repeatInterval > 0 ? task.repeatInterval : 1,
      ...(task.repeatDays.length > 0 ? { days: [...task.repeatDays] } : {}),
      ...(task.repeatEndDate ? { endDate: task.repeatEndDate } : {}),
    };
  }
  if (blocker) {
    detail.blockedBy = { id: blocker.id, title: blocker.title, resolved: publicStatus(blocker) !== "open" };
  }
  if (task.reminder) detail.reminder = task.reminder;
  if (task.completedAt) detail.completedAt = task.completedAt;

  return detail;
}

function capText(value: string | undefined): { text: string; truncated: boolean } {
  const text = value ?? "";
  if (text.length <= TEXT_CAP) return { text, truncated: false };
  return { text: text.slice(0, TEXT_CAP), truncated: true };
}

export interface CalendarEntry {
  kind: "task" | "external" | "focus";
  /** The task id, the expanded event id, or the focus session id. */
  sourceId: string;
  /** Which subscribed calendar an external event came from. */
  calendarName?: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  /** External events only — never their description (§16.1). */
  location?: string;
  /** Task blocks only. */
  completed?: boolean;
  /** One occurrence of a repeating series (§9.2.1). */
  repeating?: boolean;
}
