// Decides WHAT a save should write to the account. Pure — no Supabase, no
// React — so the destructive half of syncing (which ids get deleted) can be
// tested directly instead of only in front of a live account.
//
// usePlannerData executes the returned plan; it does not decide its contents.
import type { AppSettings, PlannerData, PlannerSettings, RecentItem } from "../../types";
import { diffChangedRecords, diffRemovedIds } from "./diffRecords";

// PlannerData key -> Supabase table.
export const collectionTables = [
  ["tasks", "tasks"],
  ["projects", "projects"],
  ["subtasks", "subtasks"],
  ["habits", "habits"],
  ["habitLogs", "habit_logs"],
  ["focusSessions", "focus_sessions"],
  ["taskTemplates", "task_templates"],
  ["studyTopics", "study_topics"],
  ["conceptNotes", "concept_notes"],
] as const;

// Tables added after the original schema: a client whose project predates them
// keeps working without them instead of failing every sync.
export const optionalRemoteTables: ReadonlySet<string> = new Set(["study_topics", "concept_notes"]);

export type SyncCollectionKey = (typeof collectionTables)[number][0];

export type SyncTableOperation = {
  table: string;
  // Records to upsert, in their stored shape.
  upsert: Array<{ id: string }>;
  // Ids to delete. Only ever ids the account is known to hold and the local
  // state no longer does.
  removeIds: string[];
};

export type AppStateRow = {
  appSettings: AppSettings;
  activeSessionId: string;
  recentItems: RecentItem[];
};

export type SyncPlan = {
  // Only tables with something to do appear here.
  tables: SyncTableOperation[];
  // Null when the row is already up to date on the account.
  settings: PlannerSettings | null;
  appState: AppStateRow | null;
};

export function isEmptySyncPlan(plan: SyncPlan): boolean {
  return plan.tables.length === 0 && plan.settings === null && plan.appState === null;
}

// `baseline` is the last state known to be on the account (from the load, or
// from the previous successful save). Null means nothing is known about the
// account yet, in which case everything is pushed and NOTHING is deleted —
// deleting against an unknown baseline is how a fresh device would wipe an
// existing account.
export function buildSyncPlan(
  next: PlannerData,
  baseline: PlannerData | null,
  skipTables: ReadonlySet<string> = new Set(),
): SyncPlan {
  const tables: SyncTableOperation[] = [];

  for (const [key, table] of collectionTables) {
    if (skipTables.has(table)) continue;

    // The diff needs only identity and an id, so the per-collection record
    // types collapse to one shape here rather than switching on `key`.
    const items = next[key] as Array<{ id: string }>;
    const previous = baseline ? (baseline[key] as Array<{ id: string }>) : undefined;

    const upsert = diffChangedRecords(items, previous);
    const removeIds = diffRemovedIds(items, previous);
    if (upsert.length > 0 || removeIds.length > 0) {
      tables.push({ table, upsert, removeIds });
    }
  }

  // Settings rode along on every single save before, two upserts per keystroke
  // even when untouched. The reducers replace these objects only when they
  // actually change, so identity answers it here too.
  const settingsChanged = !baseline || next.settings !== baseline.settings;
  const appStateChanged =
    !baseline ||
    next.appSettings !== baseline.appSettings ||
    next.activeSessionId !== baseline.activeSessionId ||
    next.recentItems !== baseline.recentItems;

  return {
    tables,
    settings: settingsChanged ? next.settings : null,
    appState: appStateChanged
      ? {
          appSettings: next.appSettings,
          activeSessionId: next.activeSessionId,
          recentItems: next.recentItems,
        }
      : null,
  };
}
