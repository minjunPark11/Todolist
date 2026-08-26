// What fits inside an event block.
//
// The block's height is the event's duration, so how much text it can hold is
// not a style question — it is arithmetic on a number the grid computed.
// CALENDAR_GEOMETRY_DESIGN R1 halved the hour row and then let it follow the
// window, which made short events shorter than the two lines they were drawing:
// a 30-minute event is 26px at a 52px row, and 26px cannot hold a 14px title
// plus a 13px time under 14px of chrome.
//
// METRICS §2.4 recorded that Calendar.app shows the time line "only when the
// block is tall enough". This is that rule, with our own numbers in it.

/** 2px inset border and 5px padding, top and bottom (R5). */
const BLOCK_CHROME = 14;
/** The same chrome once the block is too short to spend 5px on padding. */
const TIGHT_CHROME = 6;
const TITLE_LINE = 14;
const TIME_LINE = 13;

/** Both lines fit, so the time is worth drawing. */
export function blockShowsTime(height: number): boolean {
  return height - BLOCK_CHROME >= TITLE_LINE + TIME_LINE;
}

/**
 * Even the title does not fit at full padding.
 *
 * The block gives the padding up rather than the title: a 15-minute event is
 * 24px, which holds a title at 1px of padding and nothing at 5.
 */
export function blockIsTight(height: number): boolean {
  return height - BLOCK_CHROME < TITLE_LINE && height - TIGHT_CHROME >= TITLE_LINE;
}
