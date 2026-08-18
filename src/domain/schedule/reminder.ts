// The 알림 choices (design §8, mockup panel 3).
//
// This file decides WHICH reminders can be offered and what each one means as
// a moment in time. It does not deliver anything — the app has no scheduler
// and no notification permission flow (audit D5), so a stored reminder is a
// stated intent, and `reminderInstant` is the seam the delivery engine will
// plug into when it arrives.
//
// Keeping the resolution here rather than in the future scheduler means the
// panel and the eventual notification agree on what "1일 전 오전 9시" is by
// construction, instead of agreeing until someone edits one of them.
import { addDays } from "./scheduleCommands";
import { isTimed } from "./scheduleQueries";
import { REMINDER_PRESETS, type LocalDate, type LocalTime, type ReminderPreset, type Schedule } from "./types";

/** The default hour for reminders on a schedule that has no time of its own. */
const ALL_DAY_HOUR: LocalTime = "09:00";

/**
 * The presets a given draft can actually use.
 *
 * `at-time` ("정시") is dropped when there is no time, because "at the time"
 * of an all-day task names no moment. Offering it anyway and silently firing
 * at 09:00 would be the editor deciding something the user did not.
 */
export function availableReminders(schedule: Schedule): readonly ReminderPreset[] {
  return isTimed(schedule) ? REMINDER_PRESETS : REMINDER_PRESETS.filter((preset) => preset !== "at-time");
}

/**
 * The preset to keep after an edit that may have invalidated it.
 *
 * Called whenever the time or the dates change: clearing a time turns 정시
 * into a choice that no longer exists, and INV-06 forbids a reminder with no
 * date at all. Both fall back to `none` rather than to a neighbouring preset,
 * because guessing which reminder someone would have wanted is worse than
 * showing them that it went.
 */
export function reconcileReminder(schedule: Schedule, preset: ReminderPreset): ReminderPreset {
  if (schedule.dueDate === null && schedule.startDate === null) return "none";
  return availableReminders(schedule).includes(preset) ? preset : "none";
}

/**
 * When the reminder fires, as a wall-clock `[date, time]`, or null.
 *
 * Anchored to the START of the schedule — the first day of a range, not its
 * deadline — because a reminder is a nudge to begin. A range's `endTime` is
 * when the last day finishes and firing then would be a notification about
 * something already over.
 *
 * Not exported to any caller yet. It is here so the panel's labels are
 * derived from the same arithmetic the delivery will use.
 */
export function reminderInstant(schedule: Schedule): { date: LocalDate; time: LocalTime } | null {
  const preset = schedule.reminder;
  if (preset === "none") return null;

  const date = schedule.startDate ?? schedule.dueDate;
  if (date === null) return null;

  const time = schedule.startTime ?? ALL_DAY_HOUR;

  switch (preset) {
    case "at-time":
      return { date, time };
    case "10m":
      return shift(date, time, -10);
    case "1h":
      return shift(date, time, -60);
    case "1d-9am":
      // A fixed hour, not an offset: "the morning before" is what the label
      // promises, and subtracting 24h from a 22:00 task would fire at 22:00.
      return { date: addDays(date, -1), time: ALL_DAY_HOUR };
  }
}

/** Move a wall-clock moment by `minutes`, rolling the date when it crosses midnight. */
function shift(date: LocalDate, time: LocalTime, minutes: number): { date: LocalDate; time: LocalTime } {
  const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes;
  const dayShift = Math.floor(total / (24 * 60));
  const withinDay = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(withinDay / 60)).padStart(2, "0");
  const mm = String(withinDay % 60).padStart(2, "0");
  return { date: addDays(date, dayShift), time: `${hh}:${mm}` };
}
