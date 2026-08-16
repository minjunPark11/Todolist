// Space Detail work-hub models (SPACE_DETAIL_COMPLETE_IMPLEMENTATION_SPEC §29).
// Spaces themselves are derived from projects/study topics on SpacesPage; the
// hub adds notes, activity records, and per-space customization on top.

import type { SpaceNavId } from "../domain/view/spaceNav";
import type { ProjectType } from "../types";

// `SpaceHubType` ("project" | "personal" | "custom") used to live here, beside
// a page-local `SpaceType` ("project" | "custom") and the stored `ProjectType`
// ("project" | "area") — three vocabularies for one question, none of which
// knew about the other two (SPACES_REDESIGN_II §0.3.8).
//
// `ProjectType` is the survivor because it is the only one that is stored and
// synced; the other two were derived on the way to the screen and had to be
// translated back at every boundary. "personal" had no path that could produce
// it at all.

// The per-space "calendar" tab was removed (PROJECT_DETAIL_REMOVE_CALENDAR_TAB
// spec) — scheduling lives in the main Calendar page. Legacy ?tab=calendar
// URLs fall back to "overview" because the value is no longer in SPACE_TABS.
/**
 * What the View Bar offers.
 *
 * This used to be `"overview" | SpaceViewId`, which said every tab after
 * Overview was a view over Items — true of Board, false of Goals and Horizons
 * (§12). The registry in domain/view/spaceNav.ts holds the classification now,
 * and its ids are the tabs; this alias exists so the screens keep one name for
 * "which tab is open".
 */
export type SpaceTab = SpaceNavId;

export type SpaceSignalStatus =
  | "on_track"
  | "needs_attention"
  | "deadline_risk"
  | "blocked"
  | "inactive"
  | "review_due"
  | "pending_items";

export type SpaceActivityType =
  | "task_created"
  | "task_updated"
  | "task_completed"
  | "task_scheduled"
  | "focus_started"
  | "focus_completed"
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
  type: ProjectType;
  description: string;
  color: string;
  // `id` IS the Project id (SPACES_REDESIGN_II §0.3.8). A `sourceId` beside it
  // and a `sourceRef` discriminator whose only arm was "project" — "study" had
  // no producer at all — are gone; they described a time when a space could be
  // something other than a Project.
}

// Preset per space type (§27): same layout, different labels/groups/rules.
export interface SpaceTypePreset {
  headerSubtitle: string;
  addTaskLabel: string;
  startFocusLabel: string;
  primaryTaskSectionLabel: string;
  nextActionLabel: string;
  signalLabel: string;
  focusTimeLabel: string;
  upcomingLabel: string;
  taskGroups: string[];  // Example first tasks shown under the tasks-tab empty state ("e.g. …").
  emptyTaskExamples: string;
}
