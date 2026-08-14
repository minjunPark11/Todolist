// Assembles the AI-readable snapshot of app data from the planner store, so
// UI components (App.tsx today, the AI Assistant surface later) hand the AI
// layer one value instead of plucking a dozen fields inline. This is the
// single place to grow/shrink what the AI is allowed to read.
import type { AiContextInput } from "../../lib/ai/context/buildAiContext";
import type {
  AppSettings,
  FocusSession,
  PageId,
  PlannerSettings,
  Project,
  Subtask,
  Task,
} from "../../types";

// Structural subset of usePlannerData's return value — only the data the AI
// may read, none of the mutators.
export type AiReadablePlannerData = {
  tasks: Task[];
  projects: Project[];
  subtasks: Subtask[];
  focusSessions: FocusSession[];
  activeSessionId: string;
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
    focusSessions: planner.focusSessions,
    activeSessionId: planner.activeSessionId,
    settings: planner.settings,
    appSettings,
  };
}
