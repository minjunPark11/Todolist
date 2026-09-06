import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type {
  FocusFlow,
  FocusSession,
  List,
  Tag,
  Task,
  TaskTag,
} from "../types";
import { tagNamesForTask } from "../domain/tags/tags";
import { isTaskOpen } from "../domain/tasks/taskState";
import {
  breakRemaining,
  DEFAULT_POMODORO,
  focusDisplaySeconds,
  sanitizePomodoro,
  type FocusCommand,
} from "../domain/focus/engine";
import { focusDate, focusRecords } from "../domain/focus/records";
import { formatFocusDuration, useNowTick } from "../lib/focusTimer";
import type { FocusUserSettings } from "../lib/focusSettingsStorage";
import { platform } from "../platform";
import { useT } from "../i18n";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface FocusPageProps {
  tasks: Task[];
  tags: Tag[];
  taskTags: TaskTag[];
  lists: List[];
  focusSessions: FocusSession[];
  activeSession: FocusSession | null;
  flow: FocusFlow | null;
  settings: FocusUserSettings;
  timezone: string;
  command: (command: FocusCommand) => boolean;
  ready: boolean;
  error: string;
  onRetry: () => void;
  onCompleteTask: (id: string) => void;
  onOpenTask: (id: string) => void;
  onUpdateSettings: (patch: Partial<FocusUserSettings>) => void;
}
export function FocusIcon({
  name,
}: {
  name:
    | "play"
    | "pause"
    | "stop"
    | "search"
    | "expand"
    | "mini"
    | "records"
    | "note"
    | "clock"
    | "more"
    | "close"
    | "chevron";
}) {
  const paths: Record<typeof name, ReactNode> = {
    play: <path d="m8 5 11 7-11 7Z" />,
    pause: <path d="M8 5v14M16 5v14" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    expand: <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" />,
    mini: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M13 13h5v4h-5z" />
      </>
    ),
    records: <path d="M4 20h17M7 16V9m5 7V4m5 12v-6" />,
    note: (
      <>
        <path d="m5 16-1 4 4-1L20 7l-3-3Z" />
        <path d="m14 7 3 3" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    chevron: <path d="m6 9 6 6 6-6" />,
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
function FocusDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  return (
    <div
      className="focus-dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="focus-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <header>
          <h2>{title}</h2>
          <button aria-label="Close" onClick={onClose}>
            <FocusIcon name="close" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function FocusPage({
  tasks,
  tags,
  taskTags,
  lists,
  focusSessions,
  activeSession,
  flow,
  settings,
  timezone,
  command,
  ready,
  error,
  onRetry,
  onCompleteTask,
  onOpenTask,
  onUpdateSettings,
}: FocusPageProps) {
  const { lang } = useT();
  const l = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [view, setView] = useState<"timer" | "records">("timer");
  const [immersive, setImmersive] = useState(false);
  const wasImmersive = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (wasImmersive.current && !immersive) root.current?.querySelector<HTMLButtonElement>("[data-immersive-toggle]")?.focus();
    wasImmersive.current = immersive;
  }, [immersive]);
  const [mode, setMode] = useState<"stopwatch" | "pomodoro">("stopwatch");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [resultId, setResultId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [gapEnd, setGapEnd] = useState("");
  const [showGap, setShowGap] = useState(false);
  const [message, setMessage] = useState("");
  const today = focusDate(Date.now(), timezone);
  const [from, setFrom] = useState(today),
    [to, setTo] = useState(today),
    [filter, setFilter] = useState("all"),
    [limit, setLimit] = useState(20);
  const now = useNowTick(
    activeSession?.status === "running" || flow?.phase === "break_running",
  );
  const prefs = settings.pomodoro ?? DEFAULT_POMODORO;
  const selected = tasks.find((t) => t.id === selectedId && isTaskOpen(t));
  const result = focusSessions.find((s) => s.id === resultId),
    detail = focusSessions.find((s) => s.id === detailId),
    note = focusSessions.find((s) => s.id === noteId);
  const previous = useRef(activeSession?.id);
  const previousPhase = useRef(flow?.phase);
  useEffect(() => {
    if (previousPhase.current?.startsWith("break_") && flow?.phase === "next_ready") setResultId(null);
    previousPhase.current = flow?.phase;
  }, [flow?.phase]);
  useEffect(() => { setNoteDraft(focusSessions.find(s => s.id === noteId)?.focusNote ?? ""); }, [noteId]);
  useEffect(() => {
    if (previous.current && !activeSession) {
      const ended = focusSessions.find(
        (s) => s.id === previous.current && s.status === "completed",
      );
      if (ended) setResultId(ended.id);
    }
    previous.current = activeSession?.id;
  }, [activeSession, focusSessions]);
  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selectedId, selected]);
  useEffect(() => {
    document.body.classList.toggle("focus-stage-visible", view === "timer");
    return () => document.body.classList.remove("focus-stage-visible");
  }, [view]);
  useEffect(() => {
    if (!immersive) return;
    const app = document.getElementById("root");
    const wasInert = app?.inert ?? false;
    if (app) app.inert = true;
    return () => {
      if (app) app.inert = wasInert;
    };
  }, [immersive]);
  useFocusTrap(root, {
    enabled: immersive && !picker && !noteId && !showSettings && !showGap,
  });
  const candidates = useMemo(() => {
    const score = (t: Task) =>
      (t.dueDate && t.dueDate <= today ? 4 : 0) +
      (t.startDate && t.startDate <= today && t.dueDate >= today ? 2 : 0) +
      (tagNamesForTask(t, tags, taskTags).some((n) =>
        /study|공부|복습|review/i.test(n),
      )
        ? 1
        : 0);
    return tasks
      .filter(isTaskOpen)
      .sort(
        (a, b) =>
          score(b) - score(a) ||
          (b.lastFocusedAt ?? "").localeCompare(a.lastFocusedAt ?? ""),
      )
      .slice(0, 3);
  }, [tasks, tags, taskTags, today]);
  const choices = useMemo(
    () =>
      tasks
        .filter((t) => !t.deletedAt && (picker !== "start" || isTaskOpen(t)))
        .filter((t) =>
          `${t.title} ${lists.find((x) => x.id === t.listId)?.name ?? ""} ${tagNamesForTask(t, tags, taskTags).join(" ")}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          (b.lastFocusedAt ?? "").localeCompare(a.lastFocusedAt ?? ""),
        ),
    [tasks, picker, query, lists, tags, taskTags],
  );
  const rows = useMemo(
    () => focusRecords(focusSessions, from, to, timezone, filter),
    [focusSessions, from, to, timezone, filter],
  );
  const counted = rows.filter((r) => r.ms > 0),
    total = counted.reduce((n, r) => n + r.ms, 0) / 1000;
  const titleOf = (s?: FocusSession) => {
    if (!s?.taskId) return l("작업 미지정", "No task assigned");
    const linked = tasks.find(t => t.id === s.taskId);
    const title = linked?.title || s.title || l("집중", "Focus");
    return !linked || linked.deletedAt ? `${title} · ${l("삭제된 작업", "Deleted task")}` : title;
  };
  const run = (c: FocusCommand) => {
    setMessage("");
    return command(c);
  };
  const start = (taskId = selected?.id ?? null) => {
    if (activeSession || (flow && flow.phase !== "next_ready")) {
      setMessage(
        l(
          "진행 중인 집중 또는 휴식이 있어요.",
          "A focus session or break is already active.",
        ),
      );
      return;
    }
    if (
      run({
        type: "start",
        taskId,
        mode: flow ? "pomodoro" : mode,
        settings: prefs,
      })
    )
      setResultId(null);
  };
  const openPicker = (id: string) => {
    setQuery("");
    setPicker(id);
  };
  const isBreak = Boolean(flow?.phase.startsWith("break_"));
  const display = activeSession
    ? focusDisplaySeconds(activeSession, now)
    : isBreak && flow
      ? breakRemaining(flow, now)
      : flow || mode === "pomodoro"
        ? (flow?.settings ?? prefs).focusMinutes * 60
        : 0;
  async function openMini() {
    if (!activeSession && !isBreak) return;
    const ok = await platform.miniFocusTimer.open({
      sessionId: activeSession?.id ?? flow!.id,
      phase: activeSession ? "focus" : "break",
      revision: activeSession?.revision ?? flow?.revision ?? 0,
      title: activeSession ? titleOf(activeSession) : l("휴식 중", "Break"),
      time: formatFocusDuration(display),
      status:
        activeSession?.status === "running" || flow?.phase === "break_running"
          ? "running"
          : "paused",
    });
    if (!ok)
      setMessage(
        l(
          "팝업을 허용한 뒤 미니 창을 다시 열어 주세요.",
          "Allow popups and try the mini window again.",
        ),
      );
  }
  const stage = (
    <>
      {!activeSession && !isBreak && !result && (
        <>
          {!flow && (
            <div
              className="focus-mode"
              role="group"
              aria-label={l("측정 방식", "Timer mode")}
            >
              {(["stopwatch", "pomodoro"] as const).map((m) => (
                <button
                  key={m}
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                >
                  <FocusIcon name="clock" />
                  {m === "stopwatch"
                    ? l("스톱워치", "Stopwatch")
                    : l("포모도로", "Pomodoro")}
                </button>
              ))}
            </div>
          )}
          <button
            className="focus-picker-trigger"
            onClick={() => openPicker("start")}
          >
            <FocusIcon name="search" />
            <span>
              {selected?.title ??
                l("작업 선택 (선택 사항)", "Choose a task (optional)")}
            </span>
            <FocusIcon name="chevron" />
          </button>
          {(mode === "pomodoro" || flow) && (
            <button
              className="focus-text-button"
              onClick={() => setShowSettings(true)}
            >
              {flow?.settings.focusMinutes ?? prefs.focusMinutes}
              {l("분 집중", " min focus")} ·{" "}
              {flow?.settings.shortBreakMinutes ?? prefs.shortBreakMinutes}
              {l("분 휴식", " min break")}
            </button>
          )}
        </>
      )}
      {activeSession && (
        <>
          <div className="focus-session-heading">
            <span className="focus-eyebrow">
              {activeSession.measurementMode === "pomodoro"
                ? l("포모도로", "Pomodoro")
                : l("스톱워치", "Stopwatch")}
            </span>
            <h2>{titleOf(activeSession)}</h2>
          </div>
          <p className="focus-status" role="status">
            {activeSession.recoveryRequired
              ? l("복구됨 · 일시정지", "Recovered · Paused")
              : activeSession.status === "paused"
                ? l("일시정지됨", "Paused")
                : l("집중 중", "Focusing")}
          </p>
        </>
      )}
      {isBreak && flow && (
        <>
          <span className="focus-eyebrow">
            {l("집중 기록이 저장되었어요", "Your focus has been recorded")}
          </span>
          <p className="focus-status" role="status">
            {flow.phase === "break_ready"
              ? l("휴식 준비", "Ready for a break")
              : flow.phase === "break_paused"
                ? l("휴식 일시정지", "Break paused")
                : l("휴식 중", "Taking a break")}
          </p>
        </>
      )}
      {(!result || activeSession || isBreak) && (
        <div className="focus-time" aria-label={l("타이머", "Timer")}>
          {formatFocusDuration(display)}
        </div>
      )}
      {activeSession ? (
        <>
          {activeSession.recoveryRequired && (
            <div className="focus-recovery">
              <p>
                {l(
                  "마지막 저장 시점까지 보존했어요. 저장 이후의 공백은 포함하지 않았어요.",
                  "Saved time is preserved. The unsaved gap is excluded.",
                )}
              </p>
              <button
                onClick={() => {
                  const date = new Date();
                  setGapEnd(new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                  setShowGap(true);
                }}
              >
                {l("공백 확인", "Review gap")}
              </button>
            </div>
          )}
          <div className="focus-main-actions">
            <button
              onClick={() =>
                run({
                  type: activeSession.status === "paused" ? "resume" : "pause",
                  id: activeSession.id,
                })
              }
            >
              <FocusIcon
                name={activeSession.status === "paused" ? "play" : "pause"}
              />
              {activeSession.status === "paused"
                ? l("재개", "Resume")
                : l("일시정지", "Pause")}
            </button>
            <button
              className="focus-danger"
              onClick={() => run({ type: "finish", id: activeSession.id })}
            >
              <FocusIcon name="stop" />
              {l("종료", "Finish")}
            </button>
          </div>
          <button
            className="focus-text-button"
            onClick={() => setNoteId(activeSession.id)}
          >
            <FocusIcon name="note" />
            {activeSession.focusNote
              ? l("메모 있음", "Edit note")
              : l("메모", "Note")}
          </button>
        </>
      ) : isBreak && flow ? (
        <>
          <p className="focus-muted">
            {flow.completedBlocks % flow.settings.longBreakEvery === 0
              ? l("긴 휴식", "Long break")
              : l("짧은 휴식", "Short break")}{" "}
            · {flow.completedBlocks}/{flow.settings.longBreakEvery}{" "}
            {l("완료", "completed")}
          </p>
          <div className="focus-main-actions">
            <button
              onClick={() =>
                run({
                  type:
                    flow.phase === "break_running"
                      ? "break_pause"
                      : flow.phase === "break_ready"
                        ? "break_start"
                        : "break_resume",
                  id: flow.id,
                })
              }
            >
              {flow.phase === "break_running"
                ? l("일시정지", "Pause")
                : flow.phase === "break_ready"
                  ? l("휴식 시작", "Start break")
                  : l("휴식 재개", "Resume break")}
            </button>
            <button
              className="focus-danger"
              onClick={() => {
                run({ type: "break_end", id: flow.id });
                setResultId(null);
              }}
            >
              {l("휴식 종료", "End break")}
            </button>
          </div>
          <p className="focus-muted">
            {flow.settings.autoFocus
              ? l(
                  "휴식이 끝나면 다음 집중이 자동 시작됩니다.",
                  "The next focus starts automatically.",
                )
              : l(
                  "다음 집중은 준비되었을 때 시작하세요.",
                  "Start the next focus when you are ready.",
                )}
          </p>
          {flow.lastSessionId && (
            <button
              className="focus-text-button"
              onClick={() => setNoteId(flow.lastSessionId)}
            >
              <FocusIcon name="note" />
              {l("방금 집중 메모", "Note for last focus")}
            </button>
          )}
        </>
      ) : result ? (
        <div className="focus-result">
          <p className="focus-status" role="status">
            {l("집중이 기록되었어요", "Focus recorded")}
          </p>
          <h2>
            {formatFocusDuration(result.accumulatedSeconds)}{" "}
            {l("기록됨", "recorded")}
          </h2>
          <button
            className="focus-picker-trigger"
            onClick={() => openPicker(result.id)}
          >
            <span>{titleOf(result)}</span>
            <span>{l("작업 연결", "Link task")}</span>
          </button>
          <button
            className="focus-primary"
            onClick={() =>
              start(
                result.taskId &&
                  tasks.some((t) => t.id === result.taskId && isTaskOpen(t))
                  ? result.taskId
                  : null,
              )
            }
          >
            <FocusIcon name="play" />
            {l("다시 집중 시작", "Focus again")}
          </button>
          <div className="focus-main-actions">
            <button onClick={() => setNoteId(result.id)}>
              {l("메모 추가", "Edit note")}
            </button>
            {result.taskId &&
              tasks.some((t) => t.id === result.taskId && isTaskOpen(t)) && (
                <button onClick={() => onCompleteTask(result.taskId!)}>
                  {l("작업 완료", "Complete task")}
                </button>
              )}
            <button
              onClick={() => {
                if (flow) run({ type: "flow_end", id: flow.id });
                setResultId(null);
              }}
            >
              {l("마치기", "Done")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <button className="focus-primary" onClick={() => start()}>
            <FocusIcon name="play" />
            {flow
              ? l("다음 집중 시작", "Start next focus")
              : l("집중 시작", "Start focus")}
          </button>
          <p className="focus-muted">
            {l(
              "작업을 선택하지 않아도 시작할 수 있어요.",
              "You can start without choosing a task.",
            )}
          </p>
          {flow && (
            <button
              className="focus-text-button"
              onClick={() => run({ type: "flow_end", id: flow.id })}
            >
              {l("마치기", "End flow")}
            </button>
          )}
        </>
      )}
    </>
  );
  const content = (
    <div
      ref={root}
      className={`foc-page focus-page-v2${immersive ? " focus-immersive" : ""}`}
      onKeyDown={(e) => {
        if (
          e.key === "Escape" &&
          immersive &&
          !picker &&
          !noteId &&
          !showSettings &&
          !showGap &&
          !detailId &&
          !deleteId
        )
          setImmersive(false);
      }}
    >
      <header className="focus-page-header" data-tauri-drag-region>
        <div>
          <h1>
            {view === "records"
              ? l("집중 기록", "Focus records")
              : l("집중", "Focus")}
          </h1>
          <p>
            {l(
              "지금, 더 깊이 집중해 보세요.",
              "Make room for your next moment of focus.",
            )}
          </p>
        </div>
        <nav aria-label={l("집중 도구", "Focus tools")}>
          {!immersive && (
            <button
              onClick={() => setView(view === "records" ? "timer" : "records")}
            >
              <FocusIcon name={view === "records" ? "clock" : "records"} />
              {view === "records"
                ? l("집중으로", "Back to focus")
                : l("기록", "Records")}
            </button>
          )}
          {settings.showMiniTimerButton && (
            <button
              aria-label={l("미니 창", "Mini timer")}
              title={l("미니 창", "Mini timer")}
              disabled={!activeSession && !isBreak}
              onClick={() => void openMini()}
            >
              <FocusIcon name="mini" />
            </button>
          )}
          <button
            data-immersive-toggle
            onClick={() => {
              setView("timer");
              setImmersive(!immersive);
            }}
          >
            <FocusIcon name="expand" />
            {immersive
              ? l("몰입 종료 · Esc", "Exit immersion · Esc")
              : l("몰입 보기", "Immersive view")}
          </button>
          <button
            aria-label={l("집중 설정", "Focus settings")}
            title={l("집중 설정", "Focus settings")}
            onClick={() => setShowSettings(true)}
          >
            <FocusIcon name="more" />
          </button>
        </nav>
      </header>
      {error && (
        <div className="focus-error" role="alert">
          {l(
            "기록 저장 실패 · 다시 시도해 주세요.",
            "Could not save focus. Please retry.",
          )}{" "}
          <span>{error}</span>
          <button onClick={onRetry}>{l("다시 시도", "Retry")}</button>
        </div>
      )}
      {message && (
        <p role="status" className="focus-error">
          {message}
        </p>
      )}
      {view === "timer" ? (
        <div className="focus-layout">
          <section
            className="focus-stage"
            aria-label={l("집중 타이머", "Focus timer")}
          >
            <fieldset disabled={!ready || Boolean(error)}>{stage}</fieldset>
          </section>
          {!immersive &&
            !activeSession &&
            !flow &&
            !result &&
            candidates.length > 0 && (
              <section className="focus-candidates">
                <header>
                  <div>
                    <h2>{l("바로 시작할 일", "Ready when you are")}</h2>
                    <p>
                      {l(
                        "지금 바로 집중하기 좋은 작업이에요.",
                        "A few tasks to get you started.",
                      )}
                    </p>
                  </div>
                  <button
                    className="focus-text-button"
                    onClick={() => openPicker("start")}
                  >
                    {l("모두 보기", "View all")} →
                  </button>
                </header>
                {candidates.map((t) => (
                  <article key={t.id}>
                    <button
                      className="focus-candidate-play"
                      aria-label={`${l("이 작업으로", "Start")} ${mode === "pomodoro" ? l("포모도로 시작", "pomodoro") : l("스톱워치 시작", "stopwatch")}: ${t.title}`}
                      onClick={() => start(t.id)}
                    >
                      <FocusIcon name="play" />
                    </button>
                    <button
                      className="foc-task-main"
                      onClick={() => onOpenTask(t.id)}
                    >
                      <strong>{t.title}</strong>
                    </button>
                    <span className="focus-task-label">
                      {lists.find((x) => x.id === t.listId)?.name ?? ""}
                    </span>
                    <small>{formatFocusDuration(t.actualSeconds, true)}</small>
                  </article>
                ))}
              </section>
            )}
        </div>
      ) : (
        <section className="focus-records">
          <div className="focus-filters">
            <label>
              {l("시작일", "From")}
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setLimit(20);
                }}
              />
            </label>
            <label>
              {l("종료일", "To")}
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => {
                  setTo(e.target.value);
                  setLimit(20);
                }}
              />
            </label>
            <label>
              {l("작업", "Task")}
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setLimit(20);
                }}
              >
                <option value="all">{l("전체 작업", "All tasks")}</option>
                <option value="unassigned">
                  {l("작업 미지정", "Unassigned")}
                </option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="focus-record-stats">
            {[
              [
                l("기록된 집중", "Recorded focus"),
                formatFocusDuration(total, true),
              ],
              [l("세션 수", "Sessions"), String(counted.length)],
              [
                l("평균", "Average"),
                counted.length
                  ? formatFocusDuration(total / counted.length, true)
                  : "—",
              ],
              [
                l("최장", "Longest"),
                counted.length
                  ? formatFocusDuration(
                      Math.max(...counted.map((r) => r.ms)) / 1000,
                      true,
                    )
                  : "—",
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <p className="focus-muted">
            {l(
              "선택 기간에 포함된 실행 구간 기준",
              "Running segments within the selected range",
            )}{" "}
            · {timezone}
          </p>
          {!rows.length && (
            <p className="focus-record-empty">
              {l(
                "이 기간의 집중 기록이 없어요.",
                "No focus records in this period.",
              )}
            </p>
          )}
          {rows.slice(0, limit).map(({ session: s, ms }) => (
            <button
              className="focus-record-row"
              key={s.id}
              onClick={() => setDetailId(s.id)}
            >
              <span>
                <strong>{titleOf(s)}</strong>
                <small>
                  {new Intl.DateTimeFormat(lang === "ko" ? "ko-KR" : "en-US", {
                    timeZone: timezone,
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(s.endedAt || s.startedAt))}
                </small>
              </span>
              <span className="focus-record-mode">
                {s.measurementMode === "pomodoro"
                  ? l("포모도로", "Pomodoro")
                  : l("스톱워치", "Stopwatch")}
              </span>
              <span>
                {s.segments.length
                  ? formatFocusDuration(ms / 1000)
                  : l("구간 정보 없음", "No segment data")}
              </span>
              {s.focusNote && <FocusIcon name="note" />}
            </button>
          ))}
          {rows.length > limit && (
            <button onClick={() => setLimit(limit + 20)}>
              {l("더 보기", "Load more")}
            </button>
          )}
        </section>
      )}
      {picker && (
        <FocusDialog
          title={l("작업 선택", "Choose a task")}
          onClose={() => setPicker(null)}
        >
          <input
            className="focus-search"
            aria-label={l("작업 검색", "Search tasks")}
            placeholder={l(
              "작업, 리스트, 태그 검색…",
              "Search tasks, lists, tags…",
            )}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="focus-choice-list">
            {[null, ...choices].map((t) => (
              <button
                key={t?.id ?? "none"}
                onClick={() => {
                  if (picker === "start") setSelectedId(t?.id ?? null);
                  else {
                    const s = focusSessions.find((s) => s.id === picker);
                    if (
                      !run({
                        type: "link",
                        id: picker,
                        taskId: t?.id ?? null,
                        revision: s?.revision,
                      })
                    )
                      return;
                  }
                  setPicker(null);
                }}
              >
                <span>
                  {t?.title ?? l("작업 없이 집중", "Focus without a task")}
                </span>
                <small>
                  {t
                    ? `${lists.find((x) => x.id === t.listId)?.name ?? ""}${!isTaskOpen(t) ? l(" · 완료", " · Completed") : ""}`
                    : ""}
                </small>
              </button>
            ))}
          </div>
        </FocusDialog>
      )}
      {note && (
        <FocusDialog
          title={l("집중 메모", "Focus note")}
          onClose={() => { if (run({ type: "note", id: note.id, note: noteDraft })) setNoteId(null); }}
        >
          <p>{titleOf(note)}</p>
          <textarea
            aria-label={l("메모", "Note")}
            value={noteDraft}
            onChange={(e) =>
              { setNoteDraft(e.target.value); run({ type: "note", id: note.id, note: e.target.value }); }
            }
            rows={7}
          />
          <button onClick={() => { if (run({ type: "note", id: note.id, note: noteDraft })) setNoteId(null); }}>{l("닫기", "Close")}</button>
        </FocusDialog>
      )}
      {detail && !picker && !note && !deleteId && (
        <FocusDialog
          title={l("집중 기록 상세", "Focus record")}
          onClose={() => setDetailId(null)}
        >
          <h3>{titleOf(detail)}</h3>
          <p>
            {formatFocusDuration(detail.accumulatedSeconds)} ·{" "}
            {detail.measurementMode === "pomodoro" ? "Pomodoro" : "Stopwatch"}
          </p>
          <p className="focus-muted">
            {detail.focusNote || l("메모 없음", "No note")}
          </p>
          <div className="focus-segments">
            {detail.segments.length
              ? detail.segments.map((s, i) => (
                  <p key={i}>
                    {new Date(s.startAt).toLocaleString(lang, {
                      timeZone: timezone,
                    })}{" "}
                    →{" "}
                    {new Date(s.endAt).toLocaleString(lang, {
                      timeZone: timezone,
                    })}
                  </p>
                ))
              : l(
                  "구간 정보 없음 · 기존 시간은 보존됩니다.",
                  "No segment data. Original duration is preserved.",
                )}
          </div>
          <div className="focus-main-actions">
            <button onClick={() => openPicker(detail.id)}>
              {l("작업 연결 변경", "Change task")}
            </button>
            <button onClick={() => setNoteId(detail.id)}>
              {l("메모", "Note")}
            </button>
            <button
              className="focus-danger"
              onClick={() => setDeleteId(detail.id)}
            >
              {l("삭제", "Delete")}
            </button>
          </div>
        </FocusDialog>
      )}
      {deleteId && (
        <FocusDialog
          title={l("집중 기록을 삭제할까요?", "Delete this focus record?")}
          onClose={() => setDeleteId(null)}
        >
          <p>
            {l(
              "연결 작업의 실제 시간에서도 차감됩니다.",
              "This duration is also removed from its linked task.",
            )}
          </p>
          <div className="focus-main-actions">
            <button onClick={() => setDeleteId(null)}>
              {l("취소", "Cancel")}
            </button>
            <button
              className="focus-danger"
              onClick={() => {
                const s = focusSessions.find((s) => s.id === deleteId);
                if (
                  run({ type: "delete", id: deleteId, revision: s?.revision })
                ) {
                  setDeleteId(null);
                  setDetailId(null);
                }
              }}
            >
              {l("삭제", "Delete")}
            </button>
          </div>
        </FocusDialog>
      )}
      {showSettings && (
        <FocusDialog
          title={l("집중 설정", "Focus settings")}
          onClose={() => setShowSettings(false)}
        >
          <p className="focus-muted">
            {flow
              ? l(
                  "시간과 자동 시작 변경은 다음 새 흐름부터 적용됩니다.",
                  "Timing changes apply to the next new flow.",
                )
              : l(
                  "스톱워치는 제한 없이 실제 시간을 기록합니다.",
                  "The stopwatch records time without a target.",
                )}
          </p>
          {(
            [
              ["focusMinutes", l("집중 (분)", "Focus (minutes)"), 180],
              [
                "shortBreakMinutes",
                l("짧은 휴식 (분)", "Short break (minutes)"),
                60,
              ],
              [
                "longBreakMinutes",
                l("긴 휴식 (분)", "Long break (minutes)"),
                60,
              ],
              [
                "longBreakEvery",
                l("긴 휴식 간격 (회)", "Long break interval"),
                8,
              ],
            ] as const
          ).map(([key, label, max]) => (
            <label className="focus-setting-row" key={key}>
              {label}
              <input
                type="number"
                min={key === "longBreakEvery" ? 2 : 1}
                max={max}
                value={prefs[key]}
                onChange={(e) =>
                  onUpdateSettings({
                    pomodoro: sanitizePomodoro({
                      ...prefs,
                      [key]: Number(e.target.value),
                    }),
                  })
                }
              />
            </label>
          ))}
          {(
            [
              [
                "autoBreak",
                l("집중 종료 후 휴식 자동 시작", "Start breaks automatically"),
              ],
              [
                "autoFocus",
                l(
                  "휴식 종료 후 다음 집중 자동 시작",
                  "Start next focus automatically",
                ),
              ],
            ] as const
          ).map(([key, label]) => (
            <label className="focus-setting-row" key={key}>
              {label}
              <input
                type="checkbox"
                checked={prefs[key]}
                onChange={(e) =>
                  onUpdateSettings({
                    pomodoro: { ...prefs, [key]: e.target.checked },
                  })
                }
              />
            </label>
          ))}
          <p className="focus-muted">
            {l(
              "자동 집중을 켜면 부재 중에도 시간이 기록될 수 있어요.",
              "Automatic focus may record time while you are away.",
            )}
          </p>
          <label className="focus-setting-row">
            {l("알림음", "Sound")}
            <input
              type="checkbox"
              checked={settings.soundEnabled ?? true}
              onChange={(e) =>
                onUpdateSettings({ soundEnabled: e.target.checked })
              }
            />
          </label>
          <label className="focus-setting-row">
            {l("음량", "Volume")}
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={settings.soundVolume ?? 0.4}
              onChange={(e) =>
                onUpdateSettings({ soundVolume: Number(e.target.value) })
              }
            />
          </label>
          <button
            onClick={() =>
              void platform
                .requestNotificationPermission()
                .then((ok) =>
                  setMessage(
                    ok === "granted"
                      ? l("알림이 허용되었습니다.", "Notifications enabled.")
                      : l(
                          "브라우저 또는 시스템 설정에서 알림을 허용해 주세요.",
                          "Allow notifications in browser or system settings.",
                        ),
                  ),
                )
            }
          >
            {l("알림 권한 요청", "Enable notifications")}
          </button>
        </FocusDialog>
      )}
      {showGap && activeSession && (
        <FocusDialog
          title={l("저장 공백 확인", "Review unsaved gap")}
          onClose={() => setShowGap(false)}
        >
          <p>
            {l(
              "저장 이후에도 계속 집중했다면, 실제로 집중을 마친 시각을 선택하세요. 다른 집중 기록과 겹치는 시간은 추가할 수 없어요.",
              "If you kept focusing after the last save, choose when you actually stopped. Time overlapping another record cannot be added.",
            )}
          </p>
          <label>
            {l("종료 시각", "End time")} · {Intl.DateTimeFormat().resolvedOptions().timeZone}
            <input type="datetime-local" value={gapEnd} onChange={(e) => setGapEnd(e.target.value)} />
          </label>
          <button
            onClick={() => {
              const end = Date.parse(gapEnd);
              if (!Number.isFinite(end) || end > Date.now()) { setMessage(l("현재 이전의 종료 시각을 선택해 주세요.", "Choose a valid end time before now.")); return; }
              const start = Date.parse(activeSession.checkpointAt ?? activeSession.pausedAt);
              if (end <= start || focusSessions.some(s => s.id !== activeSession.id && s.segments.some(g => Date.parse(g.startAt) < end && Date.parse(g.endAt) > start))) {
                setMessage(l("마지막 저장 이후이며 다른 기록과 겹치지 않는 시각을 선택해 주세요.", "Choose a time after the last save without overlapping another record."));
                return;
              }
              if (run({ type: "recover_gap", id: activeSession.id, endAt: new Date(end).toISOString() })) setShowGap(false);
            }}
          >
            {l("확인한 시간 추가", "Add confirmed time")}
          </button>
        </FocusDialog>
      )}
    </div>
  );
  return immersive ? createPortal(content, document.body) : content;
}
