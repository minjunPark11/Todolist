// The 반복 choices, and their translation to the Task's legacy repeat fields
// (design §9, mockup panel 4).
//
// The record has carried `repeatType` / `repeatInterval` / `repeatDays` /
// `repeatEndDate` since long before this editor, and tasks in the wild already
// repeat on them. So the preset is NOT a new storage format — it is a reading
// of the three fields that exist, which is what lets the new panel and the old
// `getNextDueDate` describe the same repetition.
//
// The mapping is deliberately lossy in one direction only: every preset
// produces exactly one field triple, while several triples read back as the
// same preset (weekly on four days is "매주"). That is the honest shape of a
// six-button UI over a richer model, and it means a task built elsewhere is
// shown as the nearest preset rather than as nothing.
import type { LocalDate, RepeatPreset } from "./types";

/** Monday–Friday as JS weekday numbers (0 = Sunday), which is what `repeatDays` holds. */
export const WEEKDAY_NUMBERS = [1, 2, 3, 4, 5] as const;

/**
 * The Task's `repeatType`, restated structurally.
 *
 * Not imported from `src/types.ts` — nothing in this folder depends on the
 * app's record type (design §19.3). Structural typing makes the two
 * interchangeable, and the moment they stop matching, the adapter stops
 * compiling, which is the check that matters.
 */
export type RepeatKind = "none" | "daily" | "weekly" | "monthly" | "yearly";

/** The Task fields a repeat preset expands into. */
export interface RepeatFields {
  repeatType: RepeatKind;
  repeatInterval: number;
  repeatDays: number[];
}

export interface RepeatSource {
  repeatType?: string;
  repeatInterval?: number;
  repeatDays?: number[];
}

function isWeekdaySet(days: readonly number[]): boolean {
  const unique = [...new Set(days)].sort();
  return unique.length === 5 && unique.every((day, index) => day === WEEKDAY_NUMBERS[index]);
}

/**
 * Which preset a Task's repeat fields read as.
 *
 * An interval other than 1 still reads as its base preset — "every 2 weeks"
 * shows as 매주. The alternative is showing 없음 for a task that visibly
 * repeats, and a panel that denies an existing repeat is worse than one that
 * rounds it. Selecting a preset then rewrites the interval to 1, which is the
 * user explicitly choosing the simple form.
 */
export function repeatPresetFromTask(task: RepeatSource): RepeatPreset {
  switch (task.repeatType) {
    case "daily":
      return "daily";
    case "weekly":
      return isWeekdaySet(task.repeatDays ?? []) ? "weekdays" : "weekly";
    case "monthly":
      return "monthly";
    case "yearly":
      return "yearly";
    default:
      return "none";
  }
}

/**
 * The fields a preset writes back.
 *
 * `anchor` is the schedule's own date, used only by 매주 — "every week" has to
 * name a weekday, and the one the task already falls on is the only answer
 * that does not move the task the moment it is chosen. Without an anchor the
 * day list is left empty, which `getNextDueDate` reads as a plain +7.
 */
export function repeatPresetToFields(preset: RepeatPreset, anchor: LocalDate | null): RepeatFields {
  switch (preset) {
    case "none":
      return { repeatType: "none", repeatInterval: 1, repeatDays: [] };
    case "daily":
      return { repeatType: "daily", repeatInterval: 1, repeatDays: [] };
    case "weekdays":
      return { repeatType: "weekly", repeatInterval: 1, repeatDays: [...WEEKDAY_NUMBERS] };
    case "weekly":
      return {
        repeatType: "weekly",
        repeatInterval: 1,
        repeatDays: anchor === null ? [] : [new Date(`${anchor}T00:00:00Z`).getUTCDay()],
      };
    case "monthly":
      return { repeatType: "monthly", repeatInterval: 1, repeatDays: [] };
    case "yearly":
      return { repeatType: "yearly", repeatInterval: 1, repeatDays: [] };
  }
}
