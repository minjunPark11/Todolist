// What colour an event block is painted
// (CALENDAR_COLOR_SOURCE_AND_VIEW_OPTIONS_DESIGN.md §3, §7).
//
// The colour used to come from a calendar-only taxonomy: a `categoryId` on the
// Task, set from three `<select>`s that all lived inside the calendar. Nothing
// in the Tasks module could set it, so every task made there fell back to the
// default category and the whole grid came out one colour — which the solid
// fills of the previous chapter turned from unnoticeable into a wall.
//
// TickTick answers this by not having the taxonomy at all: the colour is read
// from an axis the user already maintains, and which axis is a view option.
// This is that, with our two axes.
import type { CalendarColorBy, List, TaskPriority } from "../../types";
import { LIST_COLOR_PRESETS, listColorHex } from "../tasks/listColor";

// `CalendarColorBy` is declared in types.ts beside `CalendarViewOptions`, the
// record that stores it. Re-exported here because this is where the axis is
// resolved and every caller of `colorForTask` already imports from this file.
export type { CalendarColorBy };

export const DEFAULT_COLOR_BY: CalendarColorBy = "list";

export function sanitizeColorBy(value: unknown): CalendarColorBy {
  return value === "priority" ? "priority" : DEFAULT_COLOR_BY;
}

/**
 * The priority palette, mirroring `--priority-*` in `01-base.css`.
 *
 * The tokens cannot be read from here, and CSS cannot be given the hex back —
 * `readableInkOn` needs a real colour to weigh, so the value has to exist in
 * TypeScript too. `itemColor.tokens.test.ts` reads the stylesheet and fails if
 * these two copies ever drift.
 */
export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  high: "#ff3b30",
  medium: "#ff9500",
  low: "#4772fa",
  none: "#8e8e93",
};

/** The Inbox is one system List nobody named, so its colour says nothing. */
export const NEUTRAL_LIST_COLOR = "#8e8e93";

/**
 * A stable 32-bit hash of a List id (FNV-1a).
 *
 * E1-C wants a colour for a List whose owner never picked one, and wants the
 * same colour on every device. A hash gives both without storing anything:
 * nothing has to be written when a List is created, and two clients that never
 * talk still agree. `>>> 0` keeps it unsigned so the modulo cannot go negative.
 */
function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * The colour of a List, whether or not anyone chose one (E1-C).
 *
 * A chosen colour always wins. Otherwise the id picks one from the same eight
 * presets the picker offers, so an account that has never opened the colour
 * picker still reads as several calendars rather than one — and overriding it
 * is just picking a colour, which is where the user would go anyway.
 */
export function colorForList(list: List | undefined): string {
  if (!list) return NEUTRAL_LIST_COLOR;
  const chosen = listColorHex(list.color);
  if (chosen) return chosen;
  // "Inbox" is not a calendar anyone named; giving it a hue would imply a
  // choice that was never made, and there is only ever one of it.
  if (list.kind === "inbox") return NEUTRAL_LIST_COLOR;
  return LIST_COLOR_PRESETS[hashId(list.id) % LIST_COLOR_PRESETS.length].hex;
}

export interface TaskColorInput {
  colorBy: CalendarColorBy;
  /** Resolved through `listIdFor` before it gets here (design §3.1). */
  listId: string;
  priority: TaskPriority | undefined;
  listsById: Map<string, List>;
}

export function colorForTask({ colorBy, listId, priority, listsById }: TaskColorInput): string {
  if (colorBy === "priority") return PRIORITY_COLOR[priority ?? "none"] ?? PRIORITY_COLOR.none;
  return colorForList(listsById.get(listId));
}
