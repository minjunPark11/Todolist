// The device half of the daily-plan legacy adoption.
//
// ./dailyPlan holds the rules and stays pure so a server can run them (§7.2 of
// FOCUSFLOW_EXTERNAL_AI_ACCESS_ARCHITECTURE.md). What is left here is the one
// thing only a device can do: read the localStorage blob the records replaced.
// A server has no such blob — there was never a "this machine" behind an
// account — so nothing on that side imports this file.
import type { TaskDailyPlan } from "../../types";
import { platform } from "../../platform";
import {
  adoptLegacyBucketOverrides,
  parseLegacyBucketOverrides,
  type LegacyOverrides,
} from "./dailyPlan";

const LEGACY_OVERRIDES_KEY = "todayPage.bucketOverrides.v1";

/** The blob this device still holds, if it holds one. */
export function readLegacyBucketOverrides(): LegacyOverrides | null {
  return parseLegacyBucketOverrides(platform.storage.getSync(LEGACY_OVERRIDES_KEY));
}

/** `adoptLegacyBucketOverrides` against what this device holds. */
export function adoptStoredLegacyBucketOverrides(
  current: TaskDailyPlan[],
  now: string,
): TaskDailyPlan[] {
  return adoptLegacyBucketOverrides(current, now, readLegacyBucketOverrides());
}
