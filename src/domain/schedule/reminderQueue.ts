// Which reminders are due right now (design §8, audit D5).
//
// The pure half of delivery. `reminders.ts` says WHEN a reminder falls;
// this says which of those moments have arrived, which have already been
// handled, and which arrived so long ago that firing them now would be noise
// rather than a reminder.
//
// Pure because the hard parts are all decisions, not I/O: an app that was shut
// for a week must not open into forty notifications, a reminder must fire once
// and not once per tick, and a task that has been rescheduled must be
// reminded about at its NEW time and not its old one. Each of those is a rule
// worth testing without a timer.
import { reminderMoment } from "./reminders";
import { scheduleFromTask, type TaskScheduleSource } from "./taskSchedule";
import type { LocalDate, LocalTime, ReminderSpec } from "./types";
import { isTaskOpen } from "../tasks/taskState";

/** A wall-clock moment, in the same terms the rest of this folder uses. */
export interface LocalMoment {
  date: LocalDate;
  time: LocalTime;
}

/** The fields delivery needs off a Task. */
export interface ReminderTaskSource extends TaskScheduleSource {
  id: string;
  title: string;
  /** This Task's reminders (§6.3), supplied by the caller that holds them. */
  reminders?: ReminderSpec[];
  status?: string;
  archivedAt?: string;
  deletedAt?: string;
  wontDoAt?: string;
}

export interface DueReminder {
  taskId: string;
  title: string;
  /** When it was supposed to fire. */
  at: LocalMoment;
  /** Identity of this one firing — see `reminderKey`. */
  key: string;
}

export interface ReminderSweep {
  /** Fire these, then record their keys. */
  due: DueReminder[];
  /**
   * Record these WITHOUT firing.
   *
   * Reminders that came due while the app was closed, or long enough ago that
   * announcing them now would be a surprise rather than a nudge. They are
   * recorded so the same moment cannot fire later — reopening the app twice
   * must not resurrect them.
   */
  expired: string[];
}

/**
 * How late a reminder may be and still be worth showing.
 *
 * Half an hour: long enough to survive a laptop lid being shut over lunch,
 * short enough that a notification still refers to something upcoming.
 */
export const GRACE_MINUTES = 30;

/**
 * The identity of one firing: the task, and the moment it was due.
 *
 * The moment is IN the key on purpose. Rescheduling a task changes when its
 * reminder falls, which changes the key, which is what makes the new time
 * fire even though the old one already did. A key of just the task id would
 * make a rescheduled task silent forever.
 */
export function reminderKey(taskId: string, at: LocalMoment): string {
  return `${taskId}|${at.date}T${at.time}`;
}

/** The moment a key refers to, for pruning old keys. */
export function keyMoment(key: string): LocalMoment | null {
  const stamp = key.slice(key.indexOf("|") + 1);
  if (stamp.length !== 16 || stamp[10] !== "T") return null;
  return { date: stamp.slice(0, 10), time: stamp.slice(11) };
}

/** Minutes between two wall-clock moments, ignoring zones (they are local by definition). */
function minutesBetween(from: LocalMoment, to: LocalMoment): number {
  const days = Math.round(
    (Date.parse(`${to.date}T00:00:00Z`) - Date.parse(`${from.date}T00:00:00Z`)) / 86_400_000,
  );
  return days * 24 * 60 + (toMinutes(to.time) - toMinutes(from.time));
}

function toMinutes(time: LocalTime): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/**
 * True for a task that should still be reminded about.
 *
 * A finished, archived or deleted task keeps its schedule — that is how the
 * record works — so the reminder has to be suppressed here rather than by
 * clearing it on completion, which would lose the setting if the task were
 * reopened.
 */
function isLive(task: ReminderTaskSource): boolean {
  // `archivedAt` stays beside the shared predicate until D-20's migration has
  // moved these records: the predicate reads the `archived` status, and a row
  // carrying only the timestamp would otherwise still ring.
  return isTaskOpen(task) && !task.archivedAt;
}

/**
 * What to fire and what to quietly bury, given the clock and what has already
 * been handled.
 *
 * `seen` is the caller's memory across ticks AND across restarts; a sweep that
 * did not consult it would re-fire everything on every tick.
 */
export function sweepReminders(
  tasks: readonly ReminderTaskSource[],
  now: LocalMoment,
  seen: ReadonlySet<string>,
  graceMinutes: number = GRACE_MINUTES,
): ReminderSweep {
  const due: DueReminder[] = [];
  const expired: string[] = [];

  for (const task of tasks) {
    if (!isLive(task)) continue;

    // Several per Task now (§6.15), so this is a loop where it used to be one
    // lookup. The key already carried the moment, which is what lets two
    // reminders on one Task be two firings rather than one that wins.
    const schedule = scheduleFromTask(task);
    for (const reminder of task.reminders ?? []) {
      // §6.40: a disabled reminder is stored and not sent.
      if (reminder.enabled === false) continue;

      const at = reminderMoment(reminder, schedule);
      if (at === null) continue;

      const key = reminderKey(task.id, at);
      if (seen.has(key)) continue;

      const lateBy = minutesBetween(at, now);
      if (lateBy < 0) continue; // still in the future
      if (lateBy > graceMinutes) expired.push(key);
      else due.push({ taskId: task.id, title: task.title, at, key });
    }
  }

  return { due, expired };
}

/**
 * Keys still worth remembering.
 *
 * Anything older than the retention window can be forgotten: its schedule is
 * days past, and if the task were rescheduled onto it again that would be a
 * new decision deserving a new reminder. Bounded so the stored set cannot
 * grow without limit on a long-lived install.
 */
export function pruneSeen(keys: readonly string[], now: LocalMoment, retentionDays = 14): string[] {
  return keys.filter((key) => {
    const at = keyMoment(key);
    if (at === null) return false;
    return minutesBetween(at, now) <= retentionDays * 24 * 60;
  });
}
