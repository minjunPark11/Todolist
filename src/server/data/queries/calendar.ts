// The day as hours rather than as a list: what is on it, and what is left.
import { formatMinuteSpan, freeSpans } from "../../../domain/schedule/freeTime";
import { parseTimeToMinutes } from "../../../utils/todayView";
import { invalidArgument } from "../../errors";
import type { CalendarEntry } from "../projections";
import { busySpansFor, buildMetaAt, loadCalendar, TABLES, type QueryContext, type ResponseMeta } from "./shared";

export const MAX_CALENDAR_DAYS = 92;
export const DEFAULT_DAY_START = "09:00";
export const DEFAULT_DAY_END = "22:00";
/** Shorter than this is a gap on paper and not one in a day (§9.2). */
export const MIN_FREE_BLOCK_MINUTES = 15;

export interface CalendarRangeResult {
  from: string;
  to: string;
  entries: CalendarEntry[];
  meta: ResponseMeta;
}

export async function getCalendarRange(
  ctx: QueryContext,
  from: string,
  to: string,
  include?: Array<"tasks" | "external" | "focus">,
): Promise<CalendarRangeResult> {
  assertDate(from, "from");
  assertDate(to, "to");
  if (to < from) throw invalidArgument("to must not be before from.");
  if (daysApart(from, to) > MAX_CALENDAR_DAYS) {
    throw invalidArgument(`from..to may span at most ${MAX_CALENDAR_DAYS} days.`);
  }

  const slice = await ctx.repo.loadSlice(TABLES.calendar);
  const { entries, external } = await loadCalendar(ctx, slice, { from, to, include });

  return { from, to, entries, meta: buildMetaAt(slice, ctx.request.now, external) };
}

export interface FreeTimeResult {
  date: string;
  blocks: Array<{ start: string; end: string; minutes: number }>;
  totalFreeMinutes: number;
  busy: Array<{ start: string; end: string; title: string; kind: CalendarEntry["kind"] }>;
  meta: ResponseMeta;
}

/**
 * The holes in one day, and what filled the rest.
 *
 * `busy` is returned beside the blocks on purpose. A free-time answer is only
 * as good as the calendar behind it, and this app's calendar can be
 * incomplete in two ways a reader cannot see — a subscription that failed
 * (meta.externalCalendars) and an account that has not synced (meta.freshness).
 * Showing the commitments the answer was computed from lets a person catch
 * "that's not my whole day" immediately, instead of after acting on it.
 */
export async function getFreeTimeBlocks(
  ctx: QueryContext,
  date: string,
  dayStart = DEFAULT_DAY_START,
  dayEnd = DEFAULT_DAY_END,
): Promise<FreeTimeResult> {
  assertDate(date, "date");
  const start = parseTimeToMinutes(dayStart);
  const end = parseTimeToMinutes(dayEnd);
  if (start === undefined || end === undefined) throw invalidArgument("dayStart and dayEnd must be HH:mm.");
  if (end <= start) throw invalidArgument("dayEnd must be after dayStart.");

  const slice = await ctx.repo.loadSlice(TABLES.calendar);
  const { entries, external } = await loadCalendar(ctx, slice, { from: date, to: date });

  const busySpans = busySpansFor(entries, date);
  const blocks = freeSpans(busySpans, start, end, MIN_FREE_BLOCK_MINUTES).map((span) => ({
    start: formatMinuteSpan(span.start),
    end: formatMinuteSpan(span.end),
    minutes: span.end - span.start,
  }));

  return {
    date,
    blocks,
    totalFreeMinutes: blocks.reduce((total, block) => total + block.minutes, 0),
    busy: entries
      .filter((entry) => entry.date === date && !entry.allDay && entry.startTime && entry.endTime)
      .map((entry) => ({
        start: entry.startTime as string,
        end: entry.endTime as string,
        title: entry.title,
        kind: entry.kind,
      })),
    meta: buildMetaAt(slice, ctx.request.now, external),
  };
}

function assertDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalidArgument(`${field} must be a date in YYYY-MM-DD form.`);
}

function daysApart(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
