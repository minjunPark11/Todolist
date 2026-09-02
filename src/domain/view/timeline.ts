// The fixed window a timeline draws, and where a bar sits inside it
// (GANTT_TIMELINE_DESIGN D3/D4).
//
// There is no horizontal scrolling. The window is a fixed number of columns
// and the user pages between windows, which is why nothing here virtualises:
// the worst case is `visible items x 14 columns`, and CSS Grid places every
// bar from two integers.
//
// Pure, and unaware of pixels. `placeBar` answers in grid column numbers so
// the same arithmetic can be tested without a DOM and reused if the rendering
// ever changes.
import { addDays, addMonths, daysBetween, getWeekStart } from "../../utils/date";
import { spanBounds, type Span } from "./span";

/**
 * `life` is deliberately absent. A period with no first and no last day cannot
 * be cut into columns; those goals belong in the undated tray (D3).
 */
/**
 * What the reader picks, named for how much TIME the window covers (§12).
 *
 * It used to name the width of a COLUMN — `day` meant day-wide columns and the
 * window's length fell out of the count. That made two of these impossible to
 * have at once: `6개월` and `1년` are both cut into months and differ only in
 * how many. The id and the unit are separate now.
 */
export type TimelineZoom = "week" | "month" | "halfYear" | "year";

/** What ONE column covers. Two zooms may share it and differ in length. */
export type ColumnUnit = "day" | "week" | "month";

/**
 * The four windows, and how each is cut.
 *
 * The old set ran 2 weeks / 12 weeks / 12 months / 5 years, which left every
 * column between 41 and 47px on a 568px track [실측] — narrow enough that half
 * the bars could not hold their own title (GANTT §11). These are shorter
 * windows with wider columns.
 *
 * `month` is FIVE WEEKS rather than a calendar month. A month cut into day
 * columns is 30 of them at 18px, which is back where we started; four weeks is
 * 28 days and falls short of a month. Five is the nearest cut that covers one.
 */
export const ZOOM_SPEC: Record<TimelineZoom, { unit: ColumnUnit; columns: number }> = {
  week: { unit: "day", columns: 7 },
  month: { unit: "week", columns: 5 },
  halfYear: { unit: "month", columns: 6 },
  year: { unit: "month", columns: 12 },
};

/** Fixed by D11 — the window never changes length with the viewport. */
export const ZOOM_COLUMNS: Record<TimelineZoom, number> = Object.fromEntries(
  Object.entries(ZOOM_SPEC).map(([zoom, spec]) => [zoom, spec.columns]),
) as Record<TimelineZoom, number>;

/** What a column of this zoom covers — the only thing most callers need. */
export function columnUnitOf(zoom: TimelineZoom): ColumnUnit {
  return ZOOM_SPEC[zoom].unit;
}

export interface TimelineWindow {
  zoom: TimelineZoom;
  /** First day of the first column. */
  anchor: string;
  /**
   * Column boundaries, length = columns + 1. The extra entry is the day AFTER
   * the last column, which is what makes the exclusive end of a bar and the
   * "does it fit" test both fall out of the same array.
   */
  edges: string[];
  /** Inclusive window bounds, for `spanIntersects`. */
  from: string;
  to: string;
}

/**
 * Start of the period `date` falls in, so a window never begins mid-column.
 *
 * Reads the UNIT, not the id: `1년` and `6개월` are both cut into months and
 * both start on the 1st. The year window is therefore ROLLING — twelve months
 * from this one rather than pinned to January, which is the more useful answer
 * to "what is coming" and the place `Today` returns to.
 */
export function alignToZoom(date: string, zoom: TimelineZoom): string {
  const unit = columnUnitOf(zoom);
  if (unit === "day") return date;
  if (unit === "week") return getWeekStart(date);
  return `${date.slice(0, 7)}-01`;
}

function advance(date: string, zoom: TimelineZoom, steps: number): string {
  const unit = columnUnitOf(zoom);
  if (unit === "day") return addDays(date, steps);
  if (unit === "week") return addDays(date, steps * 7);
  return addMonths(date, steps);
}

export function timelineWindow(zoom: TimelineZoom, anchorDate: string): TimelineWindow {
  const anchor = alignToZoom(anchorDate, zoom);
  const count = ZOOM_COLUMNS[zoom];
  const edges: string[] = [];
  for (let i = 0; i <= count; i += 1) edges.push(advance(anchor, zoom, i));
  return {
    zoom,
    anchor,
    edges,
    from: edges[0],
    // Inclusive: the day before the boundary that follows the last column.
    to: addDays(edges[count], -1),
  };
}

/** Pages the window by whole windows, which is what the arrows move (D3). */
export function shiftWindow(window: TimelineWindow, direction: -1 | 1): string {
  return advance(window.anchor, window.zoom, direction * ZOOM_COLUMNS[window.zoom]);
}

export interface BarPlacement {
  /**
   * Where the bar begins and how wide it is, as fractions of the track (§14).
   *
   * Grid lines before: a bar spanned whole columns, so at week zoom a
   * three-day task and a seven-day one were the same width, and moving a task
   * one day moved the bar zero pixels [실측]. The dates decide the geometry
   * now, and the columns are only the ruler drawn behind it.
   */
  left: number;
  width: number;
  /** The bar begins before the window and was cut (D4). */
  clippedStart: boolean;
  /** The bar continues past the window and was cut. */
  clippedEnd: boolean;
}

/** The window as the half-open interval it covers, in milliseconds. */
export function windowBounds(window: TimelineWindow): { from: number; to: number } {
  const edges = window.edges;
  return {
    from: new Date(`${edges[0]}T00:00:00`).getTime(),
    to: new Date(`${edges[edges.length - 1]}T00:00:00`).getTime(),
  };
}

/** Index of the column containing `date`, or -1 when it falls outside. */
export function columnOf(date: string, window: TimelineWindow): number {
  const count = ZOOM_COLUMNS[window.zoom];
  for (let i = 0; i < count; i += 1) {
    if (date >= window.edges[i] && date < window.edges[i + 1]) return i;
  }
  return -1;
}

/**
 * Null when the span does not touch the window at all — the caller draws
 * nothing rather than a zero-width bar.
 *
 * A span wider than the window is clipped at both ends and still renders,
 * because the alternative is a task that silently disappears on the zoom
 * level where it matters most.
 */
export function placeBar(span: Span, window: TimelineWindow): BarPlacement | null {
  const view = windowBounds(window);
  const bar = spanBounds(span);
  // Half-open on both sides: a bar that ends exactly where the window begins
  // occupies none of it.
  if (bar.from >= view.to || bar.to <= view.from) return null;

  const total = view.to - view.from;
  if (total <= 0) return null;

  const clippedStart = bar.from < view.from;
  const clippedEnd = bar.to > view.to;
  const from = clippedStart ? view.from : bar.from;
  const to = clippedEnd ? view.to : bar.to;

  return {
    left: (from - view.from) / total,
    width: (to - from) / total,
    clippedStart,
    clippedEnd,
  };
}

/** First day of a column — where a bar dropped on it should begin. */
export function columnStartDate(window: TimelineWindow, index: number): string {
  return window.edges[index];
}

/**
 * The day at `ratio` through a column (§13).
 *
 * A column is only a day at the shortest zoom; everywhere else it is a week or
 * a month, and a gesture that can name only the column can name only that week
 * or that month. Dragging a bar one column right moved it seven days [실측] —
 * so the smallest nudge on the default screen was a week, and a drop never
 * landed on the day it was aimed at.
 *
 * `ratio` is how far across the column the pointer fell, 0 to 1. The column's
 * own length decides what that buys: a day column has one day and ignores it,
 * a week has seven, a month has as many as it has. At month zoom a column is
 * ~95px, so a day is ~3px — coarse, but coarse in the direction of "about the
 * 15th" rather than "the 1st, always".
 *
 * Clamped inside the column: a ratio of 1 is its last day, never the first day
 * of the next one.
 */
export function dateAtColumnOffset(window: TimelineWindow, index: number, ratio: number): string {
  const start = window.edges[index];
  const next = window.edges[index + 1];
  // A column off the end of the window, or a pointer that reported no
  // position: either would otherwise arrive as `NaN-NaN-NaN` in the record.
  if (!start || !next || !Number.isFinite(ratio)) return start ?? "";
  const days = daysBetween(start, next);
  const offset = Math.min(Math.max(Math.floor(ratio * days), 0), Math.max(days - 1, 0));
  return addDays(start, offset);
}

/**
 * Last day of a column. Dragging the right edge onto a month column means
 * "through the end of that month", not "to the 1st" — the coarse zooms are
 * unusable otherwise.
 */
export function columnEndDate(window: TimelineWindow, index: number): string {
  return addDays(window.edges[index + 1], -1);
}

/** True when the column contains today, for the "now" marker. */
export function todayColumn(window: TimelineWindow, today: string): number | null {
  const index = columnOf(today, window);
  return index === -1 ? null : index + 1;
}
