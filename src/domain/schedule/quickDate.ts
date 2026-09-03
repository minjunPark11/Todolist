// The four shortcuts above the calendar (design §5: 오늘 / 내일 / 7일 후 /
// 다음 달).
//
// They are not a fifth schedule mode. Each one is exactly the click the user
// could have made in the grid, which is why every path below ends in
// `selectDate` or `shiftSchedule` rather than assembling dates itself — a
// shortcut that wrote `dueDate` directly would be a second answer to what
// picking a date means, and Date/Duration would drift apart the first time
// either rule changed (design §5.3).
//
// All four now answer with a DAY and nothing else. The fourth used to be
// 오늘 밤, which also set a time — the word names an hour, so it had to. It is
// 다음 달 instead, and with it the last reason any shortcut touched the clock
// is gone: none of them changes a time that is already there (design §5.10).
import { addDays, daysBetween, selectDate, shiftSchedule } from "./scheduleCommands";
import { getRangeStage } from "./scheduleQueries";
import type { LocalDate, ScheduleDraft } from "./types";

export const QUICK_DATES = ["today", "tomorrow", "plus7", "nextMonth"] as const;
export type QuickDateKey = (typeof QUICK_DATES)[number];

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
      return today;
    case "tomorrow":
      return addDays(today, 1);
    case "plus7":
      return addDays(today, 7);
    case "nextMonth":
      return addMonthClamped(today);
  }
}

/**
 * The same day next month, or that month's last day when there is no such day.
 *
 * The clamp is the whole reason this is not two lines of `Date`: adding a
 * month to 1월 31일 with `setMonth` gives **3월 3일**, because February
 * overflows and the overflow spills forward. A shortcut that answers "next
 * month" with a date two months out is worse than one that does not exist.
 *
 * 31일 → 30일 (or 28/29) is the reading every calendar app takes, and it is
 * the only one that keeps the answer inside the month the button names.
 */
function addMonthClamped(date: LocalDate): LocalDate {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  const targetMonth = month === 12 ? 1 : month + 1;
  const targetYear = month === 12 ? year + 1 : year;
  // Day 0 of the month after is the last day of the target month.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const clamped = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

/* `tonightTime` stood here — 18:00, or the next half hour once the evening had
   started, so that pressing 오늘 밤 at 20:42 could not schedule something for
   two hours ago. It went with the button: 다음 달 names a day, and a day needs
   no clock. */

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
): ScheduleDraft {
  return reschedule(draft, quickTargetDate(key, today));
}

function reschedule(draft: ScheduleDraft, target: LocalDate): ScheduleDraft {
  if (draft.mode === "duration" && getRangeStage(draft) === "complete" && draft.startDate !== null) {
    return shiftSchedule(draft, daysBetween(draft.startDate, target));
  }
  return selectDate(draft, target);
}
