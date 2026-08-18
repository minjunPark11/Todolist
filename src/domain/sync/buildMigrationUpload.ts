// The one-time "upload this device's local data" migration, decided purely.
//
// It used to be expressed as an ordinary save of the local state against the
// account's state as baseline, which made buildSyncPlan compute removeIds for
// every record the account held and this device did not — so pressing a button
// labelled "upload" DELETED the account's rows, and the local state then
// replaced what was on screen. The box only appears when this device has
// leftover local data AND the user is signed in, which is exactly the case
// where the account is the copy more likely to be current.
//
// So the migration merges and never deletes: local-only records are added, and
// a record the account already holds keeps the account's version. Neither side
// loses anything, which is the only outcome that needs no undo.
import type { PlannerData } from "../../types";
import { collectionTables } from "./buildSyncPlan";

export function buildMigrationUpload(local: PlannerData, account: PlannerData): PlannerData {
  const merged: PlannerData = { ...account };

  for (const [key] of collectionTables) {
    const accountItems = account[key] as Array<{ id: string }>;
    const localItems = local[key] as Array<{ id: string }>;
    const accountIds = new Set(accountItems.map((item) => item.id));
    const additions = localItems.filter((item) => !accountIds.has(item.id));
    // Identity is what buildSyncPlan diffs on, so a collection with nothing to
    // add must stay the SAME array — otherwise every merge would re-upload
    // every row of every table.
    if (additions.length === 0) continue;
    merged[key] = [...accountItems, ...additions] as never;
  }

  // Settings are single rows rather than collections: there is no "local-only"
  // half of them to add, and overwriting would silently change the account's
  // preferences on every device. The account keeps what it has.
  return merged;
}
