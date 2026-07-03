import { useEffect, useMemo, useRef, useState } from "react";
import type { FocusSession, PageId, Project, Task } from "../types";
import { formatDate, isOverdue, todayValue } from "../utils/date";
import type { FocusUserSettings } from "../lib/focusSettingsStorage";
import { openMiniFocusTimer, supportsMiniFocusTimer } from "../lib/miniFocusTimer";
import {
  formatFocusDuration,
  getDisplayedFocusSeconds,
  getFocusRemainingSeconds,
  getFocusTargetSeconds,
  useNowTick,
} from "../lib/focusTimer";

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

function minutesBetween(start: string, end: string) {
  if (!start || !end) return 30;
  const startDate = new Date(`2000-01-01T${start}`);
  const endDate = new Date(`2000-01-01T${end}`);
  const minutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
  return minutes > 0 ? minutes : 30;
}

function plannedMinutes(task: Task) {
  if (task.startTime && task.endTime) return minutesBetween(task.startTime, task.endTime);
  if (task.priority === "high") return 50;
  if (task.priority === "medium") return 30;
  return 25;
}

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
  onUpdateFocusNote,
  onCompleteTask,
  onOpenTask,
  onNavigate,
}: FocusPageProps) {
  const today = todayValue();
  const now = useNowTick(Boolean(activeSession && activeSession.status === "running"));
  const elapsed = getDisplayedFocusSeconds(activeSession, now);
  const remaining = getFocusRemainingSeconds(activeSession, now);
  const activeTask = activeSession ? tasks.find((task) => task.id === activeSession.taskId) ?? null : null;
  const [finishTaskId, setFinishTaskId] = useState("");
  const [durationDrafts, setDurationDrafts] = useState<Record<string, number>>({});
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
      { id: "scheduled", title: "오늘 예정", tone: "blue" as const, tasks: scheduled },
      { id: "deadline", title: "마감 임박", tone: "red" as const, tasks: deadline },
      { id: "study", title: "학습 복습", tone: "purple" as const, tasks: study },
      { id: "quick", title: "바로 시작", tone: "green" as const, tasks: quickStart },
    ].filter((group) => group.tasks.length > 0);
  }, [openTasks, projects, today]);

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

  const targetSeconds = activeSession ? getFocusTargetSeconds(activeSession) : 0;
  const progress = targetSeconds ? Math.min(100, Math.round((elapsed / targetSeconds) * 100)) : 0;
  const canOpenMiniTimer = Boolean(activeSession && activeTask && settings.showMiniTimerButton && supportsMiniFocusTimer());

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

  useEffect(() => {
    if (!activeSession || !activeTask || activeSession.status !== "running") return;
    if (elapsed < getFocusTargetSeconds(activeSession)) return;
    setFinishTaskId(activeSession.taskId);
    onStopFocus(activeSession.id, false);
  }, [activeSession, activeTask, elapsed, onStopFocus]);

  function durationForTask(task: Task) {
    return durationDrafts[task.id] ?? plannedMinutes(task);
  }

  function updateDuration(taskId: string, value: number) {
    const minutes = Math.max(1, Math.min(240, Math.round(value || 1)));
    setDurationDrafts((current) => ({ ...current, [taskId]: minutes }));
  }

  function toggleTaskFocus(task: Task) {
    if (!activeSession) {
      onStartFocus(task.id, "focus_page", durationForTask(task));
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
    openMiniFocusTimer({
      sessionId: activeSession.id,
      title: activeTask.title,
      remaining: formatFocusDuration(remaining),
      status: activeSession.status,
    });
  }

  return (
    <div className="foc-page">
      <header className="foc-header">
        <div>
          <h1>Focus</h1>
          <p>실제 집중 시간을 기록하고 확인하는 공간</p>
        </div>
        <div className="foc-header-chips">
          <span>{formatDate(today, "ko")}</span>
          <strong>오늘 {formatFocusDuration(todaySeconds, true)}</strong>
          <div className="foc-options-wrap" ref={optionsRef}>
            <button
              type="button"
              className="foc-options-button"
              aria-expanded={optionsOpen}
              aria-label="Open focus options"
              onClick={() => setOptionsOpen((open) => !open)}
            >
              <span aria-hidden="true">⚙</span>
              <b>Focus 옵션</b>
            </button>
            {optionsOpen ? (
              <div className="foc-options-popover" role="dialog" aria-label="Focus options">
                <h2>Focus 옵션</h2>
                <FocusOptionToggle
                  label="탭 제목 타이머"
                  checked={settings.showTabTitleTimer}
                  onChange={(checked) => onUpdateSettings({ showTabTitleTimer: checked })}
                />
                <FocusOptionToggle
                  label="완료 알림"
                  checked={settings.enableCompletionNotification}
                  onChange={(checked) => onUpdateSettings({ enableCompletionNotification: checked })}
                />
                <FocusOptionToggle
                  label="미니 타이머 버튼"
                  checked={settings.showMiniTimerButton}
                  onChange={(checked) => onUpdateSettings({ showMiniTimerButton: checked })}
                />
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="foc-layout">
        <section className="foc-card foc-queue">
          <header className="foc-card-head">
            <h2>오늘 시작할 일</h2>
            <button type="button" onClick={() => onNavigate("calendar")} title="Calendar">
              ...
            </button>
          </header>
          {groups.length === 0 ? (
            <div className="foc-empty">
              <strong>시작할 일이 없습니다.</strong>
              <p>오늘 할 일을 추가하거나 Calendar에 배치해보세요.</p>
              <button type="button" onClick={() => onNavigate("today")}>Today로 이동</button>
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
                            {project?.name ?? "Inbox"}
                            {task.scheduledDate === today && task.startTime ? ` · 오늘 ${task.startTime}` : ""}
                          </span>
                          <small>
                            예정 {durationForTask(task)}m · 실제 {formatFocusDuration(task.actualSeconds, true)}
                          </small>
                        </button>
                        <label className="foc-duration" title="Focus minutes">
                          <input
                            type="number"
                            min="1"
                            max="240"
                            step="5"
                            value={durationForTask(task)}
                            disabled={Boolean(activeSession)}
                            onChange={(event) => updateDuration(task.id, Number(event.target.value))}
                            onClick={(event) => event.stopPropagation()}
                          />
                          <span>min</span>
                        </label>
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
                {activeSession.status === "paused" ? "일시정지됨" : "현재 집중 중"}
              </div>
              <div className="foc-task-pills">
                {projectFor(activeTask, projects) ? <span>{projectFor(activeTask, projects)?.name}</span> : null}
                {isStudyTask(activeTask, projectFor(activeTask, projects)) ? <span>Study</span> : null}
              </div>
              <h2>{activeTask.title}</h2>
              <div className="foc-clock">{formatFocusDuration(remaining)}</div>
              <p className="foc-progress-copy">
                예정 {activeSession.durationMinutes}m 중 <strong>{formatFocusDuration(elapsed, true)}</strong> 진행
              </p>
              <div className="foc-progress"><span style={{ width: `${progress}%` }} /></div>
              <textarea
                className="foc-note"
                value={activeSession.focusNote}
                onChange={(event) => onUpdateFocusNote(activeSession.id, event.target.value)}
                placeholder="집중 메모"
              />
              <div className="foc-controls">
                {activeSession.status === "paused" ? (
                  <button type="button" onClick={() => onResumeFocus(activeSession.id)}>재개</button>
                ) : (
                  <button type="button" onClick={() => onPauseFocus(activeSession.id)}>일시정지</button>
                )}
                <button type="button" className="danger" onClick={() => stopAndAsk(activeSession)}>끝내기</button>
                {canOpenMiniTimer ? (
                  <button type="button" className="foc-mini-open" onClick={openMiniTimer}>
                    미니 타이머 열기 ↗
                  </button>
                ) : null}
              </div>
              <footer className="foc-meta">
                <span>남은 시간 <strong>{formatFocusDuration(remaining, true)}</strong></span>
                <span>예정 시간 <strong>{activeSession.durationMinutes}m</strong></span>
                <span>실제 누적 <strong>{formatFocusDuration(activeTask.actualSeconds + elapsed, true)}</strong></span>
              </footer>
            </>
          ) : (
            <div className="foc-no-session">
              <span>◎</span>
              <h2>현재 진행 중인 작업이 없습니다.</h2>
              <p>왼쪽에서 할 일을 골라 집중 시간을 기록하세요.</p>
            </div>
          )}
        </section>

        <aside className="foc-insights">
          <section className="foc-card">
            <h2>오늘 집중 요약</h2>
            <div className="foc-stat-grid">
              <span><small>총 집중</small><strong>{formatFocusDuration(todaySeconds, true)}</strong></span>
              <span><small>세션</small><strong>{todaySessions.length}개</strong></span>
              <span><small>평균</small><strong>{formatFocusDuration(avgSeconds, true)}</strong></span>
              <span><small>가장 긴 세션</small><strong>{formatFocusDuration(longestSeconds, true)}</strong></span>
            </div>
          </section>
          <section className="foc-card">
            <h2>프로젝트별 집중 시간</h2>
            <div className="foc-project-bars">
              {byProject.length === 0 ? <p>아직 오늘의 프로젝트 기록이 없습니다.</p> : null}
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
            <h2>최근 세션</h2>
            <div className="foc-recent">
              {focusSessions.filter((session) => session.status === "completed").slice(0, 4).map((session) => (
                <button key={session.id} type="button" onClick={() => onOpenTask(session.taskId)}>
                  <span>✓</span>
                  <strong>{session.title || tasks.find((task) => task.id === session.taskId)?.title || "Focus session"}</strong>
                  <small>{formatFocusDuration(session.accumulatedSeconds, true)}</small>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </main>

      {finishTaskId ? (
        <div className="foc-modal-backdrop" role="presentation">
          <div className="foc-modal" role="dialog" aria-modal="true">
            <h2>집중 기록을 저장했습니다.</h2>
            <p>{tasks.find((task) => task.id === finishTaskId)?.title ?? "이 작업"}을 완료 처리할까요?</p>
            <div>
              <button type="button" onClick={() => {
                onCompleteTask(finishTaskId);
                setFinishTaskId("");
              }}>완료 처리</button>
              <button type="button" onClick={() => setFinishTaskId("")}>아직 진행 중</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
