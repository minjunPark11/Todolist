import type { PlannerData } from "../../types";
import { platform } from "../../platform";
import { markLegacyLocalSpacesMigrated } from "../../lib/spaces/legacyLocalSpaces";

export const PLANNER_STORAGE_KEY = "focusflow.appData.v1";
export const FOCUS_V2_BACKUP_KEY = "focusflow.focus.v2.backup";

// The focus-v2 backup is a migration, and a migration can only find legacy
// data in the snapshot that was already on disk when this session started:
// every write after the first is this version's own shape, so a second look
// can only ever find what we just wrote.
//
// It used to look again on every single save, and the look is not cheap — a
// full read of the snapshot plus a `JSON.parse` of all of it. Worse, it never
// stopped: the guard is the backup key, and the backup key is only written
// when legacy data is actually found, so an account with nothing to migrate
// (every account created after focus-v2, and every account already migrated)
// re-read and re-parsed its whole store on every keystroke that committed,
// forever, to re-learn the same "nothing to do".
//
// Deciding it once per session is both faster and closer to what the check
// means. The flag is deliberately not persisted: a session that never got to
// look — because its first write threw — must still look on the next launch.
let focusBackupChecked = false;

/** Exported for the migration test only. */
export function resetFocusBackupCheckForTests(): void {
  focusBackupChecked = false;
}

export function persistPlannerData(data: PlannerData): void {
  // Keep the original local snapshot before the first focus-v2 rewrite.
  // A failed backup aborts this write rather than discarding the only source.
  if (!focusBackupChecked) {
    if (!platform.storage.getSync(FOCUS_V2_BACKUP_KEY)) {
      const previous = platform.storage.getSync(PLANNER_STORAGE_KEY);
      if (previous) {
        let legacy = false;
        try { const parsed = JSON.parse(previous); legacy = Array.isArray(parsed.focusSessions) && parsed.focusSessions.some((s: {schemaVersion?:number}) => !s.schemaVersion || s.schemaVersion < 2); } catch { /* Existing malformed data is not a migration source. */ }
        if (legacy) platform.storage.setSync(FOCUS_V2_BACKUP_KEY, previous);
      }
    }
    // Only once the look is complete: a backup write that threw leaves this
    // unset, so the next attempt still has the legacy source to find.
    focusBackupChecked = true;
  }
  platform.storage.setSync(PLANNER_STORAGE_KEY, JSON.stringify(data));
  // This call intentionally follows the write. If persistence throws, the
  // legacy source stays unmarked and remains available for the next launch.
  markLegacyLocalSpacesMigrated();
}
