import { useEffect, useMemo, useRef, useState } from "react";
import { pushUndo } from "../lib/undoStack";
import { platform } from "../platform";
import { isSupabaseConfigured, supabase } from "../services/supabaseClient";
import type {
  AppSettings,
  ExternalCalendar,
  FocusMode,
  FocusSegment,
  FocusSession,
  Language,
  PlannerData,
  PlannerSettings,
  Project,
  ProjectType,
  RawPlannerData,
  RepeatType,
  Subtask,
  Task,
  TaskDraft,
} from "../types";
import type { LearningPath, Milestone } from "../lib/ai/learningPaths/types";
import {
  readLegacyLearningPaths,
  sanitizeLearningPath,
} from "../lib/ai/learningPaths/store";
import {
  readLegacyLocalSpaces,
} from "../lib/spaces/legacyLocalSpaces";
import * as pathOps from "../domain/horizons/pathMutations";
import { countPlannerDataItems } from "../domain/migrations/plannerDataMigration";
import { persistPlannerData, PLANNER_STORAGE_KEY } from "../domain/migrations/persistPlannerData";
import { recoverStaleFocusSessions } from "../domain/focus/selectors";
import {
  buildSyncPlan,
  collectionTables,
  isEmptySyncPlan,
  optionalRemoteTables,
} from "../domain/sync/buildSyncPlan";
import { addDays, addMonths, todayValue } from "../utils/date";
import { planRecurringCompletion } from "../utils/planner";

const STORAGE_KEY = PLANNER_STORAGE_KEY;
const LEGACY_STORAGE_KEY = "todo-planner-data";
const taskStatuses = ["inbox", "todo", "doing", "waiting", "done", "archived"] as const;
const taskPriorities = ["none", "low", "medium", "high"] as const;
const projectTypes = ["project", "area"] as const;
const projectStatuses = ["active", "paused", "completed", "archived"] as const;
const accentColors = ["blue", "purple", "green", "pink", "orange"] as const;
const themeModes = ["light", "dark", "system"] as const;
const fontSizes = ["small", "medium", "large"] as const;
const languages = ["ko", "en"] as const;

// First-run default only — the user's explicit choice always wins once saved.
function detectDefaultLanguage(): Language {
  const browserLanguage = typeof navigator !== "undefined" ? navigator.language : "";
  return browserLanguage?.toLowerCase().startsWith("ko") ? "ko" : "en";
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: "light",
  accentColor: "blue",
  fontSize: "medium",
  language: detectDefaultLanguage(),
  defaultView: "/today",
  showCompletedInToday: true,
  confirmBeforeDelete: true,
  showSidebarCounts: true,
  sidebarCollapsed: false,
  reduceMotion: false,
  aiModel: "",
};

const repeatTypes = ["none", "daily", "weekly", "monthly"] as const;
const focusModes = ["focus", "short_break", "long_break"] as const;
const focusStatuses = ["running", "paused", "completed", "cancelled"] as const;
const focusSources = ["focus_page", "today_page", "calendar_event", "global_bar"] as const;
function isMissingRemoteTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  return (
    record.code === "PGRST205" ||
    message.includes("could not find the table") ||
    (message.includes("schema cache") && message.includes("table"))
  );
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function oneOf<T extends readonly string[]>(value: unknown, options: T, fallback: T[number]): T[number] {
  return typeof value === "string" && options.includes(value) ? value : fallback;
}

function normalizeTask(task: Partial<Task>): Task {
  const now = new Date().toISOString();

  // Migrate legacy statuses to the canonical lifecycle (spec §0.1.2).
  const rawStatus = migrateStatus(task.status);
  const rawPrevious = task.previousStatus ? migrateStatus(task.previousStatus) : undefined;

  // CALENDAR_DESIGN.md §1.2/§10.2: startTime/endTime now belong to scheduledDate
  // (not dueDate). Older records saved by the pre-redesign calendar drag/drop
  // have a time but no scheduledDate — promote dueDate into scheduledDate so
  // the timed block keeps showing up. Additive only, and guarded by
  // `!scheduledDate` so it never re-fires once applied (idempotent).
  const dueDate = task.dueDate ?? "";
  const startTime = task.startTime ?? "";
  let scheduledDate = task.scheduledDate ?? "";
  if (startTime && !scheduledDate && dueDate) {
    scheduledDate = dueDate;
  }

  return {
    id: task.id ?? createId("task"),
    title: task.title ?? "Untitled task",
    description: task.description ?? "",
    status: oneOf(rawStatus, taskStatuses, "todo"),
    priority: oneOf(task.priority, taskPriorities, "none"),
    dueDate,
    scheduledDate,
    startTime,
    endTime: task.endTime ?? "",
    projectId: task.projectId ?? "",
    categoryId: task.categoryId ?? "",
    parentTaskId: task.parentTaskId ?? "",
    tags: Array.isArray(task.tags) ? task.tags : [],
    notes: task.notes ?? "",
    estimatedMinutes:
      Number.isFinite(task.estimatedMinutes) && Number(task.estimatedMinutes) > 0
        ? Math.round(Number(task.estimatedMinutes))
        : 0,
    actualSeconds: Number.isFinite(task.actualSeconds) ? Number(task.actualSeconds) : 0,
    activeSessionId: task.activeSessionId ?? "",
    lastFocusedAt: task.lastFocusedAt ?? "",
    isSomeday: Boolean(task.isSomeday),
    waitingReason: task.waitingReason ?? "",
    waitingFollowUpDate: task.waitingFollowUpDate ?? "",
    order: typeof task.order === "number" ? task.order : 0,
    createdAt: task.createdAt ?? now,
    updatedAt: task.updatedAt ?? now,
    completedAt: task.completedAt ?? "",
    archivedAt: task.archivedAt ?? "",
    deletedAt: task.deletedAt,
    previousStatus: rawPrevious ? oneOf(rawPrevious, taskStatuses, "todo") : undefined,
    blockedByTaskId: task.blockedByTaskId ?? "",
    repeatType: oneOf(task.repeatType, repeatTypes, "none"),
    repeatInterval: task.repeatInterval ?? 1,
    repeatDays: Array.isArray(task.repeatDays) ? task.repeatDays : [],
    repeatEndDate: task.repeatEndDate ?? "",
  };
}

function migrateStatus(status: unknown): string {
  if (status === "in_progress") return "doing";
  if (status === "blocked") return "waiting";
  return typeof status === "string" ? status : "todo";
}

function normalizeProject(project: Partial<Project>): Project {
  const now = new Date().toISOString();

  return {
    id: project.id ?? createId("project"),
    name: project.name ?? "Untitled project",
    description: project.description ?? "",
    notes: project.notes ?? "",
    color: project.color ?? "#007AFF",
    type: oneOf(project.type, projectTypes, "project") as ProjectType,
    icon: project.icon,
    dueDate: project.dueDate ?? "",
    pinned: Boolean(project.pinned),
    order: typeof project.order === "number" ? project.order : 0,
    status: oneOf(project.status, projectStatuses, "active"),
    archivedAt: project.archivedAt ?? "",
    createdAt: project.createdAt ?? now,
    updatedAt: project.updatedAt ?? now,
  };
}

function normalizeSubtask(subtask: Partial<Subtask>): Subtask {
  const now = new Date().toISOString();

  return {
    id: subtask.id ?? createId("subtask"),
    taskId: subtask.taskId ?? "",
    title: subtask.title ?? "Untitled subtask",
    completed: Boolean(subtask.completed),
    createdAt: subtask.createdAt ?? now,
    updatedAt: subtask.updatedAt ?? now,
  };
}

function normalizeFocusSession(session: Partial<FocusSession>): FocusSession {
  const now = new Date().toISOString();
  const startedAt = session.startedAt ?? session.startAt ?? now;
  const endedAt = session.endedAt ?? session.endAt ?? "";
  const accumulatedSeconds =
    Number.isFinite(session.accumulatedSeconds)
      ? Number(session.accumulatedSeconds)
      : Math.max(0, Math.round((session.durationMinutes ?? 0) * 60));
  const status = session.status ?? (session.completed ? "completed" : "completed");

  // Segment migration: records saved before segments existed get one span
  // covering the whole session, so past focus time still shows on the
  // calendar. Sessions that already carry the field keep it as-is (an empty
  // array on a fresh running session is valid, not legacy).
  let segments = Array.isArray(session.segments)
    ? session.segments.filter(
        (segment): segment is FocusSegment =>
          Boolean(segment) &&
          typeof segment.startAt === "string" &&
          typeof segment.endAt === "string" &&
          segment.startAt < segment.endAt,
      )
    : undefined;
  if (segments === undefined) {
    segments =
      status === "completed" && startedAt && endedAt && startedAt < endedAt
        ? [{ startAt: startedAt, endAt: endedAt }]
        : [];
  }

  return {
    id: session.id ?? createId("focus"),
    taskId: session.taskId ?? "",
    title: session.title ?? "",
    mode: oneOf(session.mode, focusModes, "focus"),
    status: oneOf(status, focusStatuses, "completed"),
    durationMinutes: session.durationMinutes ?? Math.max(1, Math.round(accumulatedSeconds / 60)),
    accumulatedSeconds,
    completed: session.completed ?? status === "completed",
    startAt: session.startAt ?? startedAt,
    endAt: session.endAt ?? endedAt,
    startedAt,
    endedAt,
    pausedAt: session.pausedAt ?? "",
    segments,
    source: oneOf(session.source, focusSources, "focus_page"),
    projectId: session.projectId ?? "",
    projectName: session.projectName ?? "",
    focusNote: session.focusNote ?? "",
    createdAt: session.createdAt ?? startedAt,
    updatedAt: session.updatedAt ?? now,
  };
}


function normalizeSettings(settings?: Partial<PlannerSettings>): PlannerSettings {
  const now = new Date().toISOString();

  return {
    id: "settings",
    theme: settings?.theme === "light" || settings?.theme === "dark" ? settings.theme : "system",
    externalCalendars: Array.isArray(settings?.externalCalendars)
      ? settings.externalCalendars.map(normalizeExternalCalendar).filter((calendar): calendar is ExternalCalendar => Boolean(calendar))
      : [],
    createdAt: settings?.createdAt ?? now,
    updatedAt: settings?.updatedAt ?? now,
  };
}

function normalizeExternalCalendar(calendar: Partial<ExternalCalendar>): ExternalCalendar | null {
  if (!calendar.id || !calendar.name || !calendar.icsUrl) return null;
  const now = new Date().toISOString();
  return {
    id: String(calendar.id),
    name: String(calendar.name),
    icsUrl: String(calendar.icsUrl),
    color: calendar.color || "#4f73ff",
    visible: calendar.visible !== false,
    enabled: calendar.enabled !== false,
    syncStatus: calendar.syncStatus ?? "idle",
    lastSyncedAt: calendar.lastSyncedAt,
    lastAttemptedAt: calendar.lastAttemptedAt,
    lastError: calendar.lastError,
    eventCount: calendar.eventCount ?? 0,
    createdAt: calendar.createdAt || now,
    updatedAt: calendar.updatedAt || now,
  };
}

function normalizeAppSettings(settings?: Partial<AppSettings>): AppSettings {
  return {
    theme: oneOf(settings?.theme, themeModes, DEFAULT_APP_SETTINGS.theme),
    accentColor: oneOf(settings?.accentColor, accentColors, DEFAULT_APP_SETTINGS.accentColor),
    fontSize: oneOf(settings?.fontSize, fontSizes, DEFAULT_APP_SETTINGS.fontSize),
    language: oneOf(settings?.language, languages, DEFAULT_APP_SETTINGS.language),
    defaultView: oneOf(
      settings?.defaultView,
      ["/today", "/inbox", "/calendar", "/planning", "/projects", "/focus"] as const,
      DEFAULT_APP_SETTINGS.defaultView,
    ),
    showCompletedInToday: settings?.showCompletedInToday ?? DEFAULT_APP_SETTINGS.showCompletedInToday,
    confirmBeforeDelete: settings?.confirmBeforeDelete ?? DEFAULT_APP_SETTINGS.confirmBeforeDelete,
    showSidebarCounts: settings?.showSidebarCounts ?? DEFAULT_APP_SETTINGS.showSidebarCounts,
    sidebarCollapsed: settings?.sidebarCollapsed ?? DEFAULT_APP_SETTINGS.sidebarCollapsed,
    reduceMotion: settings?.reduceMotion ?? DEFAULT_APP_SETTINGS.reduceMotion,
    aiModel: typeof settings?.aiModel === "string" ? settings.aiModel : DEFAULT_APP_SETTINGS.aiModel,
  };
}

function normalizeData(data: RawPlannerData): PlannerData {
  return {
    tasks: Array.isArray(data.tasks) ? data.tasks.map(normalizeTask) : [],
    projects: Array.isArray(data.projects) ? data.projects.map(normalizeProject) : [],
    subtasks: Array.isArray(data.subtasks)
      ? data.subtasks.map(normalizeSubtask).filter((subtask) => subtask.taskId)
      : [],
    focusSessions: Array.isArray(data.focusSessions)
      ? data.focusSessions.map(normalizeFocusSession)
      : [],
    activeSessionId: typeof data.activeSessionId === "string" ? data.activeSessionId : "",
    // One validator for both sources: the same sanitizer that read the old
    // local blob now vets the synced rows.
    learningPaths: Array.isArray(data.learningPaths)
      ? data.learningPaths
          .map(sanitizeLearningPath)
          .filter((path): path is LearningPath => path !== null)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      : [],
    settings: normalizeSettings(data.settings),
    appSettings: normalizeAppSettings(data.appSettings),
  };
}

function emptyData(): PlannerData {
  return normalizeData({});
}

// Any data crossing into the app from outside this running instance goes
// through here, so a timer left running when the app closed can't keep
// accruing wall-clock time (see recoverStaleFocusSessions).
function adoptLoadedData(data: PlannerData): PlannerData {
  const focusSessions = recoverStaleFocusSessions(data.focusSessions);
  const learningPaths = adoptLegacyLearningPaths(data.learningPaths);
  const projects = adoptLegacyLocalSpaces(data.projects);
  if (
    focusSessions === data.focusSessions &&
    learningPaths === data.learningPaths &&
    projects === data.projects
  ) {
    return data;
  }
  return { ...data, focusSessions, learningPaths, projects };
}

// Phase S4 migration, and the same shape as the one below it: custom spaces
// written before Spaces read Projects sat in a device-local blob. Merged by
// id so a repeated read (StrictMode, or a failed marker write) adds nothing
// twice, and an already-synced copy is never overwritten by the stale one.
function adoptLegacyLocalSpaces(current: Project[]): Project[] {
  const legacy = readLegacyLocalSpaces();
  if (legacy.length === 0) return current;
  const seen = new Set(current.map((project) => project.id));
  const added = legacy.filter((project) => !seen.has(project.id));
  if (added.length === 0) return current;
  return [...current, ...added];
}

// Phase 2 migration: goals written before they were synced sat in a local
// blob. The read is pure and repeats until the marker is set after mount, and
// what it yields is merged by id rather than replacing — if a synced copy has
// already arrived, both survive and neither wins by accident.
function adoptLegacyLearningPaths(current: LearningPath[]): LearningPath[] {
  const legacy = readLegacyLearningPaths();
  if (legacy.length === 0) return current;
  const seen = new Set(current.map((path) => path.id));
  const added = legacy.filter((path) => !seen.has(path.id));
  if (added.length === 0) return current;
  return pathOps.sortPaths([...current, ...added]).slice(0, pathOps.MAX_PATHS);
}

function readStorage(): PlannerData {
  const raw = platform.storage.getSync(STORAGE_KEY);

  if (raw) {
    try {
      return adoptLoadedData(normalizeData(JSON.parse(raw) as Partial<PlannerData>));
    } catch {
      return emptyData();
    }
  }

  // One-time migration from the legacy storage key (statuses remapped on normalize).
  const legacy = platform.storage.getSync(LEGACY_STORAGE_KEY);
  if (legacy) {
    try {
      return adoptLoadedData(normalizeData(JSON.parse(legacy) as Partial<PlannerData>));
    } catch {
      return emptyData();
    }
  }

  // First run, no saved data anywhere: start completely blank. Demo content
  // is opt-in only, via the "Load Samples" button in Settings.
  //
  // Still goes through adoptLoadedData: the legacy blobs are separate keys, so
  // "no planner data" does not mean "nothing to migrate". Returning emptyData()
  // raw skipped the drain while the marker was set anyway, which lost the
  // records rather than merely postponing them.
  return adoptLoadedData(emptyData());
}

export function usePlannerData() {
  const [data, setDataState] = useState<PlannerData>(() => readStorage());
  // Every user-facing mutation goes through this wrapper so Ctrl+Z can walk
  // edits back; system paths (remote load, migration) use setDataState so
  // they never land on the undo stack.
  function setData(updater: PlannerData | ((current: PlannerData) => PlannerData)) {
    setDataState((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      if (next !== current) pushUndo(() => setDataState(current));
      return next;
    });
  }
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [userEmail, setUserEmail] = useState("");
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [syncStatus, setSyncStatus] = useState(
    isSupabaseConfigured ? "sync.ready" : "sync.localMode",
  );
  const [syncError, setSyncError] = useState("");
  const [remoteLoaded, setRemoteLoaded] = useState(false);
  const [localMigrationData, setLocalMigrationData] = useState<PlannerData | null>(null);
  // True after the user opens a password-reset link (Supabase PASSWORD_RECOVERY);
  // the UI then shows a "set a new password" form instead of the normal app.
  const [recoveryMode, setRecoveryMode] = useState(false);
  const syncTimerRef = useRef<number | null>(null);
  const missingRemoteTablesRef = useRef<Set<string>>(new Set());
  // Last state we know the account holds; the save diffs against it so an edit
  // uploads the records it touched instead of every row in every table.
  const syncedSnapshotRef = useRef<PlannerData | null>(null);

  useEffect(() => {
    persistPlannerData(data);
  }, [data]);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data: sessionData }) => {
      if (!isMounted) {
        return;
      }
      const user = sessionData.session?.user;
      setUserEmail(user?.email ?? "");
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setUserEmail(session?.user.email ?? "");
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !userEmail) {
      setRemoteLoaded(false);
      // Signed out, or switching accounts: the old baseline describes someone
      // else's rows, so the next sign-in must start from a fresh load.
      syncedSnapshotRef.current = null;
      return;
    }

    const localSnapshot = readStorage();
    if (countPlannerDataItems(localSnapshot) > 0) {
      setLocalMigrationData(localSnapshot);
    }

    loadSupabaseData();
  }, [userEmail]);

  useEffect(() => {
    if (!supabase || !userEmail || !remoteLoaded) {
      return;
    }

    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = window.setTimeout(() => {
      saveSupabaseData(data);
    }, 700);

    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
    };
  }, [data, remoteLoaded, userEmail]);

  const selectedTask = useMemo(
    () => data.tasks.find((task) => task.id === selectedTaskId) ?? null,
    [data.tasks, selectedTaskId],
  );

  async function getUserId() {
    if (!supabase) {
      return "";
    }

    const { data: userData, error } = await supabase.auth.getUser();
    if (error) {
      throw error;
    }

    return userData.user?.id ?? "";
  }

  async function loadSupabaseData() {
    if (!supabase) {
      return;
    }

    setSyncStatus("sync.syncing");
    setSyncError("");

    try {
      const partial: Partial<PlannerData> = {};
      missingRemoteTablesRef.current = new Set();

      for (const [key, table] of collectionTables) {
        const { data: rows, error } = await supabase.from(table).select("data");
        if (error) {
          if (optionalRemoteTables.has(table) && isMissingRemoteTableError(error)) {
            missingRemoteTablesRef.current.add(table);
            partial[key] = data[key] as never;
            continue;
          }
          // Required tables should still fail loudly with the table name so a
          // broken base Supabase setup is obvious.
          throw new Error(`Failed to load '${table}' table: ${error.message}`);
        }
        partial[key] = (rows ?? []).map((row: { data: unknown }) => row.data) as never;
      }

      const { data: settingsRows, error: settingsError } = await supabase
        .from("settings")
        .select("data")
        .eq("id", "settings")
        .maybeSingle();
      if (settingsError) {
        throw new Error(`Failed to load 'settings' table: ${settingsError.message}`);
      }

      partial.settings = normalizeSettings(settingsRows?.data as Partial<PlannerSettings> | undefined);

      const { data: appSettingsRow, error: appSettingsError } = await supabase
        .from("settings")
        .select("data")
        .eq("id", "app_settings")
        .maybeSingle();
      if (appSettingsError) {
        throw new Error(`Failed to load 'app_settings' row: ${appSettingsError.message}`);
      }
      const appState = appSettingsRow?.data as
        | { appSettings?: Partial<AppSettings>; activeSessionId?: unknown }
        | undefined;
      // Fall back to the current local values when no remote row exists yet, so
      // an existing device's preferences aren't wiped on first sync after this
      // change; the next save pushes them to the account.
      partial.appSettings = appState?.appSettings ? normalizeAppSettings(appState.appSettings) : data.appSettings;
      partial.activeSessionId = appState
        ? typeof appState.activeSessionId === "string"
          ? appState.activeSessionId
          : ""
        : data.activeSessionId;

      const loaded = adoptLoadedData(normalizeData(partial));
      setDataState(loaded);
      // What we just read IS what the account holds, so the next save has
      // nothing to push until the user actually changes something.
      syncedSnapshotRef.current = loaded;
      setRemoteLoaded(true);
      setSyncStatus("sync.synced");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load Supabase data.";
      console.error("[Supabase] load failed:", error);
      setRemoteLoaded(false);
      setSyncError(message);
      setSyncStatus("sync.loadFailed");
    }
  }

  async function saveSupabaseData(nextData: PlannerData) {
    if (!supabase) {
      return;
    }

    // What to write is decided by a pure function (see buildSyncPlan) against
    // the last state known to be on the account — set from the load, advanced
    // only after a fully successful save.
    const plan = buildSyncPlan(nextData, syncedSnapshotRef.current, missingRemoteTablesRef.current);
    if (isEmptySyncPlan(plan)) {
      // The edit touched nothing that syncs; don't spend a round trip.
      syncedSnapshotRef.current = nextData;
      return;
    }

    try {
      const userId = await getUserId();
      if (!userId) {
        return;
      }

      for (const operation of plan.tables) {
        if (operation.upsert.length > 0) {
          const rows = operation.upsert.map((item) => ({ id: item.id, user_id: userId, data: item }));
          const { error } = await supabase
            .from(operation.table)
            .upsert(rows, { onConflict: "id,user_id" });
          if (error) {
            if (optionalRemoteTables.has(operation.table) && isMissingRemoteTableError(error)) {
              missingRemoteTablesRef.current.add(operation.table);
              continue;
            }
            throw error;
          }
        }

        if (operation.removeIds.length > 0) {
          const { error: deleteError } = await supabase
            .from(operation.table)
            .delete()
            .eq("user_id", userId)
            .in("id", operation.removeIds);
          if (deleteError) {
            if (optionalRemoteTables.has(operation.table) && isMissingRemoteTableError(deleteError)) {
              missingRemoteTablesRef.current.add(operation.table);
              continue;
            }
            throw deleteError;
          }
        }
      }

      if (plan.settings) {
        const { error: settingsError } = await supabase.from("settings").upsert(
          { id: "settings", user_id: userId, data: plan.settings },
          { onConflict: "id,user_id" },
        );
        if (settingsError) {
          throw settingsError;
        }
      }

      // Device-level preferences (theme accent, language, font size, view
      // prefs, active focus session, recent items) are synced too, so a single
      // account looks and behaves the same on app and web.
      if (plan.appState) {
        const { error: appSettingsError } = await supabase.from("settings").upsert(
          { id: "app_settings", user_id: userId, data: plan.appState },
          { onConflict: "id,user_id" },
        );
        if (appSettingsError) {
          throw appSettingsError;
        }
      }

      // Only advance the baseline once everything above succeeded; a failed
      // save must stay "not yet uploaded" so the next attempt resends it.
      syncedSnapshotRef.current = nextData;
      setSyncError("");
      setSyncStatus("sync.synced");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not save Supabase data.");
      setSyncStatus("sync.syncFailed");
    }
  }

  async function signIn(email: string, password: string) {
    if (!supabase) {
      setSyncError("Supabase environment variables are not configured.");
      return false;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setSyncError(error.message);
      return false;
    }
    setSyncError("");
    return true;
  }

  async function signUp(email: string, password: string) {
    if (!supabase) {
      setSyncError("Supabase environment variables are not configured.");
      return { ok: false, needsEmailConfirmation: false };
    }

    const { data: signUpData, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setSyncError(error.message);
      return { ok: false, needsEmailConfirmation: false };
    }
    const needsEmailConfirmation = !signUpData.session;
    setSyncError("");
    setSyncStatus(needsEmailConfirmation ? "sync.verificationSent" : "sync.accountCreated");
    return { ok: true, needsEmailConfirmation };
  }

  async function signOut() {
    if (!supabase) {
      return;
    }
    await supabase.auth.signOut();
    setUserEmail("");
    setRemoteLoaded(false);
    setSyncStatus("sync.signedOut");
  }

  // Sends a password-reset email. The link brings the user back to the app with
  // a recovery session (PASSWORD_RECOVERY event), where updatePassword finishes.
  async function resetPassword(email: string) {
    if (!supabase) {
      setSyncError("Supabase environment variables are not configured.");
      return false;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
    });
    if (error) {
      setSyncError(error.message);
      return false;
    }
    setSyncError("");
    return true;
  }

  async function updatePassword(newPassword: string) {
    if (!supabase) {
      setSyncError("Supabase environment variables are not configured.");
      return false;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setSyncError(error.message);
      return false;
    }
    setSyncError("");
    setRecoveryMode(false);
    return true;
  }

  async function uploadLocalDataToSupabase() {
    if (!localMigrationData) {
      return false;
    }

    await saveSupabaseData(localMigrationData);
    setDataState(localMigrationData);
    setLocalMigrationData(null);
    setRemoteLoaded(true);
    return true;
  }

  function addTask(draft: TaskDraft): string {
    const now = new Date().toISOString();
    const title = draft.title.trim();
    if (!title) {
      return "";
    }

    const task = normalizeTask({
      ...(draft as Partial<Task>),
      id: createId("task"),
      title,
      status: draft.status ?? "todo",
      createdAt: now,
      updatedAt: now,
    });

    setData((current) => ({
      ...current,
      tasks: [task, ...current.tasks],
    }));
    return task.id;
  }

  // Spec §0.1.1 alias: capture goes to Inbox by default unless context overrides.
  function createTask(draft: TaskDraft, context?: Partial<TaskDraft>): string {
    return addTask({ status: "inbox", ...context, ...draft });
  }


  function updateTask(taskId: string, patch: Partial<Task>) {
    const now = new Date().toISOString();

    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const nextStatus = patch.status ?? task.status;
        const statusChanged = nextStatus !== task.status;

        return {
          ...task,
          ...patch,
          status: nextStatus,
          previousStatus: statusChanged ? task.status : task.previousStatus,
          completedAt:
            nextStatus === "done"
              ? task.completedAt || now
              : statusChanged
                ? ""
                : (patch.completedAt ?? task.completedAt),
          archivedAt:
            nextStatus === "archived"
              ? task.archivedAt || now
              : statusChanged
                ? ""
                : task.archivedAt,
          updatedAt: now,
        };
      }),
    }));
  }

  function deleteTask(taskId: string) {
    setData((current) => ({
      ...current,
      // Children of a deleted parent are promoted to top-level instead of
      // being orphaned or cascade-deleted (their work is still real).
      tasks: current.tasks
        .filter((task) => task.id !== taskId)
        .map((task) => (task.parentTaskId === taskId ? { ...task, parentTaskId: "" } : task)),
      subtasks: current.subtasks.filter((subtask) => subtask.taskId !== taskId),
    }));
    setSelectedTaskId("");
  }

  function archiveTask(taskId: string) {
    const now = new Date().toISOString();

    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              previousStatus: task.status === "archived" ? task.previousStatus : task.status,
              status: "archived",
              archivedAt: now,
              updatedAt: now,
            }
          : task,
      ),
    }));
    setSelectedTaskId("");
  }

  // Deletion is a hard removal, so undo re-inserts the rows the caller
  // captured beforehand. Targeted on purpose: restoring a whole-store snapshot
  // would also throw away anything the user changed while the toast was up.
  function restoreDeletedTask(task: Task, subtasks: Subtask[], childTaskIds: string[] = []) {
    setData((current) => ({
      ...current,
      tasks: (current.tasks.some((item) => item.id === task.id)
        ? current.tasks
        : [...current.tasks, task]
      ).map((item) =>
        // deleteTask promotes children to top level; put them back under the parent.
        childTaskIds.includes(item.id) ? { ...item, parentTaskId: task.id } : item,
      ),
      subtasks: [
        ...current.subtasks.filter((item) => item.taskId !== task.id),
        ...subtasks,
      ],
    }));
  }

  function restoreDeletedProject(project: Project, taskIds: string[] = []) {
    setData((current) => ({
      ...current,
      projects: current.projects.some((item) => item.id === project.id)
        ? current.projects
        : [...current.projects, project],
      // deleteProject unassigns its tasks rather than deleting them.
      tasks: current.tasks.map((item) =>
        taskIds.includes(item.id) ? { ...item, projectId: project.id } : item,
      ),
    }));
  }

  function restoreTask(taskId: string) {
    const now = new Date().toISOString();

    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: task.previousStatus && task.previousStatus !== "archived" ? task.previousStatus : "todo",
              archivedAt: "",
              updatedAt: now,
            }
          : task,
      ),
    }));
  }

  function duplicateTask(taskId: string) {
    const source = data.tasks.find((task) => task.id === taskId);
    if (!source) {
      return "";
    }

    const now = new Date().toISOString();
    const newTaskId = createId("task");
    const copy: Task = {
      ...source,
      id: newTaskId,
      title: `${source.title} Copy`,
      status: source.status === "done" || source.status === "archived" ? "todo" : source.status,
      completedAt: "",
      archivedAt: "",
      previousStatus: "todo",
      createdAt: now,
      updatedAt: now,
    };
    const copiedSubtasks = data.subtasks
      .filter((subtask) => subtask.taskId === taskId)
      .map((subtask) => ({
        ...subtask,
        id: createId("subtask"),
        taskId: newTaskId,
        completed: false,
        createdAt: now,
        updatedAt: now,
      }));

    setData((current) => ({
      ...current,
      tasks: [copy, ...current.tasks],
      subtasks: [...current.subtasks, ...copiedSubtasks],
    }));
    setSelectedTaskId(newTaskId);
    return newTaskId;
  }

  function toggleTaskDone(taskId: string) {
    const now = new Date().toISOString();
    const today = todayValue();

    setData((current) => {
      const target = current.tasks.find((task) => task.id === taskId);
      if (!target) return current;

      const isDone = target.status === "done";
      const isRecurring = !isDone && target.repeatType !== "none";

      const setOnTarget = (patch: Partial<Task>) => ({
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === taskId ? { ...task, ...patch, updatedAt: now } : task,
        ),
      });

      if (!isRecurring) {
        return setOnTarget({
          status: isDone ? "todo" : "done",
          completedAt: isDone ? "" : now,
        });
      }

      const rolled = planRecurringCompletion(target, createId("task"), now, today);
      if (rolled.kind === "final") {
        return setOnTarget({ status: "done", completedAt: now });
      }

      return {
        ...current,
        tasks: [
          rolled.occurrence,
          ...current.tasks.map((task) =>
            task.id === taskId ? { ...task, ...rolled.patch, updatedAt: now } : task,
          ),
        ],
      };
    });
  }

  function addProject(name: string, color: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    const now = new Date().toISOString();
    const project: Project = {
      id: createId("project"),
      name: trimmed,
      description: "",
      color,
      status: "active",
      archivedAt: "",
      createdAt: now,
      updatedAt: now,
    };

    setData((current) => ({
      ...current,
      projects: [...current.projects, project],
    }));
  }

  function archiveProject(projectId: string) {
    const now = new Date().toISOString();

    setData((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId
          ? { ...project, status: "archived", archivedAt: now, updatedAt: now }
          : project,
      ),
    }));
  }

  function restoreProject(projectId: string) {
    const now = new Date().toISOString();

    setData((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId
          ? { ...project, status: "active", archivedAt: "", updatedAt: now }
          : project,
      ),
    }));
  }

  function deleteProject(projectId: string) {
    setData((current) => ({
      ...current,
      projects: current.projects.filter((project) => project.id !== projectId),
      tasks: current.tasks.map((task) =>
        task.projectId === projectId ? { ...task, projectId: "", updatedAt: new Date().toISOString() } : task,
      ),
    }));
  }

  function addSubtask(taskId: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }

    const now = new Date().toISOString();
    const subtask: Subtask = {
      id: createId("subtask"),
      taskId,
      title: trimmed,
      completed: false,
      createdAt: now,
      updatedAt: now,
    };

    setData((current) => ({
      ...current,
      subtasks: [...current.subtasks, subtask],
    }));
  }





  function getSessionSeconds(session: FocusSession, nowMs = Date.now()) {
    if (session.status !== "running") return session.accumulatedSeconds;
    return session.accumulatedSeconds + Math.max(0, Math.floor((nowMs - new Date(session.startAt).getTime()) / 1000));
  }

  // While running, `startAt` marks the open segment's start (resume resets
  // it). Pausing or stopping closes that segment; a paused session has no
  // open segment to close.
  function closeOpenSegment(session: FocusSession, endAt: string): FocusSegment[] {
    if (session.status !== "running" || session.startAt >= endAt) return session.segments;
    return [...session.segments, { startAt: session.startAt, endAt }];
  }

  function startFocusSession(
    taskId: string,
    source: FocusSession["source"] = "focus_page",
    requestedDurationMinutes?: number,
  ) {
    const now = new Date().toISOString();

    setData((current) => {
      const active = current.focusSessions.find((session) => session.id === current.activeSessionId);
      if (active && (active.status === "running" || active.status === "paused")) return current;

      const task = current.tasks.find((item) => item.id === taskId);
      if (!task) return current;
      const project = current.projects.find((item) => item.id === task.projectId);
      const start = task.startTime && task.endTime ? task.startTime : "";
      const inferredDurationMinutes =
        start && task.endTime
          ? Math.max(1, Math.round((new Date(`2000-01-01T${task.endTime}`).getTime() - new Date(`2000-01-01T${task.startTime}`).getTime()) / 60000))
          : task.priority === "high"
            ? 50
            : 30;
      const durationMinutes = Math.max(1, Math.min(240, Math.round(requestedDurationMinutes || inferredDurationMinutes)));
      const session: FocusSession = {
        id: createId("focus"),
        taskId,
        title: task.title,
        mode: "focus",
        status: "running",
        durationMinutes,
        accumulatedSeconds: 0,
        completed: false,
        startAt: now,
        endAt: "",
        startedAt: now,
        endedAt: "",
        pausedAt: "",
        segments: [],
        source,
        projectId: task.projectId,
        projectName: project?.name ?? "",
        focusNote: "",
        createdAt: now,
        updatedAt: now,
      };

      return {
        ...current,
        activeSessionId: session.id,
        focusSessions: [session, ...current.focusSessions],
        tasks: current.tasks.map((item) =>
          item.id === taskId ? { ...item, activeSessionId: session.id, lastFocusedAt: now, updatedAt: now } : item,
        ),
      };
    });
  }

  function pauseFocusSession(sessionId: string) {
    const now = new Date().toISOString();
    const nowMs = Date.now();
    setData((current) => ({
      ...current,
      focusSessions: current.focusSessions.map((session) =>
        session.id === sessionId && session.status === "running"
          ? {
              ...session,
              status: "paused",
              accumulatedSeconds: getSessionSeconds(session, nowMs),
              pausedAt: now,
              segments: closeOpenSegment(session, now),
              updatedAt: now,
            }
          : session,
      ),
    }));
  }

  function resumeFocusSession(sessionId: string) {
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      activeSessionId: sessionId,
      focusSessions: current.focusSessions.map((session) =>
        session.id === sessionId && session.status === "paused"
          ? { ...session, status: "running", startAt: now, pausedAt: "", updatedAt: now }
          : session,
      ),
    }));
  }

  function stopFocusSession(sessionId: string, completeTask = false) {
    const now = new Date().toISOString();
    const nowMs = Date.now();
    setData((current) => {
      const session = current.focusSessions.find((item) => item.id === sessionId);
      if (!session || (session.status !== "running" && session.status !== "paused")) return current;
      const finalSeconds = getSessionSeconds(session, nowMs);
      return {
        ...current,
        activeSessionId: current.activeSessionId === sessionId ? "" : current.activeSessionId,
        focusSessions: current.focusSessions.map((item) =>
          item.id === sessionId
            ? {
                ...item,
                status: "completed",
                completed: true,
                accumulatedSeconds: finalSeconds,
                endAt: now,
                endedAt: now,
                pausedAt: "",
                segments: closeOpenSegment(item, now),
                updatedAt: now,
              }
            : item,
        ),
        tasks: current.tasks.map((task) =>
          task.id === session.taskId
            ? {
                ...task,
                actualSeconds: task.actualSeconds + finalSeconds,
                activeSessionId: "",
                lastFocusedAt: now,
                status: completeTask ? "done" : task.status,
                completedAt: completeTask ? now : task.completedAt,
                updatedAt: now,
              }
            : task,
        ),
      };
    });
  }


  function deleteFocusSession(sessionId: string) {
    const now = new Date().toISOString();
    setData((current) => {
      const session = current.focusSessions.find((item) => item.id === sessionId);
      if (!session) return current;

      return {
        ...current,
        activeSessionId: current.activeSessionId === sessionId ? "" : current.activeSessionId,
        focusSessions: current.focusSessions.filter((item) => item.id !== sessionId),
        tasks: current.tasks.map((task) =>
          task.id === session.taskId
            ? {
                ...task,
                actualSeconds: Math.max(0, task.actualSeconds - session.accumulatedSeconds),
                activeSessionId: task.activeSessionId === sessionId ? "" : task.activeSessionId,
                updatedAt: now,
              }
            : task,
        ),
      };
    });
  }

  function updateFocusSessionNote(sessionId: string, focusNote: string) {
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      focusSessions: current.focusSessions.map((session) =>
        session.id === sessionId ? { ...session, focusNote, updatedAt: now } : session,
      ),
    }));
  }

  function toggleSubtask(subtaskId: string) {
    const now = new Date().toISOString();

    setData((current) => ({
      ...current,
      subtasks: current.subtasks.map((subtask) =>
        subtask.id === subtaskId
          ? { ...subtask, completed: !subtask.completed, updatedAt: now }
          : subtask,
      ),
    }));
  }

  function deleteSubtask(subtaskId: string) {
    setData((current) => ({
      ...current,
      subtasks: current.subtasks.filter((subtask) => subtask.id !== subtaskId),
    }));
  }

  // === Shared task lifecycle (spec §0.1.1) ===

  function completeTask(taskId: string) {
    updateTask(taskId, { status: "done" });
  }

  // Snooze moves the planned work date only — never the deadline (spec §0.5.9).



  // === Projects ===
  function createProject(input: {
    name: string;
    color?: string;
    type?: ProjectType;
    description?: string;
    dueDate?: string;
    icon?: string;
  }): string {
    const name = input.name.trim();
    if (!name) {
      return "";
    }
    const project = normalizeProject({
      id: createId("project"),
      name,
      color: input.color ?? "#007AFF",
      type: input.type ?? "project",
      description: input.description ?? "",
      dueDate: input.dueDate ?? "",
      icon: input.icon,
    });
    setData((current) => ({ ...current, projects: [...current.projects, project] }));
    return project.id;
  }

  function updateProject(projectId: string, patch: Partial<Project>) {
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId ? { ...project, ...patch, updatedAt: now } : project,
      ),
    }));
  }

  function toggleProjectPinned(projectId: string) {
    setData((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId ? { ...project, pinned: !project.pinned } : project,
      ),
    }));
  }

  // --- Learning Paths (Horizons) --------------------------------------------
  // Thin wrappers over the pure operations in domain/horizons/pathMutations so
  // the rules stay testable and this hook only owns the state transition.

  function createLearningPath(input: {
    goal: string;
    targetDate?: string;
    projectId?: string;
    milestones?: Milestone[];
    source?: LearningPath["source"];
  }): LearningPath | null {
    const goal = input.goal.trim();
    if (!goal) return null;
    const now = new Date().toISOString();
    const path: LearningPath = {
      id: createId("lpath"),
      goal,
      milestones: input.milestones ?? [],
      targetDate: input.targetDate,
      projectId: input.projectId,
      source: input.source ?? "user",
      createdAt: now,
      updatedAt: now,
    };
    setData((current) => ({ ...current, learningPaths: pathOps.addPath(current.learningPaths, path) }));
    // The whole record, not just its id: the assistant panel needs the saved
    // path in hand to show the position line without waiting for a re-render.
    return path;
  }

  function updateLearningPath(pathId: string, patch: Partial<Omit<LearningPath, "id">>) {
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      learningPaths: pathOps.patchPath(current.learningPaths, pathId, patch, now),
    }));
  }

  function deleteLearningPath(pathId: string) {
    setData((current) => ({ ...current, learningPaths: pathOps.dropPath(current.learningPaths, pathId) }));
  }

  function addMilestone(pathId: string, input: { title: string; doneCriteria?: string; targetDate?: string }) {
    const title = input.title.trim();
    if (!title) return;
    const now = new Date().toISOString();
    const milestone: Milestone = {
      id: createId("mstone"),
      title,
      doneCriteria: input.doneCriteria?.trim() ?? "",
      cardIds: [],
      targetDate: input.targetDate,
    };
    setData((current) => ({
      ...current,
      learningPaths: pathOps.addMilestone(current.learningPaths, pathId, milestone, now),
    }));
  }

  function updateMilestone(pathId: string, milestoneId: string, patch: Partial<Omit<Milestone, "id">>) {
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      learningPaths: pathOps.patchMilestone(current.learningPaths, pathId, milestoneId, patch, now),
    }));
  }

  function deleteMilestone(pathId: string, milestoneId: string) {
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      learningPaths: pathOps.dropMilestone(current.learningPaths, pathId, milestoneId, now),
    }));
  }

  // The Month → Day bridge (HORIZONS_DESIGN.md D6): one action, because a task
  // created from a milestone but not linked back to it would leave the
  // milestone unable to tell whether its own work is moving.
  function createTaskFromMilestone(pathId: string, milestoneId: string, title: string): string {
    const taskId = createTask({ title, status: "todo", scheduledDate: todayValue() });
    if (!taskId) return "";
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      learningPaths: pathOps.patchMilestone(
        current.learningPaths,
        pathId,
        milestoneId,
        {
          taskIds: [
            ...(current.learningPaths
              .find((path) => path.id === pathId)
              ?.milestones.find((milestone) => milestone.id === milestoneId)?.taskIds ?? []),
            taskId,
          ],
        },
        now,
      ),
    }));
    return taskId;
  }

  function linkCardToMilestone(pathId: string, milestoneId: string, cardId: string): LearningPath | null {
    const now = new Date().toISOString();
    const next = pathOps.linkCardToMilestone(data.learningPaths, pathId, milestoneId, cardId, now);
    setData((current) => ({
      ...current,
      learningPaths: pathOps.linkCardToMilestone(current.learningPaths, pathId, milestoneId, cardId, now),
    }));
    return next.find((path) => path.id === pathId) ?? null;
  }

  // === App settings + recent items ===
  function updateAppSettings(patch: Partial<AppSettings>) {
    setData((current) => ({ ...current, appSettings: { ...current.appSettings, ...patch } }));
  }

  function updatePlannerSettings(patch: Partial<PlannerSettings>) {
    const now = new Date().toISOString();
    setDataState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        ...patch,
        updatedAt: now,
      },
    }));
  }


  function importData(raw: unknown): boolean {
    if (!raw || typeof raw !== "object") {
      return false;
    }

    const normalized = adoptLoadedData(normalizeData(raw as Partial<PlannerData>));
    setData(normalized);
    setSelectedTaskId("");
    return true;
  }

  function exportData(): PlannerData {
    return normalizeData(data);
  }

  function resetData() {
    setData(emptyData());
    setSelectedTaskId("");
  }

  return {
    tasks: data.tasks,
    projects: data.projects,
    subtasks: data.subtasks,
    learningPaths: data.learningPaths,
    focusSessions: data.focusSessions,
    activeSessionId: data.activeSessionId,
    activeFocusSession:
      data.focusSessions.find(
        (session) =>
          session.id === data.activeSessionId && (session.status === "running" || session.status === "paused"),
      ) ?? null,
    settings: data.settings,
    appSettings: data.appSettings,
    selectedTask,
    auth: {
      isConfigured: isSupabaseConfigured,
      isLoading: authLoading,
      userEmail,
      isSignedIn: Boolean(userEmail),
      mode: userEmail ? "supabase" : "localStorage",
      syncStatus,
      syncError,
      recoveryMode,
      migrationPreviewCount: localMigrationData ? countPlannerDataItems(localMigrationData) : 0,
    },
    addTask,
    createTask,
    updateTask,
    completeTask,
    deleteTask,
    restoreDeletedTask,
    restoreDeletedProject,
    archiveTask,
    restoreTask,
    duplicateTask,
    toggleTaskDone,
    addProject,
    createProject,
    updateProject,
    toggleProjectPinned,
    archiveProject,
    restoreProject,
    deleteProject,
    addSubtask,
    toggleSubtask,
    deleteSubtask,
    createLearningPath,
    updateLearningPath,
    deleteLearningPath,
    addMilestone,
    updateMilestone,
    deleteMilestone,
    linkCardToMilestone,
    createTaskFromMilestone,
    updateAppSettings,
    updatePlannerSettings,
    startFocusSession,
    pauseFocusSession,
    resumeFocusSession,
    stopFocusSession,
    deleteFocusSession,
    updateFocusSessionNote,
    resetData,
    importData,
    exportData,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    uploadLocalDataToSupabase,
    refreshSupabaseData: loadSupabaseData,
    selectTask: setSelectedTaskId,
  };
}
