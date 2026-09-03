// Every edit a user can make to a draft, as a pure transition (design §1.29,
// §2.30–2.31, §3.37, §4.52).
//
// These are commands rather than setters on purpose. "The user clicked the
// 27th" is not `draft.dueDate = "2026-08-27"` — what it means depends on the
// mode and, in duration mode, on how much of the range is already picked
// (design §1.14). Putting that behind `selectDate` is what stops the calendar,
// the quick actions and the keyboard handler from each deciding separately.
//
// All of them return a NEW draft and never mutate. The editor keeps the draft
// in reducer state (design §2.39) and a mutation here would skip the render.
import { getRangeStage } from "./scheduleQueries";
import type { LocalDate, LocalTime, ScheduleDraft } from "./types";

/**
 * The user picked a date on the calendar (design §3.37, §4.52).
 *
 * Date mode: the date replaces whatever was there. `startDate` is forced to
 * null so that a leftover from a previous duration cannot make the result read
 * as a range (design §1.11).
 *
 * Duration mode, by stage:
 *   empty          → the date becomes the start, and the picker waits for an end
 *   start-selected → the date becomes the end, UNLESS it is before the start
 *   complete       → a click restarts the range from this date (design §4.13)
 *
 * The "before the start" case deliberately does NOT swap the two (design
 * §4.11–4.12). A user whose second click lands before their first is far more
 * likely to be re-choosing the start than to be entering a range backwards, and
 * a silent swap would hand them a range they never asked for. Restarting from
 * the clicked date is recoverable in one more click; a wrong swap is not
 * obvious at all.
 */
export function selectDate(draft: ScheduleDraft, date: LocalDate): ScheduleDraft {
  if (draft.mode === "date") {
    return { ...draft, startDate: null, dueDate: date };
  }

  const stage = getRangeStage(draft);
  if (stage === "start-selected" && draft.startDate !== null && date >= draft.startDate) {
    return { ...draft, dueDate: date };
  }

  // empty, complete, or an end that fell before the start: (re)start here.
  // Times go with the range they described — see `clearRangeTimes`.
  return { ...draft, startDate: date, dueDate: null, startTime: null, endTime: null };
}

/**
 * Set ONE end of a range, said by name (TASK_DETAIL_SCHEDULE_BODY_DESIGN.md
 * §11.2).
 *
 * `selectDate` above infers which end the next click means from how far along
 * the selection is. That is the right reading for a grid, where the only thing
 * the user can say is "this day"; it is the wrong one for the Start and End
 * fields, which say WHICH end before they say the date.
 *
 * The inference has a cost this does not pay: clicking a day while a range is
 * complete silently drops the end (`selectDate`'s last line). A field cannot
 * do that — the user pointed at Start, so End must survive.
 *
 * What happens when the two cross: the other end is DRAGGED to meet the one
 * just set, making a single-day span. The alternatives are worse — refusing
 * leaves the field showing a date it did not take, and clearing the other end
 * throws away something the user chose earlier without being asked.
 *
 * Times are not touched. They belong to the ends by position (start time to
 * the first day, end time to the last), and moving a day does not move which
 * end its hours describe — which is exactly what `selectDate` cannot assume
 * when it restarts a range from scratch.
 */
export function setRangeDate(
  draft: ScheduleDraft,
  which: "start" | "end",
  date: LocalDate,
): ScheduleDraft {
  if (which === "start") {
    const end = draft.dueDate !== null && draft.dueDate < date ? date : draft.dueDate;
    return { ...draft, startDate: date, dueDate: end };
  }
  const start = draft.startDate !== null && date < draft.startDate ? date : draft.startDate;
  return { ...draft, startDate: start, dueDate: date };
}

/**
 * Set the block start, or clear it with null (design §7).
 *
 * Clearing the start clears the end with it. An end alone is the invalid shape
 * `Schedule.endTime` documents — the calendar would treat the task as all-day
 * and drop the value — so this removes it here rather than leaving it for
 * `normalizeSchedule` to find.
 *
 * A time with no date is refused outright (INV-03): there is no day for it to
 * land on, and storing it would resurface later attached to whatever date the
 * user eventually picks.
 */
export function setStartTime(draft: ScheduleDraft, time: LocalTime | null): ScheduleDraft {
  if (time === null) return { ...draft, startTime: null, endTime: null };
  if (draft.startDate === null && draft.dueDate === null) return draft;
  return { ...draft, startTime: time };
}

/**
 * Set the block end, or clear it with null (design §7).
 *
 * Refused when there is no start to measure from. The editor should not offer
 * an end field in that state; this makes the rule true regardless.
 */
export function setEndTime(draft: ScheduleDraft, time: LocalTime | null): ScheduleDraft {
  if (time === null) return { ...draft, endTime: null };
  if (draft.startTime === null) return draft;
  return { ...draft, endTime: time };
}

/** Drop the time of day, keeping the dates (design §1.19). */
export function clearTime(draft: ScheduleDraft): ScheduleDraft {
  return { ...draft, startTime: null, endTime: null };
}

/**
 * Remove the schedule entirely (design §1.18, §2.23).
 *
 * The mode is kept. Clearing is not leaving the tab, and bouncing the user
 * back to Date after they cleared a range would make the next click mean
 * something different from what they just set up.
 *
 * This does NOT delete the Task (design §0.10, P8). A Task with no dates is a
 * Task in the backlog, which is a normal place for one to be.
 */
export function clearSchedule(draft: ScheduleDraft): ScheduleDraft {
  return { ...draft, startDate: null, dueDate: null, startTime: null, endTime: null };
}

/**
 * Move the whole range by `days`, keeping its length (design §4.42).
 *
 * This is the drag-the-bar gesture, and it is the one case where length is
 * preserved automatically. Picking dates by hand does not preserve it — §4.42
 * is explicit that a manual re-pick means the user is choosing new endpoints,
 * not sliding the old ones.
 */
export function shiftSchedule(draft: ScheduleDraft, days: number): ScheduleDraft {
  if (days === 0) return draft;
  return {
    ...draft,
    startDate: draft.startDate === null ? null : addDays(draft.startDate, days),
    dueDate: draft.dueDate === null ? null : addDays(draft.dueDate, days),
  };
}

/**
 * Add days to a `LocalDate`, staying on the calendar rather than the clock.
 *
 * UTC throughout: `2026-03-29` plus one day is `2026-03-30` in every zone,
 * including the ones where that night is 23 hours long. Doing this in local
 * time is how a scheduler starts skipping days at a DST boundary.
 */
export function addDays(date: LocalDate, days: number): LocalDate {
  const base = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(base)) return date;
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}
