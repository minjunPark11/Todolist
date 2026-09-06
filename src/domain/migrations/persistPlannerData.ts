import type { PlannerData } from "../../types";
import { platform } from "../../platform";
import { markLegacyLocalSpacesMigrated } from "../../lib/spaces/legacyLocalSpaces";

export const PLANNER_STORAGE_KEY = "focusflow.appData.v1";
export const FOCUS_V2_BACKUP_KEY = "focusflow.focus.v2.backup";

export function persistPlannerData(data: PlannerData): void {
  // Keep the original local snapshot before the first focus-v2 rewrite.
  // A failed backup aborts this write rather than discarding the only source.
  if (!platform.storage.getSync(FOCUS_V2_BACKUP_KEY)) {
    const previous = platform.storage.getSync(PLANNER_STORAGE_KEY);
    if (previous) {
      let legacy = false;
      try { const parsed = JSON.parse(previous); legacy = Array.isArray(parsed.focusSessions) && parsed.focusSessions.some((s: {schemaVersion?:number}) => !s.schemaVersion || s.schemaVersion < 2); } catch { /* Existing malformed data is not a migration source. */ }
      if (legacy) platform.storage.setSync(FOCUS_V2_BACKUP_KEY, previous);
    }
  }
  platform.storage.setSync(PLANNER_STORAGE_KEY, JSON.stringify(data));
  // This call intentionally follows the write. If persistence throws, the
  // legacy source stays unmarked and remains available for the next launch.
  markLegacyLocalSpacesMigrated();
}
