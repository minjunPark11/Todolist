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
  Folder,
  Language,
  List,
  ListSection,
  PlannerData,
  PlannerSettings,
  Project,
  ProjectType,
  RawPlannerData,
  RepeatType,
  SavedFilter,
  SidebarFolder,
  Space,
  Subtask,
  Tag,
  Task,
  TaskDailyPlan,
  TaskTag,
  DailyPlanBucket,
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
import * as hierarchy from "../domain/spaces/hierarchy";
import * as lifecycle from "../domain/spaces/lifecycle";
import * as spaceTree from "../domain/spaces/spaces";
import { sanitizeFolder, sanitizeList } from "../domain/spaces/hierarchy";
import {
  adoptLegacyBucketOverrides,
  applyBucketOverrides,
  planTaskForDate,
  prunePlansBefore,
  sanitizeDailyPlan,
} from "../domain/today/dailyPlan";
import { backfillTaskTags, sanitizeTag, sanitizeTaskTag } from "../domain/tags/tags";
import { sanitizeListSection } from "../domain/tasks/sections";
import { addSidebarFolder, sanitizeSidebarFolder } from "../domain/tasks/sidebarFolders";
import { sanitizeSavedFilter } from "../domain/tasks/filters";
import { backfillTaskListId, defaultListIdFor, patchForGoalListMove, patchForListMove } from "../domain/spaces/membership";
import * as pathOps from "../domain/horizons/pathMutations";
import { normalizeGoalTiming } from "../domain/horizons/goalSchedule";
import { childDraft, promoteDraft } from "../domain/tasks/children";
import { countPlannerDataItems } from "../domain/migrations/plannerDataMigration";
import { persistPlannerData, PLANNER_STORAGE_KEY } from "../domain/migrations/persistPlannerData";
import { addCustomStatus as addCustomStatusRecord, archiveCustomStatus as archiveCustomStatusRecord, moveGoalToStatus as moveGoalToStatusRecord, patchCustomStatus as patchCustomStatusRecord, reconcileGoalStatuses, sanitizeCustomStatuses } from "../domain/spaces/customStatuses";
import { recoverStaleFocusSessions } from "../domain/focus/selectors";
import {
  buildSyncPlan,
  collectionTables,
  isEmptySyncPlan,
  optionalRemoteTables,
} from "../domain/sync/buildSyncPlan";
import { buildMigrationUpload } from "../domain/sync/buildMigrationUpload";
import { createSaveQueue, type SaveQueue } from "../domain/sync/saveQueue";
import { addDays, addMonths, todayValue } from "../utils/date";
import { planRecurringCompletion } from "../utils/planner";
import { planScheduleUpdate, type Schedule, type ScheduleIssue } from "../domain/schedule";

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

  // The promotion that used to live here — copying `dueDate` into
  // `scheduledDate` when a record had a time but no work day — is gone
  // (SCHEDULE_EDITOR_PHASE0_AUDIT.md §6, 1-d).
  //
  // It ran in the direction the consolidation reverses, so it fought every
  // write the calendar now makes: a task saved with a time and a date came
  // straight back out carrying the legacy field again. It is also redundant.
  // The record it existed for — a time and a `dueDate`, no work day — is what
  // `scheduleFromTask` calls `canonical`, and reads as a timed block on that
  // date without help.
  //
  // Existing rows keep whatever `scheduledDate` they already have; the adapter
  // reads both shapes, and the rewrite is its own phase.
  const dueDate = task.dueDate ?? "";
  const startTime = task.startTime ?? "";
  const scheduledDate = task.scheduledDate ?? "";

  return {
    // Forward compatibility (SPACES_CLICKUP_REDESIGN.md M0). Everything below
    // overwrites what it knows, so legacy repairs like the status migration
    // above still win; the spread exists only to carry fields this build has
    // never heard of. Without it a client one version behind silently erases
    // any field a newer one wrote — it normalizes on load, drops what it does
    // not recognise, and saves the result back over the account.
    ...task,
    id: task.id ?? createId("task"),
    title: task.title ?? "Untitled task",
    description: task.description ?? "",
    status: oneOf(rawStatus, taskStatuses, "todo"),
    priority: oneOf(task.priority, taskPriorities, "none"),
    dueDate,
    scheduledDate,
    startDate: task.startDate ?? "",
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
    ...project, // M0 — see normalizeTask
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
    boardLists: sanitizeCustomStatuses(project.boardLists),
  };
}

function normalizeSubtask(subtask: Partial<Subtask>): Subtask {
  const now = new Date().toISOString();

  return {
    ...subtask, // M0 — see normalizeTask
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
    ...session, // M0 — see normalizeTask
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
    ...settings, // M0 — see normalizeTask
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
    ...calendar, // M0 — see normalizeTask
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
    // M0 — see normalizeTask. Matters here as much as on the records: the
    // ClickApps-style feature toggles (CLICKUP_IMPORT_DESIGN.md P2) land in
    // this object, and an older client must not switch them all back off.
    ...settings,
    theme: oneOf(settings?.theme, themeModes, DEFAULT_APP_SETTINGS.theme),
    accentColor: oneOf(settings?.accentColor, accentColors, DEFAULT_APP_SETTINGS.accentColor),
    fontSize: oneOf(settings?.fontSize, fontSizes, DEFAULT_APP_SETTINGS.fontSize),
    language: oneOf(settings?.language, languages, DEFAULT_APP_SETTINGS.language),
    defaultView: oneOf(
      settings?.defaultView,
      // "/planning" stays accepted: it is stored in existing accounts and
      // resolves to the Board, so dropping it here would reset those users.
      ["/today", "/inbox", "/calendar", "/board", "/planning", "/projects", "/focus"] as const,
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

/**
 * The gate every record from outside this running instance passes through —
 * Supabase loads, localStorage reads, and imports alike.
 *
 * Exported for the forward-compatibility test only (M0). Nothing else should
 * call it from outside this module.
 */
export function normalizeData(data: RawPlannerData): PlannerData {
  const normalized = {
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
          .map((path) => sanitizeLearningPath(path))
          .filter((path): path is LearningPath => path !== null)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      : [],
    // The work area above Project (SPACES_REDESIGN_II §4). Stays empty until
    // there is a Project to file, so a fresh account creates nothing.
    spaces: Array.isArray(data.spaces)
      ? data.spaces.map(spaceTree.sanitizeSpace).filter((space): space is Space => space !== null)
      : [],
    // Space hierarchy (P3). Both collections stay empty until the Spaces UI
    // creates anything; attaching Items to Lists is P4.
    folders: Array.isArray(data.folders)
      ? data.folders.map(sanitizeFolder).filter((folder): folder is Folder => folder !== null)
      : [],
    lists: Array.isArray(data.lists)
      ? data.lists.map(sanitizeList).filter((list): list is List => list !== null)
      : [],
    // The Tasks sidebar's own grouping of Lists (§6.33), beside the domain
    // Folder rather than instead of it — every List keeps answering with the
    // Folder it hangs under until the user moves it.
    sidebarFolders: Array.isArray(data.sidebarFolders)
      ? data.sidebarFolders
          .map(sanitizeSidebarFolder)
          .filter((folder): folder is SidebarFolder => folder !== null)
      : [],
    // The user's own Filters (§6.49). A Query saved under a name, not a
    // container: deleting one deletes no Task, and the built-in Smart Lists
    // above them are never records (§6.48).
    savedFilters: Array.isArray(data.savedFilters)
      ? data.savedFilters.map(sanitizeSavedFilter).filter((filter): filter is SavedFilter => filter !== null)
      : [],
    // Board columns belonging to one List (§6.26). Empty until something
    // creates one — every Task starts in the unsectioned default column, and
    // the Inbox Board's columns are dates and never records at all (§6.24).
    listSections: Array.isArray(data.listSections)
      ? data.listSections.map(sanitizeListSection).filter((section): section is ListSection => section !== null)
      : [],
    // One day's planning decisions per record (§6.18), replacing a blob that
    // never left the device it was made on.
    dailyPlans: Array.isArray(data.dailyPlans)
      ? data.dailyPlans.map(sanitizeDailyPlan).filter((plan): plan is TaskDailyPlan => plan !== null)
      : [],
    // Tags as records beside the strings in `Task.tags` (§6.45), not instead
    // of them — see domain/tags for why both are true at once.
    tags: Array.isArray(data.tags)
      ? data.tags.map(sanitizeTag).filter((tag): tag is Tag => tag !== null)
      : [],
    taskTags: Array.isArray(data.taskTags)
      ? data.taskTags.map(sanitizeTaskTag).filter((link): link is TaskTag => link !== null)
      : [],
    settings: normalizeSettings(data.settings),
    appSettings: normalizeAppSettings(data.appSettings),
  };
  return { ...normalized, learningPaths: reconcileGoalStatuses(normalized.projects, normalized.learningPaths) };
}

function emptyData(): PlannerData {
  return normalizeData({});
}

// Any data crossing into the app from outside this running instance goes
// through here, so a timer left running when the app closed can't keep
// accruing wall-clock time (see recoverStaleFocusSessions).
function adoptLoadedData(data: PlannerData): PlannerData {
  const now = new Date().toISOString();
  const focusSessions = recoverStaleFocusSessions(data.focusSessions);
  const learningPaths = adoptLegacyLearningPaths(data.learningPaths);
  const legacyAdopted = adoptLegacyLocalSpaces(data.projects);
  // STEP 5 (§40 M2/M4): one Space, and every Project filed under it. This is
  // the whole Space migration's write budget — Projects number in the tens,
  // and nothing beneath them is touched, which is the property that made this
  // model cheaper than demoting Project to a Folder (§8, H-INV-05).
  const spaces = spaceTree.ensureDefaultSpace(data.spaces, legacyAdopted, now);
  const projects = spaceTree.backfillProjectSpace(legacyAdopted);
  // P4 (M3): every Project gets a default List so an Item always has somewhere
  // to be. Tasks and goals are not rewritten, because while a Project has one
  // List their membership is already answered by projectId
  // (domain/spaces/membership).
  const withDefaults = hierarchy.ensureDefaultLists(
    projects.filter((project) => !project.archivedAt).map((project) => project.id),
    data.lists,
    now,
    defaultListIdFor,
  );
  // TickTick plan Migration Phase 2 (§6.69): the account gets its Inbox, the
  // one List belonging to no Project. Phase 3 (§6.70) then writes down which
  // List owns each Task, so `listIdFor`'s derivation stops being the answer
  // and becomes a fallback for records neither phase has reached.
  const lists = hierarchy.ensureInboxList(withDefaults, now);
  const tasks = backfillTaskListId(data.tasks, lists, now);
  // §6.18. The plan made on another device arrives with the account; the blob
  // this replaces arrives from this one. Days already past are dropped — no
  // screen reads them, and a table that only grows would carry decisions
  // nobody can act on any more.
  const dailyPlans = prunePlansBefore(adoptLegacyBucketOverrides(data.dailyPlans, now), todayValue());
  // §6.45: the tags the tasks already carry as strings, written down as
  // records. Nothing rewrites a Task — the strings stay where every current
  // reader expects them, so this adds rows without putting the task table on
  // the wire.
  const tagged = backfillTaskTags(data.tasks, data.tags, data.taskTags, now);
  if (
    focusSessions === data.focusSessions &&
    learningPaths === data.learningPaths &&
    projects === data.projects &&
    spaces === data.spaces &&
    lists === data.lists &&
    tasks === data.tasks &&
    dailyPlans === data.dailyPlans &&
    tagged.tags === data.tags &&
    tagged.taskTags === data.taskTags
  ) {
    return data;
  }
  return {
    ...data,
    focusSessions,
    learningPaths,
    projects,
    spaces,
    lists,
    tasks,
    dailyPlans,
    tags: tagged.tags,
    taskTags: tagged.taskTags,
  };
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
  /** Which load is the current one, so an older answer cannot win (§16.34). */
  const loadTicketRef = useRef(0);
  // Last state we know the account holds; the save diffs against it so an edit
  // uploads the records it touched instead of every row in every table.
  const syncedSnapshotRef = useRef<PlannerData | null>(null);
  // Which account the writes below belong to, readable from callbacks that were
  // created before the current render (§16.34's account-switch race).
  const userEmailRef = useRef(userEmail);
  userEmailRef.current = userEmail;
  // One save at a time, newest state last, retried when the network refuses.
  // Created once: everything it reads is a ref or a hoisted declaration, so it
  // never needs rebuilding for a later render.
  const saveQueueRef = useRef<SaveQueue<SaveRequest> | null>(null);
  if (!saveQueueRef.current) {
    saveQueueRef.current = createSaveQueue<SaveRequest>({
      perform: ({ data: nextData, ownerEmail }) => performSave(nextData, ownerEmail),
      onSettled: ({ ok, error, willRetry }) => {
        if (ok) {
          setSyncError("");
          setSyncStatus("sync.synced");
          return;
        }
        console.error("[Supabase] save failed:", error);
        setSyncError(error instanceof Error ? error.message : "Could not save Supabase data.");
        // A queued retry is a different state from a save that gave up: the
        // edit is still going to be uploaded, and saying "failed" would push
        // the user toward re-entering work that is not lost.
        setSyncStatus(willRetry ? "sync.retrying" : "sync.syncFailed");
      },
      scheduleRetry: (run, delayMs) => {
        window.setTimeout(run, delayMs);
      },
    });
  }
  const saveQueue = saveQueueRef.current;

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
      // else's rows, so the next sign-in must start from a fresh load, and
      // anything still queued was meant for the account we just left.
      syncedSnapshotRef.current = null;
      saveQueue.reset();
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
      // The queue owns ordering and retry; the debounce only decides when the
      // user has stopped typing.
      saveQueue.request({ data, ownerEmail: userEmail });
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

    // §16.34's "stale response ignore". Two loads can be in flight at once —
    // a retry, a re-auth, a tab coming back — and the network does not promise
    // they finish in order. Without this the OLDER answer can land last and
    // replace the account's state with what it looked like a moment ago, which
    // is a data-loss bug that only shows up on a slow connection.
    const ticket = (loadTicketRef.current += 1);
    const isStale = () => loadTicketRef.current !== ticket;

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
      // A newer load has started since this one began; its answer is the one
      // that should win, and this one has nothing to add.
      if (isStale()) return;
      setDataState(loaded);
      // What we just read IS what the account holds, so the next save has
      // nothing to push until the user actually changes something.
      syncedSnapshotRef.current = loaded;
      setRemoteLoaded(true);
      setSyncStatus("sync.synced");
    } catch (error) {
      // A failure from a superseded load is not this load's failure to report:
      // showing it would put an error on screen while a good load is running.
      if (isStale()) return;
      const message = error instanceof Error ? error.message : "Could not load Supabase data.";
      console.error("[Supabase] load failed:", error);
      setRemoteLoaded(false);
      setSyncError(message);
      setSyncStatus("sync.loadFailed");
    }
  }

  /** One request the save queue can run: a whole state, and whose account it is. */
  type SaveRequest = { data: PlannerData; ownerEmail: string };

  // Performs ONE save. It throws on failure rather than reporting it, because
  // the queue decides what a failure means — retry, or drop because the account
  // has changed — and a swallowed error is indistinguishable from a save that
  // worked. Ordering, coalescing and retry all live in createSaveQueue.
  async function performSave(nextData: PlannerData, ownerEmail: string) {
    if (!supabase) {
      return;
    }

    // This state was captured for an account we are no longer signed into.
    if (ownerEmail !== userEmailRef.current) {
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

    const userId = await getUserId();
    if (!userId) {
      return;
    }
    // getUserId answers for whoever is signed in NOW. Signing out and back in
    // as someone else during that round trip used to write the previous
    // account's rows under the new account's user_id.
    if (ownerEmail !== userEmailRef.current) {
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

    // The account may have changed while the writes were in flight; the
    // baseline describes one account's rows and must not be set from another.
    if (ownerEmail !== userEmailRef.current) {
      return;
    }
    // Only advance the baseline once everything above succeeded; a failed
    // save must stay "not yet uploaded" so the retry resends it.
    syncedSnapshotRef.current = nextData;
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

    // Merge, never replace — see buildMigrationUpload. Saving the local state
    // directly diffed to "delete every record the account holds and this device
    // does not", which is not what a button labelled "upload" may do.
    const merged = buildMigrationUpload(localMigrationData, syncedSnapshotRef.current ?? data);
    setDataState(merged);
    saveQueue.request({ data: merged, ownerEmail: userEmailRef.current });
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

  /**
   * The canonical way to change a Task's dates (design §13, audit §7 Phase 4).
   *
   * Callers pass the schedule they want rather than the fields to set, and get
   * back whatever was wrong with it. `planScheduleUpdate` owns the three rules
   * every schedule write needs — normalize, validate, skip a no-op — so that a
   * new writer cannot arrive without them by simply calling `updateTask`.
   *
   * Returns the issues rather than throwing: an editor wants to show them
   * beside the field that caused them, and a drag handler wants to ignore
   * them and leave the task where it was.
   */
  function updateTaskSchedule(taskId: string, next: Schedule): ScheduleIssue[] {
    const task = data.tasks.find((entry) => entry.id === taskId);
    if (!task) return [];
    const plan = planScheduleUpdate(task, next);
    if (plan.patch) updateTask(taskId, plan.patch);
    return plan.issues;
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

  /**
   * `spaceId` is optional and answered by `spaceIdForProject` when absent, so
   * a caller with no Space in hand still creates a Project that appears in the
   * tree. The sidebar passes one because it knows which row was clicked —
   * writing it there beats creating the Project and moving it a moment later,
   * which would put two rows on the wire for one action.
   */
  function addProject(name: string, color: string, spaceId?: string) {
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
      ...(spaceId ? { spaceId } : {}),
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

  /** §13.28: back from either state, since a record is never in both. */
  function restoreProject(projectId: string) {
    const now = new Date().toISOString();

    setData((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId
          ? { ...project, status: "active", archivedAt: "", deletedAt: undefined, updatedAt: now }
          : project,
      ),
    }));
  }

  /**
   * §13.28, and this used to be the opposite (Phase 9).
   *
   * It hard-deleted the row and stripped `projectId` from every Task under it
   * — unrecoverable, and a write to every one of those Tasks. The plan is
   * explicit that a Project's lifecycle does not reach the work beneath it:
   * the row is marked deleted, its Lists keep pointing at it so restore needs
   * no backfill, and nothing under it moves. `permanentlyDeleteProject` is
   * where the row actually goes, and even there the Lists survive.
   */
  function deleteProject(projectId: string) {
    const now = new Date().toISOString();
    setData((current) => {
      const projects = lifecycle.trashProject(current.projects, projectId, now);
      return projects === current.projects ? current : { ...current, projects };
    });
  }

  /**
   * A child is a Task now (domain/tasks/children.ts). The `subtasks`
   * collection is no longer written to — it is only read, so the rows already
   * there keep working until each is touched.
   */
  function addSubtask(taskId: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    const parent = data.tasks.find((task) => task.id === taskId);
    if (!parent) return;
    createTask(childDraft(parent, trimmed));
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

  /**
   * Completing a legacy Subtask promotes it, because this is the moment its
   * record has to be written anyway — the conversion rides along and costs no
   * extra row. Nothing scans the collection to do this in bulk; a Subtask
   * nobody touches stays a Subtask, and stays readable.
   */
  function toggleSubtask(subtaskId: string) {
    const subtask = data.subtasks.find((item) => item.id === subtaskId);
    if (!subtask) {
      // Already a Task — the id is a task id, and completion is that path's.
      toggleTaskDone(subtaskId);
      return;
    }
    const parent = data.tasks.find((task) => task.id === subtask.taskId);
    if (!parent) return;
    createTask({ ...promoteDraft(parent, subtask), status: subtask.completed ? "todo" : "done" });
    setData((current) => ({
      ...current,
      subtasks: current.subtasks.filter((item) => item.id !== subtaskId),
    }));
  }

  function deleteSubtask(subtaskId: string) {
    setData((current) => {
      if (current.subtasks.some((item) => item.id === subtaskId)) {
        return { ...current, subtasks: current.subtasks.filter((item) => item.id !== subtaskId) };
      }
      // A promoted child is a Task; deleting it is the Task path, soft-delete
      // and all, so it can be undone like any other.
      return {
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === subtaskId ? { ...task, deletedAt: new Date().toISOString() } : task,
        ),
      };
    });
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

  function createStatus(projectId: string, name: string) {
    const title = name.trim();
    if (!title) return;
    const now = new Date().toISOString();
    setData((current) => ({ ...current, projects: addCustomStatusRecord(current.projects, projectId, { id: createId("blist"), name: title, order: current.projects.find((project) => project.id === projectId)?.boardLists?.length ?? 0 }, now) }));
  }

  function updateStatus(projectId: string, listId: string, patch: { name?: string; order?: number }) {
    const now = new Date().toISOString();
    setData((current) => ({ ...current, projects: patchCustomStatusRecord(current.projects, projectId, listId, patch, now) }));
  }

  function archiveStatus(projectId: string, listId: string) {
    const now = new Date().toISOString();
    setData((current) => {
      const next = archiveCustomStatusRecord(current.projects, current.learningPaths, projectId, listId, now);
      return { ...current, projects: next.projects, learningPaths: next.paths };
    });
  }

  function moveGoalToStatus(pathId: string, listId?: string) {
    const now = new Date().toISOString();
    setData((current) => ({ ...current, learningPaths: moveGoalToStatusRecord(current.learningPaths, current.projects, pathId, listId, now) }));
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
    schedule?: LearningPath["schedule"];
    deadlineDate?: string;
    targetDate?: string;
    projectId?: string;
    boardListId?: string;
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
      ...normalizeGoalTiming(input, todayValue()),
      projectId: input.projectId,
      boardListId: input.boardListId,
      boardOrder: input.projectId
        ? data.learningPaths
            .filter((path) => path.projectId === input.projectId && path.boardListId === input.boardListId)
            .reduce((max, path) => Math.max(max, path.boardOrder ?? -1), -1) + 1
        : undefined,
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

  function addMilestone(pathId: string, input: {
    title: string;
    doneCriteria?: string;
    schedule?: Milestone["schedule"];
    deadlineDate?: string;
    targetDate?: string;
  }) {
    const title = input.title.trim();
    if (!title) return;
    const now = new Date().toISOString();
    const milestone: Milestone = {
      id: createId("mstone"),
      title,
      doneCriteria: input.doneCriteria?.trim() ?? "",
      cardIds: [],
      ...("schedule" in input || "deadlineDate" in input || "targetDate" in input
        ? normalizeGoalTiming(input, todayValue())
        : {}),
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

  // === Spaces (SPACES_REDESIGN_II STEP 5) ===
  // The tree and routing arrive in STEP 6/11; these exist now so the
  // collection has one owner from the start, like every other record type.
  function createSpace(name: string): string {
    const now = new Date().toISOString();
    const space = spaceTree.makeSpace(createId("space"), name.trim(), now);
    setData((current) => ({ ...current, spaces: spaceTree.addSpace(current.spaces, space) }));
    return space.id;
  }

  function updateSpace(spaceId: string, patch: Partial<Space>) {
    const now = new Date().toISOString();
    setData((current) => {
      const spaces = spaceTree.patchSpace(current.spaces, spaceId, patch, now);
      return spaces === current.spaces ? current : { ...current, spaces };
    });
  }

  /**
   * H-INV-06: a Space holding Projects is archived, never deleted — deleting
   * it would strand every Project, Folder, List and Task under it. The caller
   * checks `canDeleteSpace` to decide which it is offering; this refuses
   * rather than cascading if it is asked to do the wrong one.
   */
  function archiveSpace(spaceId: string) {
    const now = new Date().toISOString();
    setData((current) => {
      const spaces = spaceTree.archiveSpace(current.spaces, spaceId, now);
      return spaces === current.spaces ? current : { ...current, spaces };
    });
  }

  /**
   * §13.29, and it is not a cascade: the Lists become standalone and every
   * Task under them is untouched. Deleting the work is a separate action the
   * user has to take on purpose.
   */
  function permanentlyDeleteProject(projectId: string) {
    const now = new Date().toISOString();
    setData((current) => {
      const next = lifecycle.permanentlyDeleteProject(current.projects, current.lists, projectId, now);
      return next.done ? { ...current, projects: next.projects, lists: next.lists } : current;
    });
  }

  function trashSpace(spaceId: string) {
    const now = new Date().toISOString();
    setData((current) => {
      const spaces = lifecycle.trashSpace(current.spaces, spaceId, now);
      return spaces === current.spaces ? current : { ...current, spaces };
    });
  }

  function restoreSpace(spaceId: string) {
    const now = new Date().toISOString();
    setData((current) => {
      const spaces = lifecycle.restoreSpace(current.spaces, spaceId, now);
      return spaces === current.spaces ? current : { ...current, spaces };
    });
  }

  /** §13.32: blocked while any Project still names this Space. */
  function permanentlyDeleteSpace(spaceId: string) {
    setData((current) => {
      const next = lifecycle.permanentlyDeleteSpace(current.spaces, current.projects, spaceId);
      return next.done ? { ...current, spaces: next.spaces } : current;
    });
  }

  /** H-INV-05: one row. Nothing under the Project is rewritten. */
  function moveProjectToSpace(projectId: string, spaceId: string) {
    const now = new Date().toISOString();
    setData((current) => {
      const projects = spaceTree.moveProjectToSpace(current.projects, projectId, spaceId, current.spaces, now);
      return projects === current.projects ? current : { ...current, projects };
    });
  }

  // === Space hierarchy (P3) ===
  // Nothing calls these yet — the Spaces UI arrives in P6. They exist now so
  // the collections have a single owner from the start, the way every other
  // record type does, rather than being written from a component later.
  /**
   * What the caller may decide beyond name and place (Add List design §0.7
   * R0-2). Both are optional because the design's whole point is that a List
   * can be made from a name and nothing else.
   */
  function createList(
    projectId: string,
    name: string,
    folderId?: string,
    options: { color?: string; defaultViewKey?: string; sidebarFolderId?: string } = {},
  ): string {
    const now = new Date().toISOString();
    const list: List = {
      id: createId("list"),
      projectId,
      // The legacy mirror, written so a client from before the rename still
      // sees the List instead of dropping it (see `List.projectId`).
      spaceId: projectId,
      // Written explicitly, and it is not decoration. `sanitizeList` keeps a
      // List only when it has an owning Project OR says what kind it is, and a
      // List made from the Tasks sidebar has no Project to belong to (§6.3
      // makes that first-class). Without this the record would load once and
      // be dropped on the next read — a List that vanishes overnight.
      kind: "regular",
      folderId,
      name: name.trim(),
      // Absent rather than "" when unset: the field means "the user chose
      // this", and an empty string is a choice that reads as one.
      ...(options.color?.trim() ? { color: options.color.trim() } : {}),
      ...(options.defaultViewKey?.trim() ? { defaultViewKey: options.defaultViewKey.trim() } : {}),
      // The sidebar's own grouping, NOT the Project ladder's Folder (D18/D19).
      // A List made in the Tasks Module has no Project, and a domain Folder
      // belongs to one — so there is no Folder of that kind it could go in.
      ...(options.sidebarFolderId?.trim() ? { sidebarFolderId: options.sidebarFolderId.trim() } : {}),
      order: 0,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    setData((current) => {
      const lists = hierarchy.addList(current.lists, list);
      // U2's one-way reveal. Once a second List has EXISTED the tree keeps
      // showing the level, even if the count later drops back to one —
      // re-deciding from the live count would make a whole tree level vanish
      // because the user deleted a list, which reads as losing the lists.
      //
      // Writing it was blocked on M0: a client older than v0.6.0 would strip
      // this field on its next save. v0.6.0 shipped the passthrough, and
      // 0.6.1/0.7.0 followed, so the field now survives a round trip.
      const revealed = hierarchy.activeLists(lists, projectId).length > 1;
      const projects = revealed
        ? current.projects.map((project) =>
            project.id === projectId && project.listsRevealed !== true
              ? { ...project, listsRevealed: true, updatedAt: now }
              : project,
          )
        : current.projects;
      return { ...current, lists, projects };
    });
    return list.id;
  }

  /**
   * A sidebar group, made because a List is going into it (Add List §6.32).
   *
   * `addSidebarFolder` has been in the domain, tested, with nothing able to
   * call it — the same gap `standaloneLists` had. Answers the new id so the
   * caller can select it straight away, which is the whole reason it was made.
   */
  function createSidebarFolder(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return "";
    const id = createId("sidebar-folder");
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      sidebarFolders: addSidebarFolder(current.sidebarFolders, trimmed, id, now),
    }));
    return id;
  }

  /** Created with a Space and never deletable, so an Item always has a home (D5). */
  function createDefaultList(spaceId: string): string {
    const now = new Date().toISOString();
    // Same derived id the backfill uses, so creating a Space and loading one
    // that predates Lists cannot end up with two different default Lists.
    const list = hierarchy.makeDefaultList(defaultListIdFor(spaceId), spaceId, now);
    setData((current) =>
      hierarchy.defaultListFor(current.lists, spaceId)
        ? current
        : { ...current, lists: hierarchy.addList(current.lists, list) },
    );
    return list.id;
  }

  function updateList(listId: string, patch: Partial<List>) {
    const now = new Date().toISOString();
    setData((current) => {
      const lists = hierarchy.patchList(current.lists, listId, patch, now);
      return lists === current.lists ? current : { ...current, lists };
    });
  }

  function archiveList(listId: string) {
    const now = new Date().toISOString();
    setData((current) => {
      const lists = hierarchy.archiveList(current.lists, listId, now);
      return lists === current.lists ? current : { ...current, lists };
    });
  }

  /**
   * The container lifecycle (§13.21-§13.24). Soft, every one of them: the
   * Tasks keep their `listId` through archive and delete alike, which is what
   * makes `restoreList` one field and keeps the Task Trash a list of what the
   * user threw away themselves.
   */
  function trashList(listId: string) {
    const now = new Date().toISOString();
    setData((current) => {
      const lists = lifecycle.trashList(current.lists, listId, now);
      return lists === current.lists ? current : { ...current, lists };
    });
  }

  function restoreList(listId: string) {
    const now = new Date().toISOString();
    setData((current) => {
      const lists = lifecycle.restoreList(current.lists, listId, now);
      return lists === current.lists ? current : { ...current, lists };
    });
  }

  /**
   * §6.56's one permitted hard cascade — the Tasks go with the List.
   *
   * Only reachable for a List already in the deleted state, so a single click
   * cannot arrive here, and the surface that calls it says how many Tasks it
   * is about to take (`taskCountInList`).
   */
  function permanentlyDeleteList(listId: string) {
    setData((current) => {
      const next = lifecycle.permanentlyDeleteList(current.lists, current.tasks, listId);
      return next.done ? { ...current, lists: next.lists, tasks: next.tasks } : current;
    });
  }

  function moveListToFolder(listId: string, folderId?: string) {
    const now = new Date().toISOString();
    setData((current) => {
      const lists = hierarchy.moveListToFolder(current.lists, listId, folderId, current.folders, now);
      return lists === current.lists ? current : { ...current, lists };
    });
  }

  /**
   * Drop an Item onto a List. The patch is empty when the move changes
   * nothing, so a drag that ends where it started puts no row on the wire.
   */
  function moveTaskToList(taskId: string, listId: string) {
    setData((current) => {
      const task = current.tasks.find((item) => item.id === taskId);
      if (!task) return current;
      const patch = patchForListMove(task, listId, current.lists);
      if (Object.keys(patch).length === 0) return current;
      const now = new Date().toISOString();
      return {
        ...current,
        tasks: current.tasks.map((item) => (item.id === taskId ? { ...item, ...patch, updatedAt: now } : item)),
      };
    });
  }

  function moveGoalToList(pathId: string, listId: string) {
    setData((current) => {
      const path = current.learningPaths.find((item) => item.id === pathId);
      if (!path) return current;
      const patch = patchForGoalListMove(path, listId, current.lists);
      if (Object.keys(patch).length === 0) return current;
      // Through patchPath, which drops the goal's Space-scoped column when the
      // Space changes — that rule stays in one place.
      const now = new Date().toISOString();
      return { ...current, learningPaths: pathOps.patchPath(current.learningPaths, pathId, patch, now) };
    });
  }

  /**
   * Make one day's plan say exactly `overrides` (§6.18).
   *
   * The whole map, not one task, because every caller on the Today page —
   * moving a row, planning the day, clearing it, and the undo that follows
   * each — deals in complete snapshots. `applyBucketOverrides` is what keeps
   * that from meaning a rewrite of every row.
   */
  function setTodayBuckets(overrides: Record<string, DailyPlanBucket>, planDate: string) {
    setData((current) => {
      const now = new Date().toISOString();
      const dailyPlans = applyBucketOverrides(current.dailyPlans, planDate, overrides, now);
      return dailyPlans === current.dailyPlans ? current : { ...current, dailyPlans };
    });
  }

  /**
   * Put a task on a day without saying where in it (§12.5.3).
   *
   * What Today's `+ 작업` contributes: the task has no due date, so this record
   * is the only thing keeping it on the screen that made it.
   */
  function planTaskForDay(taskId: string, planDate: string) {
    setData((current) => {
      const now = new Date().toISOString();
      const dailyPlans = planTaskForDate(current.dailyPlans, taskId, planDate, now);
      return dailyPlans === current.dailyPlans ? current : { ...current, dailyPlans };
    });
  }

  function createFolder(projectId: string, name: string): string {
    const now = new Date().toISOString();
    const folder: Folder = {
      id: createId("folder"),
      projectId,
      spaceId: projectId,
      name: name.trim(),
      order: 0,
      createdAt: now,
      updatedAt: now,
    };
    setData((current) => ({ ...current, folders: hierarchy.addFolder(current.folders, folder) }));
    return folder.id;
  }

  function updateFolder(folderId: string, patch: Partial<Folder>) {
    const now = new Date().toISOString();
    setData((current) => {
      const folders = hierarchy.patchFolder(current.folders, folderId, patch, now);
      return folders === current.folders ? current : { ...current, folders };
    });
  }

  function archiveFolder(folderId: string) {
    const now = new Date().toISOString();
    setData((current) => {
      const next = hierarchy.archiveFolder(current.folders, current.lists, folderId, now);
      if (next.folders === current.folders && next.lists === current.lists) return current;
      return { ...current, folders: next.folders, lists: next.lists };
    });
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
    spaces: data.spaces,
    folders: data.folders,
    lists: data.lists,
    sidebarFolders: data.sidebarFolders,
    listSections: data.listSections,
    savedFilters: data.savedFilters,
    dailyPlans: data.dailyPlans,
    tags: data.tags,
    taskTags: data.taskTags,
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
    updateTaskSchedule,
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
    createStatus,
    updateStatus,
    archiveStatus,
    moveGoalToStatus,
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
    createSpace,
    updateSpace,
    archiveSpace,
    moveProjectToSpace,
    createList,
    createSidebarFolder,
    createDefaultList,
    updateList,
    archiveList,
    trashList,
    restoreList,
    permanentlyDeleteList,
    permanentlyDeleteProject,
    trashSpace,
    restoreSpace,
    permanentlyDeleteSpace,
    moveListToFolder,
    moveTaskToList,
    moveGoalToList,
    setTodayBuckets,
    planTaskForDay,
    createFolder,
    updateFolder,
    archiveFolder,
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
