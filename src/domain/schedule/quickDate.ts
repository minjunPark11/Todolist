// The four shortcuts above the calendar (design §5, mockup: 오늘 / 내일 /
// 7일 후 / 오늘 밤).
//
// They are not a fifth schedule mode. Each one is exactly the click the user
// could have made in the grid, which is why every path below ends in
// `selectDate` or `shiftSchedule` rather than assembling dates itself — a
// shortcut that wrote `dueDate` directly would be a second answer to what
// picking a date means, and Date/Duration would drift apart the first time
// either rule changed (design §5.3).
//
// One of the four is different: 오늘 밤 sets a TIME as well, because that is
// what the word means. The other three leave any existing time alone
// (design §5.10).
import { addDays, daysBetween, selectDate, setEndTime, setStartTime, shiftSchedule } from "./scheduleCommands";
import { getRangeStage } from "./scheduleQueries";
import type { LocalDate, LocalTime, ScheduleDraft } from "./types";

export const QUICK_DATES = ["today", "tomorrow", "plus7", "tonight"] as const;
export type QuickDateKey = (typeof QUICK_DATES)[number];

/** The evening a bare 오늘 밤 means, before the clock is consulted. */
export const DEFAULT_TONIGHT_TIME: LocalTime = "18:00";

/**
 * Which day a shortcut targets (design §5.5–5.7).
 *
 * `+7` is seven days from today, NOT from whatever the task is currently set
 * to. "A week from now" is a statement about now; making it relative to the
 * existing date would turn a second press into two weeks out, and the button
 * would mean something different depending on history the user cannot see
 * (design §5.7).
 */
export function quickTargetDate(key: QuickDateKey, today: LocalDate): LocalDate {
  switch (key) {
    case "today":
    case "tonight":
      return today;
    case "tomorrow":
      return addDays(today, 1);
    case "plus7":
      return addDays(today, 7);
  }
}

/**
 * The time 오늘 밤 resolves to, given the current wall clock (design §5.9).
 *
 *   before 18:00   18:00
 *   18:00–22:59    the next half hour
 *   23:00 onward   23:59
 *
 * The rounding exists so the shortcut cannot produce a moment that has already
 * passed. A button that sets a task to 18:00 at 20:42 has scheduled something
 * for two hours ago, and the reminder attached to it would be due on arrival.
 */
export function tonightTime(now: LocalTime): LocalTime {
  if (now < DEFAULT_TONIGHT_TIME) return DEFAULT_TONIGHT_TIME;
  if (now >= "23:00") return "23:59";

  const minutes = Number(now.slice(0, 2)) * 60 + Number(now.slice(3, 5));
  const rounded = Math.ceil(minutes / 30) * 30;
  if (rounded >= 23 * 60 + 60) return "23:59";
  const hh = String(Math.floor(rounded / 60)).padStart(2, "0");
  const mm = String(rounded % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Apply a shortcut to a draft (design §5.43–5.46).
 *
 * Three shapes, and the difference between them is what the target date is
 * being asked to BE:
 *
 *   date mode, or a half-picked range  the date itself → `selectDate`
 *   a finished range                   its new start, span preserved → shift
 *
 * The second is the case worth stating: pressing 내일 on a task running Mon–Fri
 * should move the week, not collapse it onto tomorrow (design §5.24). That is
 * the same rule the calendar uses for dragging a bar, and it is deliberately
 * NOT the rule for clicking a day in the grid — a click chooses an endpoint, a
 * shortcut reschedules the whole thing.
 */
export function applyQuickDate(
  draft: ScheduleDraft,
  key: QuickDateKey,
  today: LocalDate,
  now: LocalTime,
): ScheduleDraft {
  const target = quickTargetDate(key, today);
  const rescheduled = reschedule(draft, target);
  return key === "tonight" ? withTonightTime(rescheduled, tonightTime(now)) : rescheduled;
}

function reschedule(draft: ScheduleDraft, target: LocalDate): ScheduleDraft {
  if (draft.mode === "duration" && getRangeStage(draft) === "complete" && draft.startDate !== null) {
    return shiftSchedule(draft, daysBetween(draft.startDate, target));
  }
  return selectDate(draft, target);
}

/**
 * Put the evening time on the draft.
 *
 * The end is dropped when it would now precede the start on the same day —
 * moving a 09:00–11:00 block to 18:00 cannot keep an 11:00 end, and INV-05
 * would reject the result. Dropping the end rather than sliding it keeps the
 * block's start where the shortcut promised; the length is a guess, the start
 * is not.
 */
function withTonightTime(draft: ScheduleDraft, time: LocalTime): ScheduleDraft {
  const withStart = setStartTime(draft, time);
  const sameDay = withStart.startDate === null || withStart.startDate === withStart.dueDate;
  if (sameDay && withStart.endTime !== null && withStart.endTime < time) {
    return setEndTime(withStart, null);
  }
  return withStart;
}
