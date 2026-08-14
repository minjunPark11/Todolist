// The slice of planner state the assistant UI needs for Learning Paths.
//
// Passed as one object rather than six separate props: these three always
// travel together, and grouping them keeps the seam obvious now that paths are
// synced planner data instead of a module-level local store the components
// could reach into directly (HORIZONS_DESIGN.md D3).
import type { LearningPath } from "../../types";
import type { LearningPathDraft } from "../../lib/ai/learningPaths/types";

export interface LearningPathStore {
  /** Newest-updated first; [0] is the path the breadcrumb follows. */
  paths: LearningPath[];
  /** Returns the stored record so the caller can render it immediately. */
  savePath: (draft: LearningPathDraft, source?: LearningPath["source"]) => LearningPath | null;
  /** Idempotent; returns the updated path, or null when the target is gone. */
  linkCard: (pathId: string, milestoneId: string, cardId: string) => LearningPath | null;
}
