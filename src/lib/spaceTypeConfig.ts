import type { SpaceCustomConfig, SpaceHubType, SpaceSectionGroup, SpaceTypePreset } from "./spaceHubTypes";

// Space type presets (§27). Users edit labels/groups via SpaceCustomConfig,
// never the preset itself (§2.4).
export const spaceTypePresets: Record<SpaceHubType, SpaceTypePreset> = {
  project: {
    headerSubtitle: "Hub for the work in progress",
    addTaskLabel: "+ Task",
    addNoteLabel: "+ Note",
    scheduleLabel: "Schedule",
    startFocusLabel: "Start Focus",
    primaryTaskSectionLabel: "Tasks for this Space",
    nextActionLabel: "Next Action",
    signalLabel: "Current Signal",
    focusTimeLabel: "Project Focus",
    upcomingLabel: "Upcoming",
    taskGroups: ["In Progress", "To Schedule", "Blocked", "Review Needed", "Done"],
    noteTypes: ["Meeting Note", "Feedback", "Decision", "Design Link", "Reference"],
    focusCategories: ["Development", "Design", "Planning", "Review"],
    aiSummaryLabel: "AI Space Summary",
  },
  study: {
    headerSubtitle: "Space for study and problem solving",
    addTaskLabel: "+ Study Task",
    addNoteLabel: "+ Study Note",
    scheduleLabel: "Schedule Review",
    startFocusLabel: "Start Study",
    primaryTaskSectionLabel: "Study Queue",
    nextActionLabel: "Next Study Action",
    signalLabel: "Study Signal",
    focusTimeLabel: "Study Time",
    upcomingLabel: "Upcoming Review",
    taskGroups: ["Today Study", "Review Due", "Problems", "Concepts", "Wrong Notes", "Completed"],
    noteTypes: ["Concept Note", "Wrong Answer Note", "Pattern Summary", "Reference"],
    focusCategories: ["Problem Solving", "Review", "Concept", "Mock Test"],
    aiSummaryLabel: "AI Study Summary",
  },
  research: {
    headerSubtitle: "Space for papers and experiments",
    addTaskLabel: "+ Research Task",
    addNoteLabel: "+ Paper Note",
    scheduleLabel: "Schedule",
    startFocusLabel: "Start Research",
    primaryTaskSectionLabel: "Research Tasks",
    nextActionLabel: "Next Research Step",
    signalLabel: "Research Signal",
    focusTimeLabel: "Research Time",
    upcomingLabel: "Upcoming Research",
    taskGroups: ["Literature", "Experiment", "Analysis", "Writing", "Revision", "Submission"],
    noteTypes: ["Paper Note", "Literature Summary", "Supervisor Feedback", "Experiment Note", "Citation"],
    focusCategories: ["Reading", "Writing", "Experiment", "Analysis", "Meeting", "Revision"],
    aiSummaryLabel: "AI Research Summary",
  },
  personal: {
    headerSubtitle: "Space for routines and life admin",
    addTaskLabel: "+ Task",
    addNoteLabel: "+ Note",
    scheduleLabel: "Schedule",
    startFocusLabel: "Start",
    primaryTaskSectionLabel: "Personal Tasks",
    nextActionLabel: "Next Action",
    signalLabel: "Personal Signal",
    focusTimeLabel: "Time Spent",
    upcomingLabel: "Upcoming",
    taskGroups: ["Today", "Routine", "Quick Tasks", "Errands", "Waiting", "Done"],
    noteTypes: ["Quick Note", "Checklist", "Reminder", "Reference", "Link"],
    focusCategories: ["Routine", "Life Admin", "Reading", "Health", "Errand"],
    aiSummaryLabel: "AI Personal Summary",
  },
  custom: {
    headerSubtitle: "Flexible space for your own work",
    addTaskLabel: "+ Task",
    addNoteLabel: "+ Note",
    scheduleLabel: "Schedule",
    startFocusLabel: "Start Focus",
    primaryTaskSectionLabel: "Tasks for this Space",
    nextActionLabel: "Next Action",
    signalLabel: "Current Signal",
    focusTimeLabel: "Focus Time",
    upcomingLabel: "Upcoming",
    taskGroups: ["In Progress", "To Schedule", "Waiting", "Done"],
    noteTypes: ["Quick Note", "Reference", "Link", "Decision"],
    focusCategories: ["Work", "Review", "Planning"],
    aiSummaryLabel: "AI Space Summary",
  },
};

export function getSpacePreset(type: string): SpaceTypePreset {
  return spaceTypePresets[(type as SpaceHubType) in spaceTypePresets ? (type as SpaceHubType) : "custom"];
}

// Preset + user overrides -> the labels/groups the UI actually renders.
export function resolveTaskGroups(preset: SpaceTypePreset, config: SpaceCustomConfig): SpaceSectionGroup[] {
  if (config.sectionGroups && config.sectionGroups.length > 0) {
    return [...config.sectionGroups].sort((a, b) => a.order - b.order);
  }
  return preset.taskGroups.map((label, index) => ({ id: `preset-${index}`, label, order: index }));
}
