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
export type TaskLevel = "high" | "low";
export type RepeatType = "none" | "daily" | "weekly" | "monthly";
export type HabitFrequency = "daily" | "weekly";
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
  importance: TaskLevel;
  urgency: TaskLevel;
  isFocus: boolean;
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
}

// === Study (spec §4.4 / §4.5) ===
export type StudyTopicCategory =
  | "Python"
  | "LeetCode"
  | "Research"
  | "fNIRS"
  | "English"
  | "Presentation"
  | "Other";

export interface StudyTopic {
  id: string;
  name: string;
  category: StudyTopicCategory;
  description: string;
  status: "active" | "paused" | "mastered" | "archived";
  color: string;
  icon?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export type NoteType = "concept" | "leetcode" | "research" | "english" | "presentation" | "other";
export type NoteDifficulty = "unknown" | "hard" | "medium" | "easy";
export type StoredReviewStatus = "not_scheduled" | "reviewed" | "mastered";
export type ComputedReviewStatus = "not_scheduled" | "due" | "upcoming" | "reviewed" | "mastered";
export type ReviewDifficulty = "hard" | "medium" | "easy" | "mastered";

export interface ReviewHistoryItem {
  id: string;
  reviewedAt: string;
  difficulty: ReviewDifficulty;
  previousNextReviewDate?: string;
  nextReviewDate?: string;
}

export interface LeetCodeNoteFields {
  problemNumber?: string;
  problemTitle?: string;
  pattern?: string;
  dataStructure?: string;
  coreIdea?: string;
  wrongApproach?: string;
  correctApproach?: string;
  pythonSyntax?: string;
  timeComplexity?: string;
  spaceComplexity?: string;
  relatedProblems?: string[];
}

export interface ResearchNoteFields {
  concept?: string;
  definition?: string;
  whyItMatters?: string;
  methodOrFormula?: string;
  paperSource?: string;
  relatedConcepts?: string[];
  openQuestion?: string;
}

export interface EnglishPresentationNoteFields {
  expression?: string;
  meaning?: string;
  useCase?: string;
  mySentence?: string;
  presentationContext?: string;
  similarExpressions?: string[];
}

export interface ConceptNote {
  id: string;
  topicId: string;
  title: string;
  noteType: NoteType;
  summary: string;
  content: string;
  examples: string;
  personalExplanation: string;
  confusionPoint: string;
  difficulty: NoteDifficulty;
  reviewStatus: StoredReviewStatus;
  nextReviewDate: string;
  lastReviewedAt: string;
  reviewHistory: ReviewHistoryItem[];
  leetcode?: LeetCodeNoteFields;
  research?: ResearchNoteFields;
  english?: EnglishPresentationNoteFields;
  source: string;
  tags: string[];
  order: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Habit {
  id: string;
  name: string;
  description: string;
  frequency: HabitFrequency;
  targetCount: number;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface HabitLog {
  id: string;
  habitId: string;
  date: string;
  completed: boolean;
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

export interface TaskTemplate {
  id: string;
  name: string;
  title: string;
  description: string;
  priority: TaskPriority;
  projectId: string;
  tags: string[];
  notes: string;
  subtasks: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PlannerSettings {
  id: string;
  theme: "system" | "light" | "dark";
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
  defaultView: "/today" | "/inbox";
  showCompletedInToday: boolean;
  confirmBeforeDelete: boolean;
  showSidebarCounts: boolean;
  sidebarCollapsed: boolean;
  reduceMotion: boolean;
}

export type RecentItemType = "task" | "project" | "topic" | "note";

export interface RecentItem {
  id: string;
  type: RecentItemType;
  refId: string;
  title: string;
  openedAt: string;
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
  studyTopics: StudyTopic[];
  conceptNotes: ConceptNote[];
  habits: Habit[];
  habitLogs: HabitLog[];
  focusSessions: FocusSession[];
  activeSessionId: string;
  taskTemplates: TaskTemplate[];
  recentItems: RecentItem[];
  settings: PlannerSettings;
  appSettings: AppSettings;
}

export type PageId =
  | "today"
  | "projects"
  | "focus"
  | "planning"
  | "study"
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
  importance?: TaskLevel;
  urgency?: TaskLevel;
  isFocus?: boolean;
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
