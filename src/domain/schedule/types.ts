// The Schedule domain's vocabulary (design §1.3, audit §9).
//
// A Schedule is not a record of its own — it is the set of Task fields that
// answer "when". Keeping it as a separate type is what lets the rules live in
// one place instead of being re-derived by the editor, the calendar and the
// gantt, each slightly differently (design §0.12).
//
// Two things here differ from the design document, both settled in the Phase 0
// audit (SCHEDULE_EDITOR_PHASE0_AUDIT.md §6):
//
//   1. `endTime` is what the design calls `dueTime` (decision 2). The app has
//      47 files using the existing name and no reason to churn them.
//   2. Time is a BLOCK, not an instant (decision 1-b). Design §1.11 gives Date
//      mode a single `dueTime` with `startTime = null`; this app's calendar
//      already draws draggable, resizable blocks with a start and an end, and
//      demoting them to an instant would lose a feature that exists today.
//
// `null` is the unset value here, never `""`. The Task record uses `""`
// (types.ts) and the adapter between them is the only place that knows both
// (audit decision 4) — it arrives in Phase 2. Nothing in this folder imports
// Task, React, Supabase or a browser API (design §19.3).

/** Calendar date, `YYYY-MM-DD`. Never a `Date` — see `NOTE ON TIMEZONE`. */
export type LocalDate = string;

/** Wall-clock time of day, `HH:mm`, 24-hour. */
export type LocalTime = string;

/**
 * Which shape the Schedule has.
 *
 * NOT a stored field (design §1.4). A Task with a `startDate` is a duration
 * and one without is a date, so storing the answer would create a second
 * source of truth that can disagree with the dates themselves. `getScheduleMode`
 * derives it; only `ScheduleDraft` carries it, and only because an editor can
 * be in a state the record cannot (see below).
 */
export type ScheduleMode = "date" | "duration";

/**
 * The "when" fields of a Task, as the domain sees them.
 *
 * Every combination reachable here is one the record can hold. Combinations it
 * must NOT hold — a time with no date, an end before a start — are what
 * `validateSchedule` rejects and `normalizeSchedule` repairs. There is no DB
 * constraint behind this: the Task lives in a jsonb blob (audit §2), so these
 * functions are the only thing standing between a malformed write and the
 * calendar (audit §2.2).
 */
export interface Schedule {
  /**
   * Start of the range, duration mode only.
   *
   * Its presence IS what makes a Schedule a duration, which is why date mode
   * always clears it rather than leaving a stale value behind (design §1.11).
   */
  startDate: LocalDate | null;
  /**
   * The date in date mode; the end of the range in duration mode.
   *
   * Canonical in both (design §1.5), which is what keeps the existing List /
   * Today / Calendar meaning of a due date intact across the change.
   */
  dueDate: LocalDate | null;
  /**
   * Block start. Belongs to `dueDate` in date mode, to `startDate` in duration
   * mode (audit decision 1-b/1-c).
   */
  startTime: LocalTime | null;
  /**
   * Block end. Belongs to `dueDate` in both modes.
   *
   * Optional even when `startTime` is set: a block with only a start is the
   * app's existing "starts at 14:00, length from estimatedMinutes" behaviour.
   * The reverse is not allowed — an end with no start has nothing to measure
   * from, and the calendar would render it as all-day and silently drop the
   * value (`calendarItems.ts:237`).
   */
  endTime: LocalTime | null;
  /**
   * IANA zone the times were entered in, or null for "the viewer's zone".
   *
   * NOTE ON TIMEZONE: Phase 1 carries this field and compares it, but does not
   * interpret it. Dates and times here are wall-clock and local by definition
   * (design §1.23) — converting them to instants is the reminder scheduler's
   * problem (Phase 11), and doing it early is how a date picker starts moving
   * dates by a day for people east of UTC.
   */
  timezone: string | null;
  /**
   * When to be told about this — all of the times, not one of them (§6.15).
   *
   * This was a single `ReminderPreset`, which §6.3 names as the shape not to
   * use. The comment that stood here argued that "a list type whose UI can
   * only ever hold one element is a type that lies about what the app can
   * do"; the answer turned out to be the other half of that trade — the UI is
   * a multi-select now (§6.17), and the type says so.
   *
   * Specs and not rows: the editor's draft is not committed until the reader
   * confirms it, so a reminder added and then cancelled must never have been
   * stored. The store turns these into `Reminder` entities on commit, which is
   * where the ids and the timestamps come from.
   *
   * Empty is the unset value, so no caller has to write `?? []`.
   */
  reminders: ReminderSpec[];
  /**
   * How this repeats, as one of the offered choices.
   *
   * Stored on the Task as the legacy `repeatType`/`repeatInterval`/
   * `repeatDays` trio; `recurrence.ts` is the only place that knows the
   * mapping. Kept as a preset here for the same reason as `reminder`: the
   * editor offers six choices, and modelling a full RRULE behind six buttons
   * would be a grammar nobody can enter.
   */
  repeat: RepeatPreset;
}

/**
 * One reminder on a schedule, without an identity (§6.2, §6.12).
 *
 * The behaviour lives in `reminders.ts`; the shape is here because a Schedule
 * carries a list of them. `Reminder` in the root types is this plus an id, a
 * Task and timestamps — the stored row. The difference matters: the editor
 * holds specs in a draft that a cancel throws away, and only a confirm turns
 * them into rows.
 */
export interface ReminderSpec {
  type: "relative" | "absolute";
  /** Minutes BEFORE the anchor. Null for an absolute reminder. */
  offsetMinutes: number | null;
  /** `YYYY-MM-DDTHH:mm`, wall clock like everything else in this folder. */
  absoluteAt: string | null;
  /**
   * §6.12's field, and the reason `offsetMinutes` alone is not enough.
   *
   * "1 day before at 9 AM" is not an offset: subtracting 1440 minutes from a
   * Task at 22:00 gives 22:00 the day before, which is not the morning. When
   * this is set the offset chooses the DAY and this chooses the time on it.
   */
  allDayTime: LocalTime | null;
  /** §6.40: a reminder that cannot currently be delivered is still stored. */
  enabled: boolean;
}

/**
 * The choices the 알림 panel used to offer, one of which a Task could hold.
 *
 * LEGACY. §6.3 retired this shape and `Schedule.reminders` replaced it; what
 * keeps the union alive is that accounts have a preset STORED on the Task.
 * `reminder.ts` converts one into a `ReminderSpec` on the way in, and nothing
 * writes a new one.
 */
export const REMINDER_PRESETS = ["none", "at-time", "10m", "1h", "1d-9am"] as const;
export type ReminderPreset = (typeof REMINDER_PRESETS)[number];

/** The choices the 반복 panel offers, in the order it shows them. */
export const REPEAT_PRESETS = ["none", "daily", "weekdays", "weekly", "monthly", "yearly"] as const;
export type RepeatPreset = (typeof REPEAT_PRESETS)[number];

/** True for a value this build knows how to show. Anything else normalizes away. */
export function isReminderPreset(value: unknown): value is ReminderPreset {
  return REMINDER_PRESETS.includes(value as ReminderPreset);
}

export function isRepeatPreset(value: unknown): value is RepeatPreset {
  return REPEAT_PRESETS.includes(value as RepeatPreset);
}

/**
 * A Schedule being edited, plus the tab the user is on.
 *
 * `mode` exists here and nowhere else (design §1.8). The editor can be in a
 * state the record cannot express — the Duration tab open with no dates picked
 * yet — and without `mode` that state is indistinguishable from "no schedule",
 * which would bounce the user back to the Date tab on every render.
 *
 * This is also why `dirty`, `rangeStage`, `hoverDate` and `canConfirm` are NOT
 * here: they are derived, and a derived value that is also stored is a value
 * that can be wrong (design §1.28, §2.7).
 */
export interface ScheduleDraft extends Schedule {
  mode: ScheduleMode;
}

/**
 * How far along a duration selection is (design §1.14, §2.7).
 *
 * Derived from the dates, never stored. `start-selected` is the state that has
 * no persistent equivalent: INV-01 forbids a saved `startDate` without a
 * `dueDate`, so a draft sitting here cannot be confirmed (design §2.9).
 */
export type RangeStage = "empty" | "start-selected" | "complete";

/** A Schedule with nothing set. */
export const EMPTY_SCHEDULE: Schedule = {
  startDate: null,
  dueDate: null,
  startTime: null,
  endTime: null,
  timezone: null,
  reminders: [],
  repeat: "none",
};

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * True for a well-formed, real calendar date (INV-09).
 *
 * The shape check alone would accept `2026-02-31`, so this round-trips through
 * `Date` to reject days that do not exist. Lexicographic comparison of two
 * valid `LocalDate`s is chronological, which is the whole reason the domain
 * keeps dates as strings rather than `Date` objects.
 */
export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== "string" || !LOCAL_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** True for a well-formed 24-hour wall-clock time (INV-09). */
export function isLocalTime(value: unknown): value is LocalTime {
  return typeof value === "string" && LOCAL_TIME.test(value);
}
