// A Task, as a Google Calendar event (GOOGLE_CALENDAR_SYNC_DESIGN.md §5.1, §8, §9.2).
//
// Pure — no fetch, no platform, no React. The whole outbound decision is settled
// here against fixtures: whether a Task belongs on the calendar at all, what
// shape it takes, and how its repeat reads as an RRULE. What sits above this is
// left with nothing but I/O and retries (§12 M1-2), which is the same split
// `server/data/*` already uses.
import { isTaskAlive, type TaskStateFields } from "../../tasks/taskState";

/**
 * The fields this mapper reads, and nothing else.
 *
 * Structural rather than `Task` for the reason `TaskStateFields` is: the tests
 * below build eight-field fixtures instead of thirty-field records, and a real
 * `Task` satisfies it.
 */
export interface SyncableTask extends TaskStateFields {
  title: string;
  description?: string;
  /** The day the work is due (YYYY-MM-DD). "" = unset, which is what §5.1 reads. */
  dueDate: string;
  /** When the work begins (YYYY-MM-DD). Makes a span rather than a point. */
  startDate?: string;
  startTime?: string;
  endTime?: string;
  repeatType?: string;
  repeatInterval?: number;
  /** JS weekday numbers, 0 = Sunday — see `domain/schedule/recurrence`. */
  repeatDays?: number[];
  repeatEndDate?: string;
}

/** One end of a Google event. Exactly one of `date` / `dateTime` is set. */
export interface GoogleEventTime {
  /** All-day form: YYYY-MM-DD. */
  date?: string;
  /** Timed form: RFC3339 WITHOUT an offset — `timeZone` resolves it (§9.2). */
  dateTime?: string;
  timeZone?: string;
}

export interface GoogleEventBody {
  summary: string;
  description?: string;
  start: GoogleEventTime;
  end: GoogleEventTime;
  /** RRULE lines. Absent when the Task does not repeat (§8). */
  recurrence?: string[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

function isDate(value: string | undefined): value is string {
  return Boolean(value && DATE.test(value));
}

function isTime(value: string | undefined): value is string {
  return Boolean(value && TIME.test(value));
}

/**
 * Does this Task belong on the Google calendar? (§5.1)
 *
 * "A date, and still alive." Deliberately NOT a statement about whether an
 * event currently exists in the account — that is what `googleEventId` answers,
 * and conflating the two is the data-loss path §5.1 rejects the biconditional
 * over: an API failure would read as "the user deleted it there".
 *
 * Completed tasks stay eligible. A finished piece of work still happened on the
 * day it happened, and pulling it off the calendar would rewrite the record of
 * a day the moment it was ticked. `isTaskAlive` is the line — trashed and given
 * up on are out.
 */
export function isSyncEligible(task: SyncableTask): boolean {
  return isDate(task.dueDate) && isTaskAlive(task);
}

/**
 * The day AFTER `date` — Google's all-day `end` is exclusive.
 *
 * Built in UTC so the machine's own zone cannot move it: this is date
 * arithmetic on a calendar day, not a moment in time.
 */
function nextDay(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

/** `"14:00"` + 1 hour, clamped at the end of the day. */
function addOneHour(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  if (hours >= 23) return "23:59";
  return `${String(hours + 1).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const RRULE_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

/**
 * The Task's repeat fields as an RRULE line, or null when it does not repeat.
 *
 * Outbound only (§8). The mapping is narrow and total in this direction —
 * five `repeatType` values onto FREQ, plus INTERVAL / BYDAY / UNTIL — which is
 * exactly why the reverse is not attempted: Google's full RRULE grammar does
 * not fit back into five values without losing what the user wrote.
 */
export function toRrule(task: SyncableTask, allDay: boolean): string | null {
  const freq = {
    daily: "DAILY",
    weekly: "WEEKLY",
    monthly: "MONTHLY",
    yearly: "YEARLY",
  }[task.repeatType ?? "none"];
  if (!freq) return null;

  const parts = [`FREQ=${freq}`];

  const interval = task.repeatInterval ?? 1;
  if (Number.isFinite(interval) && interval > 1) {
    parts.push(`INTERVAL=${Math.floor(interval)}`);
  }

  if (task.repeatType === "weekly") {
    const days = [...new Set(task.repeatDays ?? [])]
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      .sort((a, b) => a - b)
      .map((day) => RRULE_DAYS[day]);
    // No BYDAY when the set is empty: the series then repeats on DTSTART's own
    // weekday, which is what a weekly task with no chosen days means.
    if (days.length > 0) parts.push(`BYDAY=${days.join(",")}`);
  }

  if (isDate(task.repeatEndDate)) {
    // UNTIL's value type has to match DTSTART's, which is why this splits.
    //
    // The timed form is pinned to 23:59:59Z rather than converted out of the
    // user's zone, because converting would need a tz database this layer does
    // not have. The error it can make is one-sided: an occurrence late on the
    // last day in a zone far behind UTC lands after the bound and is dropped.
    // It can never ADD an occurrence past the end date, which is the direction
    // that would surprise someone.
    const compact = task.repeatEndDate.replace(/-/g, "");
    parts.push(allDay ? `UNTIL=${compact}` : `UNTIL=${compact}T235959Z`);
  }

  return `RRULE:${parts.join(";")}`;
}

/**
 * The event body for a Task. Callers must check `isSyncEligible` first.
 *
 * Three shapes, in the order they are decided:
 *
 * 1. A time on the day  → a timed event on `dueDate`. `startDate` is ignored;
 *    a span AND a time of day is a shape Google has no single event for, and
 *    the time is the more specific of the two.
 * 2. `startDate` before `dueDate` → an all-day event spanning both ends.
 * 3. Otherwise → a one-day all-day event.
 *
 * The timed form hands Google the WALL time plus the zone name and lets it
 * resolve the offset (§9.2). We never compute one: doing so would need a tz
 * database, and getting DST wrong is a silent hour-shift twice a year.
 */
export function toGoogleEventBody(task: SyncableTask, timezone: string): GoogleEventBody {
  const timed = isTime(task.startTime);
  const body: GoogleEventBody = {
    summary: task.title,
    ...(task.description ? { description: task.description } : {}),
    start: {},
    end: {},
  };

  if (timed) {
    const start = task.startTime as string;
    // An end at or before the start is not a zero-length meeting, it is an
    // unset or stale field. The published ICS feed already answers this with
    // an hour (`api/calendar/[token].js`), and two outbound paths disagreeing
    // about the same task would be worse than either answer.
    const end = isTime(task.endTime) && (task.endTime as string) > start ? (task.endTime as string) : addOneHour(start);
    body.start = { dateTime: `${task.dueDate}T${start}:00`, timeZone: timezone };
    body.end = { dateTime: `${task.dueDate}T${end}:00`, timeZone: timezone };
  } else if (isDate(task.startDate) && (task.startDate as string) < task.dueDate) {
    body.start = { date: task.startDate as string };
    body.end = { date: nextDay(task.dueDate) };
  } else {
    body.start = { date: task.dueDate };
    body.end = { date: nextDay(task.dueDate) };
  }

  const rrule = toRrule(task, !timed);
  if (rrule) body.recurrence = [rrule];

  return body;
}
