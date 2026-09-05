// The window a timeline draws, and where a bar sits inside it
// (GANTT_TIMELINE_DESIGN D3/D4, and §17 which reopened D3).
//
// The window is a fixed number of columns and the user pages between windows,
// which is why nothing here virtualises: the worst case is
// `visible items x 24 columns`.
//
// It no longer has to FIT the viewport. D3 fixed the track to the screen, so
// the scale — pixels per day — fell out of the division and collapsed as the
// window grew: 17.5px at `1개월`, 3.4 at `6개월`, 1.7 at `1년` [실측]. §17
// turns that around. The zoom names a FLOOR on the scale (`dayWidth`), the
// track is as wide as the window needs at that scale, and what does not fit
// scrolls. `minTrackWidth` is the one number this module answers it with.
//
// Pure, and almost unaware of pixels — `dayWidth` is the exception, and it is
// here because it is a property of the ZOOM and not of the stylesheet: it is
// what the reader chose when they chose `6개월`.
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
export type TimelineZoom = "day" | "week" | "month" | "halfYear" | "year";

/** What ONE column covers. Two zooms may share it and differ in length. */
export type ColumnUnit = "hour" | "day" | "week" | "month";

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
export const ZOOM_SPEC: Record<
  TimelineZoom,
  { unit: ColumnUnit; columns: number; dayWidth: number }
> = {
  // One day, hour by hour (§15). The only zoom where the record's times are
  // legible at all — above it an hour is under a pixel.
  // 24px an hour: `HH` needs about 18 at 11px/600, and a 15-minute drag step
  // (§16) is 6px of aim at that width.
  day: { unit: "hour", columns: 24, dayWidth: 24 * 24 },
  // A day column wide enough for `12.31 – 12.31`'s short form plus the two
  // handles — 69 + 12 rounds to 64 once the text's own threshold (40) is what
  // actually decides whether it is drawn.
  week: { unit: "day", columns: 7, dayWidth: 64 },
  // What the default zoom already measured at 1440 was 17.5 [실측] and it
  // reads well; 16 is that, rounded down so a wide screen still stretches
  // rather than scrolls.
  month: { unit: "week", columns: 5, dayWidth: 16 },
  // Below `1개월` the reader is locating work to the WEEK, not the day, so a
  // week is what has to survive: 7 x 7 = 49px, about the width of a column at
  // the old `1년`. A month column comes out ~213px and an eight-day task 56 —
  // wider than the 20px a single date occupies, which is the inversion §17
  // was written to end.
  halfYear: { unit: "month", columns: 6, dayWidth: 7 },
  // A 28px week, which is the floor at which two of them still read as two.
  year: { unit: "month", columns: 12, dayWidth: 4 },
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
   * Column boundaries as local `YYYY-MM-DDTHH:mm`, length = columns + 1.
   *
   * The extra entry is the boundary AFTER the last column, which is what makes
   * the exclusive end of a bar and the "does it fit" test fall out of the same
   * array.
   *
   * They carry a clock since §15. Everywhere but the day zoom every one of
   * them is `T00:00`, and `from`/`to` slice it away — but a day cut into hours
   * has 24 boundaries inside ONE date, and a date could not tell them apart.
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
  // An hour window still BEGINS on a day: its columns divide that day rather
  // than running from whatever hour the reader happened to be looking at.
  const day =
    unit === "hour" || unit === "day"
      ? date.slice(0, 10)
      : unit === "week"
        ? getWeekStart(date.slice(0, 10))
        : `${date.slice(0, 7)}-01`;
  return `${day}T00:00`;
}

function advance(at: string, zoom: TimelineZoom, steps: number): string {
  const unit = columnUnitOf(zoom);
  const day = at.slice(0, 10);
  // The one unit that moves the clock rather than the calendar. 24 of them is
  // one day, so the boundary after the last column is the next midnight.
  if (unit === "hour") {
    const hour = Number(at.slice(11, 13)) + steps;
    return `${addDays(day, Math.floor(hour / 24))}T${String(((hour % 24) + 24) % 24).padStart(2, "0")}:00`;
  }
  if (unit === "day") return `${addDays(day, steps)}T00:00`;
  if (unit === "week") return `${addDays(day, steps * 7)}T00:00`;
  return `${addMonths(day, steps)}T00:00`;
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
    // Dates, not boundaries: these two are the filter every caller uses to ask
    // whether an Item belongs on this screen at all, and an Item is dated.
    from: edges[0].slice(0, 10),
    // Inclusive. The boundary after the last column is the next midnight, so
    // the last day the window covers is the day before it — except where that
    // boundary is mid-day, which only the hour zoom can produce and where the
    // window is the one day it started on.
    to:
      edges[count].slice(11) === "00:00"
        ? addDays(edges[count].slice(0, 10), -1)
        : edges[count].slice(0, 10),
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
  return { from: instantOf(edges[0]), to: instantOf(edges[edges.length - 1]) };
}

/** A `YYYY-MM-DDTHH:mm` boundary as local milliseconds. */
function instantOf(edge: string): number {
  return new Date(`${edge}:00`).getTime();
}

/** One day, in milliseconds. The unit `dayWidth` is priced in. */
const DAY = 86400000;

/**
 * How long each column is, in HOURS — the one cut everything else follows
 * (§17, §17.13).
 *
 * The columns were `repeat(n, 1fr)`, n equal slices, while a bar was placed by
 * its share of the window's TIME (`placeBar`). Those two agree only where the
 * columns are equal in time, and at the month-unit zooms they are not: a
 * 6개월 window holds a 28-day February beside a 31-day December.
 *
 * Hours rather than milliseconds because the numbers go straight out as `fr`
 * units — an hour column is `1fr` and a week `168fr`, which are readable in a
 * stylesheet, and `fr` is a ratio so the unit cancels. The gestures divide by
 * the same array (`instantAtWindowFraction`), which is the point: one cut,
 * drawn and aimed at.
 */
export function columnHours(window: TimelineWindow): number[] {
  const spans: number[] = [];
  for (let i = 0; i < ZOOM_COLUMNS[window.zoom]; i += 1) {
    spans.push((instantOf(window.edges[i + 1]) - instantOf(window.edges[i])) / 3600000);
  }
  return spans;
}

/** How many days the window covers. Rounded — a DST day is 23 or 25 hours. */
export function windowDays(window: TimelineWindow): number {
  const { from, to } = windowBounds(window);
  return Math.max(1, Math.round((to - from) / DAY));
}

/**
 * The narrowest the track may be drawn, in pixels (§17).
 *
 * The FLOOR, not the width. A track with room to spare still stretches — that
 * is what keeps `1주` and `1개월` on screens they already fit exactly where
 * they were — and a track without it scrolls rather than dividing what it has
 * by 181 days and calling the answer a bar.
 *
 * Days rather than columns, because a day is the unit every bar is measured
 * in and a column is not: the same 6개월 window is 6 columns whether its
 * months are Februaries or Decembers, and the reader is asking about the work
 * inside them.
 */
export function minTrackWidth(window: TimelineWindow): number {
  return windowDays(window) * ZOOM_SPEC[window.zoom].dayWidth;
}

/** Index of the column containing `date`, or -1 when it falls outside. */
export function columnOf(date: string, window: TimelineWindow): number {
  const count = ZOOM_COLUMNS[window.zoom];
  // A date against boundaries that carry a clock: compared on the day alone,
  // so a date lands in the first column of the day it falls on. The hour zoom
  // therefore reports column 0 for its whole day, which is what a marker drawn
  // from a DATE can honestly say.
  for (let i = 0; i < count; i += 1) {
    if (date >= window.edges[i].slice(0, 10) && date < window.edges[i + 1].slice(0, 10)) return i;
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
  return window.edges[index]?.slice(0, 10) ?? "";
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
  return instantAtColumnOffset(window, index, ratio).date;
}

/** Minutes a drag snaps to where a column can name a time (§16). */
export const CLOCK_STEP_MINUTES = 15;

export interface Instant {
  /** `YYYY-MM-DD`. Always present. */
  date: string;
  /**
   * `HH:mm`, or "" where the column is too long to name one (§16).
   *
   * A column names the finest unit it is made of and no finer: an hour column
   * can say 09:30, a week column can say Wednesday and nothing about the
   * clock. That is §13's rule, one unit further down.
   */
  time: string;
}

/**
 * The instant at `ratio` through a column (§16).
 *
 * `dateAtColumnOffset` is this with the clock thrown away, and remains what
 * the gestures that write only dates use.
 */
export function instantAtColumnOffset(
  window: TimelineWindow,
  index: number,
  ratio: number,
): Instant {
  const start = window.edges[index];
  const next = window.edges[index + 1];
  if (!start || !next) return { date: "", time: "" };
  const safe = Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 0.999999) : 0;

  const span = instantOf(next) - instantOf(start);
  // A day or longer: the column names a day, and the clock means nothing.
  if (span >= 86400000) {
    const days = Math.round(span / 86400000);
    const offset = Math.min(Math.max(Math.floor(safe * days), 0), days - 1);
    return { date: addDays(start.slice(0, 10), offset), time: "" };
  }

  // Shorter than a day: the pointer can name a time, rounded to something a
  // reader would have chosen. An hour column is ~21px [실측], so a free-form
  // minute would be three pixels of aim and produce times like 09:37.
  const step = CLOCK_STEP_MINUTES * 60000;
  // Clamped inside the column, as §13 clamps the day version: rounding near
  // the far edge would otherwise reach the next boundary — 23:54 in the 23:00
  // column became midnight, and with it the NEXT DAY [실측].
  const raw = instantOf(start) + Math.round((safe * span) / step) * step;
  const at = Math.min(raw, instantOf(next) - step);
  const clock = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${clock.getFullYear()}-${pad(clock.getMonth() + 1)}-${pad(clock.getDate())}`,
    time: `${pad(clock.getHours())}:${pad(clock.getMinutes())}`,
  };
}

/**
 * The instant at `fraction` across the whole TRACK (§17.13).
 *
 * The gestures used to find their column with `across * columns`, which is
 * true only while every column is the same width — and §17 stopped that being
 * so. The ruler is cut by time now, so a pointer aimed at the first of
 * February was answered from an even sixth of the window: at `6개월` the two
 * cuts stand up to **2.2 days** apart, and at `1년` 1.5 [계산]. §13 exists to
 * stop exactly that — a drop landing somewhere other than the day under it.
 *
 * So this walks the same array the grid is drawn from, and hands the leftover
 * to `instantAtColumnOffset`, which already owns what a column can name.
 */
export function instantAtWindowFraction(window: TimelineWindow, fraction: number): Instant {
  const spans = columnHours(window);
  const total = spans.reduce((sum, span) => sum + span, 0);
  if (!(total > 0)) return { date: "", time: "" };
  // Clamped just inside, so the far edge is the last column and not one past
  // the end of the window.
  const safe = Number.isFinite(fraction) ? Math.min(Math.max(fraction, 0), 0.999999) : 0;
  let at = safe * total;
  for (let i = 0; i < spans.length; i += 1) {
    if (at < spans[i]) return instantAtColumnOffset(window, i, at / spans[i]);
    at -= spans[i];
  }
  return instantAtColumnOffset(window, spans.length - 1, 0.999999);
}




/**
 * Last day of a column. Dragging the right edge onto a month column means
 * "through the end of that month", not "to the 1st" — the coarse zooms are
 * unusable otherwise.
 */
export function columnEndDate(window: TimelineWindow, index: number): string {
  return addDays(window.edges[index + 1].slice(0, 10), -1);
}

/** True when the column contains today, for the "now" marker. */
export function todayColumn(window: TimelineWindow, today: string): number | null {
  const index = columnOf(today, window);
  return index === -1 ? null : index + 1;
}

/**
 * Where `at` falls across the window, 0 to 1 — or null when it is outside
 * (TIMELINE_V2_DESIGN.md §6).
 *
 * The column band and the heading's pill both answer "which column is today",
 * and neither can say where inside it the moment is. The line drawn from this
 * can, and that is what makes "has this bar been passed?" a glance rather than
 * a comparison: the bar and the line are placed by the same arithmetic, so a
 * bar whose end is left of the line is late, exactly.
 *
 * Milliseconds, like `placeBar`'s own coordinate — the column index would put
 * the line on a boundary, which at the hour zoom is up to an hour away from
 * now and at the month zoom is up to a week.
 */
export function windowFraction(window: TimelineWindow, at: number): number | null {
  const { from, to } = windowBounds(window);
  if (!Number.isFinite(at) || at < from || at >= to) return null;
  return (at - from) / (to - from);
}

// ---------------------------------------------------------------------------
// What is written inside a bar (TIMELINE_V2_DESIGN.md §4 — I1-B, I9-C)
//
// It was the title, and GANTT §11.2 chose that while writing down the reason
// not to: "라벨 열이 언제나 읽히는 제목이므로, 중복은 반대쪽에서 없앤다." The
// label column already says the name on every row, so the copy inside the bar
// was the same word twice — and the one that broke first, because a bar under
// 80px drops its text and a title is what the reader loses.
//
// The bar says what only the bar can say instead: WHEN. Which unit that is in
// depends on the zoom, because the zoom is what a column already measures.
// ---------------------------------------------------------------------------

/** `2026-08-31` → `8.31`. Unpadded, as the reference screen writes it. */
function shortDate(date: string): string {
  return `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}`;
}

/** En dash with spaces, the range separator the reference uses. */
const RANGE = " – ";

/**
 * The line inside a bar.
 *
 * `allDay` is passed in rather than looked up: this module is pure and has no
 * language. The caller hands it `calendar.allDay` — the same word the calendar
 * puts on its own all-day row, so the two screens say one thing one way.
 *
 * At the hour zoom the bar's WIDTH is already the length of the work, and the
 * clock is the one fact that zoom can show and no other can (`ZOOM_SPEC.day`
 * says as much). A record with no times fills the window there, and `allDay`
 * is the only line that explains why — a date would repeat the heading, and
 * nothing at all would leave the one silent bar in a row of times.
 *
 * A span crossing midnight keeps its DATES even at the hour zoom: its two
 * clock values belong to different days, so `14:00 – 16:00` would describe a
 * bar that is neither, and the range says why the bar runs off both edges.
 *
 * An open end is written as one — `14:00 –` — because that is what the record
 * holds. `spanBounds` runs such a bar to the end of the day, and a bar labelled
 * `14:00` alone would read as a moment rather than as the rest of an afternoon.
 */
export function barText(span: Span, zoom: TimelineZoom, allDay: string): string {
  if (columnUnitOf(zoom) === "hour" && span.start === span.end) {
    if (!span.startTime && !span.endTime) return allDay;
    if (!span.endTime) return `${span.startTime}${RANGE}`.trimEnd();
    if (!span.startTime) return `${RANGE}${span.endTime}`.trimStart();
    return `${span.startTime}${RANGE}${span.endTime}`;
  }
  const from = shortDate(span.start);
  const to = shortDate(span.end);
  return from === to ? from : `${from}${RANGE}${to}`;
}

/**
 * The same line with only its leading half, for a bar too narrow for both.
 *
 * §4 said to re-measure the 80px threshold the title used, and measuring is
 * what produced this: at 12px/600 the widest range — `12.31 – 12.31`, plus the
 * `✓` a finished bar carries and the 12px of handles — needs 103px, while a
 * two-hour meeting at the hour zoom is about 40 [실측]. One threshold set
 * honestly at 104 would take the text off more bars than the old wrong one
 * did, so there are two, and this is what the middle one says.
 *
 * The leading value with an open dash after it: `8.31 –` says the work starts
 * there and runs on, which the bar's own width then measures. A bare `8.31`
 * would say the opposite — one day — and that is the one reading a squeezed
 * label must not produce.
 */
export function barTextShort(span: Span, zoom: TimelineZoom, allDay: string): string {
  const full = barText(span, zoom, allDay);
  if (columnUnitOf(zoom) === "hour" && span.start === span.end) {
    // Only the both-times case has a half to drop; `14:00 –` and `종일` are
    // already as short as they get.
    return span.startTime && span.endTime ? `${span.startTime}${RANGE}`.trimEnd() : full;
  }
  return span.start === span.end ? full : `${shortDate(span.start)}${RANGE}`.trimEnd();
}
