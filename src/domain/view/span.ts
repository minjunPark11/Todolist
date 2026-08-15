// The [start, end] a timeline bar covers, resolved from the three date fields
// a task can carry (CLICKUP_IMPORT_DESIGN §4.1).
//
// A timeline needs a span; the record stores points, and which points are set
// varies by how the user works. Someone who only ever sets deadlines still has
// a timeline — of one-day bars — and someone who plans start-to-finish gets a
// real one. So this resolves rather than requires: any single date produces a
// bar, and only a record with no dates at all stays off the timeline.
//
// It is a projection, never a write. Nothing here fills a missing `startDate`
// into the record, because a bar drawn from a fallback is an inference and
// storing an inference as if the user chose it is how a planner starts lying.
import type { Item } from "./item";

export interface Span {
  /** Inclusive YYYY-MM-DD. */
  start: string;
  /** Inclusive YYYY-MM-DD; equals `start` for a single-day bar. */
  end: string;
  /**
   * True when `start` came from a fallback rather than a stored `startDate`.
   * A timeline should draw an inferred bar differently from one the user
   * actually set, so it can be shown without being asserted.
   */
  inferredStart: boolean;
}

/**
 * Start is the earliest thing the record commits to, end the latest. Both
 * consider every date rather than a fixed precedence: a task that says it
 * starts Friday but is due Monday is contradictory, and picking `startDate`
 * blindly would render a backwards bar. Taking min/max over what is set means
 * the bar always covers the dates the user typed, whatever order they are in.
 */
export function spanForItem(item: Pick<Item, "startDate" | "scheduledDate" | "dueDate">): Span | null {
  const dates = [item.startDate, item.scheduledDate, item.dueDate].filter(Boolean);
  if (dates.length === 0) return null;

  let start = dates[0];
  let end = dates[0];
  for (const date of dates) {
    if (date < start) start = date;
    if (date > end) end = date;
  }
  return { start, end, inferredStart: !item.startDate || item.startDate !== start };
}

/** Inclusive day count, so a single-day bar is 1 rather than 0. */
export function spanDays(span: Span): number {
  const start = Date.parse(`${span.start}T00:00:00Z`);
  const end = Date.parse(`${span.end}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1;
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

/** True when the span overlaps the window at all, both ends inclusive. */
export function spanIntersects(span: Span, from: string, to: string): boolean {
  return span.start <= to && span.end >= from;
}
