// Task read-model selectors: pure functions over the planner's task array so
// consumers (AI context building today, the AI Assistant MVP later) don't
// re-derive liveness/relevance rules inline. Keep these free of React and IO.
import type { Task } from "../../types";
import { addDays } from "../../utils/date";
import { isCompleted, isTaskAlive, isTaskOpen } from "./taskState";

// Tasks that still exist from the user's point of view.
export function selectLiveTasks(tasks: Task[]): Task[] {
  return tasks.filter(isTaskAlive);
}

// Live tasks that still need doing.
export function selectActiveTasks(tasks: Task[]): Task[] {
  return tasks.filter(isTaskOpen);
}

// Nearest future date the task is actionable on, "" if none. A range's first
// day counts: work starting Friday is actionable Friday, whatever its deadline.
export function nextActionableDateOf(task: Task, today: string): string {
  return [task.startDate, task.dueDate].filter((date) => date && date > today).sort()[0] ?? "";
}

/** True when today falls inside the task's dates — a range counts on every day of it. */
function coversToday(task: Task, today: string): boolean {
  if (task.dueDate === today) return true;
  return Boolean(task.startDate) && task.startDate <= today && Boolean(task.dueDate) && task.dueDate >= today;
}

export type RelevantTaskLimits = {
  overdueTasks: number;
  todayTasks: number;
  upcomingTasks: number;
  recentDoneTasks: number;
  otherActiveTasks: number;
};

// Bucketed relevance selection per the limits: overdue, today, upcoming,
// recently completed (last 7 days), then recently touched active tasks —
// deduped in that priority order. Dumping every task blew past the local
// model's context window as soon as real data accumulated.
export function selectRelevantTasks(tasks: Task[], today: string, limits: RelevantTaskLimits): Task[] {
  const live = selectLiveTasks(tasks);
  const active = live.filter((task) => !isCompleted(task));

  const overdue = active
    .filter((task) => task.dueDate && task.dueDate < today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, limits.overdueTasks);
  const todays = active
    .filter((task) => coversToday(task, today))
    .slice(0, limits.todayTasks);
  const upcoming = active
    .filter((task) => nextActionableDateOf(task, today) !== "")
    .sort((a, b) => nextActionableDateOf(a, today).localeCompare(nextActionableDateOf(b, today)))
    .slice(0, limits.upcomingTasks);
  const recentDone = live
    .filter((task) => isCompleted(task) && task.completedAt.slice(0, 10) >= addDays(today, -6))
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, limits.recentDoneTasks);

  const picked = new Map<string, Task>();
  for (const task of [...overdue, ...todays, ...upcoming, ...recentDone]) {
    picked.set(task.id, task);
  }

  const otherActive = active
    .filter((task) => !picked.has(task.id))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limits.otherActiveTasks);
  for (const task of otherActive) {
    picked.set(task.id, task);
  }

  return [...picked.values()];
}
