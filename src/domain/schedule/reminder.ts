// The one-preset reminder, and the way out of it (spec §6.3).
//
// This file used to BE the reminder model: which of five presets a Schedule
// could hold, what each meant as a moment, and how an edit invalidated one.
// §6.3 names that shape as the one not to use — a Task can want reminding a
// day before and an hour before, and a field holds one answer — so the model
// moved to `reminders.ts` and this is what remains: the translation from what
// accounts already have written into what the app now reads.
//
// It is deliberately one-way. Nothing writes a `ReminderPreset` any more, and
// `presetToSpec` runs on the way in so that a record written before §6.3 keeps
// its reminder instead of being told it never had one.
import { ALL_DAY_REMINDER_TIME, specFromOffer, type ReminderOffer } from "./reminders";
import type { ReminderPreset, ReminderSpec } from "./types";

/**
 * What each retired preset meant, as an offer the new model can express.
 *
 * The values are the ones `reminderInstant` computed before the change, so a
 * migrated reminder fires at exactly the moment it would have. `1d-9am` is the
 * one that needed §6.12's extra field: it was a fixed hour and never an
 * offset, which is why subtracting 24 hours from a 22:00 Task gave the wrong
 * answer and the old code special-cased it.
 */
const PRESET_OFFERS: Record<Exclude<ReminderPreset, "none">, ReminderOffer> = {
  "at-time": { id: "at-time", offsetMinutes: 0, allDayTime: null },
  "10m": { id: "10m", offsetMinutes: 10, allDayTime: null },
  "1h": { id: "1h", offsetMinutes: 60, allDayTime: null },
  "1d-9am": { id: "1d-9am", offsetMinutes: 1440, allDayTime: ALL_DAY_REMINDER_TIME },
};

/** The spec a stored preset stands for, or null for "none" and for junk. */
export function presetToSpec(preset: string | undefined): ReminderSpec | null {
  const offer = PRESET_OFFERS[preset as Exclude<ReminderPreset, "none">];
  return offer ? specFromOffer(offer) : null;
}
