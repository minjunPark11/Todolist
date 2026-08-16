// Learning Paths started as an AI-side concept and still live next to their
// drafting siblings, but since the Horizons page they are ordinary user data
// that has to sync. This file is otherwise import-free on purpose; the two
// type-only references below are the exceptions, and neither introduces a
// cycle (learningPaths/types.ts reaches only contextCards/types.ts, which
// imports nothing; spaceHubTypes.ts imports nothing at all).
import type { GoalLink, GoalSchedule, LearningPath, Milestone } from "./lib/ai/learningPaths/types";

export type { GoalLink, GoalSchedule, LearningPath, Milestone };

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
  /**
   * When the work BEGINS (YYYY-MM-DD, "" = unset). Added for the timeline,
   * which needs a span and not a point.
   *
   * Deliberately not the same thing as `scheduledDate`: a task can start on
   * Monday and be due Friday while the day actually blocked out on the
   * calendar is Wednesday. Folding the two together would make every
   * multi-day task either lose its span or lie about its calendar block.
   *
   * Additive only (M0). It rides inside the `data` jsonb, so no table change
   * is needed, and `normalizeTask` spreads unknown fields first — which is
   * what lets a client that predates this field carry it instead of erasing
   * it (a29a8f7).
   */
  startDate: string;
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
  // === Space hierarchy (P4) ===
  // Written only when the answer stops being derivable — when the task is
  // moved into a List other than its Space's default, or onto a status the
  // user invented. Resolve through membership.listIdFor / statusIdFor rather
  // than reading these directly; `projectId` and `status` still answer when
  // they are absent, which is the normal case.
  listId?: string;
  statusId?: string;
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

// === Space hierarchy (SPACES_CLICKUP_REDESIGN.md §4) ===
//
// Space -> Folder? -> List -> Item. Folder is optional, so a List may hang
// straight off a Space (D4); that is the shape ClickUp calls a Folderless
// List, and it is what keeps simple use from paying for the hierarchy.
//
// Only the two NEW collections live here so far. The Space itself is still the
// existing `Project` record and gains its fields in P4: adding a field to a
// record an older client already syncs would have that client erase it, which
// is the whole point of M0 (§5). A brand-new table has no such problem — a
// client that has never heard of it simply leaves it alone.

/**
 * A workflow stage. The label is the user's, but `group` is the app's: it is
 * how "does this count as finished" stays answerable no matter what someone
 * names their columns (D7).
 *
 * Four groups, always on. ClickUp ships three and puts Not Started behind a
 * toggle; a per-user toggle for a status group would just be one more decision
 * to make in an app with one user, and `inbox` already occupies that slot.
 */
export type StatusGroup = "notStarted" | "active" | "done" | "closed";

export interface Status {
  id: string;
  label: string;
  color: string;
  order: number;
  group: StatusGroup;
}

/** Optional grouping inside a Space. Absent until someone makes one (D4). */
export interface Folder {
  id: string;
  spaceId: string;
  name: string;
  order: number;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface List {
  id: string;
  /**
   * Always set, even when the List sits inside a Folder. Reaching the Space
   * through the Folder would make every lookup a two-hop join, and a
   * Folderless List could not be resolved that way at all.
   */
  spaceId: string;
  /** Absent for a Folderless List (D4). */
  folderId?: string;
  name: string;
  order: number;
  /**
   * Created with the Space and not deletable, so an Item always has somewhere
   * to be (D5). It is also what lets the UI hide the List level entirely until
   * a second List exists (SPACES_CLICKUP_UI_DESIGN U2).
   */
  isDefault: boolean;
  /** Overrides the Space's set when present; inherits when absent (D7). */
  statuses?: Status[];
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProjectStatus = "active" | "paused" | "completed" | "archived";
export type ProjectType = "project" | "area";

/**
 * A status the user added to a Space, stored in the reduced form it was first
 * written in — `membership.statusesWithCustom` supplies the colour and the
 * group the full `Status` needs.
 *
 * Not a `List`. A List is where an Item is stored; this is a column it can be
 * shown in. The two shared the word "board list" until the hierarchy arrived
 * and made the collision expensive.
 */
export interface CustomStatus {
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
  /**
   * The statuses the user added. Keyed `boardLists` because that is what it
   * was called when the field started syncing, and a renamed key is a key an
   * older client erases (M0). Read together with `statuses` below.
   */
  boardLists?: CustomStatus[];
  // === Space fields (P4, SPACES_CLICKUP_REDESIGN D1/D7) ===
  // A Project IS the Space; the record keeps its id so Task.projectId,
  // LearningPath.projectId, calendar categories and space:<id> tags all keep
  // pointing at the same thing.
  //
  // All optional, and none is backfilled. A Space that has never been edited
  // stores nothing new, so this migration rewrites no records at all — see
  // domain/spaces/membership.ts for why that matters.
  /** Absent means the default set (membership.statusesForSpace). */
  statuses?: Status[];
  /** Feature toggles, inherited from AppSettings when absent. */
  features?: Record<string, boolean>;
  /** One-way once a second List has existed (SPACES_CLICKUP_UI_DESIGN U2). */
  listsRevealed?: boolean;
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
  // "/planning" is LEGACY: the Planning page became the Board's quadrant
  // grouping, but the value is already stored in accounts, so it stays in the
  // union and resolves to the Board rather than dropping those users on Today.
  defaultView: "/today" | "/inbox" | "/calendar" | "/board" | "/planning" | "/projects" | "/focus";
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
  folders: Folder[];
  lists: List[];
  settings: PlannerSettings;
  appSettings: AppSettings;
}

export type PageId =
  | "today"
  | "projects"
  | "focus"
  | "board"
  | "timeline"
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
  /** Keeps a child in the same List as its parent (domain/tasks/children.ts). */
  listId?: string;
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
