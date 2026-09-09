// The future occurrences of a repeating Task, for anything that draws a range.
//
// RECURRING_OCCURRENCE_EDIT_DESIGN.md §5, M2. Until this existed a repeating
// task drew ONCE — on its current `dueDate` — because the Task model is
// rolling: one record, one date, moved forward on completion (§1.1). Meanwhile
// the same task went to Google as an RRULE and drew N times there (§1.4). This
// closes that gap on the app's side.
//
// Two rules from the design shape everything here:
//
//   R4  Virtual, not stored. An endless repeat has endless occurrences, so
//       these are computed per range and never saved. Only an occurrence
//       someone EDITS becomes a real record (§3) — that is M3's job.
//   R8  Forward only. A three-weeks-neglected weekly repeat still shows as one
//       thing, because `getNextDueDate` collapses it to today and this app is
//       a to-do app, not a calendar (§5.3).
import type { Task } from "../types";
import { isTaskAlive } from "../domain/tasks/taskState";
import { getNextDueDate } from "./planner";
import { todayValue } from "./date";

/** Where a virtual occurrence's id comes from. Real records keep their own. */
export const OCCURRENCE_ID_SEPARATOR = "::";

/**
 * The id a virtual occurrence carries.
 *
 * `expandIcsOccurrences` learned this the hard way and left the note: sharing
 * the series' id meant a list keyed by id showed one occurrence and silently
 * dropped the rest (`lib/ics/recurrence.ts:275`). Same answer here.
 */
export function occurrenceIdFor(seriesId: string, date: string): string {
  return `${seriesId}${OCCURRENCE_ID_SEPARATOR}${date}`;
}

/** The series id inside a virtual occurrence id, or "" for a real record's id. */
export function seriesIdOf(id: string): string {
  const at = id.indexOf(OCCURRENCE_ID_SEPARATOR);
  return at === -1 ? "" : id.slice(0, at);
}

/** Nothing is expanded past this many steps, however wide the caller's range. */
const MAX_OCCURRENCES = 400;

function isSeries(task: Task): boolean {
  return Boolean(task.repeatType) && task.repeatType !== "none"
    && Boolean(task.dueDate) && !task.recurrenceId && isTaskAlive(task);
}

/**
 * The occurrences of every repeating task in `tasks` that land inside `range`,
 * as Tasks — additions only.
 *
 * Unlike `expandIcsOccurrences` this does NOT pass the input through. External
 * events arrive as a series master that must be replaced by its occurrences;
 * a Task series is itself the next occurrence and already draws on its own
 * `dueDate`. So the caller concatenates rather than substitutes, and the first
 * occurrence is never generated here — it is the record itself.
 */
export function expandTaskOccurrences(
  tasks: readonly Task[],
  range: { from: string; to: string },
  today = todayValue(),
): Task[] {
  if (!range.from || !range.to || range.from > range.to) return [];

  // R8. The past is only ever what was actually recorded — completed snapshots
  // and edited occurrences, which are real rows and draw on their own. A missed
  // occurrence is not a thing this app invents after the fact.
  const from = range.from > today ? range.from : today;

  // A date already spoken for by a real record. `recurrenceId` is the date the
  // occurrence WAS on, which is exactly the key generated below — so a finished
  // occurrence (M1) and an edited one (M3) both land here through one rule.
  const claimed = new Set<string>();
  for (const task of tasks) {
    if (task.recurrenceId && task.occurrenceOf) {
      claimed.add(occurrenceIdFor(task.occurrenceOf, task.recurrenceId));
    }
  }

  const occurrences: Task[] = [];
  for (const series of tasks) {
    if (!isSeries(series)) continue;
    const skipped = new Set(series.exdates ?? []);

    // Stepping with `getNextDueDate` rather than re-deriving the rule is the
    // point: the dates drawn are literally the dates completing the task would
    // roll it to. A second implementation would drift from the first, and the
    // one place it would drift is the overdue case R8 just decided.
    let cursor = series.dueDate;
    for (let step = 0; step < MAX_OCCURRENCES; step += 1) {
      const date = getNextDueDate({ ...series, dueDate: cursor }, today);
      if (date <= cursor) break; // No progress: a rule that cannot advance.
      cursor = date;
      if (date > range.to) break;
      if (series.repeatEndDate && date > series.repeatEndDate) break;
      if (date < from || skipped.has(date)) continue;

      const id = occurrenceIdFor(series.id, date);
      if (claimed.has(id)) continue;

      occurrences.push({
        ...series,
        id,
        dueDate: date,
        // A range keeps its length, the same way `planRecurringCompletion`
        // shifts `startDate` with the deadline rather than stranding it.
        startDate: series.startDate ? shift(series.startDate, series.dueDate, date) : series.startDate,
        // The rule belongs to the series, not to a date it produced — and the
        // exceptions with it. `expandIcsOccurrences` clears the same two.
        repeatType: "none",
        repeatInterval: 1,
        repeatDays: [],
        repeatEndDate: "",
        exdates: undefined,
        // What it is: this series' occurrence for this date. Written even
        // though nothing stored it, so a virtual occurrence and a real one read
        // the same (§4).
        recurrenceId: date,
        occurrenceOf: series.id,
        // Not started, not finished, and not owning the series' focus session.
        completedAt: "",
        activeSessionId: "",
      });
    }
  }
  return occurrences;
}

/** `date` moved by however far `from` moved to `to`, in whole days. */
function shift(date: string, from: string, to: string): string {
  const day = 86_400_000;
  const moved = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  if (!Number.isFinite(moved)) return date;
  return new Date(Date.parse(`${date}T00:00:00Z`) + Math.round(moved / day) * day)
    .toISOString().slice(0, 10);
}
