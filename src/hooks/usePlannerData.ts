import { useEffect, useMemo, useRef, useState } from "react";
import { sampleData } from "../data/sampleData";
import { isSupabaseConfigured, supabase } from "../services/supabaseClient";
import type {
  AppSettings,
  ConceptNote,
  FocusMode,
  FocusSession,
  Habit,
  HabitFrequency,
  HabitLog,
  Language,
  NoteDifficulty,
  NoteType,
  PlannerData,
  PlannerSettings,
  Project,
  ProjectType,
  RawPlannerData,
  RecentItem,
  RepeatType,
  ReviewDifficulty,
  StoredReviewStatus,
  StudyTopic,
  StudyTopicCategory,
  Subtask,
  Task,
  TaskDraft,
  TaskTemplate,
} from "../types";
import { addDays, addMonths, todayValue } from "../utils/date";

const STORAGE_KEY = "focusflow.appData.v1";
const LEGACY_STORAGE_KEY = "todo-planner-data";
const taskStatuses = ["inbox", "todo", "doing", "waiting", "done", "archived"] as const;
const taskPriorities = ["none", "low", "medium", "high"] as const;
const taskLevels = ["low", "high"] as const;
const projectTypes = ["project", "area"] as const;
const projectStatuses = ["active", "paused", "completed", "archived"] as const;
const topicCategories = [
  "Python",
  "LeetCode",
  "Research",
  "fNIRS",
  "English",
  "Presentation",
  "Other",
] as const;
const topicStatuses = ["active", "paused", "mastered", "archived"] as const;
const noteTypes = ["concept", "leetcode", "research", "english", "presentation", "other"] as const;
const noteDifficulties = ["unknown", "hard", "medium", "easy"] as const;
const storedReviewStatuses = ["not_scheduled", "reviewed", "mastered"] as const;
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
};

// Review interval (days) by difficulty. `mastered` clears the schedule.
const REVIEW_INTERVALS: Record<ReviewDifficulty, number | null> = {
  hard: 1,
  medium: 3,
  easy: 7,
  mastered: null,
};
const repeatTypes = ["none", "daily", "weekly", "monthly"] as const;
const habitFrequencies = ["daily", "weekly"] as const;
const focusModes = ["focus", "short_break", "long_break"] as const;
const focusStatuses = ["running", "paused", "completed", "cancelled"] as const;
const focusSources = ["focus_page", "today_page", "calendar_event", "global_bar"] as const;
const collectionTables = [
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
    parentTaskId: task.parentTaskId ?? "",
    tags: Array.isArray(task.tags) ? task.tags : [],
    notes: task.notes ?? "",
    importance: oneOf(task.importance, taskLevels, "low"),
    urgency: oneOf(task.urgency, taskLevels, "low"),
    isFocus: Boolean(task.isFocus),
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

function normalizeHabit(habit: Partial<Habit>): Habit {
  const now = new Date().toISOString();

  return {
    id: habit.id ?? createId("habit"),
    name: habit.name ?? "Untitled habit",
    description: habit.description ?? "",
    frequency: oneOf(habit.frequency, habitFrequencies, "daily"),
    targetCount: habit.targetCount ?? 1,
    color: habit.color ?? "#0066cc",
    createdAt: habit.createdAt ?? now,
    updatedAt: habit.updatedAt ?? now,
  };
}

function normalizeHabitLog(log: Partial<HabitLog>): HabitLog {
  return {
    id: log.id ?? createId("habit-log"),
    habitId: log.habitId ?? "",
    date: log.date ?? "",
    completed: Boolean(log.completed),
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
    source: oneOf(session.source, focusSources, "focus_page"),
    projectId: session.projectId ?? "",
    projectName: session.projectName ?? "",
    focusNote: session.focusNote ?? "",
    createdAt: session.createdAt ?? startedAt,
    updatedAt: session.updatedAt ?? now,
  };
}

function normalizeTaskTemplate(template: Partial<TaskTemplate>): TaskTemplate {
  const now = new Date().toISOString();

  return {
    id: template.id ?? createId("template"),
    name: template.name ?? template.title ?? "Untitled template",
    title: template.title ?? "Untitled task",
    description: template.description ?? "",
    priority: oneOf(template.priority, taskPriorities, "none"),
    projectId: template.projectId ?? "",
    tags: Array.isArray(template.tags) ? template.tags : [],
    notes: template.notes ?? "",
    subtasks: Array.isArray(template.subtasks) ? template.subtasks : [],
    createdAt: template.createdAt ?? now,
    updatedAt: template.updatedAt ?? now,
  };
}

function normalizeSettings(settings?: Partial<PlannerSettings>): PlannerSettings {
  const now = new Date().toISOString();

  return {
    id: "settings",
    theme: settings?.theme === "light" || settings?.theme === "dark" ? settings.theme : "system",
    createdAt: settings?.createdAt ?? now,
    updatedAt: settings?.updatedAt ?? now,
  };
}

function normalizeStudyTopic(topic: Partial<StudyTopic>): StudyTopic {
  const now = new Date().toISOString();

  return {
    id: topic.id ?? createId("topic"),
    name: topic.name ?? "Untitled topic",
    category: oneOf(topic.category, topicCategories, "Other") as StudyTopicCategory,
    description: topic.description ?? "",
    status: oneOf(topic.status, topicStatuses, "active"),
    color: topic.color ?? "#007AFF",
    icon: topic.icon,
    order: typeof topic.order === "number" ? topic.order : 0,
    createdAt: topic.createdAt ?? now,
    updatedAt: topic.updatedAt ?? now,
    archivedAt: topic.archivedAt,
  };
}

function normalizeConceptNote(note: Partial<ConceptNote>): ConceptNote {
  const now = new Date().toISOString();

  return {
    id: note.id ?? createId("note"),
    topicId: note.topicId ?? "",
    title: note.title ?? "Untitled note",
    noteType: oneOf(note.noteType, noteTypes, "concept") as NoteType,
    summary: note.summary ?? "",
    content: note.content ?? "",
    examples: note.examples ?? "",
    personalExplanation: note.personalExplanation ?? "",
    confusionPoint: note.confusionPoint ?? "",
    difficulty: oneOf(note.difficulty, noteDifficulties, "unknown") as NoteDifficulty,
    reviewStatus: oneOf(note.reviewStatus, storedReviewStatuses, "not_scheduled") as StoredReviewStatus,
    nextReviewDate: note.nextReviewDate ?? "",
    lastReviewedAt: note.lastReviewedAt ?? "",
    reviewHistory: Array.isArray(note.reviewHistory) ? note.reviewHistory : [],
    leetcode: note.leetcode,
    research: note.research,
    english: note.english,
    source: note.source ?? "",
    tags: Array.isArray(note.tags) ? note.tags : [],
    order: typeof note.order === "number" ? note.order : 0,
    createdAt: note.createdAt ?? now,
    updatedAt: note.updatedAt ?? now,
    deletedAt: note.deletedAt,
  };
}

function normalizeAppSettings(settings?: Partial<AppSettings>): AppSettings {
  return {
    theme: oneOf(settings?.theme, themeModes, DEFAULT_APP_SETTINGS.theme),
    accentColor: oneOf(settings?.accentColor, accentColors, DEFAULT_APP_SETTINGS.accentColor),
    fontSize: oneOf(settings?.fontSize, fontSizes, DEFAULT_APP_SETTINGS.fontSize),
    language: oneOf(settings?.language, languages, DEFAULT_APP_SETTINGS.language),
    defaultView: settings?.defaultView === "/inbox" ? "/inbox" : "/today",
    showCompletedInToday: settings?.showCompletedInToday ?? DEFAULT_APP_SETTINGS.showCompletedInToday,
    confirmBeforeDelete: settings?.confirmBeforeDelete ?? DEFAULT_APP_SETTINGS.confirmBeforeDelete,
    showSidebarCounts: settings?.showSidebarCounts ?? DEFAULT_APP_SETTINGS.showSidebarCounts,
    sidebarCollapsed: settings?.sidebarCollapsed ?? DEFAULT_APP_SETTINGS.sidebarCollapsed,
    reduceMotion: settings?.reduceMotion ?? DEFAULT_APP_SETTINGS.reduceMotion,
  };
}

function normalizeRecentItem(item: Partial<RecentItem>): RecentItem {
  return {
    id: item.id ?? createId("recent"),
    type: (item.type ?? "task") as RecentItem["type"],
    refId: item.refId ?? "",
    title: item.title ?? "",
    openedAt: item.openedAt ?? new Date().toISOString(),
  };
}

function normalizeData(data: RawPlannerData): PlannerData {
  const hasStudy =
    Array.isArray(data.studyTopics) || Array.isArray(data.conceptNotes);

  return {
    tasks: Array.isArray(data.tasks) ? data.tasks.map(normalizeTask) : [],
    projects: Array.isArray(data.projects) ? data.projects.map(normalizeProject) : [],
    subtasks: Array.isArray(data.subtasks)
      ? data.subtasks.map(normalizeSubtask).filter((subtask) => subtask.taskId)
      : [],
    studyTopics: hasStudy
      ? (data.studyTopics ?? []).map(normalizeStudyTopic)
      : [],
    conceptNotes: hasStudy
      ? (data.conceptNotes ?? []).map(normalizeConceptNote).filter((note) => !note.deletedAt)
      : [],
    habits: Array.isArray(data.habits) ? data.habits.map(normalizeHabit) : [],
    habitLogs: Array.isArray(data.habitLogs)
      ? data.habitLogs.map(normalizeHabitLog).filter((log) => log.habitId && log.date)
      : [],
    focusSessions: Array.isArray(data.focusSessions)
      ? data.focusSessions.map(normalizeFocusSession)
      : [],
    activeSessionId: typeof data.activeSessionId === "string" ? data.activeSessionId : "",
    taskTemplates: Array.isArray(data.taskTemplates)
      ? data.taskTemplates.map(normalizeTaskTemplate)
      : [],
    recentItems: Array.isArray(data.recentItems) ? data.recentItems.map(normalizeRecentItem) : [],
    settings: normalizeSettings(data.settings),
    appSettings: normalizeAppSettings(data.appSettings),
  };
}

function emptyData(): PlannerData {
  return normalizeData({ studyTopics: [], conceptNotes: [] });
}

function countDataItems(data: PlannerData): number {
  return (
    data.tasks.length +
    data.projects.length +
    data.subtasks.length +
    data.habits.length +
    data.habitLogs.length +
    data.focusSessions.length +
    data.taskTemplates.length +
    data.studyTopics.length +
    data.conceptNotes.length
  );
}

function getNextDueDate(task: Task): string {
  const interval = Math.max(task.repeatInterval || 1, 1);
  const baseDate = task.dueDate || new Date().toISOString().slice(0, 10);

  if (task.repeatType === "daily") {
    return addDays(baseDate, interval);
  }

  if (task.repeatType === "weekly") {
    return addDays(baseDate, interval * 7);
  }

  if (task.repeatType === "monthly") {
    return addMonths(baseDate, interval);
  }

  return baseDate;
}

function readStorage(): PlannerData {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (raw) {
    try {
      return normalizeData(JSON.parse(raw) as Partial<PlannerData>);
    } catch {
      return emptyData();
    }
  }

  // One-time migration from the legacy storage key (statuses remapped on normalize).
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy) {
    try {
      return normalizeData(JSON.parse(legacy) as Partial<PlannerData>);
    } catch {
      return emptyData();
    }
  }

  // First run, no saved data anywhere: start completely blank. Demo content
  // is opt-in only, via the "Load Samples" button in Settings.
  return emptyData();
}

export function usePlannerData() {
  const [data, setData] = useState<PlannerData>(() => readStorage());
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [userEmail, setUserEmail] = useState("");
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [syncStatus, setSyncStatus] = useState(
    isSupabaseConfigured ? "Supabase ready. Sign in to sync." : "LocalStorage mode",
  );
  const [syncError, setSyncError] = useState("");
  const [remoteLoaded, setRemoteLoaded] = useState(false);
  const [localMigrationData, setLocalMigrationData] = useState<PlannerData | null>(null);
  const syncTimerRef = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? "");
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !userEmail) {
      setRemoteLoaded(false);
      return;
    }

    const localSnapshot = readStorage();
    if (countDataItems(localSnapshot) > 0) {
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

    setSyncStatus("Loading Supabase data...");
    setSyncError("");

    try {
      const partial: Partial<PlannerData> = {};

      for (const [key, table] of collectionTables) {
        const { data: rows, error } = await supabase.from(table).select("data");
        if (error) {
          throw error;
        }
        partial[key] = (rows ?? []).map((row: { data: unknown }) => row.data) as never;
      }

      const { data: settingsRows, error: settingsError } = await supabase
        .from("settings")
        .select("data")
        .eq("id", "settings")
        .maybeSingle();
      if (settingsError) {
        throw settingsError;
      }

      partial.settings = normalizeSettings(settingsRows?.data as Partial<PlannerSettings> | undefined);

      setData(normalizeData(partial));
      setRemoteLoaded(true);
      setSyncStatus("Synced with Supabase");
    } catch (error) {
      setRemoteLoaded(false);
      setSyncError(error instanceof Error ? error.message : "Could not load Supabase data.");
      setSyncStatus("Supabase load failed. Local data is still available.");
    }
  }

  async function saveSupabaseData(nextData: PlannerData) {
    if (!supabase) {
      return;
    }

    try {
      const userId = await getUserId();
      if (!userId) {
        return;
      }

      for (const [key, table] of collectionTables) {
        const items = nextData[key];
        const rows = items.map((item) => ({
          id: item.id,
          user_id: userId,
          data: item,
        }));

        if (rows.length > 0) {
          const { error } = await supabase.from(table).upsert(rows, { onConflict: "id,user_id" });
          if (error) {
            throw error;
          }
        }

        const keepIds = items.map((item) => item.id);
        let deleteQuery = supabase.from(table).delete().eq("user_id", userId);
        if (keepIds.length > 0) {
          deleteQuery = deleteQuery.not("id", "in", `(${keepIds.map((id) => `"${id}"`).join(",")})`);
        }
        const { error: deleteError } = await deleteQuery;
        if (deleteError) {
          throw deleteError;
        }
      }

      const { error: settingsError } = await supabase.from("settings").upsert(
        {
          id: "settings",
          user_id: userId,
          data: nextData.settings,
        },
        { onConflict: "id,user_id" },
      );
      if (settingsError) {
        throw settingsError;
      }

      setSyncError("");
      setSyncStatus("Synced with Supabase");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not save Supabase data.");
      setSyncStatus("Supabase sync failed. Changes remain in localStorage.");
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
    setSyncStatus(needsEmailConfirmation ? "Verification email sent. Please check your inbox." : "Account created.");
    return { ok: true, needsEmailConfirmation };
  }

  async function signOut() {
    if (!supabase) {
      return;
    }
    await supabase.auth.signOut();
    setUserEmail("");
    setRemoteLoaded(false);
    setSyncStatus("Signed out. LocalStorage mode");
  }

  async function uploadLocalDataToSupabase() {
    if (!localMigrationData) {
      return false;
    }

    await saveSupabaseData(localMigrationData);
    setData(localMigrationData);
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

  function createTaskFromTemplate(templateId: string) {
    const template = data.taskTemplates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    const now = new Date().toISOString();
    const taskId = createId("task");
    const task: Task = normalizeTask({
      id: taskId,
      title: template.title,
      description: template.description,
      status: "todo",
      priority: template.priority,
      projectId: template.projectId,
      tags: template.tags,
      notes: template.notes,
      createdAt: now,
      updatedAt: now,
    });
    const subtasks = template.subtasks.map((title) => ({
      id: createId("subtask"),
      taskId,
      title,
      completed: false,
      createdAt: now,
      updatedAt: now,
    }));

    setData((current) => ({
      ...current,
      tasks: [task, ...current.tasks],
      subtasks: [...current.subtasks, ...subtasks],
    }));
    setSelectedTaskId(taskId);
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
      tasks: current.tasks.filter((task) => task.id !== taskId),
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

    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const isDone = task.status === "done";
        const isRecurring = !isDone && task.repeatType !== "none";

        if (isRecurring) {
          const nextDueDate = getNextDueDate(task);
          const shouldStop = task.repeatEndDate && nextDueDate > task.repeatEndDate;

          return {
            ...task,
            status: shouldStop ? "done" : "todo",
            dueDate: shouldStop ? task.dueDate : nextDueDate,
            completedAt: shouldStop ? now : "",
            updatedAt: now,
          };
        }

        return {
          ...task,
          status: isDone ? "todo" : "done",
          completedAt: isDone ? "" : now,
          updatedAt: now,
        };
      }),
    }));
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

  function saveTaskAsTemplate(taskId: string, name: string) {
    const task = data.tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    const now = new Date().toISOString();
    const template: TaskTemplate = {
      id: createId("template"),
      name: name.trim() || task.title,
      title: task.title,
      description: task.description,
      priority: task.priority,
      projectId: task.projectId,
      tags: task.tags,
      notes: task.notes,
      subtasks: data.subtasks.filter((subtask) => subtask.taskId === task.id).map((subtask) => subtask.title),
      createdAt: now,
      updatedAt: now,
    };

    setData((current) => ({
      ...current,
      taskTemplates: [template, ...current.taskTemplates],
    }));
  }

  function addHabit(name: string, frequency: HabitFrequency) {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    const now = new Date().toISOString();
    const habit: Habit = {
      id: createId("habit"),
      name: trimmed,
      description: "",
      frequency,
      targetCount: 1,
      color: "#0066cc",
      createdAt: now,
      updatedAt: now,
    };

    setData((current) => ({
      ...current,
      habits: [...current.habits, habit],
    }));
  }

  function toggleHabitLog(habitId: string, date: string) {
    setData((current) => {
      const existing = current.habitLogs.find((log) => log.habitId === habitId && log.date === date);

      if (existing) {
        return {
          ...current,
          habitLogs: current.habitLogs.map((log) =>
            log.id === existing.id ? { ...log, completed: !log.completed } : log,
          ),
        };
      }

      return {
        ...current,
        habitLogs: [
          ...current.habitLogs,
          {
            id: createId("habit-log"),
            habitId,
            date,
            completed: true,
          },
        ],
      };
    });
  }

  function addFocusSession(
    taskId: string,
    mode: FocusMode,
    durationMinutes: number,
    startedAt: string,
    completed: boolean,
  ) {
    const now = new Date().toISOString();
    const task = data.tasks.find((item) => item.id === taskId);
    const project = data.projects.find((item) => item.id === task?.projectId);
    const session: FocusSession = {
      id: createId("focus"),
      taskId,
      title: task?.title ?? "",
      mode,
      status: completed ? "completed" : "running",
      durationMinutes,
      accumulatedSeconds: completed ? durationMinutes * 60 : 0,
      completed,
      startAt: startedAt,
      endAt: completed ? now : "",
      startedAt,
      endedAt: completed ? now : "",
      pausedAt: "",
      source: "focus_page",
      projectId: task?.projectId ?? "",
      projectName: project?.name ?? "",
      focusNote: "",
      createdAt: startedAt,
      updatedAt: now,
    };

    setData((current) => ({
      ...current,
      focusSessions: [session, ...current.focusSessions],
      activeSessionId: completed ? current.activeSessionId : session.id,
      tasks: current.tasks.map((item) =>
        item.id === taskId
          ? {
              ...item,
              actualSeconds: item.actualSeconds + session.accumulatedSeconds,
              activeSessionId: completed ? "" : session.id,
              lastFocusedAt: now,
              updatedAt: now,
            }
          : item,
      ),
    }));
  }

  function getSessionSeconds(session: FocusSession, nowMs = Date.now()) {
    if (session.status !== "running") return session.accumulatedSeconds;
    return session.accumulatedSeconds + Math.max(0, Math.floor((nowMs - new Date(session.startAt).getTime()) / 1000));
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

  function cancelFocusSession(sessionId: string) {
    const now = new Date().toISOString();
    setData((current) => {
      const session = current.focusSessions.find((item) => item.id === sessionId);
      return {
        ...current,
        activeSessionId: current.activeSessionId === sessionId ? "" : current.activeSessionId,
        focusSessions: current.focusSessions.map((item) =>
          item.id === sessionId ? { ...item, status: "cancelled", endAt: now, endedAt: now, updatedAt: now } : item,
        ),
        tasks: session
          ? current.tasks.map((task) =>
              task.id === session.taskId ? { ...task, activeSessionId: "", updatedAt: now } : task,
            )
          : current.tasks,
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
  function updateTaskStatus(taskId: string, nextStatus: Task["status"], options?: Partial<Task>) {
    updateTask(taskId, { status: nextStatus, ...options });
  }

  function completeTask(taskId: string) {
    updateTask(taskId, { status: "done" });
  }

  function setTaskFocus(taskId: string, isFocus: boolean) {
    updateTask(taskId, { isFocus });
  }

  // Snooze moves the planned work date only — never the deadline (spec §0.5.9).
  function snoozeTask(taskId: string, date?: string) {
    updateTask(taskId, { scheduledDate: date ?? addDays(todayValue(), 1) });
  }

  function rescheduleTask(taskId: string, date: string) {
    updateTask(taskId, { scheduledDate: date });
  }

  function moveToWaiting(taskId: string, reason?: string, followUpDate?: string) {
    updateTask(taskId, {
      status: "waiting",
      waitingReason: reason ?? "",
      waitingFollowUpDate: followUpDate ?? "",
    });
  }

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

  // === Study topics ===
  function createTopic(input: {
    name: string;
    category?: StudyTopicCategory;
    description?: string;
    color?: string;
  }): string {
    const name = input.name.trim();
    if (!name) {
      return "";
    }
    const topic = normalizeStudyTopic({
      id: createId("topic"),
      name,
      category: input.category ?? "Other",
      description: input.description ?? "",
      color: input.color ?? "#007AFF",
    });
    setData((current) => ({ ...current, studyTopics: [...current.studyTopics, topic] }));
    return topic.id;
  }

  function updateTopic(topicId: string, patch: Partial<StudyTopic>) {
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      studyTopics: current.studyTopics.map((topic) =>
        topic.id === topicId ? { ...topic, ...patch, updatedAt: now } : topic,
      ),
    }));
  }

  function archiveTopic(topicId: string) {
    updateTopic(topicId, { status: "archived", archivedAt: new Date().toISOString() });
  }

  function deleteTopic(topicId: string) {
    setData((current) => ({
      ...current,
      studyTopics: current.studyTopics.filter((topic) => topic.id !== topicId),
      conceptNotes: current.conceptNotes.map((note) =>
        note.topicId === topicId ? { ...note, topicId: "" } : note,
      ),
    }));
  }

  // === Concept notes ===
  function createNote(input: Partial<ConceptNote> & { title: string; topicId: string }): string {
    const title = input.title.trim();
    if (!title) {
      return "";
    }
    const note = normalizeConceptNote({
      ...input,
      id: createId("note"),
      title,
      reviewStatus: input.nextReviewDate ? "reviewed" : input.reviewStatus ?? "not_scheduled",
    });
    setData((current) => ({ ...current, conceptNotes: [note, ...current.conceptNotes] }));
    return note.id;
  }

  function updateNote(noteId: string, patch: Partial<ConceptNote>) {
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      conceptNotes: current.conceptNotes.map((note) =>
        note.id === noteId ? { ...note, ...patch, updatedAt: now } : note,
      ),
    }));
  }

  function moveNote(noteId: string, topicId: string) {
    updateNote(noteId, { topicId });
  }

  function deleteNote(noteId: string) {
    setData((current) => ({
      ...current,
      conceptNotes: current.conceptNotes.filter((note) => note.id !== noteId),
    }));
  }

  function scheduleReview(noteId: string, nextReviewDate: string) {
    updateNote(noteId, { nextReviewDate, reviewStatus: nextReviewDate ? "reviewed" : "not_scheduled" });
  }

  // Mark a note reviewed: append history and schedule next review by difficulty (spec §9.6A.11).
  function markNoteReviewed(noteId: string, difficulty: ReviewDifficulty) {
    const now = new Date().toISOString();
    const today = todayValue();
    const interval = REVIEW_INTERVALS[difficulty];
    const nextReviewDate = interval === null ? "" : addDays(today, interval);
    const storedStatus: StoredReviewStatus = difficulty === "mastered" ? "mastered" : "reviewed";

    setData((current) => ({
      ...current,
      conceptNotes: current.conceptNotes.map((note) => {
        if (note.id !== noteId) {
          return note;
        }
        const mappedDifficulty: NoteDifficulty = difficulty === "mastered" ? note.difficulty : difficulty;
        return {
          ...note,
          difficulty: mappedDifficulty,
          reviewStatus: storedStatus,
          nextReviewDate,
          lastReviewedAt: now,
          reviewHistory: [
            ...note.reviewHistory,
            {
              id: createId("review"),
              reviewedAt: now,
              difficulty,
              previousNextReviewDate: note.nextReviewDate || undefined,
              nextReviewDate: nextReviewDate || undefined,
            },
          ],
          updatedAt: now,
        };
      }),
    }));
  }

  // === App settings + recent items ===
  function updateAppSettings(patch: Partial<AppSettings>) {
    setData((current) => ({ ...current, appSettings: { ...current.appSettings, ...patch } }));
  }

  function pushRecentItem(item: Omit<RecentItem, "id" | "openedAt">) {
    setData((current) => {
      const filtered = current.recentItems.filter(
        (existing) => !(existing.type === item.type && existing.refId === item.refId),
      );
      const next: RecentItem = { ...item, id: createId("recent"), openedAt: new Date().toISOString() };
      return { ...current, recentItems: [next, ...filtered].slice(0, 12) };
    });
  }

  function importData(raw: unknown): boolean {
    if (!raw || typeof raw !== "object") {
      return false;
    }

    const normalized = normalizeData(raw as Partial<PlannerData>);
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

  function loadSamples() {
    setData(normalizeData(sampleData));
    setSelectedTaskId("");
  }

  return {
    tasks: data.tasks,
    projects: data.projects,
    subtasks: data.subtasks,
    studyTopics: data.studyTopics,
    conceptNotes: data.conceptNotes,
    habits: data.habits,
    habitLogs: data.habitLogs,
    focusSessions: data.focusSessions,
    activeSessionId: data.activeSessionId,
    activeFocusSession:
      data.focusSessions.find(
        (session) =>
          session.id === data.activeSessionId && (session.status === "running" || session.status === "paused"),
      ) ?? null,
    taskTemplates: data.taskTemplates,
    recentItems: data.recentItems,
    settings: data.settings,
    appSettings: data.appSettings,
    selectedTask,
    auth: {
      isConfigured: isSupabaseConfigured,
      isLoading: authLoading,
      userEmail,
      isSignedIn: Boolean(userEmail),
      mode: userEmail && remoteLoaded ? "supabase" : "localStorage",
      syncStatus,
      syncError,
      migrationPreviewCount: localMigrationData ? countDataItems(localMigrationData) : 0,
    },
    addTask,
    createTask,
    createTaskFromTemplate,
    updateTask,
    updateTaskStatus,
    completeTask,
    setTaskFocus,
    snoozeTask,
    rescheduleTask,
    moveToWaiting,
    deleteTask,
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
    createTopic,
    updateTopic,
    archiveTopic,
    deleteTopic,
    createNote,
    updateNote,
    moveNote,
    deleteNote,
    scheduleReview,
    markNoteReviewed,
    updateAppSettings,
    pushRecentItem,
    saveTaskAsTemplate,
    addHabit,
    toggleHabitLog,
    addFocusSession,
    startFocusSession,
    pauseFocusSession,
    resumeFocusSession,
    stopFocusSession,
    cancelFocusSession,
    updateFocusSessionNote,
    resetData,
    loadSamples,
    importData,
    exportData,
    signIn,
    signUp,
    signOut,
    uploadLocalDataToSupabase,
    refreshSupabaseData: loadSupabaseData,
    selectTask: setSelectedTaskId,
  };
}
