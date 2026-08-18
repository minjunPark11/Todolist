// Repair, rather than reject, a Schedule read from storage (design §1.24).
//
// `validateSchedule` says what is wrong. This says what to do about it on the
// read path, where refusing is not an option — the record already exists, the
// user is looking at it, and an error where a date should be helps nobody.
//
// This exists because the Task is a jsonb blob with no constraints (audit §2).
// Against a real schema most of these shapes would be unreachable; here they
// arrive from older builds, from clients a version behind, and from the
// Phase 4 consolidation. Normalizing on every read is what keeps one bad
// record from becoming a crash in the calendar.
//
// Idempotent by construction: `normalize(normalize(x))` equals `normalize(x)`,
// which is what lets it run on every load without drifting.
import { isLocalDate, isLocalTime, type Schedule } from "./types";

/**
 * The canonical form of a Schedule.
 *
 * Order matters. Formats are cleaned first because every later step compares
 * these values, then dates, then the times that depend on them — a time is
 * dropped for having no date only after we know which dates survived.
 */
export function normalizeSchedule(schedule: Schedule): Schedule {
  // INV-09 — anything malformed is treated as absent. Keeping a bad value
  // would let it flow into a comparison; `"2026-02-31" < "2026-03-01"` is
  // true, so a nonexistent date sorts perfectly happily and never surfaces.
  let startDate = isLocalDate(schedule.startDate) ? schedule.startDate : null;
  let dueDate = isLocalDate(schedule.dueDate) ? schedule.dueDate : null;
  let startTime = isLocalTime(schedule.startTime) ? schedule.startTime : null;
  let endTime = isLocalTime(schedule.endTime) ? schedule.endTime : null;

  // INV-01 — a start with no end is not a record shape. The start becomes the
  // date rather than being discarded: the user picked that day, and keeping it
  // as a single date loses less than dropping it entirely.
  if (startDate !== null && dueDate === null) {
    dueDate = startDate;
    startDate = null;
  }

  // INV-02 — a backwards range. Normalization is the one place a swap is
  // right: the commands refuse to swap because a live user is mid-gesture and
  // can be asked (design §4.12), but this is a stored record with no one to
  // ask, and both dates are values someone once chose.
  if (startDate !== null && dueDate !== null && startDate > dueDate) {
    [startDate, dueDate] = [dueDate, startDate];
  }

  // A single-day range is a date. `startDate === dueDate` would otherwise make
  // `getScheduleMode` answer "duration" for something the editor shows on the
  // Date tab, and the mode would flip the moment the user saved.
  if (startDate !== null && startDate === dueDate) {
    startDate = null;
  }

  // INV-03 — no date, no time.
  if (startDate === null && dueDate === null) {
    startTime = null;
    endTime = null;
  }

  // A block needs a start (see `validateSchedule`). An end alone is dropped
  // rather than promoted: promoting would move the block to a time the user
  // never chose as a beginning.
  if (startTime === null) {
    endTime = null;
  }

  // INV-05 — within one day, an end before its start. Dropped, not swapped:
  // unlike the date case above, the times are not interchangeable. `endTime`
  // is optional and `startTime` is the anchor the calendar positions the block
  // by, so keeping the start and losing the end is the smaller loss.
  const sameDay = startDate === null || startDate === dueDate;
  if (sameDay && startTime !== null && endTime !== null && endTime < startTime) {
    endTime = null;
  }

  return {
    startDate,
    dueDate,
    startTime,
    endTime,
    timezone: typeof schedule.timezone === "string" && schedule.timezone ? schedule.timezone : null,
  };
}
