// Two devices, two settings, one row (MULTI_DEVICE_SYNC_DESIGN.md §4).
//
// Every collection this app syncs is diffed per record, so two people — or one
// person on two machines — editing different tasks never collide. Settings are
// the exception: `settings` and `app_settings` are one jsonb blob each, written
// whole. Change the language on the web and the week start in the app, and
// whichever saved last erases the other, even though they touched nothing in
// common.
//
// The fix is the rule `reapplyLocalEdits` already applies to records, applied
// to fields instead:
//
//   this device changed the field   ->  ours wins
//   it did not                      ->  theirs wins
//
// `baseline` is what we last agreed the account held. A field that still equals
// it is a field we have no opinion about, so whatever the account says now is
// the newer answer by definition. A field that differs is an edit of ours that
// has not landed yet.
//
// Same field on both sides is still last-write-wins, and that is right: there
// is no third thing to do with two answers to one question, and pretending
// otherwise would need a timestamp per field and a schema to hold it (§4.3).
//
// The rule follows the account into absence, too: a field we did not touch and
// the account no longer has is a field the account dropped, and `googleDeleted-
// EventIds` emptying on another device has to be able to reach us. The cost is
// an older client that writes the row without a field it does not know about —
// but `normalizeSettings` and `normalizeAppSettings` fill every field this
// build knows before the row gets here, so what actually rides on this is the
// handful that are optional by design.

type Fields = Record<string, unknown>;

function shallowEqual(a: Fields, b: Fields): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => key in b && Object.is(a[key], b[key]));
}

/**
 * The account's row and ours, reconciled field by field.
 *
 * Returns `local` or `remote` ITSELF when the answer is one of them unchanged.
 * Both callers decide what to do next by object identity — the save plan asks
 * "did settings change?" that way, and a fresh object here would push a row
 * that says exactly what the account already holds, on every save, forever.
 *
 * With no baseline (a first load, or a device that has never synced) the remote
 * is taken whole. That is the existing behaviour and the safe one: without a
 * baseline every field looks locally edited, and a device that had never seen
 * the account would overwrite all of it.
 */
export function mergeSettingsFields<T extends object>(
  baseline: T | undefined | null,
  local: T,
  remote: T,
): T {
  if (!baseline) return remote;

  const base = baseline as Fields;
  const ours = local as Fields;
  const theirs = remote as Fields;

  const merged: Fields = {};
  for (const key of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
    // A key we dropped and they did not is still a change of ours.
    const source = Object.is(ours[key], base[key]) ? theirs : ours;
    if (key in source) merged[key] = source[key];
  }

  if (shallowEqual(merged, ours)) return local;
  if (shallowEqual(merged, theirs)) return remote;
  return merged as T;
}
