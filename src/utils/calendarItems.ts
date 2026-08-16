// Calendar derived-item model (CALENDAR_DESIGN.md §1.3/§1.4).
// Shared by CalendarView rendering and the Ollama calendar context builder.
import type { ExternalCalendar, ExternalCalendarEvent, FocusSession, List, Project, Task, TaskPriority, TaskStatus } from "../types";
import { projectItems } from "../domain/view/item";
import { externalEventDate, externalEventEndDate, externalEventEndTime, externalEventStartTime } from "../lib/externalCalendars";
import {
  externalCategoryId,
  projectCategoryId,
  FOCUS_ACTUAL_CATEGORY_ID,
  FOCUS_ACTUAL_COLOR,
  type CalendarCategory,
} from "../lib/calendarCategories";
import { addDays, todayValue } from "./date";

export type CalendarLayer = "task" | "deadline" | "project-deadline" | "external" | "focus-actual";

export interface CalendarLayerToggles {
  task: boolean;
  deadline: boolean;
  projectDeadline: boolean;
  completed: boolean;
  focusActual: boolean;
}

export const defaultCalendarLayers: CalendarLayerToggles = {
  task: true,
  deadline: true,
  projectDeadline: true,
  completed: false,
  focusActual: true,
};

export interface CalendarItem {
  key: string;
  layer: CalendarLayer;
  sourceType: "task" | "project" | "external" | "focus";
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

// Every item takes its category's colour; the layer tone below is only the
// fallback for items whose category has none (CALENDAR_APPLE_DESIGN.md D1).
// Hue answers "which calendar is this?" and nothing else — the layer is read
// from the item's *shape* instead, so recolouring a category can no longer
// make a deadline marker and a project deadline collide on the same orange.
const LAYER_COLOR: Record<CalendarLayer, string> = {
  task: "#0066cc",
  deadline: "#ff9500",
  "project-deadline": "#ff2d55",
  external: "#4f73ff",
  "focus-actual": FOCUS_ACTUAL_COLOR,
};

// A focus segment is wall-clock time, so it can cross midnight: split it
// into per-day parts in *local* time (calendar dates/times are local).
interface FocusSegmentPart {
  date: string;
  startTime: string;
  endTime: string;
}

function localDateOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localTimeOf(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function splitFocusSegmentByDay(startAt: string, endAt: string): FocusSegmentPart[] {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return [];

  const parts: FocusSegmentPart[] = [];
  let cursor = start;
  // 7-day cap as a runaway guard against corrupted timestamps.
  for (let i = 0; i < 7 && cursor < end; i += 1) {
    const dayEnd = new Date(cursor);
    dayEnd.setHours(24, 0, 0, 0);
    const partEnd = end < dayEnd ? end : dayEnd;
    const startTime = localTimeOf(cursor);
    // Sub-minute stretches still get a visible 1-minute sliver.
    let endTime = partEnd.getTime() >= dayEnd.getTime() ? "24:00" : localTimeOf(partEnd);
    if (endTime <= startTime) {
      const bumped = new Date(cursor.getTime() + 60000);
      endTime = localDateOf(bumped) === localDateOf(cursor) ? localTimeOf(bumped) : "24:00";
    }
    parts.push({ date: localDateOf(cursor), startTime, endTime });
    cursor = dayEnd;
  }
  return parts;
}

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
  /**
   * Resolves each Item's List and Folder. Optional, and no caller passes it
   * yet, because nothing the calendar draws reads them — it is the input a
   * List- or Folder-scoped calendar would need (§16), and passing it is the
   * whole of that change. Absent, every Item's `listId` resolves to "" and is
   * simply unused.
   */
  lists?: List[];
  externalCalendars?: ExternalCalendar[];
  externalCalendarEvents?: ExternalCalendarEvent[];
  // Completed sessions become read-only "actual focus time" blocks.
  focusSessions?: FocusSession[];
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
  lists = [],
  externalCalendars = [],
  externalCalendarEvents = [],
  focusSessions = [],
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

  // The task half runs on the shared projection (CLICKUP_IMPORT_DESIGN §4.1),
  // so "one Task, different renderings" holds here as it does on the board and
  // the timeline. What the calendar adds is not a second reading of a Task —
  // it is the expansion of one Item into the chips its dates earn: a work
  // block from `scheduledDate`, a marker from `dueDate`. That is presentation,
  // and it stays here.
  //
  // `taskById` carries the fields no view needs but this renderer does —
  // repeat, category, the raw status for the popover.
  const taskById = new Map(tasks.map((entry) => [entry.id, entry]));
  const viewItems = projectItems({
    tasks,
    paths: [],
    projects,
    lists,
    today: todayValue(),
    // Goals and milestones have deadlines too, and adding them here is now a
    // one-word change. It is not this refactor's to make: the calendar has
    // never shown them, and quietly starting to would be a new feature
    // arriving disguised as a cleanup.
    sources: ["task"],
  });

  for (const item of viewItems) {
    const task = taskById.get(item.sourceId);
    if (!task) continue;
    if (item.statusId === "archived" || task.status === "archived") continue;
    const done = item.done;
    const hasScheduledBlock = Boolean(item.scheduledDate);
    // Scheduled work blocks stay on the calendar after completion so the
    // plan remains visible as a completed schedule. Completed, unscheduled
    // tasks still obey the optional Completed layer.
    if (done && !hasScheduledBlock && !layers.completed) continue;
    // The calendar filters and colours by PROJECT. `Item.spaceId` named one
    // until STEP 7 and now names the Space above it, which would let one
    // project's filter match every project beside it.
    if (!projectAllowed(item.projectId, projectFilter)) continue;

    const project = projectById.get(item.projectId);
    const repeating = task.repeatType !== "none";
    const taskCategoryId = resolveTaskCategoryId(task);
    if (!categoryAllowed(taskCategoryId)) continue;
    const taskCategory = categories?.get(taskCategoryId);

    // D1: scheduledDate drives the work-time block; startTime/endTime belong to it.
    if (layers.task && item.scheduledDate) {
      items.push({
        key: `task-block:${item.sourceId}`,
        layer: "task",
        sourceType: "task",
        sourceId: item.sourceId,
        title: item.title,
        date: item.scheduledDate,
        startTime: item.startTime || undefined,
        endTime: item.endTime || undefined,
        allDay: !item.startTime,
        color: taskCategory?.color ?? project?.color ?? LAYER_COLOR.task,
        categoryId: taskCategoryId,
        priority: item.priority,
        status: task.status,
        draggable: !done,
        repeating,
      });
    }

    // D2: dueDate is always an all-day, non-draggable deadline marker.
    if (layers.deadline && item.dueDate && (!done || layers.completed)) {
      items.push({
        key: `deadline:${item.sourceId}`,
        layer: "deadline",
        sourceType: "task",
        sourceId: item.sourceId,
        title: item.title,
        date: item.dueDate,
        allDay: true,
        color: taskCategory?.color ?? project?.color ?? LAYER_COLOR.deadline,
        categoryId: taskCategoryId,
        priority: item.priority,
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

  // Actual focus time: every completed focus session's running segments,
  // drawn as read-only blocks so planned vs. executed time can be compared
  // on the same grid.
  if (layers.focusActual && focusSessions.length > 0) {
    const focusCategoryId = resolveCategoryId(FOCUS_ACTUAL_CATEGORY_ID);
    if (categoryAllowed(focusCategoryId)) {
      const focusColor = categories?.get(focusCategoryId)?.color ?? FOCUS_ACTUAL_COLOR;
      for (const session of focusSessions) {
        if (session.status !== "completed") continue;
        // Breaks are rest, not executed plan time.
        if (session.mode !== "focus") continue;
        session.segments.forEach((segment, index) => {
          for (const part of splitFocusSegmentByDay(segment.startAt, segment.endAt)) {
            items.push({
              key: `focus:${session.id}:${index}:${part.date}`,
              layer: "focus-actual",
              sourceType: "focus",
              sourceId: session.id,
              title: session.title || session.projectName || "Focus",
              date: part.date,
              startTime: part.startTime,
              endTime: part.endTime,
              allDay: false,
              color: focusColor,
              categoryId: focusCategoryId,
              draggable: false,
              readOnly: true,
            });
          }
        });
      }
    }
  }

  return items;
}
