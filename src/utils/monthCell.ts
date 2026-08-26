// How many event chips a month cell can show.
//
// This used to be `CHIP_CAP = 5`, with a comment giving its reason: "128px
// cells fit at most 5 compact 18px chips before '+N'". CALENDAR_GEOMETRY_DESIGN
// D8 then took the 128 away — the rows share the window now and stop at a 72px
// floor — and the constant stayed behind. At 1440x900 the cell is 110px and five
// chips ran 27px past its bottom, onto the week below; at 1280x720, 57px.
//
// So the count comes from the height instead. Same arithmetic the comment did,
// done at the size the cell actually is.

/** The floor D8 gives a row, and the smallest cell these numbers must work at. */
export const MONTH_CELL_MIN_HEIGHT = 72;

const CELL_PADDING = 6;
const DATE_ROW = 22;
const CHIP_HEIGHT = 18;
const CHIP_GAP = 1;

/** Rows of chip that fit under the date, including the row "+N more" would use. */
export function chipRowsFor(cellHeight: number): number {
  const usable = cellHeight - CELL_PADDING * 2 - DATE_ROW;
  return Math.max(1, Math.floor((usable + CHIP_GAP) / (CHIP_HEIGHT + CHIP_GAP)));
}

/**
 * How many of `itemCount` chips to draw.
 *
 * If they all fit, they all show. If they do not, one row goes to "+N more" —
 * which is why this is not simply `min(itemCount, rows)`: the summary needs a
 * row of its own, and taking it out of the chips is what keeps the cell whole.
 */
export function chipCapFor(cellHeight: number, itemCount: number): number {
  const rows = chipRowsFor(cellHeight);
  if (itemCount <= rows) return itemCount;
  return Math.max(1, rows - 1);
}
