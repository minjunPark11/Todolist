// Space Detail work-hub models (SPACE_DETAIL_COMPLETE_IMPLEMENTATION_SPEC §29).
// Spaces themselves are derived from projects/study topics on SpacesPage; the
// hub adds notes, activity records, and per-space customization on top.

export type SpaceHubType = "project" | "study" | "research" | "personal" | "custom";

export type SpaceTab = "overview" | "tasks" | "calendar" | "focus" | "notes" | "records";

export const SPACE_TABS: SpaceTab[] = ["overview", "tasks", "calendar", "focus", "notes", "records"];

export type SpaceSignalStatus =
  | "on_track"
  | "needs_attention"
  | "deadline_risk"
  | "blocked"
  | "inactive"
  | "review_due"
  | "pending_items";

export interface SpaceNote {
  id: string;
  spaceId: string;
  title: string;
  body: string;
  type: string;
  url: string;
  relatedTaskId: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type SpaceActivityType =
  | "task_created"
  | "task_updated"
  | "task_completed"
  | "task_scheduled"
  | "focus_started"
  | "focus_completed"
  | "note_created"
  | "note_updated"
  | "manual_record"
  | "ai_suggestion_applied";

export interface SpaceActivity {
  id: string;
  spaceId: string;
  type: SpaceActivityType;
  title: string;
  description: string;
  relatedTaskId: string;
  relatedSessionId: string;
  relatedNoteId: string;
  createdAt: string;
}

export interface SpaceSectionGroup {
  id: string;
  label: string;
  order: number;
  hidden?: boolean;
}

export interface SpaceCustomConfig {
  spaceId: string;
  nameOverride?: string;
  descriptionOverride?: string;
  colorOverride?: string;
  sectionGroups?: SpaceSectionGroup[];
  overviewCards: {
    nextAction: boolean;
    signal: boolean;
    focusTime: boolean;
    upcoming: boolean;
  };
  defaults: {
    defaultDurationMinutes: number;
    weeklyFocusGoalSeconds: number;
  };
  pinnedNextActionTaskId?: string;
  updatedAt: string;
}

export const DEFAULT_OVERVIEW_CARDS: SpaceCustomConfig["overviewCards"] = {
  nextAction: true,
  signal: true,
  focusTime: true,
  upcoming: true,
};

export const DEFAULT_SPACE_DEFAULTS: SpaceCustomConfig["defaults"] = {
  defaultDurationMinutes: 30,
  weeklyFocusGoalSeconds: 5 * 3600,
};

export function emptySpaceConfig(spaceId: string): SpaceCustomConfig {
  return {
    spaceId,
    overviewCards: { ...DEFAULT_OVERVIEW_CARDS },
    defaults: { ...DEFAULT_SPACE_DEFAULTS },
    updatedAt: new Date().toISOString(),
  };
}

// Minimal shape of a Space card the detail hub needs — SpacesPage's derived
// Space objects satisfy this structurally.
export interface SpaceLike {
  id: string;
  name: string;
  type: string;
  description: string;
  color: string;
  sourceId?: string;
  sourceRef?: "project" | "study" | "local";
}

// Preset per space type (§27): same layout, different labels/groups/rules.
export interface SpaceTypePreset {
  headerSubtitle: string;
  addTaskLabel: string;
  addNoteLabel: string;
  scheduleLabel: string;
  startFocusLabel: string;
  primaryTaskSectionLabel: string;
  nextActionLabel: string;
  signalLabel: string;
  focusTimeLabel: string;
  upcomingLabel: string;
  taskGroups: string[];
  noteTypes: string[];
  focusCategories: string[];
  aiSummaryLabel: string;
}
