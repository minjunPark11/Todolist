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
// lets Phase 3 move the readers over without also deciding the semantics.
//
// READ-ONLY as of Phase 2. This translates on the way out of storage; the data
// on disk still has `scheduledDate` and keeps it until Phase 4 rewrites it. So
// the adapter must stay able to read BOTH shapes, and does: a record that has
// already been consolidated simply hits the `canonical` case.
import { normalizeSchedule } from "./normalizeSchedule";
import type { Schedule } from "./types";

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
}

/**
 * Which consolidation rule a record falls under (audit §6, 1-d).
 *
 * Exported for instrumentation, not for branching: audit §10 asks for counts
 * of `promoted` and `start-kept` before Phase 4 rewrites anything, because
 * those are the two cases that change what a record means. If `start-kept`
 * turns out to be common, rule 1-d needs revisiting rather than running.
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
  /** A range already exists and disagrees with the work day, which is dropped. */
  | "start-kept";

function value(raw: string | undefined): string | null {
  return typeof raw === "string" && raw !== "" ? raw : null;
}

/**
 * How many records fall under each rule (audit §10).
 *
 * Phase 4 rewrites the data, and two of these cases change what a record means
 * rather than just where it is stored — `promoted` turns a work day into a
 * three-day range, `start-kept` discards a date outright. The risk register
 * asks for both counts BEFORE that runs, because a large `start-kept` is not a
 * migration to monitor, it is a sign rule 1-d is wrong for this data.
 */
export function countScheduleShapes(tasks: readonly TaskScheduleSource[]): Record<ScheduleShape, number> {
  const counts: Record<ScheduleShape, number> = {
    empty: 0,
    canonical: 0,
    "scheduled-only": 0,
    aligned: 0,
    promoted: 0,
    "start-kept": 0,
  };
  for (const task of tasks) counts[classifyTaskSchedule(task)] += 1;
  return counts;
}

/** Which rule `scheduleFromTask` will apply, without applying it. */
export function classifyTaskSchedule(task: TaskScheduleSource): ScheduleShape {
  const startDate = value(task.startDate);
  const scheduledDate = value(task.scheduledDate);
  const dueDate = value(task.dueDate);

  if (startDate !== null && scheduledDate !== null && scheduledDate !== startDate) return "start-kept";
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
 * `start-kept` is the case with no good answer: three dates, two slots. The
 * range the user built explicitly wins over the work day, which was often set
 * implicitly by dragging on a calendar. Audit §10 asks for a count of these
 * before Phase 4 makes it permanent.
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

  const base = { timezone: null };

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

    case "start-kept":
      return normalizeSchedule({ ...base, startDate, dueDate, startTime: null, endTime: null });
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
export function scheduleToTaskPatch(schedule: Schedule): Required<TaskScheduleSource> {
  const canonical = normalizeSchedule(schedule);
  return {
    startDate: canonical.startDate ?? "",
    dueDate: canonical.dueDate ?? "",
    startTime: canonical.startTime ?? "",
    endTime: canonical.endTime ?? "",
    scheduledDate: "",
  };
}
