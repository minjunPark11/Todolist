// How the user's attention actually went, as recorded — not as planned.
import type { FocusSession } from "../../../types";
import { focusSessionStartOf } from "../../../domain/focus/selectors";
import { localDateTimeParts } from "../../../lib/ics/parse";
import { addDays } from "../../../utils/date";
import { invalidArgument } from "../../errors";
import { buildMetaAt, TABLES, todayFor, type QueryContext, type ResponseMeta } from "./shared";

export const DEFAULT_FOCUS_DAYS = 14;
export const MAX_FOCUS_DAYS = 366;

export interface FocusSummary {
  from: string;
  to: string;
  totalMinutes: number;
  sessionCount: number;
  byDay: Array<{ date: string; minutes: number; sessions: number }>;
  topTasks: Array<{ taskId: string; title: string; minutes: number }>;
  recentSessions: Array<{
    taskId?: string;
    title: string;
    startedAt: string;
    minutes: number;
    completed: boolean;
  }>;
  meta: ResponseMeta;
}

export async function getFocusSummary(
  ctx: QueryContext,
  range: { from?: string; to?: string } = {},
): Promise<FocusSummary> {
  const today = todayFor(ctx);
  const to = range.to ?? today;
  const from = range.from ?? addDays(to, -(DEFAULT_FOCUS_DAYS - 1));
  if (to < from) throw invalidArgument("to must not be before from.");
  if (daysApart(from, to) > MAX_FOCUS_DAYS) {
    throw invalidArgument(`from..to may span at most ${MAX_FOCUS_DAYS} days.`);
  }

  const slice = await ctx.repo.loadSlice(TABLES.focus);
  const titleById = new Map(slice.data.tasks.map((task) => [task.id, task.title]));

  const sessions = slice.data.focusSessions.filter((session) => {
    const date = sessionDate(session, ctx.request.timezone);
    return date >= from && date <= to;
  });

  const byDay = new Map<string, { minutes: number; sessions: number }>();
  const byTask = new Map<string, number>();
  let totalMinutes = 0;

  for (const session of sessions) {
    const minutes = sessionMinutes(session);
    totalMinutes += minutes;

    const date = sessionDate(session, ctx.request.timezone);
    const day = byDay.get(date) ?? { minutes: 0, sessions: 0 };
    day.minutes += minutes;
    day.sessions += 1;
    byDay.set(date, day);

    if (session.taskId) byTask.set(session.taskId, (byTask.get(session.taskId) ?? 0) + minutes);
  }

  return {
    from,
    to,
    totalMinutes,
    sessionCount: sessions.length,
    byDay: [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, value]) => ({ date, ...value })),
    topTasks: [...byTask.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([taskId, minutes]) => ({
        taskId,
        // A session names the task it was for, and the task may since have
        // been deleted. The recorded name is the honest answer then.
        title: titleById.get(taskId) ?? "(deleted task)",
        minutes,
      })),
    recentSessions: [...sessions]
      .sort((a, b) => focusSessionStartOf(b).localeCompare(focusSessionStartOf(a)))
      .slice(0, 10)
      .map((session) => ({
        ...(session.taskId ? { taskId: session.taskId } : {}),
        title: session.title || titleById.get(session.taskId) || "Focus session",
        startedAt: focusSessionStartOf(session),
        minutes: sessionMinutes(session),
        completed: session.status === "completed",
      })),
    meta: buildMetaAt(slice, ctx.request.now),
  };
}

/**
 * Which day a session counts towards, in the user's zone.
 *
 * A session is stored as a UTC instant. Taking the first ten characters of it
 * — which is what a device can get away with, since its own clock agrees —
 * puts every session after 09:00 UTC on the wrong day for a reader in Seoul,
 * and that is a report that says the user did no work on Monday.
 */
function sessionDate(session: FocusSession, timezone: string): string {
  return localDateTimeParts(focusSessionStartOf(session), undefined, timezone).date;
}

/**
 * Time actually spent, not time planned for.
 *
 * `accumulatedSeconds` is what the timer counted; `durationMinutes` is what
 * the user asked for when they started. A session abandoned after four
 * minutes of a twenty-five minute pomodoro is four minutes of focus, and
 * reporting twenty-five would make every summary flattering and useless.
 */
function sessionMinutes(session: FocusSession): number {
  return Math.round(Math.max(0, session.accumulatedSeconds) / 60);
}

function daysApart(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
