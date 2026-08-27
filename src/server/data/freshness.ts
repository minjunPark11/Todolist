// How old the account's copy is, said out loud (§11.2).
//
// This app is local-first: the device holds the truth and the account is a
// mirror that only runs while signed in (B1). Anything reading the account
// without the device present — which is every reader this layer serves — can
// be looking at last Tuesday and have no way to tell. Hiding that would make
// an AI confidently wrong, which §21 names as the failure to avoid above all
// others, so every response carries this whether it is flattering or not.
import type { SyncStateRow } from "./repository";

export type Staleness = "live" | "recent" | "stale" | "unknown";

export interface Freshness {
  /** When the account last CHANGED. */
  lastSyncedAt?: string;
  /** When a device last CHECKED IN and agreed with the account. */
  lastSeenAt?: string;
  staleness: Staleness;
  /** "web" | "desktop". A label, not an identifier. */
  syncedFromDevice?: string;
}

const MINUTE = 60 * 1000;
export const LIVE_WITHIN_MS = 5 * MINUTE;
export const RECENT_WITHIN_MS = 24 * 60 * MINUTE;

/**
 * Staleness is measured from the LATER of the two stamps, and the reason is
 * the difference between them (M4): `lastSyncedAt` moves when something is
 * written, so a week with no edits leaves it a week old while the account is
 * in fact current. `lastSeenAt` moves whenever a device connected and
 * reconciled, which is what actually answers "is this copy trustworthy".
 *
 * Both are reported, because a reader that wants to say "you last changed
 * anything on Tuesday" needs the other one.
 */
export function freshnessFrom(syncState: SyncStateRow | null, now: Date): Freshness {
  const lastSyncedAt = validStamp(syncState?.lastSyncedAt);
  const lastSeenAt = validStamp(syncState?.lastSeenAt);
  const stamps = [lastSyncedAt, lastSeenAt].filter((stamp): stamp is string => Boolean(stamp)).sort();
  const newest = stamps[stamps.length - 1];

  const freshness: Freshness = {
    ...(lastSyncedAt ? { lastSyncedAt } : {}),
    ...(lastSeenAt ? { lastSeenAt } : {}),
    ...(syncState?.platform ? { syncedFromDevice: syncState.platform } : {}),
    staleness: "unknown",
  };

  if (!newest) return freshness;

  const age = now.getTime() - Date.parse(newest);
  // A stamp from the future is a clock disagreement, not freshness. Treating
  // it as "live" would be the optimistic reading, and this metadata exists to
  // err the other way.
  if (age < -LIVE_WITHIN_MS) return freshness;

  freshness.staleness = age <= LIVE_WITHIN_MS ? "live" : age <= RECENT_WITHIN_MS ? "recent" : "stale";
  return freshness;
}

function validStamp(value: string | undefined): string | undefined {
  if (!value || Number.isNaN(Date.parse(value))) return undefined;
  return value;
}
