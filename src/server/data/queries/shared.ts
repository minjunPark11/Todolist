// What every query needs before it can answer anything.
//
// The queries themselves are deliberately thin: they name the tables they
// read, hand the records to the domain functions the app already uses, and
// project the result. Anything a second query would also need lives here, so
// two tools cannot end up with two definitions of the same word.
import type { ExternalCalendar } from "../../../types";
import { buildCalendarItems, type CalendarItem } from "../../../utils/calendarItems";
import { parseTimeToMinutes } from "../../../utils/todayView";
import { expandIcsOccurrences } from "../../../lib/ics/recurrence";
import type { MinuteSpan } from "../../../domain/schedule/freeTime";
import type { RequestContext } from "../context";
import { todayIn } from "../context";
import { freshnessFrom } from "../freshness";
import type { Freshness } from "../freshness";
import type { PlannerSlice, ReadableTable, Repository } from "../repository";
import { projectionContext, type CalendarEntry, type ProjectionContext } from "../projections";
import {
  loadExternalEvents,
  type ExternalCalendarStatus,
  type ExternalEventsResult,
} from "../calendar/icsSource";

/** The metadata every tool answer carries, whether or not it flatters us. */
export interface ResponseMeta {
  freshness: Freshness;
  externalCalendars?: ExternalCalendarStatus[];
  truncated: boolean;
  partial: boolean;
}

/**
 * One request's world: who is asking, where the rows come from, and how to
 * reach their subscribed calendars.
 *
 * The last two are injected rather than imported so the whole query layer can
 * be tested against fixtures — no account, no network, no clock (§20 Phase 3).
 */
export interface QueryContext {
  request: RequestContext;
  repo: Repository;
  loadExternal?: (calendars: ExternalCalendar[]) => Promise<ExternalEventsResult>;
}

/** The user's today, from their zone rather than the machine's. */
export function todayFor(ctx: QueryContext): string {
  return todayIn(ctx.request.now, ctx.request.timezone);
}

export function buildMeta(
  slice: PlannerSlice,
  external?: ExternalEventsResult,
): ResponseMeta {
  const meta: ResponseMeta = {
    freshness: freshnessFrom(slice.syncState, new Date()),
    truncated: slice.truncated.length > 0,
    // A missing table means part of the answer is simply not there. Saying so
    // is the difference between "you have no tags" and "I could not read your
    // tags", and only one of those is honest.
    partial: slice.missing.length > 0 || Boolean(external?.partial),
  };
  if (external) meta.externalCalendars = external.statuses;
  return meta;
}

/** Freshness is measured against the request's clock, not the process's. */
export function buildMetaAt(
  slice: PlannerSlice,
  now: Date,
  external?: ExternalEventsResult,
): ResponseMeta {
  return { ...buildMeta(slice, external), freshness: freshnessFrom(slice.syncState, now) };
}

export function projectionFor(slice: PlannerSlice, today: string): ProjectionContext {
  return projectionContext({
    today,
    tasks: slice.data.tasks,
    lists: slice.data.lists,
    projects: slice.data.projects,
    subtasks: slice.data.subtasks,
    checkItems: slice.data.checkItems,
  });
}

export interface CalendarWindow {
  from: string;
  to: string;
  include?: Array<"tasks" | "external" | "focus">;
}

export interface CalendarResult {
  entries: CalendarEntry[];
  external?: ExternalEventsResult;
}

/**
 * Task blocks, subscribed events and actual focus time on one timeline.
 *
 * `buildCalendarItems` is the app's own merge — the same function the month
 * and week views draw from — so a reader and a screen cannot disagree about
 * what is on a day. The expansion is done here as well as inside it so the
 * source event stays reachable: an occurrence's location and its series id
 * are on the event, and a drawn item deliberately carries neither.
 */
export async function loadCalendar(
  ctx: QueryContext,
  slice: PlannerSlice,
  window: CalendarWindow,
): Promise<CalendarResult> {
  const include = window.include ?? ["tasks", "external", "focus"];
  const timezone = ctx.request.timezone;
  const subscriptions = slice.data.settings.externalCalendars ?? [];

  const external = include.includes("external")
    ? await (ctx.loadExternal ?? loadExternalEvents)(subscriptions)
    : undefined;

  const expanded = external
    ? expandIcsOccurrences(external.events, { from: window.from, to: window.to }, { viewerTimezone: timezone })
    : [];
  const eventById = new Map(expanded.map((event) => [event.id, event]));

  const items = buildCalendarItems({
    tasks: include.includes("tasks") ? slice.data.tasks : [],
    lists: slice.data.lists,
    externalCalendars: subscriptions,
    externalCalendarEvents: expanded,
    externalCalendarRange: { from: window.from, to: window.to },
    viewerTimezone: timezone,
    focusSessions: include.includes("focus") ? slice.data.focusSessions : [],
    layers: {
      task: include.includes("tasks"),
      // A finished task still occupied the hours it was scheduled for, and a
      // reader asking what a day looked like should see them.
      completed: include.includes("tasks"),
      focusActual: include.includes("focus"),
    },
  });

  const entries = items
    .filter((item) => item.date >= window.from && item.date <= window.to)
    .map((item) => toCalendarEntry(item, eventById))
    .sort(compareEntries);

  return { entries, external };
}

function toCalendarEntry(
  item: CalendarItem,
  eventById: Map<string, { location?: string; occurrenceOf?: string }>,
): CalendarEntry {
  const entry: CalendarEntry = {
    kind: item.sourceType,
    sourceId: item.sourceId,
    title: item.title,
    date: item.date,
    allDay: item.allDay,
  };
  if (item.startTime) entry.startTime = item.startTime;
  if (item.endTime) entry.endTime = item.endTime;
  if (item.sourceType === "task" && item.done !== undefined) entry.completed = item.done;
  if (item.sourceType === "external") {
    if (item.externalCalendarName) entry.calendarName = item.externalCalendarName;
    const event = eventById.get(item.sourceId);
    if (event?.location) entry.location = event.location;
    if (event?.occurrenceOf) entry.repeating = true;
  }
  if (item.sourceType === "task" && item.repeating) entry.repeating = true;
  return entry;
}

function compareEntries(a: CalendarEntry, b: CalendarEntry): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  // All-day first: it frames the day rather than sitting at a point in it.
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const aStart = a.startTime ?? "";
  const bStart = b.startTime ?? "";
  if (aStart !== bStart) return aStart < bStart ? -1 : 1;
  return a.title.localeCompare(b.title);
}

/**
 * The hours a day is spoken for.
 *
 * All-day entries are not busy time: an all-day "conference" blocks a day in
 * the sense that a person knows what they are doing, but it names no hours,
 * and treating it as 00:00–24:00 would answer "you have no free time today"
 * for a day that may be entirely free.
 */
export function busySpansFor(entries: CalendarEntry[], date: string): MinuteSpan[] {
  const spans: MinuteSpan[] = [];
  for (const entry of entries) {
    if (entry.date !== date || entry.allDay) continue;
    const start = parseTimeToMinutes(entry.startTime ?? "");
    if (start === undefined) continue;
    const end = parseTimeToMinutes(entry.endTime ?? "");
    // An entry with a start and no end is a point in the day, not a span. It
    // is left out rather than given a made-up length: guessing an hour would
    // manufacture busy time the user never recorded.
    if (end === undefined || end <= start) continue;
    spans.push({ start, end });
  }
  return spans;
}

/**
 * Every table a question touches, declared where the question is asked.
 *
 * `settings` is in all of them, and not because every query reads a setting:
 * it holds the `sync_state` row, and §11.2 says every answer carries how old
 * the account's copy is. A query that skipped it would report `unknown`
 * freshness for an account that syncs every minute — the metadata would be
 * wrong in the direction that makes a reader distrust good data. Three rows,
 * read once per request.
 */
export const TABLES = {
  tasks: ["tasks", "subtasks", "check_items", "projects", "lists", "settings"],
  taskDetail: ["tasks", "subtasks", "check_items", "projects", "lists", "reminders", "settings"],
  today: ["tasks", "subtasks", "check_items", "projects", "lists", "daily_plans", "task_tags", "settings"],
  calendar: ["tasks", "focus_sessions", "lists", "settings"],
  projects: ["projects", "lists", "tasks", "subtasks", "check_items", "settings"],
  focus: ["focus_sessions", "tasks", "settings"],
  currentContext: [
    "tasks",
    "subtasks",
    "check_items",
    "projects",
    "lists",
    "daily_plans",
    "task_tags",
    "focus_sessions",
    "settings",
  ],
} satisfies Record<string, ReadableTable[]>;
