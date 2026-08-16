// Display-time translation for the Space detail hub.
//
// Preset labels, task-group labels, and note types double as stable identity
// keys in the selectors/config (e.g. resolveTaskGroupLabel matches on the
// English "Done"/"Blocked" strings, group filters store the raw label). We keep
// those English values as the source of truth and translate only at render time
// via the maps below. Unknown values (user-created groups/note types) fall
// through untouched so custom input still shows exactly what the user typed.
import type { SpaceTab } from "./spaceHubTypes";
import type { ProjectType } from "../types";

type TFn = (key: string, vars?: Record<string, string | number>) => string;

const PRESET_KEY: Record<string, string> = {
  "Hub for the work in progress": "spaceHub.preset.subtitleProject",
  "Space for study and problem solving": "spaceHub.preset.subtitleStudy",
  "Space for routines and life admin": "spaceHub.preset.subtitlePersonal",
  "Flexible space for your own work": "spaceHub.preset.subtitleCustom",
  "+ Task": "spaceHub.preset.addTask",
  "+ Study Task": "spaceHub.preset.addStudyTask",
  "+ Note": "spaceHub.preset.addNote",
  "+ Study Note": "spaceHub.preset.addStudyNote",
  Schedule: "spaceHub.preset.schedule",
  "Schedule Review": "spaceHub.preset.scheduleReview",
  "Start Focus": "spaceHub.preset.startFocus",
  "Start Study": "spaceHub.preset.startStudy",
  Start: "spaceHub.preset.start",
  "Tasks for this Space": "spaceHub.preset.tasksForSpace",
  "Study Queue": "spaceHub.preset.studyQueue",
  "Personal Tasks": "spaceHub.preset.personalTasks",
  "Next Action": "spaceHub.preset.nextAction",
  "Next Study Action": "spaceHub.preset.nextStudyAction",
  "Current Signal": "spaceHub.preset.currentSignal",
  "Study Signal": "spaceHub.preset.studySignal",
  "Personal Signal": "spaceHub.preset.personalSignal",
  "Project Focus": "spaceHub.preset.projectFocus",
  "Study Time": "spaceHub.preset.studyTime",
  "Focus Time": "spaceHub.preset.focusTime",
  "Time Spent": "spaceHub.preset.timeSpent",
  Upcoming: "spaceHub.preset.upcoming",
  "Upcoming Review": "spaceHub.preset.upcomingReview",
  "AI Space Summary": "spaceHub.preset.aiSpaceSummary",
  "AI Study Summary": "spaceHub.preset.aiStudySummary",
  "AI Personal Summary": "spaceHub.preset.aiPersonalSummary",
  "Outline the paper · Read prior research": "spaceHub.preset.taskExamplesProject",
  "Review wrong answers · Revisit key concepts": "spaceHub.preset.taskExamplesStudy",
  "Make a grocery list · 30-minute workout": "spaceHub.preset.taskExamplesPersonal",
  "Write down today's tasks · Gather references": "spaceHub.preset.taskExamplesCustom",
};

const GROUP_KEY: Record<string, string> = {
  "In Progress": "spaceHub.group.inProgress",
  "To Schedule": "spaceHub.group.toSchedule",
  Blocked: "spaceHub.group.blocked",
  "Review Needed": "spaceHub.group.reviewNeeded",
  Done: "spaceHub.group.done",
  "Today Study": "spaceHub.group.todayStudy",
  "Review Due": "spaceHub.group.reviewDue",
  Problems: "spaceHub.group.problems",
  Concepts: "spaceHub.group.concepts",
  "Wrong Notes": "spaceHub.group.wrongNotes",
  Completed: "spaceHub.group.completed",
  Literature: "spaceHub.group.literature",
  Experiment: "spaceHub.group.experiment",
  Analysis: "spaceHub.group.analysis",
  Writing: "spaceHub.group.writing",
  Revision: "spaceHub.group.revision",
  Submission: "spaceHub.group.submission",
  Today: "spaceHub.group.today",
  Routine: "spaceHub.group.routine",
  "Quick Tasks": "spaceHub.group.quickTasks",
  Errands: "spaceHub.group.errands",
  Waiting: "spaceHub.group.waiting",
  Work: "spaceHub.group.work",
};

export function presetText(t: TFn, value: string): string {
  const key = PRESET_KEY[value];
  return key ? t(key) : value;
}

export function groupText(t: TFn, value: string): string {
  const key = GROUP_KEY[value];
  return key ? t(key) : value;
}

export function tabText(t: TFn, tab: SpaceTab): string {
  return t(`spaceHub.tab.${tab}`);
}

export function hubTypeText(t: TFn, type: ProjectType): string {
  return t(`spaceHub.hubType.${type}`);
}

export function upcomingKindText(t: TFn, kind: string): string {
  return t(`spaceHub.kind.${kind}`);
}
