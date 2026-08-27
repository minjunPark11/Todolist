// Task questions: filtered lists, one task in full, what is late, what is due.
import type { Task } from "../../../types";
import { isTaskAlive } from "../../../domain/tasks/taskState";
import { isOverdue as scheduleIsOverdue } from "../../../domain/schedule/scheduleQueries";
import { scheduleFromTask } from "../../../domain/schedule/taskSchedule";
import { addDays } from "../../../utils/date";
import { invalidArgument, notFound } from "../../errors";
import { projectTask, projectTaskDetail, publicStatus, type TaskDetail, type TaskSummary } from "../projections";
import type { PublicTaskStatus } from "../projections";
import { buildMetaAt, projectionFor, TABLES, todayFor, type QueryContext, type ResponseMeta } from "./shared";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
export const MAX_DUE_RANGE_DAYS = 366;
export const MAX_DEADLINE_DAYS = 90;

export interface TaskFilter {
  status?: PublicTaskStatus;
  projectId?: string;
  listId?: string;
  tag?: string;
  priority?: Task["priority"];
  dueFrom?: string;
  dueTo?: string;
  limit?: number;
  cursor?: string;
}

export interface TaskListResult {
  items: TaskSummary[];
  total: number;
  nextCursor?: string;
  meta: ResponseMeta;
}

export async function getTasks(ctx: QueryContext, filter: TaskFilter = {}): Promise<TaskListResult> {
  const slice = await ctx.repo.loadSlice(TABLES.tasks);
  const today = todayFor(ctx);
  const projection = projectionFor(slice, today);
  const limit = clampLimit(filter.limit);
  const offset = decodeCursor(filter.cursor);

  if (filter.dueFrom && filter.dueTo && daysApart(filter.dueFrom, filter.dueTo) > MAX_DUE_RANGE_DAYS) {
    throw invalidArgument(`dueFrom..dueTo may span at most ${MAX_DUE_RANGE_DAYS} days.`);
  }

  const matched = slice.data.tasks.filter((task) => matches(task, filter));
  const ordered = [...matched].sort(byDueThenCreated);
  const page = ordered.slice(offset, offset + limit);

  const result: TaskListResult = {
    items: page.map((task) => projectTask(task, projection)),
    total: ordered.length,
    meta: buildMetaAt(slice, ctx.request.now),
  };
  if (offset + limit < ordered.length) result.nextCursor = encodeCursor(offset + limit);
  return result;
}

export interface SearchResult {
  items: TaskSummary[];
  total: number;
  meta: ResponseMeta;
}

/**
 * Substring search over title, description and notes.
 *
 * Two characters minimum, because a one-character query matches most of an
 * account and the answer would be a truncated list dressed up as a search.
 * Case-folded on both sides; no ranking, because a ranked list would be this
 * layer making a judgement, and §11 keeps those out of it.
 */
export async function searchTasks(ctx: QueryContext, query: string, limit?: number): Promise<SearchResult> {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) throw invalidArgument("query must be at least 2 characters.");

  const slice = await ctx.repo.loadSlice(TABLES.tasks);
  const today = todayFor(ctx);
  const projection = projectionFor(slice, today);

  const matched = slice.data.tasks.filter(
    (task) =>
      isTaskAlive(task) &&
      (task.title.toLowerCase().includes(needle) ||
        task.description.toLowerCase().includes(needle) ||
        task.notes.toLowerCase().includes(needle)),
  );
  const ordered = [...matched].sort(byDueThenCreated);

  return {
    items: ordered.slice(0, clampLimit(limit)).map((task) => projectTask(task, projection)),
    total: ordered.length,
    meta: buildMetaAt(slice, ctx.request.now),
  };
}

export async function getTaskDetail(ctx: QueryContext, taskId: string): Promise<TaskDetail & { meta: ResponseMeta }> {
  const slice = await ctx.repo.loadSlice(TABLES.taskDetail);
  const task = slice.data.tasks.find((candidate) => candidate.id === taskId);
  // Another user's id and an id nobody ever used take the same path to the
  // same message (§15, acceptance criterion 10). RLS already keeps the row
  // out; this keeps the ERROR from being an oracle about whether it exists.
  if (!task || !isTaskAlive(task)) throw notFound();

  const projection = projectionFor(slice, todayFor(ctx));
  return { ...projectTaskDetail(task, projection), meta: buildMetaAt(slice, ctx.request.now) };
}

export interface SubtaskListResult {
  items: Array<{ id: string; title: string; completed: boolean }>;
  meta: ResponseMeta;
}

export async function getSubtasks(ctx: QueryContext, taskId: string): Promise<SubtaskListResult> {
  const slice = await ctx.repo.loadSlice(TABLES.taskDetail);
  const task = slice.data.tasks.find((candidate) => candidate.id === taskId);
  if (!task || !isTaskAlive(task)) throw notFound();

  const projection = projectionFor(slice, todayFor(ctx));
  const detail = projectTaskDetail(task, projection);
  return { items: detail.subtasks, meta: buildMetaAt(slice, ctx.request.now) };
}

export async function getOverdueTasks(ctx: QueryContext, limit?: number): Promise<TaskListResult> {
  const slice = await ctx.repo.loadSlice(TABLES.tasks);
  const today = todayFor(ctx);
  const projection = projectionFor(slice, today);

  const overdue = slice.data.tasks
    .filter((task) => isTaskAlive(task) && publicStatus(task) === "open")
    .filter((task) => scheduleIsOverdue(scheduleFromTask(task), today))
    .sort(byDueThenCreated);

  return {
    items: overdue.slice(0, clampLimit(limit)).map((task) => projectTask(task, projection)),
    total: overdue.length,
    meta: buildMetaAt(slice, ctx.request.now),
  };
}

export interface DeadlineResult {
  items: TaskSummary[];
  groupedByDate: Array<{ date: string; items: TaskSummary[] }>;
  meta: ResponseMeta;
}

/**
 * Open work due between today and `days` from now, inclusive.
 *
 * Overdue tasks are NOT folded in. "What is coming up" and "what is already
 * late" are different questions with different answers, and a reader that
 * wants both can ask both — mixing them would bury a deadline three days out
 * under a month of arrears.
 */
export async function getUpcomingDeadlines(ctx: QueryContext, days = 7): Promise<DeadlineResult> {
  if (!Number.isInteger(days) || days < 1 || days > MAX_DEADLINE_DAYS) {
    throw invalidArgument(`days must be a whole number between 1 and ${MAX_DEADLINE_DAYS}.`);
  }

  const slice = await ctx.repo.loadSlice(TABLES.tasks);
  const today = todayFor(ctx);
  const until = addDays(today, days);
  const projection = projectionFor(slice, today);

  const items = slice.data.tasks
    .filter((task) => isTaskAlive(task) && publicStatus(task) === "open")
    .filter((task) => task.dueDate >= today && task.dueDate <= until)
    .sort(byDueThenCreated)
    .map((task) => projectTask(task, projection));

  const byDate = new Map<string, TaskSummary[]>();
  for (const item of items) {
    const date = item.dueDate ?? today;
    const bucket = byDate.get(date);
    if (bucket) bucket.push(item);
    else byDate.set(date, [item]);
  }

  return {
    items,
    groupedByDate: [...byDate.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, dateItems]) => ({ date, items: dateItems })),
    meta: buildMetaAt(slice, ctx.request.now),
  };
}

function matches(task: Task, filter: TaskFilter): boolean {
  // Deleted and archived records are absent by default (§16.1). There is no
  // filter value that lets them back in: a reader has no use for the trash,
  // and "which of my tasks did I delete" is not a question this answers.
  if (!isTaskAlive(task)) return false;
  if (filter.status && publicStatus(task) !== filter.status) return false;
  if (filter.projectId && task.projectId !== filter.projectId) return false;
  if (filter.listId && task.listId !== filter.listId) return false;
  if (filter.priority && task.priority !== filter.priority) return false;
  if (filter.tag) {
    const wanted = filter.tag.toLowerCase();
    if (!task.tags.some((tag) => tag.toLowerCase() === wanted)) return false;
  }
  // A due-date window asks about dated work, so an undated task is out of it
  // rather than at one end of it.
  if (filter.dueFrom && (!task.dueDate || task.dueDate < filter.dueFrom)) return false;
  if (filter.dueTo && (!task.dueDate || task.dueDate > filter.dueTo)) return false;
  return true;
}

/**
 * Dated work first, oldest deadline first; undated after it, oldest first.
 *
 * Total and stable — the id breaks the last tie — because the cursor is an
 * offset into this order. An unstable sort would silently skip or repeat rows
 * between two pages of the same list.
 */
function byDueThenCreated(a: Task, b: Task): number {
  const aDue = a.dueDate || "9999-12-31";
  const bDue = b.dueDate || "9999-12-31";
  if (aDue !== bDue) return aDue < bDue ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) throw invalidArgument("limit must be a whole number of at least 1.");
  return Math.min(limit, MAX_LIMIT);
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const offset = Number.parseInt(Buffer.from(cursor, "base64url").toString("utf8"), 10);
  if (!Number.isInteger(offset) || offset < 0) throw invalidArgument("cursor is not one this tool issued.");
  return offset;
}

function daysApart(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
