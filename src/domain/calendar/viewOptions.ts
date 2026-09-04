// The calendar's View Options, as this build reads them
// (CALENDAR_COLOR_SOURCE_AND_VIEW_OPTIONS_DESIGN.md §6).
//
// Three answers about one screen: which axis the fill reads, whether finished
// work stays on the grid, and whether the focus recording is drawn. They live
// in `appSettings` with `matrixHideCompleted` and `todayGroupAxis` — the
// app's other per-screen view options — which is also what makes them follow
// the account to another device.
import type { CalendarViewOptions } from "../../types";
import { sanitizeColorBy } from "./itemColor";

/**
 * What a reader who has never opened the panel sees.
 *
 * Completed work is ON: `defaultCalendarLayers.completed` shipped `false` with
 * no way to turn it on, so finishing a task emptied its slot
 * (CALENDAR_TASK_CHECKBOX_DESIGN.md §1). Focus records were already on, as a
 * category the sidebar listed.
 */
export const DEFAULT_CALENDAR_VIEW_OPTIONS: CalendarViewOptions = {
  colorBy: "list",
  showCompleted: true,
  showFocusRecords: true,
};

/**
 * A stored value made usable.
 *
 * `colorBy` goes through `sanitizeColorBy`, so a `"tag"` written by a build
 * that has tag colours (§7.3) reads as `"list"` here rather than as an axis
 * this one cannot resolve.
 */
export function sanitizeCalendarViewOptions(value: unknown): CalendarViewOptions {
  const record = (value ?? {}) as Partial<Record<keyof CalendarViewOptions, unknown>>;
  return {
    colorBy: sanitizeColorBy(record.colorBy),
    showCompleted:
      typeof record.showCompleted === "boolean"
        ? record.showCompleted
        : DEFAULT_CALENDAR_VIEW_OPTIONS.showCompleted,
    showFocusRecords:
      typeof record.showFocusRecords === "boolean"
        ? record.showFocusRecords
        : DEFAULT_CALENDAR_VIEW_OPTIONS.showFocusRecords,
  };
}
