// Learning Paths started as an AI-side concept and still live next to their
// drafting siblings, but since the Horizons page they are ordinary user data
// that has to sync. This file is otherwise import-free on purpose; the two
// type-only references below are the exceptions, and neither introduces a
// cycle (learningPaths/types.ts reaches only contextCards/types.ts, which
// imports nothing; spaceHubTypes.ts imports nothing at all).
import type { GoalLink, GoalSchedule, LearningPath, Milestone } from "./lib/ai/learningPaths/types";
// Space notes joined the synced dataset for the same reason Learning Paths did
// (SPACES_CLICKUP_REDESIGN.md D9): they are user writing, and writing that
// lives on one device is writing the user loses.
import type { SpaceNote } from "./lib/spaceHubTypes";

export type { GoalLink, GoalSchedule, LearningPath, Milestone, SpaceNote };

// === Task lifecycle (spec §4.1) ===
// Canonical MVP statuses: inbox -> todo -> doing -> waiting -> done -> archived.
// `in_progress` and `blocked` are LEGACY values kept in the union so non-MVP
// (hidden) screens still compile; stored data is migrated away from them on load.
export type TaskStatus =
  | "inbox"
  | "todo"
  | "doing"
  | "waiting"
  | "done"
  | "archived"
  | "in_progress"
  | "blocked";
export type TaskPriority = "none" | "low" | "medium" | "high";
export type RepeatType = "none" | "daily" | "weekly" | "monthly";
export type FocusMode = "focus" | "short_break" | "long_break";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  // Dates use "" as the "not set" sentinel (kept as string for legacy callers).
  dueDate: string; // deadline (YYYY-MM-DD)
  scheduledDate: string; // planned work date (YYYY-MM-DD)
  startTime: string;
  endTime: string;
  projectId: string;
  // Calendar category id ("" = unset; display falls back to the project
  // category, then the default personal category).
  categoryId: string;
  parentTaskId: string;
  tags: string[];
  notes: string;
  // Expected effort in minutes (0 = unset). Drives the default calendar
  // block length when a task is dragged onto the time grid.
  estimatedMinutes: number;
  actualSeconds: number;
  activeSessionId: string;
  lastFocusedAt: string;
  isSomeday: boolean;
  waitingReason: string;
  waitingFollowUpDate: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string; // set only when status becomes done
  archivedAt?: string; // set only when status becomes archived
  deletedAt?: string; // optional soft-delete marker
  previousStatus?: TaskStatus; // used for undo/restore
  blockedByTaskId: string;
  repeatType: RepeatType;
  repeatInterval: number;
  repeatDays: number[];
  repeatEndDate: string;
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ProjectStatus = "active" | "paused" | "completed" | "archived";
export type ProjectType = "project" | "area";

export interface BoardList {
  id: string;
  name: string;
  order: number;
  archivedAt?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  notes?: string;
  color: string;
  type?: ProjectType;
  icon?: string;
  dueDate?: string;
  pinned?: boolean;
  order?: number;
  status?: ProjectStatus;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  boardLists?: BoardList[];
}

// One uninterrupted running stretch of a focus session. Pauses close a
// segment; resume opens the next one. This is what the calendar's
// "actual focus time" blocks are drawn from.
export interface FocusSegment {
  startAt: string;
  endAt: string;
}

export interface FocusSession {
  id: string;
  taskId: string;
  title: string;
  mode: FocusMode;
  status: "running" | "paused" | "completed" | "cancelled";
  durationMinutes: number;
  accumulatedSeconds: number;
  completed: boolean;
  startAt: string;
  endAt: string;
  startedAt: string;
  endedAt: string;
  pausedAt: string;
  segments: FocusSegment[];
  source: "focus_page" | "today_page" | "calendar_event" | "global_bar";
  projectId: string;
  projectName: string;
  focusNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlannerSettings {
  id: string;
  theme: "system" | "light" | "dark";
  externalCalendars?: ExternalCalendar[];
  createdAt: string;
  updatedAt: string;
}

// === App settings (spec §4.7) ===
export type AccentColor = "blue" | "purple" | "green" | "pink" | "orange";
export type ThemeMode = "light" | "dark" | "system";
export type FontSize = "small" | "medium" | "large";
export type Language = "ko" | "en";

export interface AppSettings {
  theme: ThemeMode;
  accentColor: AccentColor;
  fontSize: FontSize;
  language: Language;
  defaultView: "/today" | "/inbox" | "/calendar" | "/planning" | "/projects" | "/focus";
  showCompletedInToday: boolean;
  confirmBeforeDelete: boolean;
  showSidebarCounts: boolean;
  sidebarCollapsed: boolean;
  reduceMotion: boolean;
  // Legacy Ollama model preference. No UI sets it since the managed
  // llama-server replaced Ollama chat (LOCAL_AI_SYSTEM_DESIGN.md Phase 4);
  // kept so synced settings from older clients still normalize cleanly.
  aiModel: string;
}

export type ExternalCalendarSyncStatus = "idle" | "syncing" | "success" | "failed" | "hidden" | "disabled";

export interface ExternalCalendar {
  id: string;
  name: string;
  icsUrl: string;
  color: string;
  visible: boolean;
  enabled: boolean;
  syncStatus?: ExternalCalendarSyncStatus;
  lastSyncedAt?: string;
  lastAttemptedAt?: string;
  lastError?: string;
  eventCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalCalendarEvent {
  id: string;
  externalCalendarId: string;
  externalUid: string;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end?: string;
  allDay: boolean;
  timezone?: string;
  sourceUrl?: string;
  readOnly: true;
  createdAt: string;
  updatedAt: string;
}

// Loose shape for seed/imported/persisted data before normalization: every
// collection may hold partial records and any top-level key may be omitted.
export type RawPlannerData = {
  [K in keyof PlannerData]?: PlannerData[K] extends Array<infer T>
    ? Array<Partial<T>>
    : Partial<PlannerData[K]>;
};

export interface PlannerData {
  tasks: Task[];
  projects: Project[];
  subtasks: Subtask[];
  focusSessions: FocusSession[];
  activeSessionId: string;
  learningPaths: LearningPath[];
  spaceNotes: SpaceNote[];
  settings: PlannerSettings;
  appSettings: AppSettings;
}

export type PageId =
  | "today"
  | "projects"
  | "focus"
  | "planning"
  | "horizons"
  | "archive"
  | "settings"
  | "calendar";

export interface TaskDraft {
  title: string;
  description?: string;
  dueDate?: string;
  scheduledDate?: string;
  startTime?: string;
  endTime?: string;
  projectId?: string;
  categoryId?: string;
  parentTaskId?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  tags?: string[];
  notes?: string;
  estimatedMinutes?: number;
  actualSeconds?: number;
  activeSessionId?: string;
  lastFocusedAt?: string;
  waitingReason?: string;
  waitingFollowUpDate?: string;
  blockedByTaskId?: string;
  repeatType?: RepeatType;
  repeatInterval?: number;
  repeatDays?: number[];
  repeatEndDate?: string;
}
