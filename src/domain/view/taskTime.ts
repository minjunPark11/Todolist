// A deadline read as the nearest thing a reader already has a word for
// (SCOPE_VIEW_OPTIONS_DESIGN.md §13.7, Q-none — from the reference's own screen).
//
// `countdown.ts` is this file's sibling and the other half of `Show Date by`:
// there the question is "how much of it is left", here it is "which day is it".
// The two swap in the same slot on the same row, so they answer in the same
// shape — a descriptor, never a string. The words are the catalogue's and the
// weekday's name is `Intl`'s; what belongs here is only the choice between
// them.
//
// [관찰] The reference app, `Next 7 Days`, `Show Date by: Task Time`, with
// today a Wednesday:
//
//   due today    → `Today`
//   due +5 days  → `Next Mon`   (the Monday of the following week)
//   due −13 days → `Aug 20`
//
// [추론] Everything between and beyond. `Tomorrow` because the app already has
// the word and uses it everywhere else a day is named. A weekday for the rest
// of the week because that is what `Next Mon` is the far end of. And a DATE
// for anything past: the one overdue row we can see is a date, and a
// "Last Mon" would be a shape the reference has not been seen making.
import type { WeekStart } from "../../types";
import { daysBetween, getWeekStart } from "../../utils/date";

export type TaskTimeLabel =
  /** A day with its own name in the catalogue. */
  | { kind: "word"; key: "common.today" | "common.tomorrow" }
  /**
   * A day named by its weekday.
   *
   * `nextWeek` is the difference between `Fri` and `Next Fri`, and it is a
   * CALENDAR week rather than "more than 7 days out" — the reference calls a
   * day 5 out `Next Mon` because it falls in the week after this one, and the
   * same 5 days from a Monday would land on Saturday and read `Sat`.
   */
  | { kind: "weekday"; date: string; nextWeek: boolean }
  /** The date itself, for anything too far off — or behind — to have a name. */
  | { kind: "date"; date: string };

/**
 * How `dueDate` reads from `today`.
 *
 * Null when there is no deadline, which is the row drawing no date at all
 * rather than a word for the absence of one.
 *
 * `weekStart` decides where `Next` begins, so an account that starts its week
 * on Monday and one that starts it on Sunday disagree about a Sunday — as they
 * should, since they disagree about which week it is in.
 */
export function taskTimeLabel(
  dueDate: string,
  today: string,
  weekStart: WeekStart = "sunday",
): TaskTimeLabel | null {
  if (!dueDate) return null;

  const days = daysBetween(today, dueDate);
  if (days === 0) return { kind: "word", key: "common.today" };
  if (days === 1) return { kind: "word", key: "common.tomorrow" };

  // Named only forward, and only within reach. A weekday name is a way of
  // saying "soon" — `Thu` for a day eight weeks out would be a date the reader
  // has to work out, dressed as one they do not.
  if (days >= 2 && days <= 6) {
    return {
      kind: "weekday",
      date: dueDate,
      nextWeek: getWeekStart(dueDate, weekStart) !== getWeekStart(today, weekStart),
    };
  }

  return { kind: "date", date: dueDate };
}
