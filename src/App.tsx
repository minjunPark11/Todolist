import { FormEvent, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { OllamaChat } from "./components/OllamaChat";
import { TaskDetail } from "./components/TaskDetail";
import { GlobalFocusBar } from "./components/GlobalFocusBar";
import { UpdateChecker } from "./components/UpdateChecker";
import { usePlannerData } from "./hooks/usePlannerData";
import { AppModals } from "./app/AppModals";
import { AppPages } from "./app/AppPages";
import type { TodayIntent } from "./components/TodayPage";
import { TasksModule } from "./components/tasks/TasksModule";
import { canonicalizeTaskUrl, listUrlFor, parseSearchUrl, parseTaskScope } from "./app/taskScopeUrl";
import { PAGE_ROUTES, RETIRED_ROUTES, bootRedirectFor, pageForPath, pathForDefaultView, pathForPage } from "./app/pageRoute";
import {
  RAIL_DESTINATIONS,
  TASKS_HOME,
  isTasksLocation,
  railItemFor,
  type RailNavItem,
} from "./app/railNav";
import { AppShell } from "./components/shell/AppShell";
import { GlobalRail } from "./components/shell/GlobalRail";
import { taskUrlFor } from "./app/taskScopeUrl";
import { useContextSidebar } from "./hooks/useContextSidebar";
import { useRecents } from "./hooks/useRecents";
import { CommandMenu } from "./components/shell/CommandMenu";
import { recentEntriesFrom } from "./app/recentEntries";
import type { SearchCollections, SearchResult } from "./domain/tasks/search";
import type { CommandContext, TaskCommand } from "./domain/tasks/commands";
import { parseTaskUrl, searchUrlFor, urlForSearchResult } from "./app/taskScopeUrl";
import { TasksSidebarSlot } from "./components/shell/TasksSidebarSlot";
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
import { useReminders } from "./hooks/useReminders";
import { formatLocalTime } from "./domain/schedule";
import { todayValue } from "./utils/date";
import { I18nProvider, translate, useT } from "./i18n";
import { isWontDo } from "./domain/tasks/taskState";
import { isTaskActive } from "./domain/tasks/scopeQuery";

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
  // Open the user's chosen default start page on boot (Nav Shell audit D-04).
  // The setting is applied by rewriting the address once, rather than by
  // seeding a page variable the URL would then contradict — `activePage` is
  // read from the path now. Computed here, at the first render the old
  // `activePage` initializer used to run in, and applied by the effect below.
  // /inbox opens Today with the triage drawer, which `todayIntent` handles.
  const [bootRedirect] = useState(() =>
    bootRedirectFor(window.location.pathname, appSettings.defaultView),
  );
  // Inbox is folded into Today's triage drawer (no standalone page). This
  // covers the legacy /inbox route, a ?triage=inbox deep link, and the
  // "default start page" setting all landing on the same Today intent.
  const [todayIntent, setTodayIntent] = useState<TodayIntent>(() => {
    const hasInboxRedirect =
      window.location.pathname === "/inbox" ||
      new URLSearchParams(window.location.search).get("triage") === "inbox";
    return hasInboxRedirect || appSettings.defaultView === "/inbox" ? "triage" : "";
  });
  const [pendingDeleteTaskId, setPendingDeleteTaskId] = useState("");
  const [pendingResetAllData, setPendingResetAllData] = useState(false);
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
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  // The Tasks Module reads path AND query — `?view=` and `?task=` are part of
  // where you are (§5.62), where every route above it is a path alone.
  const [currentUrl, setCurrentUrl] = useState(
    () => `${window.location.pathname}${window.location.search}`,
  );
  // D-04: which page is open is a reading of the address, not a state beside
  // it. Everything that used to call `setActivePage` navigates instead, which
  // is what lets a reload, Back, and (from P0-2) the Rail all agree.
  const activePage = pageForPath(currentPath);
  // §2.19: the Rail's active item is the same reading, one level coarser —
  // four items over seven pages, because Board, Archive and the Spaces tree
  // are places inside Tasks rather than siblings of it (§1.5).
  const railItem = railItemFor(currentPath);
  // §2.20. Session-scoped on purpose (audit D-15): coming back to Tasks from
  // the Calendar should return you to the list you were reading, but a cold
  // start is an arrival and belongs to the start-page setting, not to
  // wherever the app happened to be when it was last closed.
  const lastTasksLocationRef = useRef("");
  // §3.66: the sidebar's width and collapsed flag are App Shell state. They
  // used to be a boolean the legacy shell kept to itself and the Tasks Module
  // knew nothing about — which is why the two could not agree on a width.
  const contextSidebar = useContextSidebar(currentPath);
  /**
   * The Global Command Menu (D-25). §10.23: it is UI state, and nothing about
   * it is in the URL — which is exactly what separates it from `/search`.
   */
  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * V-4: the AI panel's open state lives here rather than inside the panel,
   * because the Rail button that opens it has to be able to say that it is
   * open (§11.24) — the same thing Search does one row above it.
   */
  const [aiChatOpen, setAiChatOpen] = useState(false);
  // §10.41's other half: the menu captures a title, Quick Add commits it. Held
  // here rather than in the Module because the menu is above the Module now.
  const [capturedTitle, setCapturedTitle] = useState("");
  const recents = useRecents(currentUrl);
  /**
   * The Tasks the user can actually see (audit D-24, axis 2 — P0-4b-5).
   *
   * A List that is archived or deleted takes its Tasks out of every Scope
   * WITHOUT writing anything on them (§6.56/§13.19) — that is what makes
   * restoring the List bring them all back, and why they never show up in the
   * Task Trash. Inside the Tasks Module `isTaskActive` has always enforced it.
   * Everywhere else did not: Focus still offered those Tasks, the Calendar
   * still drew them, and the reminder queue still rang for them.
   *
   * Filtering once here rather than teaching fourteen modules to take a
   * `lists` argument. `planner.tasks` stays the collection for LOOKUPS — a
   * running focus session, a parent Task, an export — because a Task that is
   * hidden is not a Task that stopped existing.
   */
  const visibleTasks = useMemo(
    () => planner.tasks.filter((task) => isTaskActive(task, planner.lists)),
    [planner.tasks, planner.lists],
  );
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


  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT";

      if (event.key === "Escape") {
        planner.selectTask("");
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
        // §2.28 advertises `/` on the Rail's Search tooltip, and P0-5 removed
        // the sidebar box this used to focus — the Rail's search is the only
        // one left, so the shortcut points at it. Since D-29 that means the
        // menu, which is what `/` opening a box over the page always implied.
        event.preventDefault();
        openGlobalSearch();
      } else if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        navigate(PAGE_ROUTES.today);
      } else if (event.key.toLowerCase() === "i") {
        event.preventDefault();
        navigate(PAGE_ROUTES.today);
        setTodayIntent("triage");
      } else if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        navigate(PAGE_ROUTES.today);
        setTodayIntent("quickAdd");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [planner]);

  // Module switching (§2.31). Deliberately NOT in the handler above: that one
  // returns early on any modifier and while the user is typing, and a module
  // switch is exactly the shortcut that should still work from inside a text
  // field. The tooltips on the Rail advertise these, so they have to fire.
  useEffect(() => {
    function handleModuleKeys(event: KeyboardEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.altKey || event.shiftKey) return;
      // §3.26's Ctrl/Cmd + \ was here, collapsing the sidebar. The collapse
      // control is gone (AppShell), so the chord has nothing to toggle.
      const item: RailNavItem | undefined = {
        "1": "tasks",
        "2": "matrix",
        "3": "calendar",
        "4": "focus",
      }[event.key] as RailNavItem | undefined;
      if (!item) return;
      event.preventDefault();
      navigateRail(item);
    }

    window.addEventListener("keydown", handleModuleKeys);
    return () => window.removeEventListener("keydown", handleModuleKeys);
    // No dependency array: `navigateRail` closes over `railItem` and the last
    // Tasks location, and a stale closure here would send Ctrl+1 to the wrong
    // place. One listener swapped per render is cheaper than getting that wrong.
  });

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

  useEffect(() => {
    function handlePopState() {
      setCurrentPath(window.location.pathname);
      setCurrentUrl(`${window.location.pathname}${window.location.search}`);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // D-04: the "default start page" setting, applied once. `replace` so Back
  // does not return to the address the app was launched with and bounce
  // straight forward again.
  useEffect(() => {
    if (bootRedirect) navigate(bootRedirect, "replace");
    // Boot means boot: re-running this on a later render would drag the user
    // back to their start page mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Every Tasks address is now a Scope — the two doorway pages, Projects and
    // Goals, are gone — so there is no longer a Tasks location the Tasks item
    // must be able to leave rather than return to.
    if (isTasksLocation(currentUrl)) {
      lastTasksLocationRef.current = currentUrl;
    }
  }, [currentUrl]);

  // A link to a screen that no longer exists lands where its content went, and
  // the address bar says so rather than quietly showing something else
  // (P0-4b-4). `replace`, because the retired address is not a place to go
  // Back to.
  useEffect(() => {
    const moved = RETIRED_ROUTES[currentPath];
    if (moved) navigate(moved, "replace");
  }, [currentPath]);

  useEffect(() => {
    if (currentPath === "/login" && planner.auth.isSignedIn) {
      // Signing in is an arrival, so it honours the start-page setting the
      // same way a cold boot does — `/app` would pin everyone to Today.
      navigate(pathForDefaultView(appSettings.defaultView), "replace");
    }
  }, [currentPath, planner.auth.isSignedIn, appSettings.defaultView]);

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

  // Reminder delivery (design §8). The wording lives here rather than in the
  // hook because it needs the dictionary, and the hook has no business knowing
  // which language the app is in.
  useReminders({
    tasks: visibleTasks,
    describe: ({ title, at }) => ({
      title,
      body: t("schedule.notificationBody", {
        time: formatLocalTime(at.time, appSettings.language === "ko" ? "ko-KR" : "en-US"),
      }),
    }),
    onFallback: (message) => showToast({ message }),
  });

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
    return buildCalendarShareSnapshot({ tasks: visibleTasks });
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

  function confirmDeleteTask() {
    if (!pendingDeleteTaskId) {
      return;
    }
    deleteTaskWithUndo(pendingDeleteTaskId);
    setPendingDeleteTaskId("");
  }

  function requestResetAllData() {
    setPendingResetAllData(true);
  }

  function confirmResetAllData() {
    planner.resetData();
    setPendingResetAllData(false);
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


  function viewTaskInCalendar(taskId: string) {
    planner.selectTask(taskId);
    navigate(PAGE_ROUTES.calendar);
  }

  /**
   * A Global Rail click (§2.11–§2.15).
   *
   * Tasks is the only item without a fixed address: §2.11 asks it to return
   * the user to where they were, and §2.11's "현재 이미 Tasks인 경우" forbids
   * the obvious shortcut of collapsing the sidebar instead — re-clicking the
   * module you are already in does nothing rather than something surprising.
   */
  function navigateRail(item: RailNavItem) {
    if (item === "tasks") {
      // Re-clicking the module you are already in does nothing.
      if (railItem === "tasks") return;
      navigateUrl(lastTasksLocationRef.current || TASKS_HOME);
      return;
    }
    navigate(RAIL_DESTINATIONS[item]);
  }

  /**
   * The Rail's Search opens the menu, over wherever you are (D-29).
   *
   * D-25 made this a navigation to `/search`, and the cost only showed up in
   * use: pressing the magnifier on the Calendar swapped the shell, moved the
   * Rail's active item to Tasks, brought in a sidebar that had not been there
   * and left the browser's Back button as the only way home. Four changes
   * from a button whose own icon does not even light up (§2.14).
   *
   * The overlay was already doing the right thing for Ctrl/Cmd+K, so this is
   * the same surface with a second way in rather than a new one. `/search`
   * keeps its job: the query in the address, all of the results, and the menu
   * hands off to it from its last row.
   */
  function openGlobalSearch() {
    setMenuOpen(true);
  }

  /**
   * The Command Menu, and everything it needs to be asked from ANY page.
   *
   * The four things below used to be read off the Tasks Module's own state.
   * They are read off the URL here instead, which is what lets Ctrl/Cmd+K
   * work on the Calendar: `menuContext` is simply null-scoped when the
   * address is not a Tasks address, and `commands.ts` hides the commands that
   * needed one (D-25).
   */
  const menuCollections: SearchCollections = {
    // `visibleTasks`, not `planner.tasks` (D-24 axis 2) — though the menu no
    // longer lists Tasks at all, the same collections feed the Search Page's
    // idea of what exists, and the two must not disagree.
    tasks: visibleTasks,
    lists: planner.lists,
    folders: planner.folders,
    sidebarFolders: planner.sidebarFolders,
    tags: planner.tags,
    savedFilters: planner.savedFilters,
  };

  const menuTaskState = parseTaskUrl(currentUrl);
  const menuContext: CommandContext = {
    scope: menuTaskState?.scope ?? null,
    view: menuTaskState?.view ?? null,
  };

  // §10.6. Caught on the window rather than on a button, because the menu is
  // reachable from anywhere and a focused input must not swallow the shortcut.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMenuOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * V-4 moved the entry point into the Rail, and the Rail is above both
   * shells — so the panel it opens has to be too. It used to be rendered
   * inside the legacy branch alone, which meant the FAB simply did not exist
   * on the Tasks Module's ten routes. A Rail button that opened nothing on
   * half the app is the version of this bug that would have shipped.
   */
  function renderAiChat() {
    return (
      <OllamaChat
        open={aiChatOpen}
        onOpenChange={setAiChatOpen}
        activePage={activePage}
        knowledgeSettings={knowledge.settings}
        aiContext={buildAiContextInput({ planner, appSettings, currentPage: activePage })}
        calendarContext={{ tasks: visibleTasks }}
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
    );
  }

  function renderCommandMenu() {
    if (!menuOpen) return null;
    return (
      <CommandMenu
        collections={menuCollections}
        ctx={menuContext}
        recents={recentEntriesFrom(recents, menuCollections, t)}
        onClose={() => setMenuOpen(false)}
        /** §10.17/§10.18: a result opens at its OWN canonical place. */
        onPickResult={(result: SearchResult) => {
          setMenuOpen(false);
          navigateUrl(urlForSearchResult(result, planner.lists));
        }}
        onRunCommand={(command: TaskCommand) => {
          setMenuOpen(false);
          const target = command.target(menuContext);
          // `null` when the command needed a Scope and the page has none —
          // `canRunCommand` should already have refused, so this is the second
          // guard rather than the first (Gate 8).
          if (!target) return;
          if ("search" in target) {
            navigateUrl(searchUrlFor(""));
            return;
          }
          navigateUrl(taskUrlFor({ scope: target.scope, view: target.view ?? "list", taskId: "" }));
        }}
        onOpenUrl={(next) => {
          setMenuOpen(false);
          navigateUrl(next);
        }}
        onSeeAll={(query) => {
          // §10.45. The one place the menu still routes, and it is a choice
          // the user makes on the last row rather than something typing does.
          setMenuOpen(false);
          navigateUrl(searchUrlFor(query));
        }}
        onCapture={(title) => {
          // §10.41: owner = Inbox, and the user lands where the task would go
          // rather than being told after the fact.
          setMenuOpen(false);
          setCapturedTitle(title);
          navigateUrl(taskUrlFor({ scope: { kind: "inbox" }, view: "list", taskId: "" }));
        }}
      />
    );
  }

  /**
   * The Context Sidebar for the legacy shell, chosen by `mode` (D-21).
   *
   * This is the fix P0-4a exists for. The mode used to decide only how wide
   * the sidebar was; the shell branch decided which one it was, so `/archive`
   * said `tasks` and drew the Space tree. Now `tasks` means the Tasks sidebar
   * wherever you are, and the tree belongs to `space`.
   */
  function renderLegacySidebar() {
    if (contextSidebar.mode === "none") return null;
    if (contextSidebar.mode === "tasks") {
      return (
        <TasksSidebarSlot
          tasks={planner.tasks}
          lists={planner.lists}
          folders={planner.folders}
          sidebarFolders={planner.sidebarFolders}
          tags={planner.tags}
          savedFilters={planner.savedFilters}
          dailyPlans={planner.dailyPlans}
          taskTags={planner.taskTags}
          today={today}
          current={null}
          onNavigateUrl={navigateUrl}
          onCreateList={({ name, color, defaultViewKey, sidebarFolderId }) =>
            // Same call the Tasks Module makes below: no domain Folder, because
            // that one belongs to a Project and this List has none. The group
            // the dialog offered is the sidebar's (§R.7).
            planner.createList("", name, undefined, { color, defaultViewKey, sidebarFolderId })
          }
          onCreateSidebarFolder={planner.createSidebarFolder}
          onRestoreList={planner.restoreList}
          onPermanentlyDeleteList={planner.permanentlyDeleteList}
        />
      );
    }
    return null;
  }

  function renderRail() {
    return (
      <GlobalRail
        active={railItem}
        onNavigate={navigateRail}
        onOpenSearch={openGlobalSearch}
        searchOpen={menuOpen}
        onOpenAi={() => setAiChatOpen((open) => !open)}
        aiOpen={aiChatOpen}
      />
    );
  }

  function navigateSection(page: PageId) {
    // Leaving the tree drops the selection with it, and one navigation now
    // does both: `selection` is read from the path, so replacing /s/:spaceId
    // with the page's own address IS clearing it. The separate
    // `clearSelection()` this used to call would have pushed a second history
    // entry for the same click.
    navigate(pathForPage(page));
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
          onAuthenticated={() => navigate(pathForDefaultView(appSettings.defaultView), "replace")}
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
        {/* Both shells hang off the same frame now (R.5.1). The Rail is built
            once, above the branch, so neither shell owns it. */}
        <AppShell rail={renderRail()} sidebar={contextSidebar}>
        <TasksModule
          tasks={planner.tasks}
          lists={planner.lists}
          folders={planner.folders}
          sidebarFolders={planner.sidebarFolders}
          savedFilters={planner.savedFilters}
          listSections={planner.listSections}
          dailyPlans={planner.dailyPlans}
          tags={planner.tags}
          taskTags={planner.taskTags}
          today={today}
          url={canonical ?? currentUrl}
          onNavigate={navigateUrl}
          error={planner.auth.syncError}
          draftTitle={capturedTitle}
          onDraftConsumed={() => setCapturedTitle("")}
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
          // Add List design §1.10. A List made from the Tasks sidebar belongs
          // to no Project: this module is Project-agnostic — it shows Lists,
          // Folders and Tags and never a Project — so there is no owner to
          // inherit and inventing one would file the List somewhere the user
          // never chose. §6.3 makes a standalone List first-class exactly for
          // this, and `createList` writes the `kind` that keeps it alive.
          onCreateList={({ name, color, defaultViewKey, sidebarFolderId }) =>
            // No domain Folder argument: that one belongs to a Project and
            // this List has none. The group the dialog offered is the
            // sidebar's (§R.7).
            planner.createList("", name, undefined, { color, defaultViewKey, sidebarFolderId })
          }
          onCreateSidebarFolder={planner.createSidebarFolder}
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
        {/* Above both shells, drawn last so it sits over whichever answered
            the route (D-25). It is `position: fixed`, so where it lands on
            screen owes nothing to which grid it was rendered inside. */}
        {renderCommandMenu()}
        {renderAiChat()}
        </AppShell>
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
            lists={planner.lists}
            subtasks={planner.subtasks}
            onMoveToList={planner.moveTaskToList}
            onUpdateTask={planner.updateTask}
            onUpdateTaskSchedule={planner.updateTaskSchedule}
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
        visibleTasks={visibleTasks}
        appSettings={appSettings}
        todayIntent={todayIntent}
        onTodayIntentHandled={() => setTodayIntent("")}
        renderTaskDetail={renderTaskDetail}
        showToast={showToast}
        handleArchiveTasks={handleArchiveTasks}
        requestDeleteTask={requestDeleteTask}
        viewTaskInCalendar={viewTaskInCalendar}
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
        <AppShell rail={renderRail()} sidebar={contextSidebar}>
        <div
          className={[
            "app-shell",
            mobileMenuOpen ? "mobile-menu-open" : "",
            // `sidebar-collapsed` used to sit here and narrow the column to a
            // 68px icon rail. The Global Rail is where icon-level navigation
            // lives now, and collapsing is gone entirely (AppShell).
          ]
            .filter(Boolean)
            .join(" ")}
        >
      {/* The local snapshot could not be written (spec §16.38, §16.93). A bar
          and not a toast: the state lasts as long as the failure does, and a
          message that expires would leave the user believing their work is
          safely on disk. */}
      {planner.storageError ? (
        <div className="storage-error-bar" role="alert">
          <span>{t("storage.saveFailed")}</span>
          <button type="button" onClick={planner.retryLocalSave}>
            {t("storage.retry")}
          </button>
        </div>
      ) : null}
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
      {/* D-21: the sidebar follows `mode`. `tasks` gets the Tasks sidebar;
          `none` draws nothing (§2.16). Stage 6 retired the `space` mode. */}
      {renderLegacySidebar()}
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
      {renderAiChat()}
      <AppModals
        pendingDeleteTaskId={pendingDeleteTaskId}
        pendingResetAllData={pendingResetAllData}
        resetReachesAccount={planner.auth.isSignedIn ? planner.auth.userEmail : ""}
        toasts={toasts}
        onCancelDeleteTask={() => setPendingDeleteTaskId("")}
        onConfirmDeleteTask={confirmDeleteTask}
        onCancelResetAllData={() => setPendingResetAllData(false)}
        onConfirmResetAllData={confirmResetAllData}
        onDismissToast={handleDismissToast}
      />
        </div>
        {renderCommandMenu()}
        </AppShell>
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


