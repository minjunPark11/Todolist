// Writing a wall-clock time the way the reader writes it.
//
// SETTINGS_REVIEW.md 4.2. The calendar formatted times with
// `new Intl.DateTimeFormat("en", { hour12: false })` — a fixed locale and a
// fixed convention — so a Korean reader got `13:00` where macOS writes
// `오후 1시`, and there was no setting either way. `locale` is the default here
// because "follow the language" is what the hard-coded value was pretending to
// do; `12h` and `24h` are for readers whose preference differs from it.
import type { TimeFormat } from "../types";

/** `undefined` lets Intl use the locale's own convention. */
export function hour12For(format: TimeFormat): boolean | undefined {
  if (format === "12h") return true;
  if (format === "24h") return false;
  return undefined;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Minutes from midnight, from a stored `HH:MM`.
 *
 * Returns null for anything that is not one — the caller then shows the raw
 * string rather than inventing a time.
 */
function parse(time: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 24 || minute > 59) return null;
  return { hour, minute };
}

function formatter(locale: string, format: TimeFormat, withMinutes: boolean): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, {
    hour: format === "24h" ? "2-digit" : "numeric",
    ...(withMinutes ? { minute: "2-digit" as const } : {}),
    hour12: hour12For(format),
  });
}

/**
 * A stored `HH:MM` as the reader writes it.
 *
 * `24:00` is the end of a day in this app's schedules, and no clock has a 24 on
 * it — it is written as midnight, which is the same instant and the thing a
 * reader recognises.
 */
export function formatClock(time: string, format: TimeFormat, locale: string): string {
  const parsed = parse(time);
  if (!parsed) return time;
  if (format === "24h") return `${pad(parsed.hour)}:${pad(parsed.minute)}`;
  const date = new Date(2026, 0, 1, parsed.hour % 24, parsed.minute);
  return formatter(locale, format, true).format(date);
}

/** The hour column's label: no minutes, because every one of them is `:00`. */
export function formatHourLabel(hour: number, format: TimeFormat, locale: string): string {
  if (format === "24h") return `${pad(hour)}:00`;
  return formatter(locale, format, false).format(new Date(2026, 0, 1, hour % 24, 0));
}

/**
 * A range, with the separator the calendar has always used.
 *
 * Both ends are optional because a calendar item's times are: an item with no
 * start has no range to write, and one with no end is a point in time.
 */
export function formatClockRange(
  start: string | undefined,
  end: string | undefined,
  format: TimeFormat,
  locale: string,
): string {
  if (!start) return "";
  if (!end) return formatClock(start, format, locale);
  return `${formatClock(start, format, locale)} – ${formatClock(end, format, locale)}`;
}
