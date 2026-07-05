import { useEffect, useMemo, useRef, useState } from "react";
import type { FocusSession, PageId, Project, Task } from "../types";
import { formatDate, isOverdue, todayValue } from "../utils/date";
import type { FocusUserSettings } from "../lib/focusSettingsStorage";
import { formatFocusDuration, getDisplayedFocusSeconds, useNowTick } from "../lib/focusTimer";
import { platform } from "../platform";
import { useT } from "../i18n";

interface FocusPageProps {
  tasks: Task[];
  projects: Project[];
  focusSessions: FocusSession[];
  activeSession: FocusSession | null;
  settings: FocusUserSettings;
  onUpdateSettings: (patch: Partial<FocusUserSettings>) => void;
  onStartFocus: (taskId: string, source?: FocusSession["source"], durationMinutes?: number) => void;
  onPauseFocus: (sessionId: string) => void;
  onResumeFocus: (sessionId: string) => void;
  onStopFocus: (sessionId: string, completeTask?: boolean) => void;
  onDeleteFocusSession: (sessionId: string) => void;
  onUpdateFocusNote: (sessionId: string, note: string) => void;
  onCompleteTask: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  onNavigate: (page: PageId) => void;
}

type FocusGroup = {
  id: string;
  title: string;
  tone: "blue" | "red" | "purple" | "green";
  tasks: Task[];
};

function projectFor(task: Task, projects: Project[]) {
  return projects.find((project) => project.id === task.projectId);
}

function isStudyTask(task: Task, project?: Project) {
  const haystack = `${task.title} ${task.tags.join(" ")} ${project?.name ?? ""}`.toLowerCase();
  return ["study", "review", "복습", "leetcode", "algorithm"].some((token) => haystack.includes(token));
}

function todaySessionFilter(session: FocusSession, today: string) {
  const date = (session.endedAt || session.startedAt || session.createdAt).slice(0, 10);
  return date === today && session.status === "completed";
}

function FocusOptionToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="foc-option-row"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <i>{checked ? "ON" : "OFF"}</i>
    </button>
  );
}

export function FocusPage({
  tasks,
  projects,
  focusSessions,
  activeSession,
  settings,
  onUpdateSettings,
  onStartFocus,
  onPauseFocus,
  onResumeFocus,
  onStopFocus,
  onDeleteFocusSession,
  onUpdateFocusNote,
  onCompleteTask,
  onOpenTask,
  onNavigate,
}: FocusPageProps) {
  const { t } = useT();
  const today = todayValue();
  const now = useNowTick(Boolean(activeSession && activeSession.status === "running"));
  const elapsed = getDisplayedFocusSeconds(activeSession, now);
  const activeTask = activeSession ? tasks.find((task) => task.id === activeSession.taskId) ?? null : null;
  const [finishTaskId, setFinishTaskId] = useState("");
  const [deleteSessionId, setDeleteSessionId] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);

  const openTasks = useMemo(
    () => tasks.filter((task) => task.status !== "done" && task.status !== "archived" && !task.deletedAt),
    [tasks],
  );
  const groups = useMemo<FocusGroup[]>(() => {
    const scheduled = openTasks.filter((task) => task.scheduledDate === today);
    const deadline = openTasks.filter((task) => task.dueDate && (task.dueDate === today || isOverdue(task.dueDate)));
    const study = openTasks.filter((task) => isStudyTask(task, projectFor(task, projects)));
    const quickStart = openTasks
      .filter((task) => !scheduled.includes(task) && !deadline.includes(task) && !study.includes(task))
      .slice(0, 8);

    return [
      { id: "scheduled", title: t("focus.groupScheduled"), tone: "blue" as const, tasks: scheduled },
      { id: "deadline", title: t("focus.groupDeadline"), tone: "red" as const, tasks: deadline },
      { id: "study", title: t("focus.groupStudy"), tone: "purple" as const, tasks: study },
      { id: "quick", title: t("focus.groupQuick"), tone: "green" as const, tasks: quickStart },
    ].filter((group) => group.tasks.length > 0);
  }, [openTasks, projects, t, today]);

  const todaySessions = focusSessions.filter((session) => todaySessionFilter(session, today));
  const todaySeconds = todaySessions.reduce((sum, session) => sum + session.accumulatedSeconds, 0);
  const avgSeconds = todaySessions.length ? Math.round(todaySeconds / todaySessions.length) : 0;
  const longestSeconds = todaySessions.reduce((max, session) => Math.max(max, session.accumulatedSeconds), 0);
  const byProject = projects
    .map((project) => ({
      project,
      seconds: todaySessions
        .filter((session) => session.projectId === project.id)
        .reduce((sum, session) => sum + session.accumulatedSeconds, 0),
    }))
    .filter((entry) => entry.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 4);

  const canOpenMiniTimer = Boolean(activeSession && activeTask && settings.showMiniTimerButton && platform.miniFocusTimer.supported());

  useEffect(() => {
    if (!optionsOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (optionsRef.current?.contains(event.target as Node)) return;
      setOptionsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOptionsOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [optionsOpen]);

  function toggleTaskFocus(task: Task) {
    if (!activeSession) {
      onStartFocus(task.id, "focus_page");
      return;
    }

    if (activeSession.taskId !== task.id) return;
    if (activeSession.status === "paused") {
      onResumeFocus(activeSession.id);
      return;
    }
    onPauseFocus(activeSession.id);
  }

  function stopAndAsk(session: FocusSession) {
    setFinishTaskId(session.taskId);
    onStopFocus(session.id, false);
  }

  function openMiniTimer() {
    if (!activeSession || !activeTask) return;
    void platform.miniFocusTimer.open({
      sessionId: activeSession.id,
      title: activeTask.title,
      time: formatFocusDuration(elapsed),
      status: activeSession.status,
    });
  }

  const deleteSession = focusSessions.find((session) => session.id === deleteSessionId) ?? null;

  // Confirm the delete dialog with Enter, dismiss with Escape.
  useEffect(() => {
    if (!deleteSession) return;
    const sessionId = deleteSession.id;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onDeleteFocusSession(sessionId);
        setDeleteSessionId("");
      } else if (event.key === "Escape") {
        setDeleteSessionId("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSession, onDeleteFocusSession]);

  return (
    <div className="foc-page">
      <header className="foc-header">
        <div>
          <h1>Focus</h1>
          <p>{t("focus.subtitle")}</p>
        </div>
        <div className="foc-header-chips">
          <span>{formatDate(today, "ko")}</span>
          <strong>{t("focus.todayTotal", { time: formatFocusDuration(todaySeconds, true) })}</strong>
          <div className="foc-options-wrap" ref={optionsRef}>
            <button
              type="button"
              className="foc-options-button"
              aria-expanded={optionsOpen}
              aria-label="Open focus options"
              onClick={() => setOptionsOpen((open) => !open)}
            >
              <span aria-hidden="true">⚙</span>
            </button>
            {optionsOpen ? (
              <div className="foc-options-popover" role="dialog" aria-label="Focus options">
                <h2>{t("focus.optionsTitle")}</h2>
                <FocusOptionToggle
                  label={t("focus.optionTabTitleTimer")}
                  checked={settings.showTabTitleTimer}
                  onChange={(checked) => onUpdateSettings({ showTabTitleTimer: checked })}
                />
                <FocusOptionToggle
                  label={t("focus.optionCompletionNotification")}
                  checked={settings.enableCompletionNotification}
                  onChange={(checked) => onUpdateSettings({ enableCompletionNotification: checked })}
                />
                <FocusOptionToggle
                  label={t("focus.optionMiniTimerButton")}
                  checked={settings.showMiniTimerButton}
                  onChange={(checked) => onUpdateSettings({ showMiniTimerButton: checked })}
                />
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="foc-layout">
        <section className="foc-card foc-queue">
          <header className="foc-card-head">
            <h2>{t("focus.queueTitle")}</h2>
          </header>
          {groups.length === 0 ? (
            <div className="foc-empty">
              <strong>{t("focus.emptyTitle")}</strong>
              <p>{t("focus.emptyBody")}</p>
              <button type="button" onClick={() => onNavigate("today")}>{t("focus.goToday")}</button>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.id} className={`foc-group foc-${group.tone}`}>
                <div className="foc-group-title">
                  <span>{group.title}</span>
                  <small>{group.tasks.length}</small>
                </div>
                <div className="foc-task-list">
                  {group.tasks.map((task) => {
                    const project = projectFor(task, projects);
                    const isActive = activeSession?.taskId === task.id;
                    return (
                      <article key={`${group.id}-${task.id}`} className={isActive ? "foc-task is-active" : "foc-task"}>
                        <button
                          type="button"
                          className="foc-play"
                          aria-label={
                            isActive
                              ? activeSession?.status === "paused"
                                ? `Resume focus session for ${task.title}`
                                : `Pause focus session for ${task.title}`
                              : `Start focus session for ${task.title}`
                          }
                          disabled={Boolean(activeSession && activeSession.taskId !== task.id)}
                          onClick={() => toggleTaskFocus(task)}
                        >
                          {isActive && activeSession?.status === "running" ? "||" : "▶"}
                        </button>
                        <button type="button" className="foc-task-main" onClick={() => onOpenTask(task.id)}>
                          <strong>{task.title}</strong>
                          <span>
                            {project?.name ?? t("status.inbox")}
                            {task.scheduledDate === today && task.startTime ? ` · ${t("common.today")} ${task.startTime}` : ""}
                          </span>
                          <small>{t("focus.actualTime", { time: formatFocusDuration(task.actualSeconds, true) })}</small>
                        </button>
                        <span className="foc-tag">{project?.name ?? (isStudyTask(task, project) ? "Study" : "Task")}</span>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </section>

        <section className="foc-card foc-timer">
          {activeSession && activeTask ? (
            <>
              <div className="foc-status">
                <span className={activeSession.status === "paused" ? "is-paused" : ""} />
                {activeSession.status === "paused" ? t("focus.paused") : t("focus.running")}
              </div>
              <div className="foc-task-pills">
                {projectFor(activeTask, projects) ? <span>{projectFor(activeTask, projects)?.name}</span> : null}
                {isStudyTask(activeTask, projectFor(activeTask, projects)) ? <span>Study</span> : null}
              </div>
              <h2>{activeTask.title}</h2>
              <div className="foc-clock">{formatFocusDuration(elapsed)}</div>
              <textarea
                className="foc-note"
                value={activeSession.focusNote}
                onChange={(event) => onUpdateFocusNote(activeSession.id, event.target.value)}
                placeholder={t("focus.notePlaceholder")}
              />
              <div className="foc-controls">
                {activeSession.status === "paused" ? (
                  <button type="button" onClick={() => onResumeFocus(activeSession.id)}>{t("focus.resume")}</button>
                ) : (
                  <button type="button" onClick={() => onPauseFocus(activeSession.id)}>{t("focus.pause")}</button>
                )}
                <button type="button" className="danger" onClick={() => stopAndAsk(activeSession)}>{t("focus.stop")}</button>
                {canOpenMiniTimer ? (
                  <button type="button" className="foc-mini-open" onClick={openMiniTimer}>
                    {t("focus.openMiniTimer")}
                  </button>
                ) : null}
              </div>
              <footer className="foc-meta">
                <span>{t("focus.thisSession")} <strong>{formatFocusDuration(elapsed, true)}</strong></span>
                <span>{t("focus.actualAccumulated")} <strong>{formatFocusDuration(activeTask.actualSeconds + elapsed, true)}</strong></span>
              </footer>
            </>
          ) : (
            <div className="foc-no-session">
              <span>◎</span>
              <h2>{t("focus.noActiveTitle")}</h2>
              <p>{t("focus.noActiveBody")}</p>
            </div>
          )}
        </section>

        <section className="foc-card foc-summary">
          <h2>{t("focus.summaryTitle")}</h2>
          <div className="foc-stat-grid">
            <span><small>{t("focus.statTotal")}</small><strong>{formatFocusDuration(todaySeconds, true)}</strong></span>
            <span><small>{t("focus.statSessions")}</small><strong>{t("focus.sessionCount", { count: todaySessions.length })}</strong></span>
            <span><small>{t("focus.statAverage")}</small><strong>{formatFocusDuration(avgSeconds, true)}</strong></span>
            <span><small>{t("focus.statLongest")}</small><strong>{formatFocusDuration(longestSeconds, true)}</strong></span>
          </div>
        </section>
        <aside className="foc-insights">
          <section className="foc-card">
            <h2>{t("focus.byProjectTitle")}</h2>
            <div className="foc-project-bars">
              {byProject.length === 0 ? <p>{t("focus.noProjectRecords")}</p> : null}
              {byProject.map(({ project, seconds }) => (
                <div key={project.id}>
                  <span>{project.name}</span>
                  <i><b style={{ width: `${Math.max(8, (seconds / Math.max(todaySeconds, 1)) * 100)}%`, background: project.color }} /></i>
                  <strong>{formatFocusDuration(seconds, true)}</strong>
                </div>
              ))}
            </div>
          </section>
          <section className="foc-card">
            <h2>{t("focus.recentSessions")}</h2>
            <div className="foc-recent">
              {focusSessions.filter((session) => session.status === "completed").slice(0, 8).map((session) => (
                <article key={session.id} className="foc-recent-session">
                <button type="button" className="foc-recent-main" onClick={() => onOpenTask(session.taskId)}>
                  <span>✓</span>
                    <strong>{session.title || tasks.find((task) => task.id === session.taskId)?.title || t("focus.sessionFallback")}</strong>
                  <small>{formatFocusDuration(session.accumulatedSeconds, true)}</small>
                </button>
                  <button
                    type="button"
                    className="foc-recent-delete"
                    aria-label={t("focus.deleteSession")}
                    title={t("focus.deleteSession")}
                    onClick={() => setDeleteSessionId(session.id)}
                  >
                    {t("common.delete")}
                  </button>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {finishTaskId ? (
        <div className="foc-modal-backdrop" role="presentation">
          <div className="foc-modal" role="dialog" aria-modal="true">
            <h2>{t("focus.savedTitle")}</h2>
            <p>{t("focus.completePrompt", { title: tasks.find((task) => task.id === finishTaskId)?.title ?? t("focus.thisTask") })}</p>
            <div>
              <button type="button" onClick={() => {
                onCompleteTask(finishTaskId);
                setFinishTaskId("");
              }}>{t("focus.markComplete")}</button>
              <button type="button" onClick={() => setFinishTaskId("")}>{t("focus.stillInProgress")}</button>
            </div>
          </div>
        </div>
      ) : null}
      {deleteSession ? (
        <div className="foc-modal-backdrop" role="presentation">
          <div className="foc-modal" role="dialog" aria-modal="true">
            <h2>{t("focus.deleteTitle")}</h2>
            <p>
              {deleteSession.title || tasks.find((task) => task.id === deleteSession.taskId)?.title || t("focus.sessionFallback")} ·{" "}
              {formatFocusDuration(deleteSession.accumulatedSeconds, true)}
            </p>
            <div>
              <button type="button" className="danger" onClick={() => {
                onDeleteFocusSession(deleteSession.id);
                setDeleteSessionId("");
              }}>{t("common.delete")}</button>
              <button type="button" onClick={() => setDeleteSessionId("")}>{t("common.cancel")}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
