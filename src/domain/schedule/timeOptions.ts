// The list a time field offers, and the ways a human writes a time
// (SCHEDULE_TIME_FIELD_DESIGN.md §3).
//
// This exists because `<input type="time">` does not. §2.1 measured it: pressed
// in Chromium it opens no listbox at all — `step` only sets the spinner's
// stride — so the four presets beside it were the only times the panel ever
// offered. The list below is what replaces the browser's missing one, and it
// has to be ours because the browser has no opinion we can borrow.
//
// Pure, and deliberately clock-free (design §19.3, and the rule `quickDate.ts`
// states in its own preamble): `nextWholeHour` takes the current time as an
// argument rather than reading one, so a test can hand it 07:15 without owning
// the machine's clock.
import type { LocalTime } from "./types";
import { isLocalTime } from "./types";

/** Half-hourly, which is what §3.1 settled on from the reference's list. */
export const TIME_STEP_MINUTES = 30;

const MINUTES_PER_DAY = 1440;
const pad = (n: number) => String(n).padStart(2, "0");

/** Minutes from midnight, as `HH:MM`. */
function toTime(minutes: number): LocalTime {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/**
 * Every step of the day, `00:00` through `23:30`, ascending.
 *
 * Nothing is filtered out. §3.1: the reference screenshot appears to start at
 * the current value only because the list is SCROLLED to it — the earlier
 * hours are still above, and a user who wants 02:00 on a task they are
 * planning for tonight must be able to reach it.
 *
 * `24:00` is not here. It is what the END of a day is written as elsewhere in
 * this app, not a time anyone picks off a list — and `isLocalTime` rejects it
 * (INV-09), so it could not be stored from here anyway.
 *
 * `step` is a parameter for the day a finer grid is wanted (§9). It is not a
 * setting today, and there is no UI that passes anything but the default.
 */
export function timeOptions(step: number = TIME_STEP_MINUTES): LocalTime[] {
  if (!Number.isFinite(step) || step <= 0) return [];
  const out: LocalTime[] = [];
  for (let minutes = 0; minutes < MINUTES_PER_DAY; minutes += step) out.push(toTime(minutes));
  return out;
}

/** Both meridiem conventions this app is read in. */
const AM = /오전|a\.?m\.?/i;
const PM = /오후|p\.?m\.?/i;

/**
 * A time as a person typed it, or `null` when it cannot be read (§3.2).
 *
 * `null` is a refusal, not midnight. Inventing a time for an unreadable input
 * is how a field ends up storing something other than what was typed, and the
 * only place that would show is the calendar a week later.
 *
 * Accepts, with or without a separator: `7`, `730`, `0730`, `7:30`, `19:00`,
 * `7:30 PM`, `7pm`, `오전 7:30`, `오후 7시`, `7시 30분`.
 *
 * The 12-hour arithmetic is `(h % 12) + (pm ? 12 : 0)`, which is the one
 * expression that gets both ends right: `12 AM` is `00:00` and `12 PM` is
 * `12:00`, and every rule written as "add 12 when PM" gets one of them wrong.
 */
export function parseTimeInput(text: string): LocalTime | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;

  const pm = PM.test(trimmed);
  const am = !pm && AM.test(trimmed);

  // 시/분 become the separator they are, so `7시 30분` and `7:30` reach the
  // same matcher. A bare `7시` leaves a trailing colon, which the strip below
  // removes rather than reading as `7:0`.
  const digits = trimmed
    .replace(AM, "")
    .replace(PM, "")
    .replace(/시/g, ":")
    .replace(/분/g, "")
    .replace(/\s+/g, "")
    .replace(/:$/, "");

  let hour: number;
  let minute: number;

  const withColon = /^(\d{1,2}):(\d{1,2})$/.exec(digits);
  const bare = /^(\d{1,4})$/.exec(digits);

  if (withColon) {
    hour = Number(withColon[1]);
    minute = Number(withColon[2]);
  } else if (bare) {
    const value = bare[1];
    // One or two digits is an hour; three or four carry the minutes in the
    // last two. `730` is half past seven, never seven hundred and thirty.
    if (value.length <= 2) {
      hour = Number(value);
      minute = 0;
    } else {
      hour = Number(value.slice(0, value.length - 2));
      minute = Number(value.slice(-2));
    }
  } else {
    return null;
  }

  if (minute > 59) return null;
  if (am || pm) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (pm ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }

  return toTime(hour * 60 + minute);
}

/**
 * The whole hour at or after `now` — the value an empty Time row opens with
 * (§3.3, a decision the user made explicitly: 19:15 offers 20:00).
 *
 * Three rules:
 *
 *   - On the hour already, stay there. Rounding up exists so that the field
 *     does not propose a moment that has passed, and an exact hour has not.
 *   - The 23rd hour rounds DOWN to `23:00`. `24:00` is not on the list (see
 *     `timeOptions`) and rolling into tomorrow is not this field's call — the
 *     calendar above it owns the date.
 *   - It takes the clock rather than reading it, which is what keeps this file
 *     pure and what lets the test above name an hour.
 *
 * Used only to fill an EMPTY start time. A time that is already set is never
 * touched by the clock — that is the line between "a suggestion" and "a value
 * that changes depending on when you opened the editor".
 */
export function nextWholeHour(now: LocalTime): LocalTime {
  if (!isLocalTime(now)) return "09:00";
  const hour = Number(now.slice(0, 2));
  const minute = Number(now.slice(3, 5));
  if (minute === 0) return now;
  if (hour >= 23) return "23:00";
  return `${pad(hour + 1)}:00`;
}
