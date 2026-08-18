// Mode derivation and the two conversions between them (design §1.4, §1.11–1.13).
//
// The conversions are the reason this file exists. Switching tabs is not a
// display change — it moves values between fields and drops the ones that stop
// making sense — and if the editor did that inline, the Date→Duration rule
// would live in a tab's onClick and nothing else could reuse or test it.
import type { LocalDate, Schedule, ScheduleDraft, ScheduleMode } from "./types";

/**
 * Which mode a Schedule is in (design §1.4).
 *
 * A `startDate` means a range, its absence means a single date. A Schedule
 * with nothing set answers `"date"` — the editor opens on the Date tab, which
 * §1.4 fixes as the default for "no schedule".
 */
export function getScheduleMode(schedule: Schedule): ScheduleMode {
  return schedule.startDate !== null ? "duration" : "date";
}

/** A draft opened on the record's own mode (design §1.9). */
export function draftFromSchedule(schedule: Schedule): ScheduleDraft {
  return { ...schedule, mode: getScheduleMode(schedule) };
}

/**
 * Date tab → Duration tab (design §1.12).
 *
 * Case A, nothing set: stay empty and let the range picker ask for a start.
 *
 * Case B, a date exists: promote it to the range START and leave the end for
 * the user to pick. The promoted date is `dueDate`, so this necessarily leaves
 * `dueDate = null` — a shape the RECORD forbids (INV-01) but a draft is
 * allowed to hold, which is exactly the split §1.7 draws between the two.
 *
 * Times are dropped, per §1.12. A single block on one day says nothing about
 * where its hours belong once the day becomes a range: keeping 14:00 as the
 * start assumes the user meant the first day, keeping it as the end assumes
 * the last, and both are guesses. Dropping is the only option that does not
 * invent intent.
 */
export function toDurationMode(draft: ScheduleDraft): ScheduleDraft {
  if (draft.mode === "duration") return draft;
  if (draft.dueDate === null) {
    return { ...draft, mode: "duration", startDate: null, startTime: null, endTime: null };
  }
  return {
    ...draft,
    mode: "duration",
    startDate: draft.dueDate,
    dueDate: null,
    startTime: null,
    endTime: null,
  };
}

/**
 * Duration tab → Date tab (design §1.13).
 *
 * The END of the range survives as the date. §1.13 gives the reason: the end
 * is already the deadline every other view reads, so keeping it means a task
 * due the 30th is still due the 30th after the switch.
 *
 * From `start-selected` (a start picked, no end yet) there is no end to keep,
 * so the start becomes the date instead — dropping it would throw away the one
 * date the user actually clicked.
 *
 * The time bound to the surviving date comes with it, and becomes that date's
 * block START. Design §1.13 words this as "keep `dueTime`", which works in a
 * model where date mode holds a single instant; this app's date mode holds a
 * block anchored on `startTime` (audit decision 1-b), and `endTime` without a
 * start is the shape `Schedule.endTime` documents as invalid. So `8/27 09:00 →
 * 8/30 17:00` becomes `8/30 17:00` exactly as §1.13 shows — the field carrying
 * 17:00 is the only thing that differs.
 *
 * The time bound to the DISCARDED date is dropped for the same reason §1.12
 * drops times in the other direction: moving 09:00 onto the 30th would be an
 * invention, not a conversion.
 */
export function toDateMode(draft: ScheduleDraft): ScheduleDraft {
  if (draft.mode === "date") return draft;

  const keepsEnd = draft.dueDate !== null;
  const kept: LocalDate | null = keepsEnd ? draft.dueDate : draft.startDate;
  if (kept === null) {
    return { ...draft, mode: "date", startDate: null, dueDate: null, startTime: null, endTime: null };
  }

  return {
    ...draft,
    mode: "date",
    startDate: null,
    dueDate: kept,
    startTime: keepsEnd ? draft.endTime : draft.startTime,
    endTime: null,
  };
}

/** Switch to `mode`, applying whichever conversion that implies. */
export function setScheduleMode(draft: ScheduleDraft, mode: ScheduleMode): ScheduleDraft {
  return mode === "duration" ? toDurationMode(draft) : toDateMode(draft);
}
