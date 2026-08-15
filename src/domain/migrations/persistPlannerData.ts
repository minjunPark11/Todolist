import type { PlannerData } from "../../types";
import { platform } from "../../platform";
import { markLegacyLearningPathsMigratedIfAdopted } from "../../lib/ai/learningPaths/store";
import { markLegacyLocalSpacesMigrated } from "../../lib/spaces/legacyLocalSpaces";

export const PLANNER_STORAGE_KEY = "focusflow.appData.v1";

export function persistPlannerData(data: PlannerData): void {
  platform.storage.setSync(PLANNER_STORAGE_KEY, JSON.stringify(data));
  // These calls intentionally follow the write. If persistence throws, the
  // legacy sources stay unmarked and remain available for the next launch.
  markLegacyLearningPathsMigratedIfAdopted(data.learningPaths);
  markLegacyLocalSpacesMigrated();
}
