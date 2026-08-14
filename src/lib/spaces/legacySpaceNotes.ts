// The space-hub blob's notes, drained into the synced dataset.
//
// Same one-way drain as legacyLocalSpaces.ts, and the same reason: a note you
// cannot see on your other device is not a note. Notes were the only user
// *writing* still trapped in a device-local blob (useSpaceHubData.ts), so this
// is the migration that stops actual data loss rather than tidying a model.
//
// The blob is NOT deleted. It still holds `activities` and `configs`, which
// this migration deliberately leaves behind (see below), and keeping the notes
// beside them for a release means a failed upload is recoverable by hand.
//
// `activities` are not migrated on purpose: nothing has written them for
// several versions — deriveSpaceActivities (spaceSelectors.ts:206) builds the
// timeline from tasks, sessions and notes, all of which sync. Once notes sync,
// the timeline is correct on every device by itself. Building a synced
// collection for a table nothing writes would just be another dead field.
import { platform } from "../../platform";
import type { SpaceNote } from "../spaceHubTypes";
import { sanitizeSpaceNote } from "./spaceNotes";

const STORAGE_KEY = "todo-planner-space-hub-v1";
// Its own marker rather than an emptied blob, so deleting every migrated note
// afterwards cannot resurrect the old copy on the next launch.
const MIGRATED_KEY = "focusflow.spaceNotes.migrated.v1";

export function hasMigratedLegacySpaceNotes(): boolean {
  try {
    return platform.storage.getSync(MIGRATED_KEY) === "1";
  } catch {
    // No storage means no blob to migrate either; treat it as done so the
    // caller never blocks on it.
    return true;
  }
}

/** Pure read — safe to call any number of times, no side effects. */
export function readLegacySpaceNotes(): SpaceNote[] {
  if (hasMigratedLegacySpaceNotes()) return [];
  try {
    const raw = platform.storage.getSync(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    const store = parsed as { notes?: unknown };
    const notes = Array.isArray(store.notes) ? store.notes : [];
    return notes
      .map((note) => sanitizeSpaceNote(note))
      .filter((note): note is SpaceNote => note !== null);
  } catch {
    // A corrupt blob is not worth failing a load over.
    return [];
  }
}

export function markLegacySpaceNotesMigrated() {
  try {
    platform.storage.setSync(MIGRATED_KEY, "1");
  } catch {
    // Marker unavailable: the read repeats next start. Adoption merges by id,
    // so a repeat is a no-op rather than a duplicate.
  }
}

/** Exported for the migration test only. */
export const LEGACY_SPACE_NOTES_KEY = STORAGE_KEY;
export const LEGACY_SPACE_NOTES_MIGRATED_KEY = MIGRATED_KEY;
