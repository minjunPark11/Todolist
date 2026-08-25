// What the user did while the account was still loading (spec §16, §21).
//
// The load replaces the whole store: it fetches every collection, normalizes
// them, and calls `setDataState(loaded)`. That is right when nothing happened
// in between — and it is silent data loss when something did. The app renders
// local data immediately, so a user can be typing before the first fetch
// resolves, and the resolve used to overwrite what they typed. Worse, it then
// set the synced baseline to the loaded state, so the edit was never pushed
// either: gone locally AND gone from the account.
//
// §24.24 states it as a MUST — "remote update가 active local draft를 silent
// overwrite하지 않는다" — and §21 asks the same of a stale fetch against an
// optimistic update.
//
// The fix is a diff, not a lock. The load already knows the local state it
// started from; comparing that with the local state at the moment it resolves
// names exactly the records the user touched, and those go back on top.
//
// Two properties make this safe to do to a freshly loaded state:
//
//   The result is a SUPERSET of what loaded. Nothing is removed, so the sync
//   plan that follows has nothing to delete — `diffRemovedIds` against the
//   loaded baseline is empty by construction. Getting that wrong would let a
//   device with older data wipe rows another device had just added, which is
//   the exact failure `diffRemovedIds` was written to end.
//
//   The baseline stays the LOADED state, not the merged one. The difference
//   between them is precisely the re-applied edits, so the next save pushes
//   those and only those.
//
// What it deliberately does not do is resurrect nothing. A record hard-deleted
// locally during the load comes back, because "absent" and "never there" look
// the same to a diff of ids. Soft deletes — which is every delete a user can
// reach — are a field on a record that is still in the array, so they count as
// touched and survive. Trading a rare resurrection for never losing an edit is
// the right way round: one is visible and undoable, the other is silent.
import type { PlannerData } from "../../types";
import { collectionTables } from "./buildSyncPlan";
import { diffChangedRecords } from "./diffRecords";

/**
 * `loaded` with the caller's local edits put back on top.
 *
 * Returns `loaded` itself when nothing was touched, so the common case — a
 * load that races nothing — allocates nothing and marks nothing dirty.
 */
export function reapplyLocalEdits(
  loaded: PlannerData,
  localBefore: PlannerData,
  localNow: PlannerData,
): PlannerData {
  // The fast path, and the one that runs almost every time.
  if (localNow === localBefore) return loaded;

  const merged: PlannerData = { ...loaded };
  let touchedAnything = false;

  for (const [key] of collectionTables) {
    const before = localBefore[key] as Array<{ id: string }>;
    const now = localNow[key] as Array<{ id: string }>;
    // Identity, the way every other diff in this folder decides "changed".
    // The reducers replace a record only when it actually changes, so an
    // untouched collection compares as one object and costs nothing.
    const touched = now === before ? [] : diffChangedRecords(now, before);
    if (touched.length === 0) continue;

    touchedAnything = true;
    const byId = new Map((loaded[key] as Array<{ id: string }>).map((item) => [item.id, item]));
    for (const item of touched) byId.set(item.id, item);
    merged[key] = [...byId.values()] as never;
  }

  // The three that are not collections. A setting toggled while the load was
  // in flight is an edit like any other.
  if (localNow.settings !== localBefore.settings) {
    merged.settings = localNow.settings;
    touchedAnything = true;
  }
  if (localNow.appSettings !== localBefore.appSettings) {
    merged.appSettings = localNow.appSettings;
    touchedAnything = true;
  }
  if (localNow.activeSessionId !== localBefore.activeSessionId) {
    merged.activeSessionId = localNow.activeSessionId;
    touchedAnything = true;
  }

  return touchedAnything ? merged : loaded;
}
