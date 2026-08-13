// Record-level diffing for the account sync (pure, no React/IO).
//
// Every reducer in usePlannerData builds its next state with .map/.filter and
// spreads only the record it actually touches, so untouched records keep their
// object identity. That makes an identity check an exact answer to "what did
// this edit change" — no deep compare, no updatedAt bookkeeping — which is what
// lets a save send one row instead of every row in every table.

// Records present now that the account does not already hold. A missing
// baseline means nothing has been synced yet, so everything counts as changed.
export function diffChangedRecords<T extends { id: string }>(
  items: T[],
  previous: T[] | undefined,
): T[] {
  if (!previous) return items;
  const previousById = new Map(previous.map((item) => [item.id, item]));
  return items.filter((item) => previousById.get(item.id) !== item);
}

// Ids the account still holds that are gone locally. Deleting exactly these
// replaces an older "delete everything NOT in the full id list" reconciliation,
// which hand-quoted ids into a filter string and let a device with stale data
// wipe rows another device had just added.
export function diffRemovedIds<T extends { id: string }>(
  items: T[],
  previous: T[] | undefined,
): string[] {
  if (!previous || previous.length === 0) return [];
  const currentIds = new Set(items.map((item) => item.id));
  return previous.filter((item) => !currentIds.has(item.id)).map((item) => item.id);
}
