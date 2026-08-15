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
import { addDays, addMonths, getWeekStart } from "../../utils/date";
import type { Span } from "./span";

/**
 * `life` is deliberately absent. A period with no first and no last day cannot
 * be cut into columns; those goals belong in the undated tray (D3).
 */
export type TimelineZoom = "day" | "week" | "month" | "year";

/** Fixed by D11 — the window never changes length with the viewport. */
export const ZOOM_COLUMNS: Record<TimelineZoom, number> = {
  day: 14,
  week: 12,
  month: 12,
  year: 5,
};

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

/** Start of the period `date` falls in, so a window never begins mid-column. */
export function alignToZoom(date: string, zoom: TimelineZoom): string {
  if (zoom === "day") return date;
  if (zoom === "week") return getWeekStart(date);
  if (zoom === "month") return `${date.slice(0, 7)}-01`;
  return `${date.slice(0, 4)}-01-01`;
}

function advance(date: string, zoom: TimelineZoom, steps: number): string {
  if (zoom === "day") return addDays(date, steps);
  if (zoom === "week") return addDays(date, steps * 7);
  if (zoom === "month") return addMonths(date, steps);
  return addMonths(date, steps * 12);
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
  /** 1-based CSS grid line where the bar starts. */
  columnStart: number;
  /** Exclusive CSS grid line where it ends; `grid-column: start / end`. */
  columnEnd: number;
  /** The bar begins before the window and was cut (D4). */
  clippedStart: boolean;
  /** The bar continues past the window and was cut. */
  clippedEnd: boolean;
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
  if (span.start > window.to || span.end < window.from) return null;

  const clippedStart = span.start < window.from;
  const clippedEnd = span.end > window.to;

  const startIndex = clippedStart ? 0 : columnOf(span.start, window);
  const endIndex = clippedEnd ? ZOOM_COLUMNS[window.zoom] - 1 : columnOf(span.end, window);
  // Both are in range here: the intersect test above already excluded the
  // cases where a lookup could miss.
  if (startIndex === -1 || endIndex === -1) return null;

  return {
    columnStart: startIndex + 1,
    // +2 = 1-based, plus one to make the end exclusive, so a single-column bar
    // spans exactly one column rather than collapsing to zero width.
    columnEnd: endIndex + 2,
    clippedStart,
    clippedEnd,
  };
}

/** First day of a column — where a bar dropped on it should begin. */
export function columnStartDate(window: TimelineWindow, index: number): string {
  return window.edges[index];
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
