// A deadline read as what is left of it
// (SCOPE_VIEW_OPTIONS_DESIGN.md §3.5, phase 4).
//
// The same date the row already carries, said the other way: `Aug 20` becomes
// `3 days overdue`, `Sep 7` becomes `5 days left`. It REPLACES the date rather
// than joining it — the reference app swaps the two in the same slot on the
// same card, and a row that said both would be answering one question twice.
//
// A descriptor rather than a string, because the words are the catalogue's and
// the arithmetic is this file's. Returning "5일 남음" here would put Korean in
// the domain and leave English with nowhere to come from.
import { daysBetween } from "../../utils/date";

export interface CountdownLabel {
  /** i18n key. `days` is the only variable any of them take. */
  key: "common.today" | "view.daysLeft" | "schedule.overdueDays";
  days: number;
}

/**
 * What is left of `dueDate`, measured from `today`.
 *
 * Null when there is no deadline: a task with no date has nothing to count
 * down to, and the row draws no date at all rather than a zero.
 *
 * Whole days, from midnight to midnight. Tomorrow is "1 day left" all of
 * today, which is what a reader means by it — an hour-aware count would say
 * "0 days left" at four in the afternoon for work due tomorrow morning.
 */
export function countdownLabel(dueDate: string, today: string): CountdownLabel | null {
  if (!dueDate) return null;
  if (dueDate === today) return { key: "common.today", days: 0 };

  const days = daysBetween(today, dueDate);
  return days > 0
    ? { key: "view.daysLeft", days }
    : { key: "schedule.overdueDays", days: Math.abs(days) };
}
