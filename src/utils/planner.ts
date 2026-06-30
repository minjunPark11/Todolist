import type {
  ComputedReviewStatus,
  ConceptNote,
  Project,
  Task,
  TaskPriority,
} from "../types";
import { todayValue } from "./date";

// === Task filters (spec §4.1.1) ===
export function isActiveTask(task: Task): boolean {
  return task.status !== "archived" && !task.deletedAt;
}

export function isArchivedTask(task: Task): boolean {
  return task.status === "archived";
}

export function isCompletedTask(task: Task): boolean {
  return task.status === "done" && Boolean(task.completedAt);
}

export function isOpenTask(task: Task): boolean {
  return isActiveTask(task) && task.status !== "done";
}

export type TodayBuckets = {
  doneToday: Task[];
  waiting: Task[];
  inProgress: Task[];
  overdue: Task[];
  focus: Task[];
  dueToday: Task[];
  scheduledToday: Task[];
};

// Assign each task to the FIRST matching bucket only (spec §0.1.7).
export function getTodayBuckets(tasks: Task[], today = todayValue()): TodayBuckets {
  const buckets: TodayBuckets = {
    doneToday: [],
    waiting: [],
    inProgress: [],
    overdue: [],
    focus: [],
    dueToday: [],
    scheduledToday: [],
  };

  for (const task of tasks) {
    if (task.deletedAt) {
      continue;
    }
    if (task.completedAt && task.completedAt.slice(0, 10) === today) {
      buckets.doneToday.push(task);
      continue;
    }
    if (task.status === "done" || task.status === "archived") {
      continue;
    }
    if (task.status === "waiting") {
      buckets.waiting.push(task);
      continue;
    }
    if (task.status === "doing") {
      buckets.inProgress.push(task);
      continue;
    }
    if (task.dueDate && task.dueDate < today) {
      buckets.overdue.push(task);
      continue;
    }
    if (task.isFocus) {
      buckets.focus.push(task);
      continue;
    }
    if (task.dueDate === today) {
      buckets.dueToday.push(task);
      continue;
    }
    if (task.scheduledDate === today) {
      buckets.scheduledToday.push(task);
    }
  }

  return buckets;
}

// === Project computed values (spec §0.2.8) ===
export function getProjectTasks(tasks: Task[], projectId: string): Task[] {
  return tasks.filter((task) => task.projectId === projectId && isActiveTask(task));
}

export function getProjectProgress(tasks: Task[], projectId: string): {
  total: number;
  completed: number;
  percent: number;
} {
  const projectTasks = getProjectTasks(tasks, projectId);
  const total = projectTasks.length;
  const completed = projectTasks.filter((task) => task.status === "done").length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percent };
}

export function getProjectPrioritySummary(
  tasks: Task[],
  projectId: string,
): Record<TaskPriority, number> {
  const summary: Record<TaskPriority, number> = { none: 0, low: 0, medium: 0, high: 0 };
  for (const task of getProjectTasks(tasks, projectId)) {
    summary[task.priority] += 1;
  }
  return summary;
}

export function getProjectStatusSummary(tasks: Task[], projectId: string) {
  const summary = { todo: 0, doing: 0, waiting: 0, done: 0, inbox: 0 };
  for (const task of getProjectTasks(tasks, projectId)) {
    if (task.status in summary) {
      summary[task.status as keyof typeof summary] += 1;
    }
  }
  return summary;
}

// === Study review computed status (spec §4.5) ===
export function getComputedReviewStatus(note: ConceptNote, today = todayValue()): ComputedReviewStatus {
  if (note.reviewStatus === "mastered") return "mastered";
  if (!note.nextReviewDate) return "not_scheduled";
  if (note.nextReviewDate <= today) return "due";
  return "upcoming";
}

export type StudyReviewQueue = {
  due: ConceptNote[];
  upcoming: ConceptNote[];
  mastered: ConceptNote[];
  notScheduled: ConceptNote[];
};

export function getStudyReviewQueue(notes: ConceptNote[], today = todayValue()): StudyReviewQueue {
  const queue: StudyReviewQueue = { due: [], upcoming: [], mastered: [], notScheduled: [] };
  for (const note of notes) {
    if (note.deletedAt) continue;
    const status = getComputedReviewStatus(note, today);
    if (status === "due") queue.due.push(note);
    else if (status === "upcoming") queue.upcoming.push(note);
    else if (status === "mastered") queue.mastered.push(note);
    else queue.notScheduled.push(note);
  }
  // Earliest review date first within due/upcoming.
  queue.due.sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate));
  queue.upcoming.sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate));
  return queue;
}

export function getDueReviewCount(notes: ConceptNote[], today = todayValue()): number {
  return notes.filter((note) => getComputedReviewStatus(note, today) === "due").length;
}

// === Misc helpers ===
export function getProjectName(projects: Project[], projectId: string): string {
  return projects.find((project) => project.id === projectId)?.name ?? "";
}

export function sortByOrderThenCreated<T extends { order?: number; createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt));
}
