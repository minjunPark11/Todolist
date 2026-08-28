// The gate every record from outside a running instance passes through —
// Supabase loads, localStorage reads, imports, and (since the external-AI
// work) a server answering for an account with no browser attached.
//
// It lived inside usePlannerData, which is a React hook bound to a device.
// That was fine while the app was the only reader. It is not fine now: a
// server that read the same jsonb WITHOUT this gate would see records missing
// every field a normalizer fills in, and would answer a question about them
// differently from the app — the second truth that
// FOCUSFLOW_EXTERNAL_AI_ACCESS_ARCHITECTURE.md §24 exists to prevent. Pure by
// construction: no React, no platform, no Supabase.
//
// Two device-shaped defaults survive here (`detectTimezone`,
// `detectDefaultLanguage`) because they are what a FIRST run needs when the
// account holds nothing. A server must not use them as answers — the machine's
// own zone is not the user's — and does not: it reads the stored value and
// refuses when there is none (M1's "no guessing").
import type {
  AppSettings,
  CheckItem,
  ExternalCalendar,
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
  Reminder,
  SavedFilter,
  SidebarFolder,
  Space,
  Subtask,
  Tag,
  Task,
  TaskDailyPlan,
  TaskTag,
  TaskTemplate,
} from "../../types";
import * as spaceTree from "../spaces/spaces";
import { sanitizeFolder, sanitizeList } from "../spaces/hierarchy";
import { sanitizeTag, sanitizeTaskTag } from "../tags/tags";
import { sanitizeListSection } from "../tasks/sections";
import { sanitizeTaskTemplate } from "../tasks/templates";
import { sanitizeSidebarFolder } from "../tasks/sidebarFolders";
import { sanitizeSavedFilter } from "../tasks/filters";
import { sanitizeCheckItem } from "../tasks/checkItems";
import { sanitizeDailyPlan } from "../today/dailyPlan";
import { sanitizeReminder, scheduleFromTask, scheduleToTaskPatch } from "../schedule";
import { sanitizeFocusDefaultLength } from "../focus/sessionLength";
import { DEFAULT_BACKUP_KEEP, sanitizeBackupInterval, sanitizeBackupKeep } from "../backup/schedule";
import { clampHoursAtATime, HOURS_AT_A_TIME } from "../../utils/calendarTime";
import { MATRIX_QUADRANTS, type MatrixQuadrant } from "../../utils/eisenhower";
import { sanitizeMatrixView, type MatrixQuadrantView } from "../view/matrixGroups";
import { sanitizeMatrixRules } from "../view/matrixRules";

// Every value `status` may hold on disk: the three lifecycle values written
// since Ch. 26 §26.3.2, and the legacy six that accounts still carry. A value
// outside this set falls back to `open`, which is what an unrecognised
// non-terminal state means.
const taskStatuses = [
  "open",
  "completed",
  "wont_do",
  "inbox",
  "todo",
  "doing",
  "waiting",
  "done",
  "archived",
] as const;
const taskPriorities = ["none", "low", "medium", "high"] as const;
const projectTypes = ["project", "area"] as const;
const projectStatuses = ["active", "paused", "completed", "archived"] as const;
const accentColors = ["blue", "purple", "green", "pink", "orange"] as const;
const themeModes = ["light", "dark", "system"] as const;
const fontSizes = ["small", "medium", "large"] as const;
const languages = ["ko", "en"] as const;

// Unlike the language default below, this is re-read on every start: it is
// not a choice the user makes, and a stale one makes a reader outside the
// browser wrong about what day it is. "" when the platform cannot say.
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

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
  timeFormat: "locale",
  weekStart: "sunday",
  hoursAtATime: HOURS_AT_A_TIME,
  focusDefaultMinutes: "auto",
  autoBackup: "off",
  autoBackupKeep: DEFAULT_BACKUP_KEEP,
  sidebarCollapsed: false,
  reduceMotion: false,
  timezone: detectTimezone(),
  aiModel: "",
};

const repeatTypes = ["none", "daily", "weekly", "monthly", "yearly"] as const;
const focusModes = ["focus", "short_break", "long_break"] as const;
const focusStatuses = ["running", "paused", "completed", "cancelled"] as const;
const focusSources = ["focus_page", "today_page", "calendar_event", "global_bar"] as const;

export function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function oneOf<T extends readonly string[]>(value: unknown, options: T, fallback: T[number]): T[number] {
  return typeof value === "string" && options.includes(value) ? value : fallback;
}

export function normalizeTask(task: Partial<Task>): Task {
  const now = new Date().toISOString();

  // Migrate legacy statuses to the canonical lifecycle (spec §0.1.2).
  const rawStatus = migrateStatus(task.status);

  // The three date fields collapse to two, here, on every load
  // (SCHEDULE_EDITOR_PHASE0_AUDIT.md §7 Phase 10, rule 1-d).
  //
  // This is the step the audit marked irreversible, and the reason it is safe
  // to take now is the order the phases ran in: every reader already goes
  // through `scheduleFromTask`, so a record that still carries the legacy work
  // day and the record this produces from it read as the SAME Schedule. The
  // rewrite therefore changes what is stored without changing anything anyone
  // can see — which is what §7.1 meant by finding an order where the
  // dangerous step is no longer needed.
  //
  // Idempotent by construction: the adapter's output is already consolidated,
  // so running this over its own result is a no-op. That matters because it
  // runs on every load, not once behind a migration flag — there is no schema
  // and no migration table (audit §2), so the load path IS the migration.
  const consolidated = scheduleToTaskPatch(scheduleFromTask(task));
  const dueDate = consolidated.dueDate;
  const startTime = consolidated.startTime;

  // Taken OUT of the record rather than blanked. The forward-compat spread
  // below deliberately carries fields this build does not know, and the legacy
  // work day is the one field that must not survive that — left in, it would
  // be copied forward on every save and the consolidation above would run
  // against it forever instead of once.
  const { scheduledDate: _legacyWorkDay, ...carried } = task as Partial<Task> & { scheduledDate?: string };
  void _legacyWorkDay;

  // Nav Shell audit D-20: Task archiving is retired. An archived Task was a
  // Task nobody was going to do, which is what `wontDoAt` says — and saying it
  // with a marker instead of a status is D-23's whole point.
  //
  // Same idiom as the schedule consolidation above: idempotent, and on the
  // load path because there is no migration table.
  //
  // It used to put the Task back on the workflow status `previousStatus` held.
  // Lifecycle has one non-terminal value now (Ch. 26 §26.3.2), so there is one
  // place to come back to and nothing to look up.
  const wasArchived = rawStatus === "archived";
  const migratedStatus = wasArchived ? "open" : rawStatus;
  const wontDoAt = wasArchived ? task.wontDoAt || task.archivedAt || now : task.wontDoAt;

  return {
    // Forward compatibility (SPACES_CLICKUP_REDESIGN.md M0). Everything below
    // overwrites what it knows, so legacy repairs like the status migration
    // above still win; the spread exists only to carry fields this build has
    // never heard of. Without it a client one version behind silently erases
    // any field a newer one wrote — it normalizes on load, drops what it does
    // not recognise, and saves the result back over the account.
    ...carried,
    id: task.id ?? createId("task"),
    title: task.title ?? "Untitled task",
    description: task.description ?? "",
    status: oneOf(migratedStatus, taskStatuses, "open"),
    priority: oneOf(task.priority, taskPriorities, "none"),
    dueDate,
    startDate: consolidated.startDate,
    startTime,
    endTime: consolidated.endTime,
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
    // Cleared by the migration above, and never written again (D-20).
    archivedAt: wasArchived ? "" : task.archivedAt ?? "",
    wontDoAt: wontDoAt ?? "",
    deletedAt: task.deletedAt,
    // `previousStatus` is dormant (Ch. 26 §26.3.2). It is neither read nor
    // written now; the M0 spread above carries whatever a record still holds.
    previousStatus: undefined,
    blockedByTaskId: task.blockedByTaskId ?? "",
    repeatType: oneOf(task.repeatType, repeatTypes, "none"),
    repeatInterval: task.repeatInterval ?? 1,
    repeatDays: Array.isArray(task.repeatDays) ? task.repeatDays : [],
    repeatEndDate: task.repeatEndDate ?? "",
    // Not validated against the preset union here — `scheduleFromTask` does
    // that on the way into the editor, and normalizing it twice would mean two
    // places to update when a preset is added.
    reminder: typeof task.reminder === "string" ? task.reminder : "",
  };
}

function migrateStatus(status: unknown): string {
  if (status === "in_progress") return "doing";
  if (status === "blocked") return "waiting";
  return typeof status === "string" ? status : "open";
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


export function normalizeSettings(settings?: Partial<PlannerSettings>): PlannerSettings {
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

export function normalizeAppSettings(settings?: Partial<AppSettings>): AppSettings {
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
    timeFormat: oneOf(settings?.timeFormat, ["locale", "12h", "24h"] as const, DEFAULT_APP_SETTINGS.timeFormat),
    weekStart: oneOf(settings?.weekStart, ["sunday", "monday"] as const, DEFAULT_APP_SETTINGS.weekStart),
    // The only numeric setting, so it gets a clamp rather than `oneOf`: a
    // record written by a future client with a wider range should land at the
    // nearest hour we can draw, not back at the default.
    hoursAtATime: clampHoursAtATime(settings?.hoursAtATime),
    focusDefaultMinutes: sanitizeFocusDefaultLength(settings?.focusDefaultMinutes),
    autoBackup: sanitizeBackupInterval(settings?.autoBackup),
    autoBackupKeep: sanitizeBackupKeep(settings?.autoBackupKeep),
    // `showSidebarCounts` was here (SETTINGS_REVIEW.md 3.4). It is not migrated
    // away or deleted from stored records: the M0 spread above carries it, so a
    // saved value survives untouched if sidebar counts are ever built.
    sidebarCollapsed: settings?.sidebarCollapsed ?? DEFAULT_APP_SETTINGS.sidebarCollapsed,
    reduceMotion: settings?.reduceMotion ?? DEFAULT_APP_SETTINGS.reduceMotion,
    // A stored value wins here even when it disagrees with this device: the
    // refresh effect owns correcting it, and doing it here instead would
    // rewrite the field on every single load.
    timezone:
      typeof settings?.timezone === "string" && settings.timezone ? settings.timezone : DEFAULT_APP_SETTINGS.timezone,
    aiModel: typeof settings?.aiModel === "string" ? settings.aiModel : DEFAULT_APP_SETTINGS.aiModel,
    // Absent stays absent: a box nobody has arranged reads as the default, and
    // writing four full view records into every account that never opened the
    // matrix would be storing a preference nobody expressed.
    ...(settings?.matrixQuadrantViews
      ? { matrixQuadrantViews: sanitizeMatrixViews(settings.matrixQuadrantViews) }
      : {}),
    // Same rule, for the same reason: absent means the default mapping, and
    // writing four full rules into an account that never opened the editor
    // would store a decision nobody made.
    ...(settings?.matrixQuadrantRules
      ? { matrixQuadrantRules: sanitizeMatrixRules(settings.matrixQuadrantRules) }
      : {}),
  };
}

/**
 * The matrix's per-box view settings, as this build understands them.
 *
 * Only the four boxes it knows, each folded to something drawable — these sync,
 * so a value written by another version must not be able to leave a box unable
 * to render.
 */
function sanitizeMatrixViews(
  value: Partial<Record<MatrixQuadrant, unknown>>,
): Partial<Record<MatrixQuadrant, MatrixQuadrantView>> {
  const views: Partial<Record<MatrixQuadrant, MatrixQuadrantView>> = {};
  for (const quadrant of MATRIX_QUADRANTS) {
    const stored = value?.[quadrant];
    if (stored) views[quadrant] = sanitizeMatrixView(stored);
  }
  return views;
}

/**
 * The gate every record from outside this running instance passes through —
 * Supabase loads, localStorage reads, imports, and server reads alike.
 *
 * Two callers now: usePlannerData, and the server's repository. That is the
 * point of the move — one gate, so the app and an outside AI cannot disagree
 * about what a stored record says.
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
    // Goals are preserved, not read (types.ts StoredGoal): the feature that
    // made and showed them is gone, so the records pass through the load
    // untouched rather than being validated against a shape nothing uses.
    learningPaths: Array.isArray(data.learningPaths) ? data.learningPaths : [],
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
    checkItems: Array.isArray(data.checkItems)
      ? data.checkItems.map(sanitizeCheckItem).filter((item): item is CheckItem => item !== null)
      : [],
    reminders: Array.isArray(data.reminders)
      ? data.reminders.map(sanitizeReminder).filter((row): row is Reminder => row !== null)
      : [],
    taskTemplates: Array.isArray(data.taskTemplates)
      ? data.taskTemplates
          .map(sanitizeTaskTemplate)
          .filter((row): row is TaskTemplate => row !== null)
      : [],
    settings: normalizeSettings(data.settings),
    appSettings: normalizeAppSettings(data.appSettings),
  };
  return normalized;
}

export function emptyData(): PlannerData {
  return normalizeData({});
}
