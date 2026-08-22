import type { PlannerData } from "../../types";
import { platform } from "../../platform";
import { markLegacyLocalSpacesMigrated } from "../../lib/spaces/legacyLocalSpaces";

export const PLANNER_STORAGE_KEY = "focusflow.appData.v1";

export function persistPlannerData(data: PlannerData): void {
  platform.storage.setSync(PLANNER_STORAGE_KEY, JSON.stringify(data));
  // This call intentionally follows the write. If persistence throws, the
  // legacy source stays unmarked and remains available for the next launch.
  markLegacyLocalSpacesMigrated();
}
