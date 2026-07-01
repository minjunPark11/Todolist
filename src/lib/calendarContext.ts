// CALENDAR_DESIGN.md §6 (D7): builds a "today's week" snapshot for the Ollama
// chat when the user is on the Calendar page. MVP scope only — no live anchor
// from the calendar's own view state (avoids lifting CalendarView state to App).
import type { ConceptNote, Project, Task } from "../types";
import { getWeekDays, todayValue } from "../utils/date";
import { buildCalendarItems, defaultCalendarLayers } from "../utils/calendarItems";

export interface CalendarContextInput {
  tasks: Task[];
  projects: Project[];
  conceptNotes: ConceptNote[];
}

function minutesBetween(start: string, end: string): number {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  return Math.max(0, endHour * 60 + endMinute - (startHour * 60 + startMinute));
}

export function buildCalendarContextText({ tasks, projects, conceptNotes }: CalendarContextInput): string {
  const days = getWeekDays(todayValue());
  const rangeStart = days[0];
  const rangeEnd = days[days.length - 1];

  const items = buildCalendarItems({
    tasks,
    projects,
    conceptNotes,
    layers: { ...defaultCalendarLayers, completed: false },
    projectFilter: "all",
  }).filter((item) => item.date >= rangeStart && item.date <= rangeEnd);

  const scheduledTasks = items
    .filter((item) => item.layer === "task")
    .map((item) => ({
      title: item.title,
      date: item.date,
      start: item.startTime ?? null,
      end: item.endTime ?? null,
    }));
  const deadlines = items
    .filter((item) => item.layer === "deadline")
    .map((item) => ({ title: item.title, date: item.date }));
  const studyReviews = items
    .filter((item) => item.layer === "study-review")
    .map((item) => ({ title: item.title, date: item.date }));
  const projectDeadlines = items
    .filter((item) => item.layer === "project-deadline")
    .map((item) => ({ title: item.title, date: item.date }));
  const unscheduledTasks = tasks
    .filter((task) => !task.scheduledDate && task.status !== "done" && task.status !== "archived")
    .slice(0, 20)
    .map((task) => ({ title: task.title, dueDate: task.dueDate || null }));

  const workloadSummary: Record<string, number> = {};
  for (const day of days) workloadSummary[day] = 0;
  for (const item of items) {
    if (item.layer !== "task" || !item.startTime || !item.endTime) continue;
    workloadSummary[item.date] = (workloadSummary[item.date] ?? 0) + minutesBetween(item.startTime, item.endTime);
  }

  const context = {
    activePage: "calendar",
    view: "week",
    range: { start: rangeStart, end: rangeEnd },
    scheduledTasks,
    deadlines,
    studyReviews,
    projectDeadlines,
    unscheduledTasks,
    workloadSummary,
  };

  return [
    "The user is currently on the Calendar page, viewing this week (Sunday-Saturday). Calendar context as JSON:",
    JSON.stringify(context, null, 2),
    "Only propose scheduling changes in your reply — never claim you already changed the calendar unless a tool actually did it.",
  ].join("\n\n");
}
