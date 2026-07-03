// Calendar derived-item model (CALENDAR_DESIGN.md §1.3/§1.4).
// Shared by CalendarView rendering and the Ollama calendar context builder.
import type { ConceptNote, ExternalCalendar, ExternalCalendarEvent, Project, Task, TaskPriority, TaskStatus } from "../types";
import { externalEventDate, externalEventEndDate, externalEventEndTime, externalEventStartTime } from "../lib/externalCalendars";
import { addDays } from "./date";

export type CalendarLayer = "task" | "deadline" | "study-review" | "project-deadline" | "external";

export interface CalendarLayerToggles {
  task: boolean;
  deadline: boolean;
  studyReview: boolean;
  projectDeadline: boolean;
  completed: boolean;
}

export const defaultCalendarLayers: CalendarLayerToggles = {
  task: true,
  deadline: true,
  studyReview: true,
  projectDeadline: true,
  completed: false,
};

export interface CalendarItem {
  key: string;
  layer: CalendarLayer;
  sourceType: "task" | "project" | "note" | "external";
  sourceId: string;
  externalCalendarId?: string;
  externalCalendarName?: string;
  readOnly?: boolean;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  color: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  draggable: boolean;
  repeating?: boolean;
}

// §9.5: task blocks use project color; other layers use a fixed layer tone.
const LAYER_COLOR: Record<CalendarLayer, string> = {
  task: "#0066cc",
  deadline: "#ff9500",
  "study-review": "#af52de",
  "project-deadline": "#ff2d55",
  external: "#4f73ff",
};

export type ProjectFilter = "all" | Set<string>;

// §9.6: tasks/projects with no project id always show; filter only hides
// items that belong to a project the user explicitly excluded.
function projectAllowed(projectId: string, projectFilter: ProjectFilter): boolean {
  if (!projectId) return true;
  if (projectFilter === "all") return true;
  return projectFilter.has(projectId);
}

export interface BuildCalendarItemsInput {
  tasks: Task[];
  projects: Project[];
  conceptNotes: ConceptNote[];
  externalCalendars?: ExternalCalendar[];
  externalCalendarEvents?: ExternalCalendarEvent[];
  layers: CalendarLayerToggles;
  projectFilter: ProjectFilter;
}

export function buildCalendarItems({
  tasks,
  projects,
  conceptNotes,
  externalCalendars = [],
  externalCalendarEvents = [],
  layers,
  projectFilter,
}: BuildCalendarItemsInput): CalendarItem[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const items: CalendarItem[] = [];

  for (const task of tasks) {
    if (task.status === "archived" || task.deletedAt) continue;
    // Done items only appear when the Completed layer is explicitly on (§9.8).
    if (task.status === "done" && !layers.completed) continue;
    if (!projectAllowed(task.projectId, projectFilter)) continue;

    const project = projectById.get(task.projectId);
    const repeating = task.repeatType !== "none";

    // D1: scheduledDate drives the work-time block; startTime/endTime belong to it.
    if (layers.task && task.scheduledDate) {
      items.push({
        key: `task-block:${task.id}`,
        layer: "task",
        sourceType: "task",
        sourceId: task.id,
        title: task.title,
        date: task.scheduledDate,
        startTime: task.startTime || undefined,
        endTime: task.endTime || undefined,
        allDay: !task.startTime,
        color: project?.color ?? LAYER_COLOR.task,
        priority: task.priority,
        status: task.status,
        draggable: true,
        repeating,
      });
    }

    // D2: dueDate is always an all-day, non-draggable deadline marker.
    if (layers.deadline && task.dueDate) {
      items.push({
        key: `deadline:${task.id}`,
        layer: "deadline",
        sourceType: "task",
        sourceId: task.id,
        title: task.title,
        date: task.dueDate,
        allDay: true,
        color: LAYER_COLOR.deadline,
        priority: task.priority,
        status: task.status,
        draggable: false,
        repeating,
      });
    }
  }

  if (layers.projectDeadline) {
    for (const project of projects) {
      if (!project.dueDate) continue;
      if (project.status !== "active" && project.status !== "paused") continue;
      if (!projectAllowed(project.id, projectFilter)) continue;
      items.push({
        key: `proj:${project.id}`,
        layer: "project-deadline",
        sourceType: "project",
        sourceId: project.id,
        title: project.name,
        date: project.dueDate,
        allDay: true,
        color: project.color || LAYER_COLOR["project-deadline"],
        draggable: false,
      });
    }
  }

  if (layers.studyReview) {
    for (const note of conceptNotes) {
      if (note.deletedAt) continue;
      if (!note.nextReviewDate) continue;
      if (note.reviewStatus === "mastered") continue;
      items.push({
        key: `review:${note.id}`,
        layer: "study-review",
        sourceType: "note",
        sourceId: note.id,
        title: note.title,
        date: note.nextReviewDate,
        allDay: true,
        color: LAYER_COLOR["study-review"],
        draggable: false,
      });
    }
  }

  const externalCalendarById = new Map(
    externalCalendars
      .filter((calendar) => calendar.enabled && calendar.visible)
      .map((calendar) => [calendar.id, calendar]),
  );

  for (const event of externalCalendarEvents) {
    const calendar = externalCalendarById.get(event.externalCalendarId);
    if (!calendar) continue;
    // All-day events can span several days (DTEND is exclusive per RFC 5545):
    // emit one chip per covered day so the whole range shows in the all-day
    // band, capped at 62 days as a runaway guard.
    const startDate = externalEventDate(event);
    const dates = [startDate];
    if (event.allDay) {
      const endDate = externalEventEndDate(event);
      let cursor = startDate;
      while (endDate && dates.length < 62) {
        const next = addDays(cursor, 1);
        if (next >= endDate) break;
        dates.push(next);
        cursor = next;
      }
    }
    for (const date of dates) {
      items.push({
        key: `external:${event.id}:${date}`,
        layer: "external",
        sourceType: "external",
        sourceId: event.id,
        externalCalendarId: calendar.id,
        externalCalendarName: calendar.name,
        title: event.title,
        date,
        startTime: externalEventStartTime(event),
        endTime: externalEventEndTime(event),
        allDay: event.allDay,
        color: calendar.color,
        draggable: false,
        readOnly: true,
      });
    }
  }

  return items;
}
