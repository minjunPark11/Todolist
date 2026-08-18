import type {
  Project,
  Task,
  TaskPriority,
} from "../types";
import { scheduleSpan } from "../domain/schedule/scheduleQueries";
import { scheduleFromTask } from "../domain/schedule/taskSchedule";
import { addDays, addMonths, daysBetween, todayValue } from "./date";

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
  /**
   * Everything landing on today (audit §6, 1-e).
   *
   * This was two buckets — `dueToday` and `scheduledToday` — because a task
   * could be due one day and planned for another. The two dates merged, so
   * the two rows would now hold the same tasks.
   */
  dueToday: Task[];
};

// Assign each task to the FIRST matching bucket only (spec §0.1.7).
export function getTodayBuckets(tasks: Task[], today = todayValue()): TodayBuckets {
  const buckets: TodayBuckets = {
    doneToday: [],
    waiting: [],
    inProgress: [],
    overdue: [],
    dueToday: [],
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
    // A range is late only once its END has passed, and it is "today's" from
    // its first day onward — so the span answers both questions.
    const span = scheduleSpan(scheduleFromTask(task));
    if (span === null) continue;
    if (span.end < today) {
      buckets.overdue.push(task);
      continue;
    }
    if (span.start <= today) {
      buckets.dueToday.push(task);
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


// === Recurring tasks ===

export function getNextDueDate(task: Task, today = todayValue()): string {
  const interval = Math.max(task.repeatInterval || 1, 1);
  // Advance from whichever is later: the task's own due date or today.
  // Basing this purely on `dueDate` meant a repeat neglected for a week
  // produced yet another date in the past, so the user had to complete it
  // once per missed cycle to catch up. Anchoring to today instead costs a
  // monthly repeat its day-of-month when it is completed late, which is the
  // cheaper of the two surprises.
  const baseDate = task.dueDate && task.dueDate > today ? task.dueDate : today;

  if (task.repeatType === "daily") return addDays(baseDate, interval);
  if (task.repeatType === "weekly") return nextWeeklyDate(baseDate, interval, task.repeatDays ?? []);
  if (task.repeatType === "monthly") return addMonths(baseDate, interval);
  if (task.repeatType === "yearly") return addMonths(baseDate, interval * 12);
  return baseDate;
}

// A weekly repeat that names its days lands on the next one of them, not seven
// days on. `repeatDays` has been stored since long before anything read it —
// the schedule editor's 평일 preset is the first thing to write a set of days,
// and "every weekday" that advanced a week at a time would mean Monday only.
//
// The interval applies to WEEKS, so a fortnightly Mon/Thu skips the days in
// between weeks rather than every other occurrence: the scan finds the next
// named day, then adds the extra weeks only when the week has wrapped.
function nextWeeklyDate(baseDate: string, interval: number, days: readonly number[]): string {
  if (days.length === 0) return addDays(baseDate, interval * 7);

  const allowed = new Set(days);
  const baseWeekday = new Date(`${baseDate}T00:00:00Z`).getUTCDay();
  for (let ahead = 1; ahead <= 7; ahead += 1) {
    if (!allowed.has((baseWeekday + ahead) % 7)) continue;
    const wrapped = baseWeekday + ahead >= 7;
    return addDays(baseDate, ahead + (wrapped ? (interval - 1) * 7 : 0));
  }
  return addDays(baseDate, interval * 7);
}

export type RecurringCompletion =
  // Past the repeat's end date: no next occurrence, so the task itself closes out.
  | { kind: "final" }
  // `occurrence` is a standalone done record for the instance just finished;
  // `patch` rolls the original task forward, still open.
  | { kind: "rolled"; occurrence: Task; patch: Partial<Task> };

// Decides what completing one occurrence of a repeating task should produce.
//
// The completion cannot be recorded on the task itself: every "done today"
// check keys on completedAt (getTodayBuckets here, isTodayTask in todayView),
// so a rolled-forward task carrying completedAt would read as finished today
// and drop out of the open list until tomorrow. Splitting the finished
// instance onto its own row keeps both facts true at once.
export function planRecurringCompletion(
  task: Task,
  occurrenceId: string,
  now: string,
  today = todayValue(),
): RecurringCompletion {
  const nextDueDate = getNextDueDate(task, today);
  if (task.repeatEndDate && nextDueDate > task.repeatEndDate) return { kind: "final" };

  const occurrence: Task = {
    ...task,
    id: occurrenceId,
    status: "done",
    previousStatus: task.status,
    completedAt: now,
    archivedAt: "",
    // A snapshot of one finished occurrence: it must never repeat again on its
    // own, and it does not own the parent's running focus session.
    repeatType: "none",
    repeatInterval: 1,
    repeatDays: [],
    repeatEndDate: "",
    activeSessionId: "",
    createdAt: now,
    updatedAt: now,
  };

  // A range keeps its length: the start moves by however far the end did,
  // rather than being stranded behind the new deadline.
  const shiftDays = daysBetween(task.dueDate || today, nextDueDate);

  return {
    kind: "rolled",
    occurrence,
    patch: {
      status: "todo",
      dueDate: nextDueDate,
      startDate: task.startDate ? addDays(task.startDate, shiftDays) : task.startDate,
      completedAt: "",
    },
  };
}

// === Misc helpers ===
export function getProjectName(projects: Project[], projectId: string): string {
  return projects.find((project) => project.id === projectId)?.name ?? "";
}

// sortByOrderThenCreated used to live here. It had no callers, and it sorted
// on an `order` field nothing ever assigned — see compareTodayEntries in
// todayView.ts for what replaced its one real use.
