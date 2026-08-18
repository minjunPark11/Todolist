import { FormEvent, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "./components/Sidebar";
import { OllamaChat } from "./components/OllamaChat";
import { TaskDetail } from "./components/TaskDetail";
import { GlobalFocusBar } from "./components/GlobalFocusBar";
import { UpdateChecker } from "./components/UpdateChecker";
import { usePlannerData } from "./hooks/usePlannerData";
import { AppModals } from "./app/AppModals";
import { AppPages } from "./app/AppPages";
import {
  filterForSelection,
  parseSelection,
  pathForSelection,
  resolveSelection,
  selectedProjectId as readSelectedProjectId,
  selectedSpaceId,
} from "./app/spaceSelection";
import { spaceIdForProject } from "./domain/spaces/spaces";
import type { TodayIntent } from "./components/TodayPage";
import { TasksModule } from "./components/tasks/TasksModule";
import { canonicalizeTaskUrl, parseSearchUrl, parseTaskScope } from "./app/taskScopeUrl";
import { childrenOf } from "./domain/tasks/children";
import { executeAgentActions } from "./app/executeAgentActions";
import { buildAiContextInput } from "./domain/ai/buildAiContextInput";
import { useDataPortability } from "./app/useDataPortability";
import { dismissToast, enqueueToast, type QueuedToast } from "./lib/toastQueue";
import { formatFocusDuration, getDisplayedFocusSeconds, useNowTick } from "./lib/focusTimer";
import { useKnowledgeAutoIndex } from "./lib/knowledge/useKnowledgeAutoIndex";
import { useKnowledgeSettings } from "./lib/knowledge/useKnowledgeSettings";
import { useLocalAiAutostart } from "./lib/localAi/runtime";
import { popUndo, pushUndo } from "./lib/undoStack";
import { reducedTransition, transitions } from "./motion/transitions";
import { pageVariants } from "./motion/variants";
import { useMotionEnabled } from "./motion/reducedMotion";
import {
  loadFocusUserSettings,
  saveFocusUserSettings,
  type FocusUserSettings,
} from "./lib/focusSettingsStorage";
import { platform, type AppUpdateStatus } from "./platform";
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
  ExternalCalendar,
  PageId,
  Project,
  Task,
} from "./types";
import { todayValue } from "./utils/date";
import { I18nProvider, translate, useT } from "./i18n";

function cloudExternalCalendarSnapshot(calendar: ExternalCalendar): ExternalCalendar {
  return {
    id: calendar.id,
    name: calendar.name,
    icsUrl: calendar.icsUrl,
    color: calendar.color,
    visible: calendar.visible,
    enabled: calendar.enabled,
    createdAt: calendar.createdAt,
    updatedAt: calendar.updatedAt,
  };
}

function comparableExternalCalendars(calendars: ExternalCalendar[]) {
  return calendars
    .map(cloudExternalCalendarSnapshot)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function externalCalendarListsEqual(a: ExternalCalendar[], b: ExternalCalendar[]) {
  return JSON.stringify(comparableExternalCalendars(a)) === JSON.stringify(comparableExternalCalendars(b));
}

function mergeExternalCalendars(local: ExternalCalendar[], remote: ExternalCalendar[]) {
  const localById = new Map(local.map((calendar) => [calendar.id, calendar]));
  const mergedRemote = remote.map((calendar) => {
    const existing = localById.get(calendar.id);
    localById.delete(calendar.id);
    return existing ? { ...existing, ...cloudExternalCalendarSnapshot(calendar) } : calendar;
  });
  return [...mergedRemote, ...Array.from(localById.values())];
}

export default function App() {
  const planner = usePlannerData();
  const appSettings = planner.appSettings;
  // Single instance shared by the Settings "지식베이스" tab and OllamaChat so a
  // vault connection made in Settings is immediately visible to the chat panel
  // (both are mounted for the app's whole lifetime, not remounted on nav).
  const knowledge = useKnowledgeSettings();
  // Phase 4: auto-syncs the Full-mode index on app start and on vault file
  // changes; no-ops entirely unless Full mode is enabled and connected.
  useKnowledgeAutoIndex(knowledge.settings);
  // Pre-warms the managed llama-server, but only when the user picked
  // "앱 시작 시 미리 실행" in Local AI settings (default is on-demand).
  useLocalAiAutostart();
  // Renders before the <I18nProvider> below exists in the tree, so this can't
  // use the useT() context hook — call the plain translate() helper instead.
  const t = (key: string, vars?: Record<string, string | number>) => translate(appSettings.language, key, vars);
  // Open the user's chosen default start page on boot. /inbox opens Today with
  // the triage drawer (handled by todayIntent below), so it maps to "today".
  const [activePage, setActivePage] = useState<PageId>(() => {
    // A deep link into the tree outranks the default start page — arriving at
    // /s/:spaceId and being shown Today would discard the link.
    if (parseSelection(window.location.pathname).kind !== "none") return "projects";
    switch (appSettings.defaultView) {
      case "/calendar":
        return "calendar";
      case "/board":
      // Legacy: Planning is now the Board grouped by quadrant.
      case "/planning":
        return "board";
      // "/projects" fell here and opened the card grid. Anyone who had it
      // stored now starts on Today (the default branch) — a Space is reached
      // from the tree, and there is no screen to land on without one.
      case "/focus":
        return "focus";
      default:
        return "today";
    }
  });
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
  // Where in the Space tree the user is standing. Derived from the path, never
  // mirrored into state: the two flat fields this replaces could not say which
  // List was open and did not survive a reload (SPACES_CLICKUP_UI_DESIGN §1).
  // `selectProject` / `selectList` / `clearSelection` below are the only writers.
  const [pendingDeleteTaskId, setPendingDeleteTaskId] = useState("");
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState("");
  const [pendingResetAllData, setPendingResetAllData] = useState(false);
  // When set, the Calendar page opens pre-filtered to this project (space
  // detail's "Open Calendar" — PROJECT_DETAIL_REMOVE_CALENDAR_TAB spec §8.2).
  const [calendarFocusProjectId, setCalendarFocusProjectId] = useState("");
  const [toasts, setToasts] = useState<QueuedToast[]>([]);
  const toastIdRef = useRef(0);
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
  const [appVersion, setAppVersion] = useState(__APP_VERSION__);
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | { status: "checking" } | { status: "installing"; latestVersion?: string }>({ status: "checking" });
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
  // The Tasks Module reads path AND query — `?view=` and `?task=` are part of
  // where you are (§5.62), where every route above it is a path alone.
  const [currentUrl, setCurrentUrl] = useState(
    () => `${window.location.pathname}${window.location.search}`,
  );
  // Parsing is syntactic; resolving is what turns an old `/s/:projectId` link
  // into a Project scope under its Space (§33). It re-runs when the records
  // arrive, so a deep link followed before the first load still lands.
  const selection = useMemo(
    () => resolveSelection(parseSelection(currentPath), { spaces: planner.spaces, projects: planner.projects }),
    [currentPath, planner.spaces, planner.projects],
  );
  const selectedProjectId = readSelectedProjectId(selection);
  const isProjectDetailOpen = selection.kind !== "none";
  const searchInputRef = useRef<HTMLInputElement>(null);
  const originalTitleRef = useRef(document.title || "FocusFlow");
  const completedNotificationRef = useRef<Set<string>>(new Set());
  const syncingExternalCalendarsRef = useRef<Set<string>>(new Set());
  const initialExternalCalendarSyncRef = useRef(false);
  const externalCalendarCloudHydratedRef = useRef(false);
  const sharePublishTimerRef = useRef<number | null>(null);

  const today = todayValue();
  const focusNow = useNowTick(Boolean(planner.activeFocusSession && planner.activeFocusSession.status === "running"));
  const activeFocusTask = planner.activeFocusSession
    ? planner.tasks.find((task) => task.id === planner.activeFocusSession?.taskId) ?? null
    : null;
  const activeFocusElapsed = getDisplayedFocusSeconds(planner.activeFocusSession, focusNow);
  // §13.28: deleted Projects leave the active views the same way archived ones
  // do. Their Lists and Tasks are untouched and stay usable in the Tasks
  // Module — a Project is a List's context, not a Task's owner (§13.19).
  const activeProjects = planner.projects.filter(
    (project) => project.status !== "archived" && !project.deletedAt,
  );
  const { importMessage, exportJson, handleImport } = useDataPortability({
    today,
    exportData: planner.exportData,
    importData: planner.importData,
  });

  useEffect(() => {
    let cancelled = false;
    platform.getAppVersion().then((version) => {
      if (!cancelled && version) {
        setAppVersion(version);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function checkAppUpdate(version = appVersion) {
    setUpdateStatus({ status: "checking" });
    const result = await platform.checkForUpdate(version);
    setUpdateStatus(result);
  }

  async function installAppUpdate() {
    const latestVersion = updateStatus.status === "available" ? updateStatus.latestVersion : undefined;
    setUpdateStatus({ status: "installing", latestVersion });
    try {
      await platform.installUpdate();
    } catch (error) {
      setUpdateStatus({
        status: "unavailable",
        message: error instanceof Error ? error.message : t("update.installFailed"),
      });
    }
  }

  useEffect(() => {
    void checkAppUpdate(appVersion);
  }, [appVersion]);

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
    };
  }, [activeProjects, planner.tasks, searchQuery]);

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

      // Modifier combos belong to the browser/OS, not to single-letter shortcuts.
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      // Every branch below moves focus into a field, so the keystroke must be
      // swallowed — otherwise the shortcut letter types itself into the input
      // it just focused.
      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        setActivePage("today");
      } else if (event.key.toLowerCase() === "i") {
        event.preventDefault();
        setActivePage("today");
        setTodayIntent("triage");
      } else if (event.key.toLowerCase() === "n") {
        event.preventDefault();
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
    if (!session || !activeFocusTask) {
      void platform.miniFocusTimer.clear();
      return;
    }
    void platform.miniFocusTimer.update({
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
    if (!session || !focusSettings.enableCompletionNotification) return;
    platform.requestNotificationPermission().catch(() => undefined);
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

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    platform.miniFocusTimer.subscribeAction((payload) => {
      const session = planner.activeFocusSession;
      if (!session || session.id !== payload.sessionId) return;
      if (payload.action === "pause") planner.pauseFocusSession(session.id);
      if (payload.action === "resume") planner.resumeFocusSession(session.id);
      if (payload.action === "finish") stopFocusWithNotification(session.id, false);
    }).then((nextUnlisten) => {
      if (cancelled) {
        nextUnlisten();
        return;
      }
      unlisten = nextUnlisten;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [planner.activeFocusSession, planner.pauseFocusSession, planner.resumeFocusSession]);

  function navigate(path: string, mode: "push" | "replace" = "push") {
    if (window.location.pathname === path) {
      return;
    }
    window.history[mode === "replace" ? "replaceState" : "pushState"](null, "", path);
    setCurrentPath(path);
    setCurrentUrl(path);
  }

  /** Same, for a destination whose query is part of the address (§5.62). */
  function navigateUrl(url: string, mode: "push" | "replace" = "push") {
    if (`${window.location.pathname}${window.location.search}` === url) return;
    window.history[mode === "replace" ? "replaceState" : "pushState"](null, "", url);
    setCurrentPath(url.split("?")[0]);
    setCurrentUrl(url);
  }

  /** The Space a Project hangs in, for building a full path to it. */
  function spaceIdOf(projectId: string): string {
    const project = planner.projects.find((item) => item.id === projectId);
    return project ? spaceIdForProject(project) : "";
  }

  function selectSpace(spaceId: string) {
    planner.selectTask("");
    navigate(pathForSelection({ kind: "space", spaceId }));
    setActivePage("projects");
  }

  function selectProject(projectId: string) {
    planner.selectTask("");
    navigate(pathForSelection({ kind: "project", spaceId: spaceIdOf(projectId), projectId }));
    setActivePage("projects");
  }

  function selectList(projectId: string, listId: string) {
    planner.selectTask("");
    navigate(pathForSelection({ kind: "list", spaceId: spaceIdOf(projectId), projectId, listId }));
    setActivePage("projects");
  }

  function selectFolder(projectId: string, folderId: string) {
    planner.selectTask("");
    navigate(pathForSelection({ kind: "folder", spaceId: spaceIdOf(projectId), projectId, folderId }));
    setActivePage("projects");
  }

  function clearSelection() {
    if (selection.kind !== "none") navigate("/app");
  }

  /**
   * Widens a Folder or List scope back to its whole Project. A Space selection
   * has no narrower scope to clear, so this does nothing there.
   */
  function clearScope() {
    if (selectedProjectId) selectProject(selectedProjectId);
  }

  // §33: once the records that can resolve an old `/s/:projectId` link have
  // loaded, the address bar is rewritten to the new scheme — replace, not
  // push, so Back still goes where the user came from rather than to the link
  // they just followed. Skipped while `spaceId` is empty: that is the marker
  // for a selection still waiting to resolve, and writing it would produce a
  // path with a hole in it.
  useEffect(() => {
    if (selection.kind === "none" || !selectedSpaceId(selection)) return;
    const canonical = pathForSelection(selection);
    if (canonical !== currentPath) navigate(canonical, "replace");
  }, [selection, currentPath]);

  useEffect(() => {
    function handlePopState() {
      setCurrentPath(window.location.pathname);
      setCurrentUrl(`${window.location.pathname}${window.location.search}`);
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
    const remoteCalendars = planner.settings.externalCalendars ?? [];
    externalCalendarCloudHydratedRef.current = true;
    if (!remoteCalendars.length) return;

    setExternalCalendarState((current) => {
      const calendars = mergeExternalCalendars(current.calendars, remoteCalendars);
      if (externalCalendarListsEqual(current.calendars, calendars)) return current;
      const next = {
        calendars,
        events: current.events.filter((event) => calendars.some((calendar) => calendar.id === event.externalCalendarId)),
      };
      saveExternalCalendarState(next);
      return next;
    });
  }, [planner.settings.externalCalendars]);

  useEffect(() => {
    if (!planner.auth.isSignedIn || !externalCalendarCloudHydratedRef.current) return;
    const remoteCalendars = planner.settings.externalCalendars ?? [];
    if (!externalCalendarState.calendars.length && remoteCalendars.length) return;
    if (externalCalendarListsEqual(externalCalendarState.calendars, remoteCalendars)) return;
    planner.updatePlannerSettings({
      externalCalendars: comparableExternalCalendars(externalCalendarState.calendars),
    });
  }, [externalCalendarState.calendars, planner.auth.isSignedIn, planner.settings.externalCalendars]);

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
            error: error instanceof Error ? error.message : t("app.calendarShareLoadFailed"),
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
  }, [calendarShare.enabled, calendarShare.token, planner.tasks, planner.projects]);

  // One-time cleanup for the ?triage=inbox deep link — the intent was already
  // captured into todayIntent above.
  //
  // `/inbox` used to be redirected here too, because Inbox was a drawer inside
  // Today and not a place. It is a Scope now (§12.3) with a screen of its own,
  // so the route is answered rather than swept away.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("triage") === "inbox") {
      params.delete("triage");
      const query = params.toString();
      const cleanPath = `${window.location.pathname}${query ? `?${query}` : ""}`;
      window.history.replaceState(null, "", cleanPath);
    }
  }, []);

  // Queued rather than replaced: back-to-back actions used to drop the first
  // toast (and its undo button) before it could be pressed. Each toast owns
  // its own lifetime in AppModals.
  function showToast(nextToast: { message: string; actionLabel?: string; onAction?: () => void }) {
    toastIdRef.current += 1;
    setToasts((current) => enqueueToast(current, { id: toastIdRef.current, ...nextToast }));
  }

  // Stable so a toast's dismissal timer isn't restarted by unrelated renders.
  const handleDismissToast = useCallback((id: number) => {
    setToasts((current) => dismissToast(current, id));
  }, []);

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

    const title = t("focus.notificationTitle");
    const body = t("focus.notificationBody", {
      time: formatFocusDuration(getDisplayedFocusSeconds(session), true),
      title: task?.title || session.title || t("focus.notificationTaskFallback"),
    });
    void platform.notify({ title, body }).then((sent) => {
      if (!sent) showToast({ message: `${title}: ${body}` });
    });
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
      if (!options?.silent) showToast({ message: t("app.calendarShareUpdated") });
    } catch (error) {
      setCalendarShare((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : t("app.calendarShareUpdateFailed"),
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
      showToast({ message: t("app.calendarShareDisabled") });
    } catch (error) {
      setCalendarShare((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : t("app.calendarShareDisableFailed"),
      }));
    }
  }

  async function regenerateCalendarShare() {
    await publishCurrentCalendarShare(createShareToken(), true);
  }

  // Batch-aware: archiving a selection must produce one toast with one undo,
  // not N toasts that evict each other out of the queue.
  function handleArchiveTasks(taskIds: string[]) {
    if (taskIds.length === 0) return;
    taskIds.forEach((taskId) => planner.archiveTask(taskId));
    showToast({
      message:
        taskIds.length === 1
          ? t("app.toastTaskArchived")
          : t("app.toastTasksArchived", { n: taskIds.length }),
      actionLabel: t("app.undo"),
      onAction: () => taskIds.forEach((taskId) => planner.restoreTask(taskId)),
    });
  }

  function handleArchiveTask(taskId: string) {
    handleArchiveTasks([taskId]);
  }

  function handleDuplicateTask(taskId: string) {
    const copyId = planner.duplicateTask(taskId);
    showToast({
      message: t("app.toastTaskDuplicated"),
      ...(copyId
        ? { actionLabel: t("app.undo"), onAction: () => planner.deleteTask(copyId) }
        : {}),
    });
  }

  function handleArchiveProject(projectId: string) {
    planner.archiveProject(projectId);
    clearSelection();
    planner.selectTask("");
    showToast({
      message: t("app.toastProjectArchived"),
      actionLabel: t("app.undo"),
      onAction: () => planner.restoreProject(projectId),
    });
  }

  // Deletion is permanent in the store, so the rows are captured first and the
  // toast hands back a targeted restore — undoing one delete never rolls back
  // whatever else the user did while the toast was up.
  function deleteTaskWithUndo(taskId: string) {
    const task = planner.tasks.find((item) => item.id === taskId);
    if (!task) return;
    const subtasks = planner.subtasks.filter((item) => item.taskId === taskId);
    const childTaskIds = planner.tasks
      .filter((item) => item.parentTaskId === taskId)
      .map((item) => item.id);
    planner.deleteTask(taskId);
    showToast({
      message: t("app.toastTaskDeleted"),
      actionLabel: t("app.undo"),
      onAction: () => planner.restoreDeletedTask(task, subtasks, childTaskIds),
    });
  }

  function requestDeleteTask(taskId: string) {
    if (appSettings.confirmBeforeDelete) {
      setPendingDeleteTaskId(taskId);
    } else {
      deleteTaskWithUndo(taskId);
    }
  }

  // Deletes immediately, no app-level confirm — for callers that already
  // showed their own confirmation (e.g. the space delete modal).
  function deleteProjectNow(projectId: string) {
    const project = planner.projects.find((item) => item.id === projectId);
    const taskIds = planner.tasks
      .filter((item) => item.projectId === projectId)
      .map((item) => item.id);
    planner.deleteProject(projectId);
    clearSelection();
    planner.selectTask("");
    showToast({
      message: t("app.toastProjectDeleted"),
      ...(project
        ? {
            actionLabel: t("app.undo"),
            onAction: () => planner.restoreDeletedProject(project, taskIds),
          }
        : {}),
    });
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
    deleteTaskWithUndo(pendingDeleteTaskId);
    setPendingDeleteTaskId("");
  }

  function confirmDeleteProject() {
    if (!pendingDeleteProjectId) {
      return;
    }
    deleteProjectNow(pendingDeleteProjectId);
    setPendingDeleteProjectId("");
  }

  function requestResetAllData() {
    setPendingResetAllData(true);
  }

  function confirmResetAllData() {
    planner.resetData();
    setPendingResetAllData(false);
    clearSelection();
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
      selectProject(task.projectId);
      return;
    }

    setActivePage("board");
  }

  function openProjectFromCalendar(projectId: string) {
    selectProject(projectId);
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
    // Leaving the tree drops the selection with it. Keeping /s/:spaceId in the
    // address bar while showing Today would make the URL describe a place the
    // user is no longer standing.
    clearSelection();
    // Plain navigation (sidebar etc.) always shows the unfiltered calendar.
    setCalendarFocusProjectId("");
    planner.selectTask("");
  }

  // A password-reset link opens the app with a recovery session — before any
  // normal routing, let the user set a new password.
  if (planner.auth.recoveryMode) {
    return (
      <I18nProvider lang={appSettings.language}>
        <PasswordRecoveryGate
          onUpdatePassword={planner.updatePassword}
          onDone={() => navigate("/login", "replace")}
        />
      </I18nProvider>
    );
  }

  if (currentPath === "/login" && !planner.auth.isSignedIn) {
    return (
      <I18nProvider lang={appSettings.language}>
        <AuthGate
          auth={planner.auth}
          onSignIn={planner.signIn}
          onSignUp={planner.signUp}
          onResetPassword={planner.resetPassword}
          onAuthenticated={() => navigate("/app", "replace")}
        />
      </I18nProvider>
    );
  }

  // The Tasks Module answers its own nine routes (§12.3) and nothing else.
  // `parseTaskScope` returning null is what keeps the Spaces routes and every
  // page above working — this branch claims `/today`, `/list/:id` and the rest,
  // not "any path I do not recognise" (§5.56).
  // §10.19 adds a tenth route to the module: the Search Page. It is not a
  // Scope — `canonicalizeTaskUrl` has nothing to tidy about it — but it opens
  // in the same shell, so the module claims it too.
  if (parseTaskScope(currentUrl.split("?")[0]) || parseSearchUrl(currentUrl) !== null) {
    const canonical = canonicalizeTaskUrl(currentUrl);
    return (
      <I18nProvider lang={appSettings.language}>
        <TasksModule
          tasks={planner.tasks}
          lists={planner.lists}
          folders={planner.folders}
          sidebarFolders={planner.sidebarFolders}
          savedFilters={planner.savedFilters}
          listSections={planner.listSections}
          projects={planner.projects}
          spaces={planner.spaces}
          dailyPlans={planner.dailyPlans}
          tags={planner.tags}
          taskTags={planner.taskTags}
          today={today}
          url={canonical ?? currentUrl}
          onNavigate={navigateUrl}
          error={planner.auth.syncError}
          onCreate={(title, resolution) => {
            if (!resolution.targetListId) return;
            const owner = planner.lists.find((list) => list.id === resolution.targetListId);
            // §12.4's Auto Apply, resolved here rather than in the resolver:
            // `Task.tags` holds names and the Scope knows an id.
            const tagNames = (resolution.applyTagIds ?? [])
              .map((id) => planner.tags.find((tag) => tag.id === id)?.name)
              .filter((name): name is string => Boolean(name));
            const taskId = planner.createTask({
              title,
              listId: resolution.targetListId,
              projectId: owner?.projectId ?? "",
              // The Inbox keeps writing the status it replaced, so a client
              // older than Migration Phase 2 still finds the task.
              status: owner?.kind === "inbox" ? "inbox" : "todo",
              ...(tagNames.length > 0 ? { tags: tagNames } : {}),
              ...resolution.patch,
            });
            if (taskId && resolution.dailyPlan) {
              planner.planTaskForDay(taskId, resolution.dailyPlan.planDate);
            }
          }}
          drawer={{
            // Both kinds of child, through the reader that already knows there
            // are two: legacy `Subtask` rows and the child Tasks `addSubtask`
            // has been writing since the promotion path landed.
            childrenOf: (taskId) => childrenOf(taskId, planner.tasks, planner.subtasks),
            onUpdate: planner.updateTask,
            onMoveToList: planner.moveTaskToList,
            onAddSubtask: planner.addSubtask,
            onToggleSubtask: planner.toggleSubtask,
            onDeleteSubtask: planner.deleteSubtask,
          }}
          // Straight to the store. The legacy confirmation modal lives in
          // AppModals, which this branch does not render — and §9.45 keeps
          // confirmation for what cannot be taken back, which a soft delete
          // with an Undo beside it is not.
          lifecycle={{
            onArchiveList: planner.archiveList,
            onTrashList: planner.trashList,
            onRestoreList: planner.restoreList,
            onPermanentlyDeleteList: planner.permanentlyDeleteList,
          }}
          onMutate={planner.updateTask}
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
            lists={planner.lists}
            subtasks={planner.subtasks}
            onMoveToList={planner.moveTaskToList}
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
        viewScope={filterForSelection(selection)}
        onClearScope={clearScope}
        onSelectList={(listId) => selectList(selectedProjectId, listId)}
        isProjectDetailOpen={isProjectDetailOpen}
        onSelectSpace={selectProject}
        onCloseSpace={clearSelection}
        todayIntent={todayIntent}
        onTodayIntentHandled={() => setTodayIntent("")}
        renderTaskDetail={renderTaskDetail}
        showToast={showToast}
        handleArchiveTask={handleArchiveTask}
        handleArchiveTasks={handleArchiveTasks}
        handleArchiveProject={handleArchiveProject}
        requestDeleteTask={requestDeleteTask}
        requestDeleteProject={requestDeleteProject}
        deleteProjectNow={deleteProjectNow}
        openProjectFromCalendar={openProjectFromCalendar}
        viewTaskInCalendar={viewTaskInCalendar}
        openCalendarForProject={openCalendarForProject}
        calendarFocusProjectId={calendarFocusProjectId}
        onNavigate={navigateSection}
        exportJson={exportJson}
        handleImport={handleImport}
        importMessage={importMessage}
        appVersion={appVersion}
        updateStatus={updateStatus}
        onCheckUpdate={() => void checkAppUpdate()}
        onInstallUpdate={() => void installAppUpdate()}
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
        knowledgeSettings={knowledge.settings}
        onUpdateKnowledgeSettings={knowledge.updateSettings}
        isKnowledgeDesktop={knowledge.isDesktop}
        accountSlot={
          <AccountSection
            auth={planner.auth}
            onOpenLogin={() => navigate("/login")}
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
      <>
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
        aria-label={mobileMenuOpen ? t("app.closeMenu") : t("app.openMenu")}
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
          aria-label={t("app.closeMenu")}
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
        showCounts={appSettings.showSidebarCounts}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
        selection={selection}
        folders={planner.folders}
        lists={planner.lists}
        onSelectProject={(projectId) => {
          selectProject(projectId);
          setMobileMenuOpen(false);
        }}
        onSelectList={(spaceId, listId) => {
          selectList(spaceId, listId);
          setMobileMenuOpen(false);
        }}
        onSelectFolder={(spaceId, folderId) => {
          selectFolder(spaceId, folderId);
          setMobileMenuOpen(false);
        }}
        onCreateList={planner.createList}
        onCreateFolder={planner.createFolder}
        onRenameList={(listId, name) => planner.updateList(listId, { name })}
        onArchiveList={planner.archiveList}
        onRenameFolder={(folderId, name) => planner.updateFolder(folderId, { name })}
        onArchiveFolder={planner.archiveFolder}
        onMoveItemToList={(itemKey, listId) => {
          // `Item.key` is `source:id` — the projection's own encoding, so the
          // tree never has to know which collection a card came from.
          const [source, id] = itemKey.split(":");
          if (source === "task") planner.moveTaskToList(id, listId);
          else if (source === "goal") planner.moveGoalToList(id, listId);
          // A milestone lives inside its goal and has no List of its own.
        }}
        onAddProject={(name) => planner.addProject(name, "#0066cc")}
        onRenameSpace={(spaceId, name) => planner.updateSpace(spaceId, { name })}
        onArchiveSpace={planner.archiveSpace}
        onRenameProject={(projectId, name) => planner.updateProject(projectId, { name })}
        onArchiveProject={handleArchiveProject}
        onTogglePinProject={planner.toggleProjectPinned}
        spaces={planner.spaces}
        onSelectSpace={selectSpace}
        onCreateSpace={planner.createSpace}
        onCreateProject={(spaceId, name) => planner.addProject(name, "#0066cc", spaceId)}
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
              selectProject(projectId);
              setSearchQuery("");
            }}
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
        knowledgeSettings={knowledge.settings}
        pathStore={{
          paths: planner.learningPaths,
          savePath: (draft, source) =>
            planner.createLearningPath({
              goal: draft.goal,
              milestones: draft.milestones,
              targetDate: draft.targetDate,
              projectId: draft.projectId,
              source: source ?? "assistant",
            }),
          linkCard: planner.linkCardToMilestone,
        }}
        aiContext={buildAiContextInput({ planner, appSettings, currentPage: activePage })}
        calendarContext={{
          tasks: planner.tasks,
          projects: planner.projects,
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
        toasts={toasts}
        onCancelDeleteTask={() => setPendingDeleteTaskId("")}
        onConfirmDeleteTask={confirmDeleteTask}
        onCancelDeleteProject={() => setPendingDeleteProjectId("")}
        onConfirmDeleteProject={confirmDeleteProject}
        onCancelResetAllData={() => setPendingResetAllData(false)}
        onConfirmResetAllData={confirmResetAllData}
        onDismissToast={handleDismissToast}
      />
        </div>
        <UpdateChecker />
      </>
    </I18nProvider>
  );
}

function AuthGate({
  auth,
  onSignIn,
  onSignUp,
  onResetPassword,
  onAuthenticated,
}: {
  auth: ReturnType<typeof usePlannerData>["auth"];
  onSignIn: (email: string, password: string) => Promise<boolean>;
  onSignUp: (email: string, password: string) => Promise<{ ok: boolean; needsEmailConfirmation: boolean }>;
  onResetPassword: (email: string) => Promise<boolean>;
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

  async function handleForgotPassword() {
    if (!email.trim()) {
      setMessage(t("auth.resetEnterEmail"));
      return;
    }
    setSubmitting(true);
    setMessage("");
    const ok = await onResetPassword(email.trim());
    setSubmitting(false);
    setMessage(ok ? t("auth.resetEmailSent") : t("auth.resetFailed"));
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
            <button type="button" className="auth-link" onClick={handleForgotPassword} disabled={submitting}>
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

function PasswordRecoveryGate({
  onUpdatePassword,
  onDone,
}: {
  onUpdatePassword: (newPassword: string) => Promise<boolean>;
  onDone: () => void;
}) {
  const { t } = useT();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  const canSubmit = password.length >= 6 && !submitting;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      setError(true);
      setMessage(t("auth.passwordTooShort"));
      return;
    }
    setSubmitting(true);
    setMessage("");
    const ok = await onUpdatePassword(password);
    setSubmitting(false);
    setPassword("");
    if (ok) {
      setError(false);
      setMessage(t("auth.passwordUpdated"));
      onDone();
    } else {
      setError(true);
      setMessage(t("auth.updatePasswordFailed"));
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="recovery-title">
        <div className="auth-brand">
          <div className="auth-logo" aria-hidden="true">
            <span />
          </div>
          <h1 id="recovery-title">{t("auth.newPasswordTitle")}</h1>
          <p>{t("auth.newPasswordSubtitle")}</p>
        </div>

        <form className="auth-gate-form" onSubmit={submit}>
          <label>
            {t("auth.newPassword")}
            <div className="auth-input-wrap">
              <span aria-hidden="true">L</span>
              <input
                type={showPassword ? "text" : "password"}
                placeholder={t("auth.passwordPlaceholder")}
                value={password}
                autoComplete="new-password"
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

          <button type="submit" className="auth-submit" disabled={!canSubmit}>
            {submitting ? t("auth.processing") : t("auth.updatePassword")}
          </button>
        </form>

        {message ? (
          <p className={error ? "auth-message error" : "auth-message"}>{message}</p>
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
  onOpenLogin,
  onSignOut,
  onUploadLocal,
  onRefresh,
}: {
  auth: ReturnType<typeof usePlannerData>["auth"];
  onOpenLogin: () => void;
  onSignOut: () => Promise<void>;
  onUploadLocal: () => Promise<boolean>;
  onRefresh: () => Promise<void>;
}) {
  const { t } = useT();
  const [message, setMessage] = useState("");

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
        <div className="account-stack">
          <p className="empty-state">{t("auth.signInSubtitle")}</p>
          <div className="settings-actions">
            <button onClick={onOpenLogin} disabled={!auth.isConfigured || auth.isLoading}>
              {t("auth.logIn")} / {t("auth.signUp")}
            </button>
          </div>
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
      <p className="settings-message">{t(auth.syncStatus)}</p>
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
}: {
  query: string;
  inputRef: RefObject<HTMLInputElement>;
  results: { tasks: Task[]; projects: Project[] };
  onChange: (value: string) => void;
  onSelectTask: (taskId: string) => void;
  onSelectProject: (projectId: string) => void;
}) {
  const { t } = useT();
  const hasResults =
    results.tasks.length > 0 ||
    results.projects.length > 0;

  return (
    <div className="global-search">
      <input
        ref={inputRef}
        aria-label={t("app.searchAria")}
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
        </div>
      ) : null}
    </div>
  );
}

