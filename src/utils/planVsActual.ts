// Planned time vs. executed (focus-measured) time, per day and per task.
// Planned = a task's scheduled calendar block (its date + start/end
// time). Actual = completed focus-session segments. Shared by the AI
// context builder; UI reports can reuse it as-is.
import type { FocusSession, Task } from "../types";
import { splitFocusSegmentByDay } from "./calendarItems";

export interface PlanVsActualTask {
  taskId: string;
  title: string;
  plannedMinutes: number;
  actualMinutes: number;
}

export interface PlanVsActualDay {
  date: string;
  plannedMinutes: number;
  actualMinutes: number;
  // Focus time on tasks that had no planned block that day (or no task link).
  unplannedActualMinutes: number;
  tasks: PlanVsActualTask[];
}

export interface PlanVsActualSummary {
  from: string;
  to: string;
  totalPlannedMinutes: number;
  totalActualMinutes: number;
  days: PlanVsActualDay[];
}

function minutesOf(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function buildPlanVsActual(
  tasks: Task[],
  focusSessions: FocusSession[],
  from: string,
  to: string,
): PlanVsActualSummary {
  // (date, taskId) -> per-task tally. taskId "" collects task-less sessions.
  const byDay = new Map<string, Map<string, PlanVsActualTask>>();
  const titleByTaskId = new Map(tasks.map((task) => [task.id, task.title]));

  function tally(date: string, taskId: string, title: string): PlanVsActualTask {
    let day = byDay.get(date);
    if (!day) {
      day = new Map();
      byDay.set(date, day);
    }
    let entry = day.get(taskId);
    if (!entry) {
      entry = { taskId, title, plannedMinutes: 0, actualMinutes: 0 };
      day.set(taskId, entry);
    }
    return entry;
  }

  for (const task of tasks) {
    if (task.deletedAt) continue;
    // The block's day is the schedule's start — its first day for a range,
    // the date itself otherwise. `startTime` belongs to that day (audit 1-b).
    const blockDay = task.startDate || task.dueDate;
    if (!blockDay || blockDay < from || blockDay > to) continue;
    if (!task.startTime || !task.endTime) continue;
    const planned = minutesOf(task.endTime) - minutesOf(task.startTime);
    if (planned <= 0) continue;
    tally(blockDay, task.id, task.title).plannedMinutes += planned;
  }

  for (const session of focusSessions) {
    if (session.status !== "completed" || session.mode !== "focus") continue;
    for (const segment of session.segments) {
      for (const part of splitFocusSegmentByDay(segment.startAt, segment.endAt)) {
        if (part.date < from || part.date > to) continue;
        const minutes = minutesOf(part.endTime) - minutesOf(part.startTime);
        if (minutes <= 0) continue;
        const title = titleByTaskId.get(session.taskId) ?? session.title;
        tally(part.date, session.taskId, title).actualMinutes += minutes;
      }
    }
  }

  const days: PlanVsActualDay[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entries]) => {
      const dayTasks = [...entries.values()];
      return {
        date,
        plannedMinutes: dayTasks.reduce((sum, entry) => sum + entry.plannedMinutes, 0),
        actualMinutes: dayTasks.reduce((sum, entry) => sum + entry.actualMinutes, 0),
        unplannedActualMinutes: dayTasks
          .filter((entry) => entry.plannedMinutes === 0)
          .reduce((sum, entry) => sum + entry.actualMinutes, 0),
        tasks: dayTasks,
      };
    });

  return {
    from,
    to,
    totalPlannedMinutes: days.reduce((sum, day) => sum + day.plannedMinutes, 0),
    totalActualMinutes: days.reduce((sum, day) => sum + day.actualMinutes, 0),
    days,
  };
}
