// Pointer-time math for drag-to-create (CALENDAR_V3_DESIGN.md §2, §6).
// DAY_START/DAY_END/SLOT_HEIGHT are the single source of truth for the
// Day/Week time grid — WeekView and CalendarView both import from here.
export const DAY_START = 6;
export const DAY_END = 23;
export const SLOT_HEIGHT = 44;

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

export function snapDown30(minutes: number): number {
  return Math.floor(minutes / 30) * 30;
}

export function snapUp30(minutes: number): number {
  return Math.ceil(minutes / 30) * 30;
}

export function clampMinutes(minutes: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, minutes));
}

// V4: callers must re-measure the day column's getBoundingClientRect() at
// move/up time (not cache it from pointerdown) so a scrolled grid still maps
// to the correct time — this already accounts for scroll since scrolling
// moves the element's on-screen position.
export function minutesFromPointerY(clientY: number, containerTop: number): number {
  const offsetY = clientY - containerTop;
  const minutes = DAY_START * 60 + (offsetY / SLOT_HEIGHT) * 60;
  return clampMinutes(minutes, DAY_START * 60, DAY_END * 60);
}

// Drag-selection range: snap start down / end up to 30min, minimum 30min, clamped to the grid.
export function snappedDragRange(aMinutes: number, bMinutes: number): { startMin: number; endMin: number } {
  const rawStart = Math.min(aMinutes, bMinutes);
  const rawEnd = Math.max(aMinutes, bMinutes);
  let startMin = snapDown30(rawStart);
  let endMin = snapUp30(rawEnd);
  if (endMin - startMin < 30) endMin = startMin + 30;
  startMin = clampMinutes(startMin, DAY_START * 60, DAY_END * 60);
  endMin = clampMinutes(endMin, DAY_START * 60, DAY_END * 60);
  return { startMin, endMin };
}

// Click (no meaningful drag) range: default 1 hour from the snapped-down click point.
export function clickDefaultRange(clickMinutes: number): { startMin: number; endMin: number } {
  const startMin = clampMinutes(snapDown30(clickMinutes), DAY_START * 60, DAY_END * 60);
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
