// Pointer-time math for drag-to-create (CALENDAR_V3_DESIGN.md §2, §6).
// DAY_START/DAY_END/SLOT_HEIGHT are the single source of truth for the
// Day/Week time grid — WeekView and CalendarView both import from here.
// CALENDAR_GEOMETRY_DESIGN.md R1: the hour row is not a constant. Calendar.app
// fits N hours into the height it has and only scrolls once that would push the
// row below a floor — a screenshot of a real Mac at 1920x1080 shows ~77px rows
// where Apple's own 522px-tall guide captures show 42.8, and one rule covers
// both: max(floor, gridHeight / N).
//
// Rounding to a multiple of four keeps what D1 was actually protecting: 15
// minutes is a quarter of a row, so a multiple of four puts the snap on a whole
// pixel whether the number is chosen or computed.
//
// The day is not cropped (D2). A 06:00 start meant anything earlier had nowhere
// to render, which WeekView compensated for by growing the window downward — a
// branch that existed only because of the crop.
export const DAY_START = 0;
export const DAY_END = 24;
export const TIME_SNAP_MINUTES = 15;

/** Apple's default for "show __ hours at a time"; the setting's range is 6–24. */
export const HOURS_AT_A_TIME = 12;

/** Nearest multiple of four to Calendar.app's measured floor of 42.8px. */
export const MIN_SLOT_HEIGHT = 44;

/**
 * Row height for a grid viewport of `viewportHeight` px.
 *
 * `viewportHeight` is the space the hour rows actually get — the scroller minus
 * the sticky header above them — not the scroller's own height.
 */
export function slotHeightFor(viewportHeight: number): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return MIN_SLOT_HEIGHT;
  const snapped = Math.round(viewportHeight / HOURS_AT_A_TIME / 4) * 4;
  return Math.max(MIN_SLOT_HEIGHT, snapped);
}

export interface CalendarDraftBlock {
  date: string;
  startTime: string;
  endTime: string;
}

export function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function minutesToTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function snapDownToStep(minutes: number, step = TIME_SNAP_MINUTES): number {
  return Math.floor(minutes / step) * step;
}

export function snapUpToStep(minutes: number, step = TIME_SNAP_MINUTES): number {
  return Math.ceil(minutes / step) * step;
}

export function clampMinutes(minutes: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, minutes));
}

// V4: callers must re-measure the day column's getBoundingClientRect() at
// move/up time (not cache it from pointerdown) so a scrolled grid still maps
// to the correct time — this already accounts for scroll since scrolling
// moves the element's on-screen position.
export function minutesFromPointerY(clientY: number, containerTop: number, slotHeight: number): number {
  const offsetY = clientY - containerTop;
  const minutes = DAY_START * 60 + (offsetY / slotHeight) * 60;
  return clampMinutes(minutes, DAY_START * 60, DAY_END * 60);
}

// Drag-selection range: snap start down / end up to TIME_SNAP_MINUTES, minimum one step, clamped to the grid.
export function snappedDragRange(aMinutes: number, bMinutes: number): { startMin: number; endMin: number } {
  const rawStart = Math.min(aMinutes, bMinutes);
  const rawEnd = Math.max(aMinutes, bMinutes);
  let startMin = snapDownToStep(rawStart);
  let endMin = snapUpToStep(rawEnd);
  if (endMin - startMin < TIME_SNAP_MINUTES) endMin = startMin + TIME_SNAP_MINUTES;
  startMin = clampMinutes(startMin, DAY_START * 60, DAY_END * 60);
  endMin = clampMinutes(endMin, DAY_START * 60, DAY_END * 60);
  return { startMin, endMin };
}

// Click (no meaningful drag) range: default 1 hour from the snapped-down click point.
export function clickDefaultRange(clickMinutes: number): { startMin: number; endMin: number } {
  const startMin = clampMinutes(snapDownToStep(clickMinutes), DAY_START * 60, DAY_END * 60);
  const endMin = clampMinutes(startMin + 60, DAY_START * 60, DAY_END * 60);
  return { startMin, endMin };
}

export function shouldStartTimeSelection(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return true;
  if (el.closest('[data-calendar-interactive="true"]')) return false;
  if (el.closest("button, input, textarea, select, a")) return false;
  return true;
}
