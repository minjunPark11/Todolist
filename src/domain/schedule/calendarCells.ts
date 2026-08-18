// What every cell of the picker looks like (design §4.32, §4.63, §6).
//
// Pure, because this is the part of a calendar that is actually hard: which
// day is an endpoint, which is inside the range, which is only a preview of a
// range nobody has committed to, and which of those wins when a day is more
// than one at once. Computing it inside the grid component would put that
// logic somewhere no test can reach and every render has to re-derive.
import { addDays } from "./scheduleCommands";
import { getRangeStage } from "./scheduleQueries";
import type { LocalDate, ScheduleDraft } from "./types";

/**
 * How a day participates in the selection (design §4.36 sets the priority).
 *
 * `single` is a date-mode pick or a range whose ends are the same day — one
 * cell carrying the whole schedule, which needs a different shape from an
 * endpoint that continues into its neighbour.
 */
export type CellSelection = "none" | "single" | "start" | "end" | "middle";

export interface CalendarCell {
  date: LocalDate;
  /** A day of a neighbouring month, shown to fill the grid (design §3.56). */
  outsideMonth: boolean;
  isToday: boolean;
  selection: CellSelection;
  /**
   * Part of the range the cursor is implying, not of the one that exists.
   *
   * Only ever true while a range is half-picked (design §2.44). Drawn weaker
   * than a real selection — §4.22 is explicit that a preview must not look
   * like a commitment.
   */
  preview: boolean;
}

/**
 * Days per row, MONDAY first.
 *
 * Not the Sunday-first order the app's other calendars use. The picker is read
 * as a work week — the weekend is where a range is dragged past, not into —
 * and putting Saturday and Sunday together at the end is what makes that
 * shape visible at a glance.
 */
export const WEEK_LENGTH = 7;
const GRID_ROWS = 6;

/** 0 = Monday … 6 = Sunday, from JS's 0 = Sunday. */
function weekdayOf(date: LocalDate): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * The first cell of the grid: the Monday on or before the 1st.
 *
 * Always six rows regardless of the month, so the popover does not change
 * height as someone pages through it — a grid that resizes moves the controls
 * under the cursor.
 */
export function gridStart(visibleMonth: LocalDate): LocalDate {
  return addDays(visibleMonth, -weekdayOf(visibleMonth));
}

function selectionFor(date: LocalDate, start: LocalDate | null, end: LocalDate | null): CellSelection {
  if (start === null) return date === end ? "single" : "none";
  if (end === null) return date === start ? "single" : "none";
  if (start === end) return date === start ? "single" : "none";
  if (date === start) return "start";
  if (date === end) return "end";
  return date > start && date < end ? "middle" : "none";
}

/**
 * The six-week grid for `visibleMonth`.
 *
 * The preview range is derived here rather than stored (design §1.28): it is
 * whatever lies between the chosen start and the cell under the cursor, and
 * only when the cursor is at or after that start. A hover before the start
 * previews nothing, because clicking there would restart the range rather than
 * close it (design §4.19, and `selectDate` for why it restarts).
 */
export function monthGrid(
  visibleMonth: LocalDate,
  draft: ScheduleDraft,
  hoverDate: LocalDate | null,
  today: LocalDate,
): CalendarCell[][] {
  const month = visibleMonth.slice(0, 7);
  const start = gridStart(visibleMonth);

  const halfPicked = getRangeStage(draft) === "start-selected" && draft.startDate !== null;
  const previewEnd = halfPicked && hoverDate !== null && hoverDate >= draft.startDate! ? hoverDate : null;

  const rows: CalendarCell[][] = [];
  for (let row = 0; row < GRID_ROWS; row += 1) {
    const cells: CalendarCell[] = [];
    for (let column = 0; column < WEEK_LENGTH; column += 1) {
      const date = addDays(start, row * WEEK_LENGTH + column);
      cells.push({
        date,
        outsideMonth: date.slice(0, 7) !== month,
        isToday: date === today,
        selection: selectionFor(date, draft.startDate, draft.dueDate),
        preview:
          previewEnd !== null && draft.startDate !== null && date > draft.startDate && date <= previewEnd,
      });
    }
    rows.push(cells);
  }
  return rows;
}
