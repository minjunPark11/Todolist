import type { SpaceSectionGroup, SpaceTypePreset } from "./spaceHubTypes";
import type { ProjectType } from "../types";

// Space type presets (§27). Users edit labels/groups via SpaceCustomConfig,
// never the preset itself (§2.4).
//
// Keyed by the stored `ProjectType` now (SPACES_REDESIGN_II §0.3.8). The
// "personal" preset is gone: no code path could produce that type, so it was a
// third of this table that no space could ever be shown with. "custom" is
// renamed to "area", which is the value the record actually stores — an area
// of standing work, as opposed to a project with a deliverable.
export const spaceTypePresets: Record<ProjectType, SpaceTypePreset> = {
  project: {
    headerSubtitle: "Hub for the work in progress",
    addTaskLabel: "+ Task",
    startFocusLabel: "Start Focus",
    primaryTaskSectionLabel: "Tasks for this Space",
    nextActionLabel: "Next Action",
    signalLabel: "Current Signal",
    focusTimeLabel: "Project Focus",
    upcomingLabel: "Upcoming",
    taskGroups: ["In Progress", "To Schedule", "Blocked", "Review Needed", "Done"],    emptyTaskExamples: "Outline the paper · Read prior research",
  },
  area: {
    headerSubtitle: "Flexible space for your own work",
    addTaskLabel: "+ Task",
    startFocusLabel: "Start Focus",
    primaryTaskSectionLabel: "Tasks for this Space",
    nextActionLabel: "Next Action",
    signalLabel: "Current Signal",
    focusTimeLabel: "Focus Time",
    upcomingLabel: "Upcoming",
    taskGroups: ["In Progress", "To Schedule", "Waiting", "Done"],    emptyTaskExamples: "Write down today's tasks · Gather references",
  },
};

/**
 * A Project with no stored `type` is a project — that is what `inferProjectType`
 * has always answered, and the preset table must not disagree with it.
 */
export function getSpacePreset(type: ProjectType | undefined): SpaceTypePreset {
  return spaceTypePresets[type === "area" ? "area" : "project"];
}

// Task groups are presentation labels supplied by the space preset. Custom
// synced goal lists belong to the Board model instead of this local config.
export function resolveTaskGroups(preset: SpaceTypePreset): SpaceSectionGroup[] {
  return preset.taskGroups.map((label, index) => ({ id: `preset-${index}`, label, order: index }));
}
