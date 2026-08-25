// The boundary between a Task record and a Schedule (audit §6 decision 1-d, 4).
//
// Two translations happen here and nowhere else:
//
//   ""   ↔ null      the record's unset value versus the domain's
//   three date fields → two    the consolidation option C commits to
//
// The second is the whole reason this file is separate from the rest of the
// folder. `scheduledDate` — "the day actually blocked out", distinct from the
// deadline — has no place in the design's model, and every reader that wants a
// schedule has to be told what became of it. Telling them once, here, is what
// lets the readers move over one at a time without each deciding the semantics.
//
// READ-ONLY. This translates on the way out of storage, and the data on disk
// keeps `scheduledDate` for the whole of v1 (audit §7.1) — so the adapter must
// stay able to read BOTH shapes, and does: a record already in the new terms
// simply hits the `canonical` case. That property is what makes the eventual
// rewrite invisible rather than dangerous.
import { normalizeSchedule } from "./normalizeSchedule";
import { repeatPresetFromTask, repeatPresetToFields, type RepeatKind } from "./recurrence";
import { presetToSpec } from "./reminder";
import type { ReminderSpec, Schedule } from "./types";

/**
 * The fields this reads off a Task.
 *
 * Structural rather than `Task` itself, which keeps the domain free of a
 * dependency on the app's record type (design §19.3) — a `Task` satisfies it
 * without being named. It also makes the tests readable, since a case here is
 * five strings rather than a forty-field fixture.
 */
export interface TaskScheduleSource {
  startDate?: string;
  scheduledDate?: string;
  dueDate?: string;
  startTime?: string;
  endTime?: string;
  /** LEGACY: the retired reminder preset, `""` when unset (§6.3). */
  reminder?: string;
  /** The Task's reminder rows, supplied by the caller that holds them (§6.3). */
  reminders?: ReminderSpec[];
  /**
   * The legacy repeat trio, which the editor now reads and writes through
   * `recurrence.ts`. Left on the record in its original shape rather than
   * replaced by the preset: `getNextDueDate` and every task already repeating
   * speak these three fields, and a second encoding of the same fact is how
   * two parts of the app start disagreeing about when something recurs.
   */
  repeatType?: RepeatKind;
  repeatInterval?: number;
  repeatDays?: number[];
}

/**
 * Which consolidation rule a record falls under (audit §6, 1-d).
 *
 * Exported for instrumentation, not for branching: audit §10 asks for counts
 * of `promoted` and `widened` before the data is rewritten, because those are
 * the two cases that change what a record means.
 */
export type ScheduleShape =
  /** No dates at all. */
  | "empty"
  /**
   * No work day in play — the record is already in the new model's terms,
   * whether that is a bare deadline, an existing range, or a lone start.
   */
  | "canonical"
  /** A work day and no deadline; the work day becomes the date. */
  | "scheduled-only"
  /** Work day and deadline agree; one of them is redundant. */
  | "aligned"
  /** Work day and deadline differ, and become a range. */
  | "promoted"
  /** A range already exists and the work day is absorbed into it. */
  | "widened";

function value(raw: string | undefined): string | null {
  return typeof raw === "string" && raw !== "" ? raw : null;
}

/** Earlier of two dates, treating null as "no opinion". */
function min(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a <= b ? a : b;
}

/** Later of two dates, treating null as "no opinion". */
function max(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a >= b ? a : b;
}

/**
 * How many records fall under each rule (audit §10).
 *
 * Phase 4 rewrites the data, and two of these cases change what a record means
 * rather than just where it is stored — `promoted` turns a work day into a
 * range, `widened` stretches one. The risk register asks for both counts
 * before the rewrite, because a large `widened` would mean this data routinely
 * carries three independent dates and rule 1-d is too lossy for it.
 */
export function countScheduleShapes(tasks: readonly TaskScheduleSource[]): Record<ScheduleShape, number> {
  const counts: Record<ScheduleShape, number> = {
    empty: 0,
    canonical: 0,
    "scheduled-only": 0,
    aligned: 0,
    promoted: 0,
    widened: 0,
  };
  for (const task of tasks) counts[classifyTaskSchedule(task)] += 1;
  return counts;
}

/** Which rule `scheduleFromTask` will apply, without applying it. */
export function classifyTaskSchedule(task: TaskScheduleSource): ScheduleShape {
  const startDate = value(task.startDate);
  const scheduledDate = value(task.scheduledDate);
  const dueDate = value(task.dueDate);

  if (startDate !== null && scheduledDate !== null && scheduledDate !== startDate) return "widened";
  if (scheduledDate === null) {
    if (dueDate === null) return startDate === null ? "empty" : "canonical";
    return "canonical";
  }
  if (dueDate === null) return "scheduled-only";
  if (dueDate === scheduledDate) return "aligned";
  return "promoted";
}

/**
 * A Task's dates, as the domain's two-field model (audit §6, 1-d).
 *
 * The interesting case is `promoted`. A Task saying "work Wednesday, due
 * Friday" holds two dates the new model has one slot for, and dropping either
 * loses something the user typed. Turning it into the range Wednesday→Friday
 * keeps both values and lands on a shape the editor can show and correct in
 * one click. It is not the same statement — a range reads as three days of
 * work rather than one — but it is the closest one available, and it is
 * recoverable.
 *
 * `widened` is three dates into two slots. The range STRETCHES to cover the
 * work day rather than discarding it: `span.ts` already draws the bar over all
 * three dates, and its own test says why — "the calendar block is real work; a
 * bar that excluded it would hide it". Dropping the work day would shrink that
 * bar and hide a day someone planned. Stretching keeps every date, and in the
 * ordinary case where the work day already sits inside the range it changes
 * nothing at all.
 *
 * Times ride on `scheduledDate` today (`calendarItems.ts:226`), so where they
 * end up depends on where that date went:
 *
 *   → the date        both times follow it; same day, same meaning
 *   → the range start `startTime` is still that day's start, but `endTime`
 *                     would land on the range END — a different day entirely.
 *                     Wednesday 09:00–11:00 must not silently become Wednesday
 *                     09:00 → Friday 11:00, so the end is dropped.
 *   → dropped         the times go with it
 */
export function scheduleFromTask(task: TaskScheduleSource): Schedule {
  const startDate = value(task.startDate);
  const scheduledDate = value(task.scheduledDate);
  const dueDate = value(task.dueDate);
  const startTime = value(task.startTime);
  const endTime = value(task.endTime);

  // Reminders and repeat ride along untouched by the date consolidation below:
  // they qualify whatever date survives it, and `normalizeSchedule` is what
  // drops them if none does (INV-06, INV-07).
  //
  // The reminders come from the caller — they are rows on the Task now (§6.3),
  // and this adapter is handed a Task and nothing else. The legacy preset is
  // the fallback for a record `migrateReminders` has not reached, so a client
  // reading storage directly still sees the reminder that is written there.
  const legacy = presetToSpec(task.reminder);
  const base = {
    timezone: null,
    reminders: task.reminders ?? (legacy ? [legacy] : []),
    repeat: repeatPresetFromTask(task),
  };

  switch (classifyTaskSchedule(task)) {
    case "empty":
      return normalizeSchedule({ ...base, startDate: null, dueDate: null, startTime: null, endTime: null });

    case "canonical":
      // Passed through as-is; `normalizeSchedule` settles a lone `startDate`
      // into a date (INV-01) and orders a backwards pair.
      return normalizeSchedule({ ...base, startDate, dueDate, startTime, endTime });

    case "scheduled-only":
    case "aligned":
      return normalizeSchedule({ ...base, startDate: null, dueDate: scheduledDate, startTime, endTime });

    case "promoted":
      return normalizeSchedule({ ...base, startDate: scheduledDate, dueDate, startTime, endTime: null });

    case "widened": {
      // `dueDate` may be absent here — a range with a start, a work day and no
      // deadline still stretches; `min`/`max` treat null as no opinion.
      const start = min(startDate, scheduledDate);
      const end = max(dueDate, scheduledDate);
      // The block's start survives only if its day became the range start.
      // Anywhere else it is an interior day the two-field model cannot name.
      const keepsStart = start === scheduledDate;
      return normalizeSchedule({
        ...base,
        startDate: start,
        dueDate: end,
        startTime: keepsStart ? startTime : null,
        endTime: null,
      });
    }
  }
}

/**
 * A Schedule as fields to write back onto a Task (audit §6 decision 4).
 *
 * Emits `scheduledDate: ""`, because a write through this function produces
 * the consolidated shape — leaving the old field populated would give the
 * record two answers and let whichever reader had not migrated yet pick the
 * stale one.
 *
 * That makes this unsafe to call before the Phase 3 readers land: until they
 * do, `calendarItems` still draws its work block from `scheduledDate` and a
 * write here would make the block vanish. Nothing calls it yet; the editor
 * that will arrives in Phase 6, behind that migration.
 */
export function scheduleToTaskPatch(
  schedule: Schedule,
): Omit<Required<TaskScheduleSource>, "reminders"> {
  const canonical = normalizeSchedule(schedule);
  // 매주 needs a weekday, and the schedule's own start is the one that keeps
  // the task where it already is (see `repeatPresetToFields`).
  const anchor = canonical.startDate ?? canonical.dueDate;
  return {
    startDate: canonical.startDate ?? "",
    dueDate: canonical.dueDate ?? "",
    startTime: canonical.startTime ?? "",
    endTime: canonical.endTime ?? "",
    scheduledDate: "",
    // The legacy field is CLEARED on every write. `migrateReminders` has
    // already turned it into rows by the time anything can edit a schedule,
    // and leaving it populated would give the record two answers — exactly the
    // failure `scheduledDate` above is emptied to avoid.
    reminder: "none",
    ...repeatPresetToFields(canonical.repeat, anchor),
  };
}
