// Assembles the AI-readable snapshot of app data from the planner store, so
// UI components (App.tsx today, the AI Assistant surface later) hand the AI
// layer one value instead of plucking a dozen fields inline. This is the
// single place to grow/shrink what the AI is allowed to read.
import type { AiContextInput } from "../../lib/ai/context/buildAiContext";
import type {
  AppSettings,
  ConceptNote,
  FocusSession,
  Habit,
  HabitLog,
  PageId,
  PlannerSettings,
  Project,
  RecentItem,
  StudyTopic,
  Subtask,
  Task,
  TaskTemplate,
} from "../../types";

// Structural subset of usePlannerData's return value — only the data the AI
// may read, none of the mutators.
export type AiReadablePlannerData = {
  tasks: Task[];
  projects: Project[];
  subtasks: Subtask[];
  studyTopics: StudyTopic[];
  conceptNotes: ConceptNote[];
  habits: Habit[];
  habitLogs: HabitLog[];
  focusSessions: FocusSession[];
  activeSessionId: string;
  taskTemplates: TaskTemplate[];
  recentItems: RecentItem[];
  settings: PlannerSettings;
  auth: { userEmail: string };
};

export function buildAiContextInput(args: {
  planner: AiReadablePlannerData;
  appSettings: AppSettings;
  currentPage: PageId;
}): Omit<AiContextInput, "calendarContextText"> {
  const { planner, appSettings, currentPage } = args;
  return {
    currentPage,
    userId: planner.auth.userEmail || "local-user",
    tasks: planner.tasks,
    projects: planner.projects,
    subtasks: planner.subtasks,
    studyTopics: planner.studyTopics,
    conceptNotes: planner.conceptNotes,
    habits: planner.habits,
    habitLogs: planner.habitLogs,
    focusSessions: planner.focusSessions,
    activeSessionId: planner.activeSessionId,
    taskTemplates: planner.taskTemplates,
    recentItems: planner.recentItems,
    settings: planner.settings,
    appSettings,
  };
}
