// Calendar derived-item model (CALENDAR_DESIGN.md §1.3/§1.4).
// Shared by the CalendarView renderers (month, week, popover).
import type { ExternalCalendar, ExternalCalendarEvent, FocusSession, List, Task, TaskPriority } from "../types";
import { projectItems } from "../domain/view/item";
// Straight from ./ics rather than through lib/externalCalendars, which
// re-exports these but drags a platform (and so a browser) in behind them.
// Calendar items are built on a server too now (§7.2 of the external-AI doc).
import {
  externalEventDate,
  externalEventEndDate,
  externalEventEndTime,
  externalEventStartTime,
  localDateTimeParts,
} from "../lib/ics/parse";
import { expandIcsOccurrences } from "../lib/ics/recurrence";
import {
  externalCategoryId,
  FOCUS_ACTUAL_CATEGORY_ID,
  FOCUS_ACTUAL_COLOR,
  type CalendarCategory,
} from "../lib/calendar/categoryModel";
import { scheduleSpan } from "../domain/schedule/scheduleQueries";
import { scheduleFromTask } from "../domain/schedule/taskSchedule";
import { addDays, todayValue } from "./date";
import { isTaskAlive } from "../domain/tasks/taskState";

// "deadline" is gone: it named the marker a task drew from `dueDate`, and a
// task draws one chip now (audit §6, 1-e). `project-deadline` went with the
// Projects feature — there is no Project record with a due date to mark.
export type CalendarLayer = "task" | "external" | "focus-actual";

export interface CalendarLayerToggles {
  task: boolean;
  completed: boolean;
  focusActual: boolean;
}

export const defaultCalendarLayers: CalendarLayerToggles = {
  task: true,
  completed: false,
  focusActual: true,
};

export interface CalendarItem {
  key: string;
  layer: CalendarLayer;
  sourceType: "task" | "external" | "focus";
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
  // else the default personal category. "" when no category map was supplied
  // (AI context builder path).
  categoryId: string;
  priority?: TaskPriority;
  /**
   * Finished, as an answer rather than as a status value.
   *
   * This carried `task.status` and every view compared it to `"done"` — four
   * screens each naming a `TaskStatus` member to ask one question. Chapter 26
   * (§26.3) moves that value out of the lifecycle axis, so the projection
   * answers the question here instead and the views read a boolean.
   */
  done?: boolean;
  draggable: boolean;
  repeating?: boolean;
}

// Every item takes its category's colour; the layer tone below is only the
// fallback for items whose category has none (CALENDAR_APPLE_DESIGN.md D1).
// Hue answers "which calendar is this?" and nothing else — the layer is read
// from the item's *shape* instead, so recolouring a category can no longer
// make two chips of different kinds collide on the same orange.
const LAYER_COLOR: Record<CalendarLayer, string> = {
  task: "#0066cc",
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

export function splitFocusSegmentByDay(
  startAt: string,
  endAt: string,
  /**
   * Whose midnight the segment is cut at. Absent means this device's, which is
   * every existing caller. A server passes the viewer's zone: a session that
   * ran 23:30–00:30 in Seoul is two days there and one day in London, and the
   * machine happening to run in UTC is not an argument for either.
   */
  timezone?: string,
): FocusSegmentPart[] {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return [];

  if (timezone) return splitByZonedDay(startAt, endAt, timezone);

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

/**
 * The same cut, made by walking DATES rather than instants.
 *
 * Advancing a day by adding 24 hours to a timestamp is what a zone breaks: on
 * the two DST days a year that is 23 or 25 hours, and the parts drift by one.
 * Reading both ends in the viewer's zone first and then stepping the calendar
 * date has no such arithmetic in it.
 */
function splitByZonedDay(startAt: string, endAt: string, timezone: string): FocusSegmentPart[] {
  const from = localDateTimeParts(startAt, undefined, timezone);
  const to = localDateTimeParts(endAt, undefined, timezone);
  const parts: FocusSegmentPart[] = [];

  let date = from.date;
  // 7-day cap as a runaway guard against corrupted timestamps, as above.
  for (let i = 0; i < 7 && date <= to.date; i += 1) {
    const startTime = date === from.date ? from.time ?? "00:00" : "00:00";
    let endTime = date === to.date ? to.time ?? "24:00" : "24:00";
    if (endTime <= startTime) {
      // A sub-minute stretch still gets a visible sliver, and a segment ending
      // exactly at midnight belongs to the day it ran in, not to the next one.
      if (date === to.date && date !== from.date) break;
      endTime = startTime >= "23:59" ? "24:00" : bumpMinute(startTime);
    }
    parts.push({ date, startTime, endTime });
    date = addDays(date, 1);
  }
  return parts;
}

function bumpMinute(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const next = hours * 60 + minutes + 1;
  return `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`;
}

export interface BuildCalendarItemsInput {
  tasks: Task[];
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
  /**
   * The days worth drawing, so a repeating event can be expanded into the
   * occurrences that fall inside them (`lib/ics/recurrence`).
   *
   * Optional, and its absence is not free: without a range there is nothing to
   * expand within, so a weekly meeting draws once — on the day it was first
   * created — and every other week reads as empty. Callers drawing a calendar
   * should pass one.
   */
  externalCalendarRange?: { from: string; to: string };
  /**
   * Whose "local" the external events are read in.
   *
   * On a device the answer is the device, which is what the absent case still
   * means. A server has no meaningful local: reading a UTC-anchored meeting in
   * the machine's zone puts a 9 a.m. call on the wrong day for anyone east of
   * it, so the caller passes the viewer's zone (§7.2, M1).
   */
  viewerTimezone?: string;
  // Completed sessions become read-only "actual focus time" blocks.
  focusSessions?: FocusSession[];
  layers: CalendarLayerToggles;
  // Category resolution (calendar category spec). When supplied, every item
  // gets a categoryId and task blocks take the category color; items whose
  // category is not in visibleCategoryIds are dropped.
  categories?: Map<string, CalendarCategory>;
  defaultCategoryId?: string;
  visibleCategoryIds?: Set<string>;
}

export function buildCalendarItems({
  tasks,
  lists = [],
  externalCalendars = [],
  externalCalendarEvents = [],
  externalCalendarRange,
  viewerTimezone,
  focusSessions = [],
  layers,
  categories,
  defaultCategoryId = "",
  visibleCategoryIds,
}: BuildCalendarItemsInput): CalendarItem[] {
  const items: CalendarItem[] = [];

  // Explicit categoryId wins; everything else lands in the default personal
  // category (§15.6 migration applied at display time so legacy data needs no
  // rewrite).
  function resolveTaskCategoryId(task: Task): string {
    if (!categories) return "";
    if (task.categoryId && categories.has(task.categoryId)) return task.categoryId;
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
  // it is the expansion of one Item into the chips its dates earn, which after
  // the consolidation (audit §6, 1-d) means one chip per day the schedule
  // covers. That is presentation, and it stays here.
  //
  // `taskById` carries the fields no view needs but this renderer does —
  // repeat, category, the raw status for the popover.
  const taskById = new Map(tasks.map((entry) => [entry.id, entry]));
  const viewItems = projectItems({
    tasks,
    lists,
    today: todayValue(),
  });

  for (const item of viewItems) {
    const task = taskById.get(item.sourceId);
    if (!task) continue;
    // One question, where there were two: `statusId === "archived"` was the
    // legacy spelling of Won't Do, which `isTaskAlive` already excludes.
    if (!isTaskAlive(task)) continue;
    const done = item.done;
    const repeating = task.repeatType !== "none";
    const taskCategoryId = resolveTaskCategoryId(task);
    if (!categoryAllowed(taskCategoryId)) continue;
    const taskCategory = categories?.get(taskCategoryId);

    // One Task, one chip per day it covers (audit §6, 1-e).
    //
    // This used to be two chips with different meanings — a draggable work
    // block from `scheduledDate`, an all-day marker from `dueDate`. The
    // consolidation collapses those two dates into one (audit 1-d), so a task
    // that had both would now emit the same chip twice, on the same day, in
    // two colours. The layers merge with the fields.
    //
    // What the user loses is the visual distinction between "doing it" and
    // "due"; what they gain is that every dated task is now draggable, where
    // before a deadline could only be moved from the task detail.
    if (!layers.task) continue;
    const schedule = scheduleFromTask(item);
    const span = scheduleSpan(schedule);
    if (span === null) continue;
    // Completed tasks stay on the calendar so the plan reads as a finished
    // schedule; an undated one has no chip to keep, which is what the
    // Completed layer governs instead.
    if (done && !layers.completed) continue;

    // A range covers every day between its ends. Same 62-day guard the
    // external all-day path uses, for the same reason: one malformed record
    // should not emit ten thousand chips.
    const dates: string[] = [span.start];
    let cursor = span.start;
    while (cursor < span.end && dates.length < 62) {
      cursor = addDays(cursor, 1);
      dates.push(cursor);
    }

    for (const date of dates) {
      // Times belong to the ends of the range, never to the days between
      // (audit 1-b). A middle day is all-day by construction.
      const isStart = date === span.start;
      const isEnd = date === span.end;
      const startTime = isStart ? schedule.startTime : null;
      const endTime = isEnd ? schedule.endTime : null;
      items.push({
        key: dates.length > 1 ? `task-block:${item.sourceId}:${date}` : `task-block:${item.sourceId}`,
        layer: "task",
        sourceType: "task",
        sourceId: item.sourceId,
        title: item.title,
        date,
        startTime: startTime ?? undefined,
        endTime: endTime ?? undefined,
        allDay: startTime === null,
        color: taskCategory?.color ?? LAYER_COLOR.task,
        categoryId: taskCategoryId,
        priority: item.priority,
        done,
        // Dragging one day of a range would have to mean either "move the
        // whole thing" or "resize this end", and the calendar has no gesture
        // that says which. Ranges are edited in the editor until it does.
        draggable: !done && dates.length === 1,
        repeating,
      });
    }
  }

  const externalCalendarById = new Map(
    externalCalendars
      .filter((calendar) => calendar.enabled && calendar.visible)
      .map((calendar) => [calendar.id, calendar]),
  );

  const externalOccurrences = externalCalendarRange
    ? expandIcsOccurrences(externalCalendarEvents, externalCalendarRange, { viewerTimezone })
    : externalCalendarEvents;

  for (const event of externalOccurrences) {
    const calendar = externalCalendarById.get(event.externalCalendarId);
    if (!calendar) continue;
    const eventCategoryId = categories ? externalCategoryId(calendar.id) : "";
    if (!categoryAllowed(eventCategoryId)) continue;
    // All-day events can span several days (DTEND is exclusive per RFC 5545):
    // emit one chip per covered day so the whole range shows in the all-day
    // band, capped at 62 days as a runaway guard.
    const startDate = externalEventDate(event, viewerTimezone);
    const dates = [startDate];
    if (event.allDay) {
      const endDate = externalEventEndDate(event, viewerTimezone);
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
        startTime: externalEventStartTime(event, viewerTimezone),
        endTime: externalEventEndTime(event, viewerTimezone),
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
          for (const part of splitFocusSegmentByDay(segment.startAt, segment.endAt, viewerTimezone)) {
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
