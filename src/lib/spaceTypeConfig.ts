import type { SpaceHubType, SpaceSectionGroup, SpaceTypePreset } from "./spaceHubTypes";

// Space type presets (§27). Users edit labels/groups via SpaceCustomConfig,
// never the preset itself (§2.4).
export const spaceTypePresets: Record<SpaceHubType, SpaceTypePreset> = {
  project: {
    headerSubtitle: "Hub for the work in progress",
    addTaskLabel: "+ Task",
    addNoteLabel: "+ Note",
    startFocusLabel: "Start Focus",
    primaryTaskSectionLabel: "Tasks for this Space",
    nextActionLabel: "Next Action",
    signalLabel: "Current Signal",
    focusTimeLabel: "Project Focus",
    upcomingLabel: "Upcoming",
    taskGroups: ["In Progress", "To Schedule", "Blocked", "Review Needed", "Done"],
    noteTypes: ["Meeting Note", "Feedback", "Decision", "Design Link", "Reference"],
    emptyTaskExamples: "Outline the paper · Read prior research",
  },
  personal: {
    headerSubtitle: "Space for routines and life admin",
    addTaskLabel: "+ Task",
    addNoteLabel: "+ Note",
    startFocusLabel: "Start",
    primaryTaskSectionLabel: "Personal Tasks",
    nextActionLabel: "Next Action",
    signalLabel: "Personal Signal",
    focusTimeLabel: "Time Spent",
    upcomingLabel: "Upcoming",
    taskGroups: ["Today", "Routine", "Quick Tasks", "Errands", "Waiting", "Done"],
    noteTypes: ["Quick Note", "Checklist", "Reminder", "Reference", "Link"],
    emptyTaskExamples: "Make a grocery list · 30-minute workout",
  },
  custom: {
    headerSubtitle: "Flexible space for your own work",
    addTaskLabel: "+ Task",
    addNoteLabel: "+ Note",
    startFocusLabel: "Start Focus",
    primaryTaskSectionLabel: "Tasks for this Space",
    nextActionLabel: "Next Action",
    signalLabel: "Current Signal",
    focusTimeLabel: "Focus Time",
    upcomingLabel: "Upcoming",
    taskGroups: ["In Progress", "To Schedule", "Waiting", "Done"],
    noteTypes: ["Quick Note", "Reference", "Link", "Decision"],
    emptyTaskExamples: "Write down today's tasks · Gather references",
  },
};

export function getSpacePreset(type: string): SpaceTypePreset {
  return spaceTypePresets[(type as SpaceHubType) in spaceTypePresets ? (type as SpaceHubType) : "custom"];
}

// Task groups are presentation labels supplied by the space preset. Custom
// synced goal lists belong to the Board model instead of this local config.
export function resolveTaskGroups(preset: SpaceTypePreset): SpaceSectionGroup[] {
  return preset.taskGroups.map((label, index) => ({ id: `preset-${index}`, label, order: index }));
}
