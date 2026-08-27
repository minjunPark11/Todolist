// "What is going on right now?" in one answer.
//
// This is the tool that exists so an assistant does not have to make six calls
// and stitch them together — and every part of it is a fact. What is on the
// calendar, what is late, what is due, what has been worked on. There is no
// ranking, no "you should start with", no urgency score. §11 is explicit about
// that: FocusFlow reports, and the reader decides. A recommendation computed
// here would be this app pretending to know things about a person's day that
// only they know.
import { freeMinutesFrom } from "../../../domain/schedule/freeTime";
import { focusSessionStartOf } from "../../../domain/focus/selectors";
import { isTaskAlive } from "../../../domain/tasks/taskState";
import { publicStatus } from "../projections";
import { addDays } from "../../../utils/date";
import { parseTimeToMinutes } from "../../../utils/todayView";
import { dayOfWeekIn, minutesOfDay, timeIn, zonedIsoString } from "../context";
import type { CalendarEntry, TaskSummary } from "../projections";
import { getCalendarRange } from "./calendar";
import { getFocusSummary } from "./focus";
import { busySpansFor, buildMetaAt, TABLES, todayFor, type QueryContext, type ResponseMeta } from "./shared";
import { getOverdueTasks, getTasks, getUpcomingDeadlines } from "./tasks";
import { getTodayTasks } from "./todayTasks";

/** Ten each, because a list a reader has to summarise is not a summary. */
export const CONTEXT_LIST_LIMIT = 10;
export const UPCOMING_DAYS = 7;
export const FOCUS_WINDOW_DAYS = 7;

export interface CurrentContext {
  now: string;
  timezone: string;
  today: string;
  dayOfWeek: string;

  todaySchedule: CalendarEntry[];
  nextEvent?: CalendarEntry;
  minutesUntilNextEvent?: number;
  freeMinutesUntilNextEvent?: number;

  todayTasks: { now: TaskSummary[]; next: TaskSummary[]; later: TaskSummary[] };
  overdue: { count: number; items: TaskSummary[] };
  upcoming: { withinDays: number; items: TaskSummary[] };
  highPriority: TaskSummary[];

  focus: {
    last7DaysMinutes: number;
    lastSession?: { title: string; endedAt: string; minutes: number };
    activeSession?: { taskId: string; title: string; startedAt: string };
  };

  counts: { openTasks: number; projects: number; lists: number };
  meta: ResponseMeta;
}

export async function getCurrentContext(ctx: QueryContext): Promise<CurrentContext> {
  const today = todayFor(ctx);
  const timezone = ctx.request.timezone;

  // One slice for the counts and the running session; every sub-query below
  // reads through the same per-request cache, so this is one read per table
  // however many of them ask for `tasks`.
  const slice = await ctx.repo.loadSlice(TABLES.currentContext);

  const [calendar, todayTasks, overdue, upcoming, highPriority, focus] = await Promise.all([
    getCalendarRange(ctx, today, today),
    getTodayTasks(ctx),
    getOverdueTasks(ctx, CONTEXT_LIST_LIMIT),
    getUpcomingDeadlines(ctx, UPCOMING_DAYS),
    getTasks(ctx, { priority: "high", status: "open", limit: CONTEXT_LIST_LIMIT }),
    getFocusSummary(ctx, { from: addDays(today, -(FOCUS_WINDOW_DAYS - 1)), to: today }),
  ]);

  const nowMinutes = minutesOfDay(timeIn(ctx.request.now, timezone)) ?? 0;
  const upcomingToday = calendar.entries
    .filter((entry) => !entry.allDay && entry.startTime)
    .filter((entry) => (parseTimeToMinutes(entry.startTime as string) ?? 0) > nowMinutes);
  const nextEvent = upcomingToday[0];

  const context: CurrentContext = {
    now: zonedIsoString(ctx.request.now, timezone),
    timezone,
    today,
    dayOfWeek: dayOfWeekIn(ctx.request.now, timezone),

    todaySchedule: calendar.entries,

    todayTasks: todayTasks.buckets,
    overdue: { count: overdue.total, items: overdue.items },
    upcoming: { withinDays: UPCOMING_DAYS, items: upcoming.items.slice(0, CONTEXT_LIST_LIMIT) },
    highPriority: highPriority.items,

    focus: {
      last7DaysMinutes: focus.totalMinutes,
    },

    counts: {
      // Every open task in the account, not today's — "you have 34 open
      // tasks" and "you have 6 things today" are different sentences, and
      // this is the first one.
      openTasks: slice.data.tasks.filter((task) => isTaskAlive(task) && publicStatus(task) === "open").length,
      projects: slice.data.projects.filter((project) => project.status !== "archived").length,
      lists: slice.data.lists.length,
    },
    // The calendar's metadata, because it is the only one carrying the state
    // of the external subscriptions — and an answer built partly from a
    // calendar that failed has to say so.
    meta: calendar.meta,
  };

  if (nextEvent) {
    context.nextEvent = nextEvent;
    const startsAt = parseTimeToMinutes(nextEvent.startTime as string) ?? 0;
    context.minutesUntilNextEvent = Math.max(0, startsAt - nowMinutes);
    // How much of that gap is actually free, which is not the same number: a
    // task block or a second meeting can sit between now and the next event.
    context.freeMinutesUntilNextEvent = freeMinutesFrom(busySpansFor(calendar.entries, today), nowMinutes, startsAt);
  }

  const lastSession = focus.recentSessions.find((session) => session.completed);
  if (lastSession) {
    const source = slice.data.focusSessions.find(
      (candidate) => focusSessionStartOf(candidate) === lastSession.startedAt,
    );
    context.focus.lastSession = {
      title: lastSession.title,
      endedAt: source?.endedAt || source?.endAt || lastSession.startedAt,
      minutes: lastSession.minutes,
    };
  }

  const active = slice.data.activeSessionId
    ? slice.data.focusSessions.find((session) => session.id === slice.data.activeSessionId)
    : undefined;
  if (active && active.status === "running") {
    context.focus.activeSession = {
      taskId: active.taskId,
      title: active.title || slice.data.tasks.find((task) => task.id === active.taskId)?.title || "Focus session",
      startedAt: focusSessionStartOf(active),
    };
  }

  // Whatever the sub-queries saw about missing tables or truncation is still
  // true of this answer.
  context.meta = mergeMeta(context.meta, buildMetaAt(slice, ctx.request.now));
  return context;
}

function mergeMeta(primary: ResponseMeta, other: ResponseMeta): ResponseMeta {
  return {
    ...primary,
    truncated: primary.truncated || other.truncated,
    partial: primary.partial || other.partial,
  };
}
