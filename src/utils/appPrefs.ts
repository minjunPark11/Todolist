// Display settings that deep components need and nothing between them carries.
//
// The theme, accent and font size already reach the tree this way — App writes
// them onto the root element's dataset and whatever needs them reads them
// there (`motion/reducedMotion.ts` is the same idiom). Threading a prop through
// CalendarView → WeekView → a block's time line for a display preference would
// cost every layer in between a parameter it does not otherwise use.
//
// These read at render time rather than subscribing: the settings live in App's
// state, so changing one re-renders the tree that reads it.
import type { TimeFormat, WeekStart } from "../types";
import { clampHoursAtATime } from "./calendarTime";

export function getTimeFormat(): TimeFormat {
  const value = document.documentElement.dataset.timeFormat;
  return value === "12h" || value === "24h" ? value : "locale";
}

export function getWeekStartPref(): WeekStart {
  return document.documentElement.dataset.weekStart === "monday" ? "monday" : "sunday";
}

export function useTimeFormat(): TimeFormat {
  return getTimeFormat();
}

export function useWeekStart(): WeekStart {
  return getWeekStartPref();
}

/** SETTINGS_REVIEW.md 4.4 — how many hour rows the grid fits before it scrolls. */
export function getHoursAtATime(): number {
  return clampHoursAtATime(document.documentElement.dataset.hoursAtATime);
}

export function useHoursAtATime(): number {
  return getHoursAtATime();
}
