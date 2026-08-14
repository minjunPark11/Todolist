import type { PlannerData } from "../../types";

// Settings are not user records and should not make an otherwise empty
// account look migratable. Learning paths are ordinary synced goal records.
export function countPlannerDataItems(
  data: Pick<PlannerData, "tasks" | "projects" | "subtasks" | "focusSessions" | "learningPaths">,
): number {
  return (
    data.tasks.length +
    data.projects.length +
    data.subtasks.length +
    data.focusSessions.length +
    data.learningPaths.length
  );
}
