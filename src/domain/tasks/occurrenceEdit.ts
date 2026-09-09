// Editing one occurrence of a repeating task, rather than the series.
//
// RECURRING_OCCURRENCE_EDIT_DESIGN.md §6, M3/M4. Pure: these decide WHAT to
// write and the store does the writing, the same split `planRecurringCompletion`
// already uses.
//
// The vocabulary is §4's, which is `ExternalCalendarEvent`'s: an occurrence is
// a Task carrying `recurrenceId` (the date it was originally on) and
// `occurrenceOf` (the series it came from). A virtual occurrence has those two
// and no stored row; materialising it means writing the row.
import type { Task } from "../../types";

/**
 * Which occurrences an edit reaches — the choice every calendar app asks for
 * (§8), and the reason it has to be asked: the same drag means three different
 * writes.
 */
export type OccurrenceScope = "this" | "following" | "all";

export interface OccurrenceEditInput {
  /** The series record. Not the occurrence. */
  series: Task;
  /** The date the occurrence being edited was originally on. */
  occurrenceDate: string;
  /** What the user changed. Schedule, title, body — anything but the rule. */
  patch: Partial<Task>;
  scope: OccurrenceScope;
  /** The row that already exists for this date, if the occurrence was edited before. */
  existing?: Task | null;
  /** Ids for records this may create. The caller owns id generation. */
  newTaskId: string;
  now: string;
}

export type OccurrenceEdit =
  /** Edit the series in place — today's behaviour, and what "all" means. */
  | { kind: "series"; taskId: string; patch: Partial<Task> }
  /** Write the row for one occurrence, leaving the series alone. */
  | { kind: "materialize"; occurrence: Task }
  /** The occurrence already had a row; just patch it. */
  | { kind: "occurrence"; taskId: string; patch: Partial<Task> }
  /** Cut the series here and start a new one (§6.4). */
  | { kind: "split"; taskId: string; patch: Partial<Task>; series: Task; adopt: string[] }
  | { kind: "refuse"; reason: string };

/** The fields an occurrence must never inherit: the rule belongs to the series. */
const notInherited = (): Pick<Task, "repeatType" | "repeatInterval" | "repeatDays" | "repeatEndDate" | "exdates"> => ({
  repeatType: "none",
  repeatInterval: 1,
  // A fresh array per occurrence: sharing one would let a later edit to any
  // occurrence's days reach every other occurrence made from this constant.
  repeatDays: [],
  repeatEndDate: "",
  exdates: undefined,
});

function isSeries(task: Task): boolean {
  return Boolean(task.repeatType) && task.repeatType !== "none" && !task.recurrenceId;
}

/** The day before `date`, as the series' new end. */
export function dayBefore(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

export function planOccurrenceEdit(input: OccurrenceEditInput): OccurrenceEdit {
  const { series, occurrenceDate, patch, scope, existing, newTaskId, now } = input;
  if (!isSeries(series)) return { kind: "refuse", reason: "not-a-series" };
  if (!occurrenceDate) return { kind: "refuse", reason: "no-occurrence-date" };

  // "All" is the series edit that has always existed. It deliberately does NOT
  // reach back into occurrences that already have rows: a finished occurrence
  // is a record of a day that happened, and `isSyncEligible` settled that
  // rewriting those is not something this app does.
  if (scope === "all") {
    return { kind: "series", taskId: series.id, patch };
  }

  if (scope === "following") {
    // Splitting AT the series' own next date would leave the original with an
    // end date before its start — an empty series. There is nothing before this
    // occurrence to preserve, so the edit is simply the series' own.
    if (occurrenceDate <= series.dueDate) {
      return { kind: "series", taskId: series.id, patch };
    }
    const cut = dayBefore(occurrenceDate);
    const carried = (series.exdates ?? []).filter((date) => date >= occurrenceDate);
    return {
      kind: "split",
      taskId: series.id,
      // The original keeps its rule and stops the day before.
      patch: {
        repeatEndDate: cut,
        exdates: (series.exdates ?? []).filter((date) => date < occurrenceDate),
      },
      series: {
        ...series,
        ...patch,
        id: newTaskId,
        dueDate: patch.dueDate ?? occurrenceDate,
        // The new series starts here, so anything the old one had scheduled
        // before it is not its business.
        repeatEndDate: series.repeatEndDate,
        ...(carried.length ? { exdates: carried } : { exdates: undefined }),
        // A split is a new record, not a continuation of one already finished.
        completedAt: "",
        activeSessionId: "",
        createdAt: now,
        updatedAt: now,
      },
      // Rows already written for dates at or after the cut belong to the new
      // series now. Left pointing at the old one they would be orphans the
      // expansion could not match, and the same date would draw twice.
      adopt: [occurrenceDate],
    };
  }

  // scope === "this"
  if (existing) {
    return { kind: "occurrence", taskId: existing.id, patch };
  }
  return {
    kind: "materialize",
    occurrence: {
      ...series,
      ...patch,
      id: newTaskId,
      ...notInherited(),
      // The date it stands for, which is NOT where it is being moved to. That
      // distinction is the whole point of the field (§4).
      recurrenceId: occurrenceDate,
      occurrenceOf: series.id,
      dueDate: patch.dueDate ?? occurrenceDate,
      completedAt: "",
      activeSessionId: "",
      createdAt: now,
      updatedAt: now,
    },
  };
}

export interface OccurrenceSkipInput {
  series: Task;
  occurrenceDate: string;
  scope: OccurrenceScope;
  existing?: Task | null;
}

export type OccurrenceSkip =
  /** Add the date to the series' exceptions. Cheapest of the four (§6.2). */
  | { kind: "skip"; taskId: string; patch: Partial<Task>; trashTaskId?: string }
  /** Stop the series before this date rather than listing every exception. */
  | { kind: "end"; taskId: string; patch: Partial<Task> }
  /** Delete the series itself, which is the existing behaviour. */
  | { kind: "series"; taskId: string }
  | { kind: "refuse"; reason: string };

export function planOccurrenceSkip(input: OccurrenceSkipInput): OccurrenceSkip {
  const { series, occurrenceDate, scope, existing } = input;
  if (!isSeries(series)) return { kind: "refuse", reason: "not-a-series" };
  if (!occurrenceDate) return { kind: "refuse", reason: "no-occurrence-date" };

  if (scope === "all") return { kind: "series", taskId: series.id };

  if (scope === "following") {
    // "Delete this and everything after" is an end date, not a list of
    // exceptions — and it is the field the series already has.
    return { kind: "end", taskId: series.id, patch: { repeatEndDate: dayBefore(occurrenceDate) } };
  }

  const exdates = [...new Set([...(series.exdates ?? []), occurrenceDate])].sort();
  return {
    kind: "skip",
    taskId: series.id,
    patch: { exdates },
    // A materialised occurrence has to go too. The exception alone would leave
    // its row on the calendar; trashing it alone would let the next expansion
    // put a virtual occurrence back on the same date (§6.2).
    ...(existing ? { trashTaskId: existing.id } : {}),
  };
}

/**
 * The plan, applied to a task list.
 *
 * Pure so the writes can be tested without a store, and so the store stays one
 * `setData` rather than five branches. `now` stamps everything it touches.
 */
export function applyOccurrenceEdit(tasks: readonly Task[], plan: OccurrenceEdit, now: string): Task[] {
  switch (plan.kind) {
    case "refuse":
      return [...tasks];
    case "series":
    case "occurrence":
      return tasks.map((task) =>
        task.id === plan.taskId ? { ...task, ...plan.patch, updatedAt: now } : task);
    case "materialize":
      return [...tasks, plan.occurrence];
    case "split": {
      const from = plan.adopt[0] ?? "";
      return [
        ...tasks.map((task) => {
          if (task.id === plan.taskId) return { ...task, ...plan.patch, updatedAt: now };
          // Rows already written for dates at or after the cut follow the rule
          // they now belong to. `recurrenceId` is the date they stand for, so
          // it — not `dueDate` — decides which side of the cut they are on: a
          // moved occurrence must not change series just by having moved.
          if (task.occurrenceOf === plan.taskId && from && (task.recurrenceId ?? "") >= from) {
            return { ...task, occurrenceOf: plan.series.id, updatedAt: now };
          }
          return task;
        }),
        plan.series,
      ];
    }
  }
}

/** The same, for a skip. `trash` marks a materialised occurrence deleted. */
export function applyOccurrenceSkip(tasks: readonly Task[], plan: OccurrenceSkip, now: string): Task[] {
  switch (plan.kind) {
    case "refuse":
      return [...tasks];
    case "series":
      return tasks.map((task) =>
        task.id === plan.taskId ? { ...task, deletedAt: now, updatedAt: now } : task);
    case "end":
      return tasks.map((task) =>
        task.id === plan.taskId ? { ...task, ...plan.patch, updatedAt: now } : task);
    case "skip":
      return tasks.map((task) => {
        if (task.id === plan.taskId) return { ...task, ...plan.patch, updatedAt: now };
        if (plan.trashTaskId && task.id === plan.trashTaskId) {
          return { ...task, deletedAt: now, updatedAt: now };
        }
        return task;
      });
  }
}
