import { FormEvent, RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { OllamaChat } from "./components/OllamaChat";
import { TaskDetail } from "./components/TaskDetail";
import { usePlannerData } from "./hooks/usePlannerData";
import { AppModals } from "./app/AppModals";
import { AppPages } from "./app/AppPages";
import { executeAgentActions } from "./app/executeAgentActions";
import { useDataPortability } from "./app/useDataPortability";
import type { ToastState } from "./components/kit";
import type {
  ConceptNote,
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
  const [activePage, setActivePage] = useState<PageId>(
    appSettings.defaultView === "/inbox" ? "inbox" : "today",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [isProjectDetailOpen, setIsProjectDetailOpen] = useState(false);
  const [planningTab, setPlanningTab] = useState<"board" | "matrix">("board");
  const [studyTab, setStudyTab] = useState<"topics" | "notes" | "reviews">("topics");
  const [studyFocusNoteId, setStudyFocusNoteId] = useState("");
  const [pendingDeleteTaskId, setPendingDeleteTaskId] = useState("");
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const today = todayValue();
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
        setActivePage("inbox");
      } else if (event.key.toLowerCase() === "n") {
        setActivePage("inbox");
        window.setTimeout(() => {
          document.querySelector<HTMLInputElement>('[aria-label="Task title"]')?.focus();
        }, 0);
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

  function showToast(nextToast: { message: string; actionLabel?: string; onAction?: () => void }) {
    setToast(nextToast);
    window.setTimeout(() => {
      setToast((current) => (current === nextToast ? null : current));
    }, 4500);
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

  function requestDeleteProject(projectId: string) {
    if (appSettings.confirmBeforeDelete) {
      setPendingDeleteProjectId(projectId);
    } else {
      planner.deleteProject(projectId);
      setIsProjectDetailOpen(false);
      setSelectedProjectId("");
      planner.selectTask("");
      showToast({ message: t("app.toastProjectDeleted") });
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

  function openTaskInOfficialPage(taskId: string) {
    const task = planner.tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    planner.selectTask(taskId);
    setSearchQuery("");

    if (task.status === "inbox") {
      setActivePage("inbox");
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
    setStudyTab(note?.nextReviewDate ? "reviews" : "notes");
    setStudyFocusNoteId(noteId);
    setActivePage("study");
  }

  function openProjectFromCalendar(projectId: string) {
    setSelectedProjectId(projectId);
    setIsProjectDetailOpen(true);
    setActivePage("projects");
  }

  function viewTaskInCalendar(taskId: string) {
    planner.selectTask(taskId);
    setActivePage("calendar");
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
    if (!planner.selectedTask) {
      return null;
    }

    return (
      <TaskDetail
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
      />
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
        planningTab={planningTab}
        setPlanningTab={setPlanningTab}
        studyTab={studyTab}
        setStudyTab={setStudyTab}
        studyFocusNoteId={studyFocusNoteId}
        setStudyFocusNoteId={setStudyFocusNoteId}
        renderTaskDetail={renderTaskDetail}
        showToast={showToast}
        handleArchiveTask={handleArchiveTask}
        handleDuplicateTask={handleDuplicateTask}
        handleArchiveProject={handleArchiveProject}
        requestDeleteTask={requestDeleteTask}
        requestDeleteProject={requestDeleteProject}
        openProjectFromCalendar={openProjectFromCalendar}
        openStudyReviewFromCalendar={openStudyReviewFromCalendar}
        viewTaskInCalendar={viewTaskInCalendar}
        exportJson={exportJson}
        handleImport={handleImport}
        importMessage={importMessage}
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
    <div className={mobileMenuOpen ? "app-shell mobile-menu-open" : "app-shell"}>
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
          setActivePage(page);
          setMobileMenuOpen(false);
        }}
        tasks={planner.tasks}
        projects={activeProjects}
        selectedProjectId={selectedProjectId}
        userEmail={planner.auth.userEmail}
        dueReviewCount={dueReviewCount}
        showCounts={appSettings.showSidebarCounts}
        onSelectProject={(projectId) => {
          setSelectedProjectId(projectId);
          setIsProjectDetailOpen(true);
          setActivePage("projects");
          setMobileMenuOpen(false);
        }}
        onAddProject={(name) => planner.addProject(name, "#0066cc")}
        onOpenSettings={() => {
          setActivePage("settings");
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
              setActivePage("projects");
              setSearchQuery("");
            }}
            onSelectTopic={() => openStudyResult()}
            onSelectNote={openStudyResult}
          />
        }
      />
      <main>{renderPage()}</main>
      <OllamaChat
        activePage={activePage}
        aiContext={{
          currentPage: activePage,
          userId: planner.auth.userEmail || "local-user",
          tasks: planner.tasks,
          projects: planner.projects,
          conceptNotes: planner.conceptNotes,
          habits: planner.habits,
          habitLogs: planner.habitLogs,
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
        toast={toast}
        onCancelDeleteTask={() => setPendingDeleteTaskId("")}
        onConfirmDeleteTask={confirmDeleteTask}
        onCancelDeleteProject={() => setPendingDeleteProjectId("")}
        onConfirmDeleteProject={confirmDeleteProject}
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

