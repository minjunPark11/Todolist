// The focus trace — actual work, drawn inside the bar that planned it
// (TIMELINE_REFERENCE_PARITY_DESIGN.md §7.1).
//
// This is the reference's signature and the one thing on its timeline that no
// other screen in this app shows: a plan and what actually happened to it, in
// one shape. The bar is the plan — pale, its List's colour — and a row of
// accent stripes along its bottom edge is the focus recorded against it, day
// by day, positioned inside the span it belongs to.
//
// Nothing here is new arithmetic. `domain/focus/records.ts` already splits a
// session's segments across date boundaries in a named timezone, including
// 23- and 25-hour DST days, and this module is the layer that asks it "which
// days, and where inside this bar".
//
// Pure, and aware of exactly one pixel value: the height ladder, which is a
// property of the DATA (how long is long) and not of the stylesheet — the same
// reason `dayWidth` lives in `timeline.ts`.
import type { FocusSession } from "../../types";
import { focusDate } from "../focus/records";
import { columnUnitOf, type TimelineWindow } from "./timeline";
import { spanBounds, type Span } from "./span";

/** One day's worth of focus against one task. */
export interface FocusDay {
  seconds: number;
  /** How many sessions touched this day — a day is often more than one. */
  sessionCount: number;
  /** A session still running is part of this day. */
  live: boolean;
}

/**
 * One stripe: a period of focus, as a fraction of the BAR.
 *
 * `left`/`width` are percentages of the bar and not of the track, because the
 * stripe is drawn inside the bar — and where a bar is clipped by the window,
 * the bar's own 0% is the first day on screen rather than the day the work
 * began.
 */
export interface FocusBin {
  start: string;
  endExclusive: string;
  seconds: number;
  sessionCount: number;
  live: boolean;
  left: number;
  width: number;
  /** What one stripe covers, for the tooltip's own wording. */
  grain: "day" | "week";
}

const DAY_MS = 86400000;

/**
 * Segments, plus the open stretch of a session that is still running.
 *
 * The reference keeps its live session in a variable of its own and appends a
 * synthetic `{start, end: now}` to the completed list. The same trick, read
 * off the record rather than off a prototype's state.
 */
function stretches(session: FocusSession, nowMs: number): { from: number; to: number; live: boolean }[] {
  const out: { from: number; to: number; live: boolean }[] = [];
  for (const segment of session.segments) {
    const from = Date.parse(segment.startAt);
    const to = Date.parse(segment.endAt);
    if (Number.isFinite(from) && Number.isFinite(to) && to > from) out.push({ from, to, live: false });
  }
  if (session.status !== "running") return out;

  // The open stretch begins at `startAt`, which on a RUNNING session is the
  // current stretch and not the sitting — `resume` overwrites it and `pause`
  // closes a segment out of it (`domain/focus/engine.ts`). `startedAt` keeps
  // the original, which is why `focusSessionStartOf` is the wrong question
  // here: a session resumed at 10:30 would otherwise be credited with the hour
  // it spent paused.
  const from = Date.parse(session.startAt);
  if (Number.isFinite(from) && nowMs > from) out.push({ from, to: nowMs, live: true });
  return out;
}

/**
 * Focus against one task, keyed by local date.
 *
 * Only `mode === "focus"`: a break is not work done on the task, and
 * `recordedMs` draws the same line for the records screen.
 *
 * `cancelled` is out and `running` is IN — which is the one place this differs
 * from `recordedMs`, and deliberately. That function answers "what was
 * recorded", a question about the past; this one answers "what is on this bar
 * right now", and a session running as the reader looks at it is the most
 * present thing the screen has.
 */
export function focusByDay(
  sessions: FocusSession[],
  taskId: string,
  timezone: string,
  nowMs: number,
): Map<string, FocusDay> {
  const byDay = new Map<string, FocusDay>();
  if (!taskId) return byDay;

  for (const session of sessions) {
    if (session.taskId !== taskId) continue;
    if (session.mode !== "focus") continue;
    if (session.status === "cancelled") continue;

    for (const piece of stretches(session, nowMs)) {
      let cursor = piece.from;
      // Walk the stretch day by day in the app's timezone. `focusDate` is what
      // the records screen groups by, so a stripe and a row in that table
      // cannot disagree about which day an evening session belongs to.
      while (cursor < piece.to) {
        const date = focusDate(cursor, timezone);
        const dayEnd = nextMidnight(cursor, date, timezone);
        const to = Math.min(piece.to, dayEnd);
        const bucket = byDay.get(date) ?? { seconds: 0, sessionCount: 0, live: false };
        bucket.seconds += (to - cursor) / 1000;
        bucket.live = bucket.live || piece.live;
        byDay.set(date, bucket);
        cursor = to;
      }
    }

    // Counted per SESSION rather than per stretch: a session paused twice is
    // one sitting, and `3회 세션` on a day that held one would be wrong.
    for (const date of daysTouched(session, nowMs, timezone)) {
      const bucket = byDay.get(date);
      if (bucket) bucket.sessionCount += 1;
    }
  }
  return byDay;
}

/** Which local dates one session reaches. */
function daysTouched(session: FocusSession, nowMs: number, timezone: string): Set<string> {
  const days = new Set<string>();
  for (const piece of stretches(session, nowMs)) {
    let cursor = piece.from;
    while (cursor < piece.to) {
      const date = focusDate(cursor, timezone);
      days.add(date);
      cursor = nextMidnight(cursor, date, timezone);
    }
  }
  return days;
}

/**
 * The instant the local day containing `ms` ends.
 *
 * Bisection rather than `+ 86400000`, because a DST day is 23 or 25 hours and
 * a timezone is a name rather than an offset — the same method and the same
 * reason as `records.ts`'s own `nextBoundary`.
 */
function nextMidnight(ms: number, date: string, timezone: string): number {
  let low = ms;
  let high = ms + 48 * 3600000;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (focusDate(mid, timezone) === date) low = mid;
    else high = mid;
  }
  return high;
}

/**
 * Where the stripes go inside one bar.
 *
 * Two things decide the grain, and both are §13's rule about what a column can
 * name, applied to a stripe: a stripe cannot be narrower than the eye can see,
 * and it must not claim a precision the ruler behind it has not got. At a zoom
 * whose columns are MONTHS, a day is half a pixel — so days are gathered into
 * weeks there, which is what the reference does at its own widest window.
 */
export function focusBins(
  byDay: Map<string, FocusDay>,
  span: Span,
  window: TimelineWindow,
): FocusBin[] {
  if (byDay.size === 0) return [];

  // The bar's own extent, clipped to the window exactly as `placeBar` clips
  // it: 0% of a bar cut at the left edge is the first day ON SCREEN.
  const bar = spanBounds(span);
  const view = windowRange(window);
  const from = Math.max(bar.from, view.from);
  const to = Math.min(bar.to, view.to);
  const total = to - from;
  if (!(total > 0)) return [];

  const weekly = columnUnitOf(window.zoom) === "month";
  const groups = new Map<string, { start: number; endExclusive: number; day: FocusDay }>();

  for (const [date, day] of byDay) {
    if (day.seconds <= 0) continue;
    const dayStart = new Date(`${date}T00:00:00`).getTime();
    if (!Number.isFinite(dayStart)) continue;
    const start = weekly ? weekStartOf(dayStart) : dayStart;
    const endExclusive = start + (weekly ? 7 : 1) * DAY_MS;

    const key = String(start);
    const group = groups.get(key);
    if (group) {
      group.day.seconds += day.seconds;
      group.day.sessionCount += day.sessionCount;
      group.day.live = group.day.live || day.live;
    } else {
      groups.set(key, { start, endExclusive, day: { ...day } });
    }
  }

  const bins: FocusBin[] = [];
  for (const group of groups.values()) {
    // Clipped to the bar, not just tested against it: a week bin at the edge
    // of a span shows the part that belongs to this bar.
    const left = Math.max(group.start, from);
    const right = Math.min(group.endExclusive, to);
    if (right <= left) continue;
    bins.push({
      start: isoOf(group.start),
      endExclusive: isoOf(group.endExclusive),
      seconds: group.day.seconds,
      sessionCount: group.day.sessionCount,
      live: group.day.live,
      left: ((left - from) / total) * 100,
      width: ((right - left) / total) * 100,
      grain: weekly ? "week" : "day",
    });
  }
  return bins.sort((a, b) => a.start.localeCompare(b.start));
}

function windowRange(window: TimelineWindow): { from: number; to: number } {
  const edges = window.edges;
  return {
    from: new Date(`${edges[0]}:00`).getTime(),
    to: new Date(`${edges[edges.length - 1]}:00`).getTime(),
  };
}

/** Sunday, matching `alignToZoom`'s week-cut windows. */
function weekStartOf(ms: number): number {
  const date = new Date(ms);
  date.setDate(date.getDate() - date.getDay());
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function isoOf(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * How tall one stripe is, in pixels. The reference's ladder, unchanged.
 *
 * Four steps rather than a continuous scale, and that is the point: the
 * question a glance asks of this row is "was there a bit or a lot", and four
 * answers are four answers. A proportional height would make 25 minutes and 35
 * minutes two different stripes that say the same thing.
 *
 * 6px is the whole band, so two hours and eight hours are both "a full day of
 * it" — the top of the ladder is a ceiling on purpose.
 */
export function traceHeight(seconds: number): number {
  const minutes = seconds / 60;
  if (minutes <= 0) return 0;
  if (minutes < 30) return 2;
  if (minutes < 60) return 3;
  if (minutes < 120) return 4.5;
  return 6;
}

/** `95m` → `1h 35m`. Empty below a minute, so an empty label is not drawn. */
export function formatFocusDuration(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  if (minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h${rest ? ` ${rest}m` : ""}` : `${rest}m`;
}

/**
 * A running session's own clock, ticking (`38:22`, `1:05:11`).
 *
 * Seconds, unlike everything else here. This is the one number on the screen
 * that is a stopwatch rather than a record, and a stopwatch that moved once a
 * minute would read as broken.
 */
export function formatLiveDuration(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const rest = value % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}

/** Total focus on a task, for the summary at the bar's right end. */
export function totalFocusSeconds(byDay: Map<string, FocusDay>): number {
  let total = 0;
  for (const day of byDay.values()) total += day.seconds;
  return total;
}

/**
 * The session running right now, if any — at most one by construction.
 *
 * Returned rather than asked for per task: the caller needs both "is THIS row
 * live" and "how long has it been", and both come off the one record.
 */
export function runningFocus(sessions: FocusSession[]): FocusSession | null {
  return sessions.find((session) => session.status === "running" && session.mode === "focus") ?? null;
}

/** How long the running session has been going, including its closed pauses. */
export function liveFocusSeconds(session: FocusSession, nowMs: number): number {
  let total = 0;
  for (const piece of stretches(session, nowMs)) total += (piece.to - piece.from) / 1000;
  return total;
}
