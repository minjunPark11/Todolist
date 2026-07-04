import { FormEvent, RefObject, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "./components/Sidebar";
import { OllamaChat } from "./components/OllamaChat";
import { TaskDetail } from "./components/TaskDetail";
import { GlobalFocusBar } from "./components/GlobalFocusBar";
import { usePlannerData } from "./hooks/usePlannerData";
import { AppModals } from "./app/AppModals";
import { AppPages } from "./app/AppPages";
import type { TodayIntent } from "./components/TodayPage";
import { executeAgentActions } from "./app/executeAgentActions";
import { useDataPortability } from "./app/useDataPortability";
import type { ToastState } from "./components/kit";
import { formatFocusDuration, getDisplayedFocusSeconds, useNowTick } from "./lib/focusTimer";
import { popUndo, pushUndo } from "./lib/undoStack";
import { reducedTransition, transitions } from "./motion/transitions";
import { pageVariants } from "./motion/variants";
import { useMotionEnabled } from "./motion/reducedMotion";
import {
  loadFocusUserSettings,
  saveFocusUserSettings,
  type FocusUserSettings,
} from "./lib/focusSettingsStorage";
import { updateMiniFocusTimer } from "./lib/miniFocusTimer";
import {
  buildCalendarShareSnapshot,
  createShareToken,
  disableCalendarShare,
  emptyCalendarShareState,
  loadCalendarShare,
  publishCalendarShare,
  type CalendarShareState,
} from "./lib/calendarShare";
import {
  createExternalCalendarDraft,
  fetchExternalCalendarEvents,
  loadExternalCalendarState,
  saveExternalCalendarState,
  shouldSyncExternalCalendar,
  type ExternalCalendarState,
} from "./lib/externalCalendars";
import type {
  ConceptNote,
  ExternalCalendar,
  PageId,
  Project,
  StudyTopic,
  Task,
} from "./types";
import { todayValue } from "./utils/date";
import { getDueReviewCount } from "./utils/planner";
import { I18nProvider, translate, useT } from "./i18n";

export default function App() {
  const planner = usePlannerData();
  const appSettings = planner.appSettings;
  // Renders before the <I18nProvider> below exists in the tree, so this can't
  // use the useT() context hook — call the plain translate() helper instead.
  const t = (key: string, vars?: Record<string, string | number>) => translate(appSettings.language, key, vars);
  const dueReviewCount = getDueReviewCount(planner.conceptNotes);
  const [activePage, setActivePage] = useState<PageId>("today");
  // Inbox is folded into Today's triage drawer (no standalone page). This
  // covers the legacy /inbox route, a ?triage=inbox deep link, and the
  // "default start page" setting all landing on the same Today intent.
  const [todayIntent, setTodayIntent] = useState<TodayIntent>(() => {
    const hasInboxRedirect =
      window.location.pathname === "/inbox" ||
      new URLSearchParams(window.location.search).get("triage") === "inbox";
    return hasInboxRedirect || appSettings.defaultView === "/inbox" ? "triage" : "";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [isProjectDetailOpen, setIsProjectDetailOpen] = useState(false);
  const [studyTab, setStudyTab] = useState<"topics" | "notes" | "reviews">("topics");
  const [studyFocusNoteId, setStudyFocusNoteId] = useState("");
  const [pendingDeleteTaskId, setPendingDeleteTaskId] = useState("");
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState("");
  const [pendingResetAllData, setPendingResetAllData] = useState(false);
  // When set, the Calendar page opens pre-filtered to this project (space
  // detail's "Open Calendar" — PROJECT_DETAIL_REMOVE_CALENDAR_TAB spec §8.2).
  const [calendarFocusProjectId, setCalendarFocusProjectId] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const motionEnabled = useMotionEnabled();
  // Page crossfade applies to navigation only; the very first page renders
  // immediately so app boot never starts at opacity 0.
  const hasBootedRef = useRef(false);
  useEffect(() => {
    hasBootedRef.current = true;
  }, []);
  const [focusSettings, setFocusSettings] = useState<FocusUserSettings>(() => loadFocusUserSettings());
  const [externalCalendarState, setExternalCalendarState] = useState<ExternalCalendarState>(() => loadExternalCalendarState());
  const [calendarShare, setCalendarShare] = useState<CalendarShareState>(emptyCalendarShareState);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Desktop-only sidebar rail collapse; ignored by the mobile overlay menu.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("focusflow-sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const originalTitleRef = useRef(document.title || "FocusFlow");
  const completedNotificationRef = useRef<Set<string>>(new Set());
  const syncingExternalCalendarsRef = useRef<Set<string>>(new Set());
  const initialExternalCalendarSyncRef = useRef(false);
  const sharePublishTimerRef = useRef<number | null>(null);

  const today = todayValue();
  const focusNow = useNowTick(Boolean(planner.activeFocusSession && planner.activeFocusSession.status === "running"));
  const activeFocusTask = planner.activeFocusSession
    ? planner.tasks.find((task) => task.id === planner.activeFocusSession?.taskId) ?? null
    : null;
  const activeFocusElapsed = getDisplayedFocusSeconds(planner.activeFocusSession, focusNow);
  const activeProjects = planner.projects.filter((project) => project.status !== "archived");
  const { importMessage, exportJson, handleImport } = useDataPortability({
    today,
    exportData: planner.exportData,
    importData: planner.importData,
  });

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return { tasks: [], projects: [], topics: [], notes: [] };
    }

    return {
      tasks: planner.tasks.filter((task) =>
        [task.title, task.description, task.notes, task.tags.join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(query),
      ),
      projects: activeProjects.filter((project) =>
        [project.name, project.description].join(" ").toLowerCase().includes(query),
      ),
      topics: planner.studyTopics.filter((topic) =>
        [topic.name, topic.description, topic.category].join(" ").toLowerCase().includes(query),
      ),
      notes: planner.conceptNotes.filter((note) =>
        [note.title, note.summary, note.content, note.tags.join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(query),
      ),
    };
  }, [activeProjects, planner.conceptNotes, planner.studyTopics, planner.tasks, searchQuery]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT";

      if (event.key === "Escape") {
        planner.selectTask("");
        setSearchQuery("");
        return;
      }

      if (isTyping) {
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (event.key.toLowerCase() === "t") {
        setActivePage("today");
      } else if (event.key.toLowerCase() === "i") {
        setActivePage("today");
        setTodayIntent("triage");
      } else if (event.key.toLowerCase() === "n") {
        setActivePage("today");
        setTodayIntent("quickAdd");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [planner]);

  useEffect(() => {
    const root = document.documentElement;
    const resolvedTheme =
      appSettings.theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : appSettings.theme;
    root.dataset.theme = resolvedTheme;
    root.dataset.accent = appSettings.accentColor;
    root.dataset.font = appSettings.fontSize;
    root.dataset.reduceMotion = appSettings.reduceMotion ? "true" : "false";
    root.lang = appSettings.language;
  }, [appSettings.theme, appSettings.accentColor, appSettings.fontSize, appSettings.reduceMotion, appSettings.language]);

  useEffect(() => {
    const session = planner.activeFocusSession;
    if (!session || !activeFocusTask || !focusSettings.showTabTitleTimer) {
      document.title = originalTitleRef.current;
      return;
    }

    if (session.status === "paused") {
      document.title = `Paused · ${activeFocusTask.title}`;
      return;
    }

    document.title = `${formatFocusDuration(activeFocusElapsed)} · ${activeFocusTask.title}`;
  }, [activeFocusTask, activeFocusElapsed, focusSettings.showTabTitleTimer, planner.activeFocusSession]);

  useEffect(() => {
    const session = planner.activeFocusSession;
    if (!session || !activeFocusTask) return;
    updateMiniFocusTimer({
      sessionId: session.id,
      title: activeFocusTask.title,
      time: formatFocusDuration(activeFocusElapsed),
      status: session.status,
    });
  }, [activeFocusTask, activeFocusElapsed, planner.activeFocusSession]);

  // Global Ctrl/Cmd+Z: undo the latest user edit across all data stores.
  // Typing fields keep their native text undo.
  useEffect(() => {
    function onUndoKey(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      if (popUndo()) showToast({ message: t("app.toastUndone") });
    }
    window.addEventListener("keydown", onUndoKey);
    return () => window.removeEventListener("keydown", onUndoKey);
  }, [t]);

  useEffect(() => {
    const session = planner.activeFocusSession;
    if (!session || !focusSettings.enableCompletionNotification || !("Notification" in window)) return;
    if (window.Notification.permission !== "default") return;
    window.Notification.requestPermission().catch(() => undefined);
  }, [focusSettings.enableCompletionNotification, planner.activeFocusSession?.id]);

  useEffect(() => {
    function handleMiniTimerMessage(event: MessageEvent) {
      if (event.source === window) return;
      const data = event.data as { type?: string; action?: string; sessionId?: string };
      if (data?.type !== "focusflow-mini-timer" || !data.sessionId) return;
      const session = planner.activeFocusSession;
      if (!session || session.id !== data.sessionId) return;
      if (data.action === "pause") planner.pauseFocusSession(session.id);
      if (data.action === "resume") planner.resumeFocusSession(session.id);
      if (data.action === "finish") stopFocusWithNotification(session.id, false);
    }

    window.addEventListener("message", handleMiniTimerMessage);
    return () => window.removeEventListener("message", handleMiniTimerMessage);
  }, [planner.activeFocusSession, planner.pauseFocusSession, planner.resumeFocusSession]);

  function navigate(path: string, mode: "push" | "replace" = "push") {
    if (window.location.pathname === path) {
      return;
    }
    window.history[mode === "replace" ? "replaceState" : "pushState"](null, "", path);
    setCurrentPath(path);
  }

  useEffect(() => {
    function handlePopState() {
      setCurrentPath(window.location.pathname);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (currentPath === "/login" && planner.auth.isSignedIn) {
      navigate("/app", "replace");
    }
  }, [currentPath, planner.auth.isSignedIn]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("focusflow:page-change", { detail: { page: activePage } }));
  }, [activePage]);

  useEffect(() => {
    if (activePage !== "calendar") return;
    externalCalendarState.calendars
      .filter((calendar) => calendar.enabled && calendar.syncStatus !== "syncing" && calendar.syncStatus !== "failed" && shouldSyncExternalCalendar(calendar))
      .forEach((calendar) => {
        void syncExternalCalendar(calendar.id);
      });
  }, [activePage, externalCalendarState.calendars]);

  useEffect(() => {
    if (initialExternalCalendarSyncRef.current) return;
    initialExternalCalendarSyncRef.current = true;
    externalCalendarState.calendars
      .filter((calendar) => calendar.enabled && calendar.visible && calendar.syncStatus !== "failed" && shouldSyncExternalCalendar(calendar))
      .forEach((calendar) => {
        void syncExternalCalendar(calendar.id);
      });
  }, [externalCalendarState.calendars]);

  useEffect(() => {
    let cancelled = false;
    setCalendarShare((current) => ({ ...current, status: current.status === "unavailable" ? "unavailable" : "loading", error: "" }));
    loadCalendarShare()
      .then((share) => {
        if (!cancelled) setCalendarShare(share);
      })
      .catch((error) => {
        if (!cancelled) {
          setCalendarShare((current) => ({
            ...current,
            status: "error",
            error: error instanceof Error ? error.message : "공유 링크를 불러오지 못했습니다.",
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [planner.auth.isSignedIn]);

  useEffect(() => {
    if (!calendarShare.enabled || !calendarShare.token) return;
    if (sharePublishTimerRef.current) {
      window.clearTimeout(sharePublishTimerRef.current);
    }
    sharePublishTimerRef.current = window.setTimeout(() => {
      void publishCurrentCalendarShare(calendarShare.token, true, { silent: true });
    }, 1800);
    return () => {
      if (sharePublishTimerRef.current) {
        window.clearTimeout(sharePublishTimerRef.current);
      }
    };
  }, [calendarShare.enabled, calendarShare.token, planner.tasks, planner.projects, planner.conceptNotes]);

  // One-time cleanup for the legacy /inbox route and ?triage=inbox deep
  // links — the intent was already captured into todayIntent above.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (window.location.pathname === "/inbox") {
      window.history.replaceState(null, "", "/app");
      setCurrentPath("/app");
    } else if (params.get("triage") === "inbox") {
      params.delete("triage");
      const query = params.toString();
      const cleanPath = `${window.location.pathname}${query ? `?${query}` : ""}`;
      window.history.replaceState(null, "", cleanPath);
    }
  }, []);

  function showToast(nextToast: { message: string; actionLabel?: string; onAction?: () => void }) {
    setToast(nextToast);
    window.setTimeout(() => {
      setToast((current) => (current === nextToast ? null : current));
    }, 4500);
  }

  function updateFocusSettings(patch: Partial<FocusUserSettings>) {
    setFocusSettings((current) => {
      const next = { ...current, ...patch };
      saveFocusUserSettings(next);
      return next;
    });
  }

  function notifyFocusCompleted(sessionId: string) {
    const session = planner.focusSessions.find((item) => item.id === sessionId);
    const task = session ? planner.tasks.find((item) => item.id === session.taskId) : null;
    if (!session || completedNotificationRef.current.has(sessionId)) return;
    completedNotificationRef.current.add(sessionId);
    if (!focusSettings.enableCompletionNotification) return;

    const title = "Focus 완료";
    const body = `${formatFocusDuration(getDisplayedFocusSeconds(session), true)} 동안 ${task?.title || session.title || "작업"}에 집중했어요.`;
    if ("Notification" in window && window.Notification.permission === "granted") {
      try {
        new window.Notification(title, { body });
        return;
      } catch {
        // Fall back to in-app toast.
      }
    }
    showToast({ message: `${title}: ${body}` });
  }

  function stopFocusWithNotification(sessionId: string, completeTask = false) {
    planner.stopFocusSession(sessionId, completeTask);
    notifyFocusCompleted(sessionId);
  }

  function saveExternalState(updater: (current: ExternalCalendarState) => ExternalCalendarState) {
    setExternalCalendarState((current) => {
      const next = updater(current);
      saveExternalCalendarState(next);
      return next;
    });
  }

  // Same as saveExternalState but records an undo snapshot — used by explicit
  // user actions (add/update/delete); background sync writes stay off the
  // undo stack so Ctrl+Z always reverts something the user actually did.
  function saveExternalStateUndoable(updater: (current: ExternalCalendarState) => ExternalCalendarState) {
    setExternalCalendarState((current) => {
      const next = updater(current);
      if (next === current) return current;
      saveExternalCalendarState(next);
      pushUndo(() => {
        setExternalCalendarState(current);
        saveExternalCalendarState(current);
      });
      return next;
    });
  }

  async function syncExternalCalendar(calendarId: string, calendarOverride?: ExternalCalendar) {
    if (syncingExternalCalendarsRef.current.has(calendarId)) return;
    const calendar = calendarOverride ?? externalCalendarState.calendars.find((item) => item.id === calendarId);
    if (!calendar || !calendar.enabled) return;
    syncingExternalCalendarsRef.current.add(calendarId);
    const attemptedAt = new Date().toISOString();
    saveExternalState((current) => ({
      ...current,
      calendars: current.calendars.map((item) =>
        item.id === calendarId ? { ...item, syncStatus: "syncing", lastAttemptedAt: attemptedAt, updatedAt: attemptedAt } : item,
      ),
    }));

    try {
      const events = await fetchExternalCalendarEvents(calendar);
      const syncedAt = new Date().toISOString();
      saveExternalState((current) => ({
        calendars: current.calendars.map((item) =>
          item.id === calendarId
            ? {
                ...item,
                syncStatus: item.visible ? "success" : "hidden",
                lastSyncedAt: syncedAt,
                lastAttemptedAt: attemptedAt,
                lastError: "",
                eventCount: events.length,
                updatedAt: syncedAt,
              }
            : item,
        ),
        events: [...current.events.filter((event) => event.externalCalendarId !== calendarId), ...events],
      }));
    } catch (error) {
      const failedAt = new Date().toISOString();
      saveExternalState((current) => ({
        ...current,
        calendars: current.calendars.map((item) =>
          item.id === calendarId
            ? {
                ...item,
                syncStatus: "failed",
                lastAttemptedAt: attemptedAt,
                lastError: error instanceof Error ? error.message : "Sync failed",
                updatedAt: failedAt,
              }
            : item,
        ),
      }));
    } finally {
      syncingExternalCalendarsRef.current.delete(calendarId);
    }
  }

  function syncAllExternalCalendars() {
    externalCalendarState.calendars.filter((calendar) => calendar.enabled).forEach((calendar) => {
      void syncExternalCalendar(calendar.id);
    });
  }

  function addExternalCalendar(input: { name: string; icsUrl: string; color: string }) {
    const calendar = createExternalCalendarDraft(input.name, input.icsUrl, input.color);
    saveExternalStateUndoable((current) => ({ ...current, calendars: [...current.calendars, calendar] }));
    void syncExternalCalendar(calendar.id, calendar);
  }

  function updateExternalCalendar(calendarId: string, patch: Partial<ExternalCalendar>) {
    const now = new Date().toISOString();
    saveExternalStateUndoable((current) => ({
      ...current,
      calendars: current.calendars.map((calendar) =>
        calendar.id === calendarId
          ? {
              ...calendar,
              ...patch,
              syncStatus:
                patch.enabled === false ? "disabled" : patch.visible === false ? "hidden" : patch.visible === true ? "success" : calendar.syncStatus,
              updatedAt: now,
            }
          : calendar,
      ),
    }));
  }

  function deleteExternalCalendar(calendarId: string) {
    saveExternalStateUndoable((current) => ({
      calendars: current.calendars.filter((calendar) => calendar.id !== calendarId),
      events: current.events.filter((event) => event.externalCalendarId !== calendarId),
    }));
  }

  function buildCurrentShareSnapshot() {
    return buildCalendarShareSnapshot({
      tasks: planner.tasks,
      projects: activeProjects,
      conceptNotes: planner.conceptNotes,
    });
  }

  async function publishCurrentCalendarShare(token = calendarShare.token || createShareToken(), enabled = true, options?: { silent?: boolean }) {
    setCalendarShare((current) => ({ ...current, status: "saving", error: "" }));
    try {
      const next = await publishCalendarShare({
        token,
        enabled,
        snapshot: buildCurrentShareSnapshot(),
      });
      setCalendarShare(next);
      if (!options?.silent) showToast({ message: "구독 링크가 업데이트되었습니다." });
    } catch (error) {
      setCalendarShare((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : "구독 링크를 업데이트하지 못했습니다.",
      }));
    }
  }

  async function enableCalendarShare() {
    await publishCurrentCalendarShare(calendarShare.token || createShareToken(), true);
  }

  async function disableCurrentCalendarShare() {
    if (!calendarShare.token) return;
    setCalendarShare((current) => ({ ...current, status: "saving", error: "" }));
    try {
      const next = await disableCalendarShare(calendarShare.token);
      setCalendarShare(next);
      showToast({ message: "구독 링크가 비활성화되었습니다." });
    } catch (error) {
      setCalendarShare((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : "구독 링크를 끄지 못했습니다.",
      }));
    }
  }

  async function regenerateCalendarShare() {
    await publishCurrentCalendarShare(createShareToken(), true);
  }

  function handleArchiveTask(taskId: string) {
    planner.archiveTask(taskId);
    showToast({
      message: t("app.toastTaskArchived"),
      actionLabel: t("app.undo"),
      onAction: () => planner.restoreTask(taskId),
    });
  }

  function handleDuplicateTask(taskId: string) {
    planner.duplicateTask(taskId);
    showToast({ message: t("app.toastTaskDuplicated") });
  }

  function handleArchiveProject(projectId: string) {
    planner.archiveProject(projectId);
    setIsProjectDetailOpen(false);
    setSelectedProjectId("");
    planner.selectTask("");
    showToast({
      message: t("app.toastProjectArchived"),
      actionLabel: t("app.undo"),
      onAction: () => planner.restoreProject(projectId),
    });
  }

  function requestDeleteTask(taskId: string) {
    if (appSettings.confirmBeforeDelete) {
      setPendingDeleteTaskId(taskId);
    } else {
      planner.deleteTask(taskId);
      showToast({ message: t("app.toastTaskDeleted") });
    }
  }

  // Deletes immediately, no app-level confirm — for callers that already
  // showed their own confirmation (e.g. the space delete modal).
  function deleteProjectNow(projectId: string) {
    planner.deleteProject(projectId);
    setIsProjectDetailOpen(false);
    setSelectedProjectId("");
    planner.selectTask("");
    showToast({ message: t("app.toastProjectDeleted") });
  }

  function requestDeleteProject(projectId: string) {
    if (appSettings.confirmBeforeDelete) {
      setPendingDeleteProjectId(projectId);
    } else {
      deleteProjectNow(projectId);
    }
  }

  function confirmDeleteTask() {
    if (!pendingDeleteTaskId) {
      return;
    }
    planner.deleteTask(pendingDeleteTaskId);
    setPendingDeleteTaskId("");
    showToast({ message: t("app.toastTaskDeleted") });
  }

  function confirmDeleteProject() {
    if (!pendingDeleteProjectId) {
      return;
    }
    planner.deleteProject(pendingDeleteProjectId);
    setPendingDeleteProjectId("");
    setIsProjectDetailOpen(false);
    setSelectedProjectId("");
    planner.selectTask("");
    showToast({ message: t("app.toastProjectDeleted") });
  }

  function requestResetAllData() {
    setPendingResetAllData(true);
  }

  function confirmResetAllData() {
    planner.resetData();
    setPendingResetAllData(false);
    setSelectedProjectId("");
    setIsProjectDetailOpen(false);
    setStudyFocusNoteId("");
    planner.selectTask("");
    try {
      localStorage.removeItem("todo-planner-space-hub-v1");
      localStorage.removeItem("todo-planner-local-spaces-v1");
    } catch {
      // Keep reset working even if localStorage is unavailable.
    }
    window.dispatchEvent(new Event("focusflow:space-hub-reset"));
    showToast({ message: t("app.toastAllDataReset") });
  }

  function openTaskInOfficialPage(taskId: string) {
    const task = planner.tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    planner.selectTask(taskId);
    setSearchQuery("");

    if (task.status === "inbox") {
      setActivePage("today");
      setTodayIntent("triage");
      return;
    }

    if (task.status === "archived" || task.archivedAt) {
      setActivePage("archive");
      return;
    }

    if (task.projectId) {
      setSelectedProjectId(task.projectId);
      setIsProjectDetailOpen(true);
      setActivePage("projects");
      return;
    }

    setActivePage("planning");
  }

  function openStudyResult(note?: ConceptNote) {
    planner.selectTask("");
    if (note) {
      setStudyTab(note.nextReviewDate ? "reviews" : "notes");
    } else {
      setStudyTab("topics");
    }
    setActivePage("study");
    setSearchQuery("");
  }

  // Phase 4 (CALENDAR_DESIGN.md §9.11): Calendar's study-review blocks route
  // here to open a specific ConceptNote inside StudyPage.
  function openStudyReviewFromCalendar(noteId: string) {
    const note = planner.conceptNotes.find((candidate) => candidate.id === noteId);
    planner.selectTask("");
    setStudyTab(note?.nextReviewDate ? "reviews" : "notes");
    setStudyFocusNoteId(noteId);
    setActivePage("study");
  }

  function openProjectFromCalendar(projectId: string) {
    planner.selectTask("");
    setSelectedProjectId(projectId);
    setIsProjectDetailOpen(true);
    setActivePage("projects");
  }

  function viewTaskInCalendar(taskId: string) {
    planner.selectTask(taskId);
    setCalendarFocusProjectId("");
    setActivePage("calendar");
  }

  function openCalendarForProject(projectId?: string) {
    planner.selectTask("");
    setCalendarFocusProjectId(projectId ?? "");
    setActivePage("calendar");
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem("focusflow-sidebar-collapsed", next ? "1" : "0");
      } catch {
        // Collapse still works for this session without persistence.
      }
      return next;
    });
  }

  function navigateSection(page: PageId) {
    setActivePage(page);
    // Plain navigation (sidebar etc.) always shows the unfiltered calendar.
    setCalendarFocusProjectId("");
    planner.selectTask("");
  }

  if (currentPath === "/login" && !planner.auth.isSignedIn) {
    return (
      <I18nProvider lang={appSettings.language}>
        <AuthGate
          auth={planner.auth}
          onSignIn={planner.signIn}
          onSignUp={planner.signUp}
          onAuthenticated={() => navigate("/app", "replace")}
        />
      </I18nProvider>
    );
  }

  function renderTaskDetail() {
    return (
      <AnimatePresence initial={false}>
        {planner.selectedTask ? (
          <TaskDetail
            key={planner.selectedTask.id}
            task={planner.selectedTask}
            tasks={planner.tasks}
            projects={activeProjects}
            subtasks={planner.subtasks}
            onUpdateTask={planner.updateTask}
            onRequestDeleteTask={setPendingDeleteTaskId}
            onArchiveTask={handleArchiveTask}
            onDuplicateTask={handleDuplicateTask}
            onAddSubtask={planner.addSubtask}
            onToggleSubtask={planner.toggleSubtask}
            onDeleteSubtask={planner.deleteSubtask}
            onClose={() => planner.selectTask("")}
          />
        ) : null}
      </AnimatePresence>
    );
  }

  function renderPage() {
    return (
      <AppPages
        activePage={activePage}
        planner={planner}
        appSettings={appSettings}
        activeProjects={activeProjects}
        selectedProjectId={selectedProjectId}
        setSelectedProjectId={setSelectedProjectId}
        isProjectDetailOpen={isProjectDetailOpen}
        setIsProjectDetailOpen={setIsProjectDetailOpen}
        studyTab={studyTab}
        setStudyTab={setStudyTab}
        studyFocusNoteId={studyFocusNoteId}
        setStudyFocusNoteId={setStudyFocusNoteId}
        todayIntent={todayIntent}
        onTodayIntentHandled={() => setTodayIntent("")}
        renderTaskDetail={renderTaskDetail}
        showToast={showToast}
        handleArchiveTask={handleArchiveTask}
        handleArchiveProject={handleArchiveProject}
        requestDeleteTask={requestDeleteTask}
        requestDeleteProject={requestDeleteProject}
        deleteProjectNow={deleteProjectNow}
        openProjectFromCalendar={openProjectFromCalendar}
        openStudyReviewFromCalendar={openStudyReviewFromCalendar}
        viewTaskInCalendar={viewTaskInCalendar}
        openCalendarForProject={openCalendarForProject}
        calendarFocusProjectId={calendarFocusProjectId}
        onNavigate={navigateSection}
        exportJson={exportJson}
        handleImport={handleImport}
        importMessage={importMessage}
        requestResetAllData={requestResetAllData}
        focusSettings={focusSettings}
        onUpdateFocusSettings={updateFocusSettings}
        onStopFocus={stopFocusWithNotification}
        externalCalendars={externalCalendarState.calendars}
        externalCalendarEvents={externalCalendarState.events}
        onAddExternalCalendar={addExternalCalendar}
        onUpdateExternalCalendar={updateExternalCalendar}
        onDeleteExternalCalendar={deleteExternalCalendar}
        onSyncExternalCalendar={(calendarId) => void syncExternalCalendar(calendarId)}
        onSyncAllExternalCalendars={syncAllExternalCalendars}
        calendarShare={calendarShare}
        onEnableCalendarShare={() => void enableCalendarShare()}
        onDisableCalendarShare={() => void disableCurrentCalendarShare()}
        onRegenerateCalendarShare={() => void regenerateCalendarShare()}
        onPublishCalendarShare={() => void publishCurrentCalendarShare()}
        accountSlot={
          <AccountSection
            auth={planner.auth}
            onSignIn={planner.signIn}
            onSignUp={planner.signUp}
            onSignOut={planner.signOut}
            onUploadLocal={planner.uploadLocalDataToSupabase}
            onRefresh={planner.refreshSupabaseData}
          />
        }
      />
    );
  }


  return (
    <I18nProvider lang={appSettings.language}>
    <div
      className={[
        "app-shell",
        mobileMenuOpen ? "mobile-menu-open" : "",
        sidebarCollapsed ? "sidebar-collapsed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className="mobile-menu-button"
        aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        aria-expanded={mobileMenuOpen}
        onClick={() => setMobileMenuOpen((open) => !open)}
      >
        <span />
        <span />
        <span />
      </button>
      {mobileMenuOpen ? (
        <button
          type="button"
          className="mobile-menu-backdrop"
          aria-label="Close menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}
      <Sidebar
        activePage={activePage}
        onNavigate={(page) => {
          navigateSection(page);
          setMobileMenuOpen(false);
        }}
        tasks={planner.tasks}
        projects={activeProjects}
        selectedProjectId={selectedProjectId}
        userEmail={planner.auth.userEmail}
        dueReviewCount={dueReviewCount}
        showCounts={appSettings.showSidebarCounts}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
        onSelectProject={(projectId) => {
          setSelectedProjectId(projectId);
          setIsProjectDetailOpen(true);
          navigateSection("projects");
          setMobileMenuOpen(false);
        }}
        onAddProject={(name) => planner.addProject(name, "#0066cc")}
        onOpenSettings={() => {
          navigateSection("settings");
          setMobileMenuOpen(false);
        }}
        search={
          <SearchBox
            query={searchQuery}
            inputRef={searchInputRef}
            results={searchResults}
            onChange={setSearchQuery}
            onSelectTask={openTaskInOfficialPage}
            onSelectProject={(projectId) => {
              setSelectedProjectId(projectId);
              setIsProjectDetailOpen(true);
              navigateSection("projects");
              setSearchQuery("");
            }}
            onSelectTopic={() => openStudyResult()}
            onSelectNote={openStudyResult}
          />
        }
      />
      {/* key={activePage} remounts <main> on navigation so the new page
          crossfades in; opacity-only per pageVariants. */}
      <motion.main
        key={activePage}
        variants={motionEnabled ? pageVariants : undefined}
        initial={motionEnabled && hasBootedRef.current ? "initial" : false}
        animate={motionEnabled ? "animate" : undefined}
        transition={motionEnabled ? transitions.soft : reducedTransition}
      >
        {renderPage()}
      </motion.main>
      <GlobalFocusBar
        session={planner.activeFocusSession}
        task={planner.activeFocusSession ? planner.tasks.find((task) => task.id === planner.activeFocusSession?.taskId) ?? null : null}
        onOpenFocus={() => navigateSection("focus")}
        onPause={planner.pauseFocusSession}
        onResume={planner.resumeFocusSession}
        onStop={(sessionId) => stopFocusWithNotification(sessionId, false)}
        settings={focusSettings}
      />
      <OllamaChat
        activePage={activePage}
        aiContext={{
          currentPage: activePage,
          userId: planner.auth.userEmail || "local-user",
          tasks: planner.tasks,
          projects: planner.projects,
          subtasks: planner.subtasks,
          studyTopics: planner.studyTopics,
          conceptNotes: planner.conceptNotes,
          habits: planner.habits,
          habitLogs: planner.habitLogs,
          focusSessions: planner.focusSessions,
          activeSessionId: planner.activeSessionId,
          taskTemplates: planner.taskTemplates,
          recentItems: planner.recentItems,
          settings: planner.settings,
          appSettings,
        }}
        calendarContext={{
          tasks: planner.tasks,
          projects: planner.projects,
          conceptNotes: planner.conceptNotes,
        }}
        onExecuteActions={(actions) =>
          executeAgentActions(actions, {
            tasks: planner.tasks,
            projects: planner.projects,
            createTask: planner.createTask,
            addSubtask: planner.addSubtask,
            updateTask: planner.updateTask,
          })
        }
      />
      <AppModals
        pendingDeleteTaskId={pendingDeleteTaskId}
        pendingDeleteProjectId={pendingDeleteProjectId}
        pendingResetAllData={pendingResetAllData}
        toast={toast}
        onCancelDeleteTask={() => setPendingDeleteTaskId("")}
        onConfirmDeleteTask={confirmDeleteTask}
        onCancelDeleteProject={() => setPendingDeleteProjectId("")}
        onConfirmDeleteProject={confirmDeleteProject}
        onCancelResetAllData={() => setPendingResetAllData(false)}
        onConfirmResetAllData={confirmResetAllData}
        onDismissToast={() => setToast(null)}
      />
    </div>
    </I18nProvider>
  );
}

function AuthGate({
  auth,
  onSignIn,
  onSignUp,
  onAuthenticated,
}: {
  auth: ReturnType<typeof usePlannerData>["auth"];
  onSignIn: (email: string, password: string) => Promise<boolean>;
  onSignUp: (email: string, password: string) => Promise<{ ok: boolean; needsEmailConfirmation: boolean }>;
  onAuthenticated: () => void;
}) {
  const { t } = useT();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isSignUp = mode === "signUp";
  const canSubmit = Boolean(email.trim()) && password.length >= 6 && !submitting && !auth.isLoading;
  const authError = formatAuthError(auth.syncError, t);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      setMessage(password && password.length < 6 ? t("auth.passwordTooShort") : t("auth.enterCredentials"));
      return;
    }

    setSubmitting(true);
    setMessage("");
    const result = isSignUp
      ? await onSignUp(email.trim(), password)
      : { ok: await onSignIn(email.trim(), password), needsEmailConfirmation: false };
    setSubmitting(false);

    if (!result.ok) {
      setMessage(isSignUp ? t("auth.signUpFailed") : t("auth.signInFailed"));
      return;
    }

    if (result.needsEmailConfirmation) {
      setMessage(t("auth.verificationSent"));
      setMode("signIn");
    } else {
      setMessage(isSignUp ? t("auth.accountCreated") : t("auth.signedIn"));
      onAuthenticated();
    }
    setPassword("");
  }

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <div className="auth-logo" aria-hidden="true">
            <span />
          </div>
          <h1 id="auth-title">{t("auth.brandTitle")}</h1>
          <p>{isSignUp ? t("auth.signUpSubtitle") : t("auth.signInSubtitle")}</p>
        </div>

        <form className="auth-gate-form" onSubmit={submit}>
          <label>
            {t("auth.email")}
            <div className="auth-input-wrap">
              <span aria-hidden="true">M</span>
              <input
                type="email"
                placeholder={t("auth.emailPlaceholder")}
                value={email}
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </label>

          <label>
            {t("auth.password")}
            <div className="auth-input-wrap">
              <span aria-hidden="true">L</span>
              <input
                type={showPassword ? "text" : "password"}
                placeholder={t("auth.passwordPlaceholder")}
                value={password}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="auth-icon-button"
                aria-label={showPassword ? t("auth.hide") : t("auth.show")}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? t("auth.hide") : t("auth.show")}
              </button>
            </div>
          </label>

          <div className="auth-options">
            <label className="auth-check">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              {t("auth.keepSignedIn")}
            </label>
            <button type="button" className="auth-link" onClick={() => setMessage(t("auth.forgotPasswordMessage"))}>
              {t("auth.forgotPassword")}
            </button>
          </div>

          <button type="submit" className="auth-submit" disabled={!canSubmit}>
            {submitting || auth.isLoading ? t("auth.processing") : isSignUp ? t("auth.signUp") : t("auth.logIn")}
          </button>
        </form>

        <div className="auth-divider">
          <span />
          <em>{t("auth.orDivider")}</em>
          <span />
        </div>

        <p className="auth-switch">
          {isSignUp ? t("auth.alreadyHaveAccount") : t("auth.noAccount")}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(isSignUp ? "signIn" : "signUp");
              setMessage("");
            }}
          >
            {isSignUp ? t("auth.logIn") : t("auth.signUp")}
          </button>
        </p>

        {message || authError ? (
          <p className={authError ? "auth-message error" : "auth-message"}>
            {authError || message}
          </p>
        ) : null}
      </section>
    </main>
  );
}

function formatAuthError(error: string, t: (key: string) => string): string {
  if (!error) {
    return "";
  }

  if (error.includes("Invalid path specified")) {
    return t("auth.supabaseUrlMisconfigured");
  }

  if (error.toLowerCase().includes("invalid login credentials")) {
    return t("auth.invalidCredentials");
  }

  return error;
}

function AccountSection({
  auth,
  onSignIn,
  onSignUp,
  onSignOut,
  onUploadLocal,
  onRefresh,
}: {
  auth: ReturnType<typeof usePlannerData>["auth"];
  onSignIn: (email: string, password: string) => Promise<boolean>;
  onSignUp: (email: string, password: string) => Promise<{ ok: boolean; needsEmailConfirmation: boolean }>;
  onSignOut: () => Promise<void>;
  onUploadLocal: () => Promise<boolean>;
  onRefresh: () => Promise<void>;
}) {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit(action: "signIn" | "signUp") {
    const result = action === "signIn"
      ? { ok: await onSignIn(email, password), needsEmailConfirmation: false }
      : await onSignUp(email, password);
    setMessage(
      result.ok
        ? action === "signIn"
          ? t("auth.signedIn")
          : result.needsEmailConfirmation
            ? t("auth.verificationSent")
            : t("auth.accountCreated")
        : t("auth.authFailed"),
    );
    if (result.ok) {
      setPassword("");
    }
  }

  return (
    <section className="settings-card account-card">
      <div className="section-title">
        <h2>{t("auth.accountTitle")}</h2>
        <span>{auth.mode}</span>
      </div>
      {!auth.isConfigured ? (
        <p className="empty-state">{t("auth.notConfigured")}</p>
      ) : null}
      {auth.isSignedIn ? (
        <div className="account-stack">
          <p>
            {t("auth.signedInAs")} <strong>{auth.userEmail}</strong>
          </p>
          <div className="settings-actions">
            <button onClick={onRefresh}>{t("auth.refreshCloud")}</button>
            <button onClick={onSignOut}>{t("auth.logOut")}</button>
          </div>
        </div>
      ) : (
        <div className="auth-form">
          <input
            type="email"
            placeholder={t("auth.email")}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            type="password"
            placeholder={t("auth.password")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button onClick={() => submit("signIn")} disabled={!auth.isConfigured || auth.isLoading}>
            {t("auth.logIn")}
          </button>
          <button onClick={() => submit("signUp")} disabled={!auth.isConfigured || auth.isLoading}>
            {t("auth.signUp")}
          </button>
        </div>
      )}
      {auth.migrationPreviewCount > 0 && auth.isSignedIn ? (
        <div className="migration-box">
          <strong>{t("auth.migrationCount", { n: auth.migrationPreviewCount })}</strong>
          <p>{t("auth.migrationBody")}</p>
          <button
            onClick={async () => {
              const success = await onUploadLocal();
              setMessage(success ? t("auth.uploadSuccess") : t("auth.uploadNoData"));
            }}
          >
            {t("auth.uploadLocal")}
          </button>
        </div>
      ) : null}
      <p className="settings-message">{auth.syncStatus}</p>
      {auth.syncError ? <p className="settings-error">{auth.syncError}</p> : null}
      {message ? <p className="settings-message">{message}</p> : null}
    </section>
  );
}

function SearchBox({
  query,
  inputRef,
  results,
  onChange,
  onSelectTask,
  onSelectProject,
  onSelectTopic,
  onSelectNote,
}: {
  query: string;
  inputRef: RefObject<HTMLInputElement>;
  results: { tasks: Task[]; projects: Project[]; topics: StudyTopic[]; notes: ConceptNote[] };
  onChange: (value: string) => void;
  onSelectTask: (taskId: string) => void;
  onSelectProject: (projectId: string) => void;
  onSelectTopic: (topicId: string) => void;
  onSelectNote: (note: ConceptNote) => void;
}) {
  const { t } = useT();
  const hasResults =
    results.tasks.length > 0 ||
    results.projects.length > 0 ||
    results.topics.length > 0 ||
    results.notes.length > 0;

  return (
    <div className="global-search">
      <input
        ref={inputRef}
        aria-label="Global search"
        placeholder={t("app.searchPlaceholder")}
        value={query}
        onChange={(event) => onChange(event.target.value)}
      />
      {query.trim() ? (
        <div className="search-results">
          {!hasResults ? <p className="empty-state">{t("app.searchNoResults")}</p> : null}
          {results.tasks.slice(0, 6).map((task) => (
            <button key={task.id} onClick={() => onSelectTask(task.id)}>
              <strong>{task.title}</strong>
              <small>{t("app.taskLabel")} - {task.status} - {task.tags.join(", ") || t("app.noTags")}</small>
            </button>
          ))}
          {results.projects.slice(0, 4).map((project) => (
            <button key={project.id} onClick={() => onSelectProject(project.id)}>
              <strong>{project.name}</strong>
              <small>{t("app.projectLabel")}</small>
            </button>
          ))}
          {results.topics.slice(0, 4).map((topic) => (
            <button key={topic.id} onClick={() => onSelectTopic(topic.id)}>
              <strong>{topic.name}</strong>
              <small>{t("app.studyTopicLabel")} - {topic.category}</small>
            </button>
          ))}
          {results.notes.slice(0, 4).map((note) => (
            <button key={note.id} onClick={() => onSelectNote(note)}>
              <strong>{note.title}</strong>
              <small>{t("app.studyNoteLabel")} - {note.noteType}</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

