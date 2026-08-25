// Reminders, as things a Task can have several of (spec §6.2, §6.3, §6.15).
//
// A Task carried one `ReminderPreset` before this — a single field on the
// Schedule — and §6.3 names that shape explicitly as the one not to use. The
// reason is one line of §6.15: "1 day before" and "1 hour before" are both
// answers, and a field can only hold one of them.
//
// This file is the domain half of Chapter 26 §26.6's split. It says WHEN a
// reminder falls and which ones a schedule can carry; nothing here knows
// whether a notification was delivered, which is the adapter's question and
// deliberately a different one — §26.6.2 is about being able to tell "it was
// never saved" from "there was no way to send it".
//
// Two shapes, because §6.14 needs them kept apart:
//
//   relative   anchored to the Task's schedule, and moves when it moves
//              (§6.26, §6.28)
//   absolute   a moment of its own, which a schedule change does not touch
//              (§6.27)
import { addDays } from "./scheduleCommands";
import { isTimed } from "./scheduleQueries";
import type { LocalDate, LocalTime, ReminderSpec, Schedule } from "./types";
import { isLocalDate, isLocalTime } from "./types";

/**
 * The hour an all-day reminder lands on (§6.10).
 *
 * §6.10 calls this a user preference and is explicit that it must NOT be
 * written into the Task's schedule — an all-day Task has no time, and giving
 * it one to hang a reminder from would make it a timed Task by accident.
 */
export const ALL_DAY_REMINDER_TIME: LocalTime = "09:00";

const MINUTES_PER_DAY = 1440;

/** One row in the reminder panel's list (§6.6, §6.11). */
export interface ReminderOffer {
  id: string;
  offsetMinutes: number;
  allDayTime: LocalTime | null;
}

/** §6.6, for a Task with a time of its own. */
export const TIMED_OFFERS: readonly ReminderOffer[] = [
  { id: "at-time", offsetMinutes: 0, allDayTime: null },
  { id: "10m", offsetMinutes: 10, allDayTime: null },
  { id: "1h", offsetMinutes: 60, allDayTime: null },
  { id: "1d-9am", offsetMinutes: MINUTES_PER_DAY, allDayTime: ALL_DAY_REMINDER_TIME },
];

/**
 * §6.11, for an all-day Task — a different list, not the same one filtered.
 *
 * The old panel offered "10 minutes before" on an all-day Task and resolved it
 * against a 09:00 that the Task did not have, so choosing it meant 08:50 on a
 * day the reader was never shown. §6.11 replaces those with the units an
 * all-day Task can actually be reminded in.
 */
export const ALL_DAY_OFFERS: readonly ReminderOffer[] = [
  { id: "on-day", offsetMinutes: 0, allDayTime: ALL_DAY_REMINDER_TIME },
  { id: "1d-9am", offsetMinutes: MINUTES_PER_DAY, allDayTime: ALL_DAY_REMINDER_TIME },
  { id: "2d", offsetMinutes: 2 * MINUTES_PER_DAY, allDayTime: ALL_DAY_REMINDER_TIME },
  { id: "1w", offsetMinutes: 7 * MINUTES_PER_DAY, allDayTime: ALL_DAY_REMINDER_TIME },
];

/** Which list this schedule gets (§6.11). */
export function offersFor(schedule: Schedule): readonly ReminderOffer[] {
  return isTimed(schedule) ? TIMED_OFFERS : ALL_DAY_OFFERS;
}

/** The spec an offer stands for. */
export function specFromOffer(offer: ReminderOffer): ReminderSpec {
  return {
    type: "relative",
    offsetMinutes: offer.offsetMinutes,
    absoluteAt: null,
    allDayTime: offer.allDayTime,
    enabled: true,
  };
}

/** A reminder at a moment of its own (§6.13). */
export function absoluteSpec(at: string): ReminderSpec {
  return { type: "absolute", offsetMinutes: null, absoluteAt: at, allDayTime: null, enabled: true };
}

/**
 * §6.16: two reminders that mean the same thing are one reminder.
 *
 * Compared by MEANING and not by id, which is what makes it a duplicate check
 * rather than an identity check — the point of that section is that a list
 * cannot hold "30 min before" twice.
 */
export function sameReminder(a: ReminderSpec, b: ReminderSpec): boolean {
  if (a.type !== b.type) return false;
  return a.type === "absolute"
    ? a.absoluteAt === b.absoluteAt
    : a.offsetMinutes === b.offsetMinutes && a.allDayTime === b.allDayTime;
}

/** True when this list already means what `candidate` means (§6.16). */
export function containsReminder(list: readonly ReminderSpec[], candidate: ReminderSpec): boolean {
  return list.some((existing) => sameReminder(existing, candidate));
}

/** Adds unless it would be a duplicate (§6.16, §6.18). */
export function addReminder(
  list: readonly ReminderSpec[],
  candidate: ReminderSpec,
): ReminderSpec[] {
  return containsReminder(list, candidate) ? [...list] : [...list, candidate];
}

/** §6.19, by meaning — the list has no ids in it. */
export function removeReminder(
  list: readonly ReminderSpec[],
  target: ReminderSpec,
): ReminderSpec[] {
  return list.filter((existing) => !sameReminder(existing, target));
}

/** The multi-select's toggle (§6.17). */
export function toggleReminder(list: readonly ReminderSpec[], candidate: ReminderSpec): ReminderSpec[] {
  return containsReminder(list, candidate) ? removeReminder(list, candidate) : addReminder(list, candidate);
}

/** A wall-clock moment, the same shape `reminderQueue` uses. */
export interface ReminderMoment {
  date: LocalDate;
  time: LocalTime;
}

function parseAbsolute(value: string | null): ReminderMoment | null {
  if (!value || value.length < 16 || value[10] !== "T") return null;
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  return isLocalDate(date) && isLocalTime(time) ? { date, time } : null;
}

/** Move a wall-clock moment by `minutes`, rolling the date across midnight. */
function shift(date: LocalDate, time: LocalTime, minutes: number): ReminderMoment {
  const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes;
  const dayShift = Math.floor(total / MINUTES_PER_DAY);
  const within = ((total % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: addDays(date, dayShift),
    time: `${pad(Math.floor(within / 60))}:${pad(within % 60)}`,
  };
}

/**
 * When this reminder fires, or null when it cannot.
 *
 * §6.8's anchor is the START of the schedule — the first day of a range and
 * not its deadline — because a reminder is a nudge to begin. An absolute one
 * ignores the schedule entirely, which is §6.27 as arithmetic rather than as a
 * rule someone has to remember.
 */
export function reminderMoment(spec: ReminderSpec, schedule: Schedule): ReminderMoment | null {
  if (spec.type === "absolute") return parseAbsolute(spec.absoluteAt);

  const date = schedule.startDate ?? schedule.dueDate;
  if (date === null || spec.offsetMinutes === null) return null;

  // §6.12: with an all-day time the offset picks the DAY and the time is
  // given. Without one it is a plain offset from the anchor moment.
  if (spec.allDayTime !== null) {
    return { date: addDays(date, -Math.floor(spec.offsetMinutes / MINUTES_PER_DAY)), time: spec.allDayTime };
  }
  return shift(date, schedule.startTime ?? ALL_DAY_REMINDER_TIME, -spec.offsetMinutes);
}

/**
 * §6.49: earliest first, which is how a reader reads a list of warnings.
 *
 * Derived from the fire time rather than stored, exactly as that section
 * allows. Reminders with no resolvable moment sort last rather than being
 * dropped — this orders a list, it does not filter one.
 */
export function sortReminders<T extends ReminderSpec>(list: readonly T[], schedule: Schedule): T[] {
  return [...list].sort((a, b) => {
    const left = reminderMoment(a, schedule);
    const right = reminderMoment(b, schedule);
    if (left === null || right === null) return Number(left === null) - Number(right === null);
    return `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`);
  });
}

/**
 * The list a schedule can still carry, after that schedule changed.
 *
 * Four rules, and each one is a section:
 *
 *   §6.30/§6.31  no date at all — every reminder goes, relative and absolute
 *                alike. V1 chooses predictable over clever: a reminder on a
 *                Task with no date is a thing the app has no screen for.
 *   §6.33        timed → all-day drops minute and hour reminders, because
 *                "30 minutes before" a day is not a moment, and converts the
 *                whole-day ones instead of discarding them.
 *   §6.26        everything else is left alone. The offset does not change
 *                when the schedule moves — that is the whole point of storing
 *                an offset rather than a moment.
 *
 * §6.32's other half is deliberately NOT here. That section says a Task going
 * from all-day to timed should let the offset win and drop the fixed hour, so
 * that "1 day before at 09:00" becomes 15:00 the day before. This app cannot
 * do that without breaking the timed list itself: `1d-9am` is one of §6.6's
 * timed offers — it always has been — and it is stored as offset 1440 plus an
 * hour, exactly like the all-day one. Stripping the hour on a timed schedule
 * would rewrite the reminder the reader had just ticked, and the checkbox
 * would come back unticked in the same breath.
 *
 * Measured in the browser: ticking "1일 전 오전 9시" on a 15:00 Task produced a
 * spec matching no offer, and the summary row read "사용자 지정".
 */
export function reconcileReminders(
  list: readonly ReminderSpec[],
  schedule: Schedule,
): ReminderSpec[] {
  if (schedule.startDate === null && schedule.dueDate === null) return [];

  const timed = isTimed(schedule);
  const out: ReminderSpec[] = [];

  for (const spec of list) {
    if (spec.type === "absolute") {
      out.push(spec);
      continue;
    }
    const offset = spec.offsetMinutes ?? 0;

    if (!timed && spec.allDayTime === null) {
      // §6.33. A whole number of days survives with the default hour; minutes
      // and hours — and "at time", which an all-day Task does not have — go.
      if (offset > 0 && offset % MINUTES_PER_DAY === 0) {
        out.push({ ...spec, allDayTime: ALL_DAY_REMINDER_TIME });
      }
      continue;
    }
    out.push(spec);
  }

  // The conversions above can make two rows mean the same thing — "at time"
  // and "on the day" both become offset 0 when a Task gains a time. §6.16
  // holds after a reconcile, not only after an add.
  return out.reduce<ReminderSpec[]>(
    (kept, spec) => (containsReminder(kept, spec) ? kept : [...kept, spec]),
    [],
  );
}

/** True for a stored value this build can use; anything else normalizes away. */
export function isReminderSpec(value: unknown): value is ReminderSpec {
  if (!value || typeof value !== "object") return false;
  const spec = value as Partial<ReminderSpec>;
  if (spec.type === "absolute") return parseAbsolute(spec.absoluteAt ?? null) !== null;
  if (spec.type !== "relative") return false;
  if (typeof spec.offsetMinutes !== "number" || spec.offsetMinutes < 0) return false;
  return spec.allDayTime === null || isLocalTime(spec.allDayTime ?? "");
}
