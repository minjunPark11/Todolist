// Calendar derived-item model (CALENDAR_DESIGN.md §1.3/§1.4).
// Shared by CalendarView rendering and the Ollama calendar context builder.
import type { ConceptNote, ExternalCalendar, ExternalCalendarEvent, Project, Task, TaskPriority, TaskStatus } from "../types";
import { externalEventDate, externalEventEndDate, externalEventEndTime, externalEventStartTime } from "../lib/externalCalendars";
import {
  externalCategoryId,
  projectCategoryId,
  studyCategoryId,
  type CalendarCategory,
} from "../lib/calendarCategories";
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
  // Resolved calendar category (category spec §2): explicit task.categoryId,
  // else the project category, else the default personal category. "" when
  // no category map was supplied (AI context builder path).
  categoryId: string;
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
  // Category resolution (calendar category spec). When supplied, every item
  // gets a categoryId and task blocks take the category color; items whose
  // category is not in visibleCategoryIds are dropped.
  categories?: Map<string, CalendarCategory>;
  defaultCategoryId?: string;
  visibleCategoryIds?: Set<string>;
}

export function buildCalendarItems({
  tasks,
  projects,
  conceptNotes,
  externalCalendars = [],
  externalCalendarEvents = [],
  layers,
  projectFilter,
  categories,
  defaultCategoryId = "",
  visibleCategoryIds,
}: BuildCalendarItemsInput): CalendarItem[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const items: CalendarItem[] = [];

  // Explicit categoryId wins; a project task falls back to its project
  // category; everything else lands in the default personal category (§15.6
  // migration applied at display time so legacy data needs no rewrite).
  function resolveTaskCategoryId(task: Task): string {
    if (!categories) return "";
    if (task.categoryId && categories.has(task.categoryId)) return task.categoryId;
    if (task.projectId && categories.has(projectCategoryId(task.projectId))) return projectCategoryId(task.projectId);
    return defaultCategoryId;
  }

  function resolveCategoryId(id: string): string {
    if (!categories) return "";
    return categories.has(id) ? id : defaultCategoryId;
  }

  function categoryAllowed(categoryId: string): boolean {
    if (!visibleCategoryIds) return true;
    return visibleCategoryIds.has(categoryId);
  }

  for (const task of tasks) {
    if (task.status === "archived" || task.deletedAt) continue;
    // Done items only appear when the Completed layer is explicitly on (§9.8).
    if (task.status === "done" && !layers.completed) continue;
    if (!projectAllowed(task.projectId, projectFilter)) continue;

    const project = projectById.get(task.projectId);
    const repeating = task.repeatType !== "none";
    const taskCategoryId = resolveTaskCategoryId(task);
    if (!categoryAllowed(taskCategoryId)) continue;
    const taskCategory = categories?.get(taskCategoryId);

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
        color: taskCategory?.color ?? project?.color ?? LAYER_COLOR.task,
        categoryId: taskCategoryId,
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
        categoryId: taskCategoryId,
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
      const categoryId = resolveCategoryId(projectCategoryId(project.id));
      if (!categoryAllowed(categoryId)) continue;
      items.push({
        key: `proj:${project.id}`,
        layer: "project-deadline",
        sourceType: "project",
        sourceId: project.id,
        title: project.name,
        date: project.dueDate,
        allDay: true,
        color: project.color || LAYER_COLOR["project-deadline"],
        categoryId,
        draggable: false,
      });
    }
  }

  if (layers.studyReview) {
    for (const note of conceptNotes) {
      if (note.deletedAt) continue;
      if (!note.nextReviewDate) continue;
      if (note.reviewStatus === "mastered") continue;
      const categoryId = resolveCategoryId(studyCategoryId(note.topicId));
      if (!categoryAllowed(categoryId)) continue;
      items.push({
        key: `review:${note.id}`,
        layer: "study-review",
        sourceType: "note",
        sourceId: note.id,
        title: note.title,
        date: note.nextReviewDate,
        allDay: true,
        color: LAYER_COLOR["study-review"],
        categoryId,
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
    const eventCategoryId = categories ? externalCategoryId(calendar.id) : "";
    if (!categoryAllowed(eventCategoryId)) continue;
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
        categoryId: eventCategoryId,
        draggable: false,
        readOnly: true,
      });
    }
  }

  return items;
}
