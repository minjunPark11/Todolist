import { useEffect, useMemo, useRef, useState } from "react";
import type { FocusMode, FocusSession, Task } from "../types";
import { todayValue } from "../utils/date";
import { useT } from "../i18n";

interface FocusPageProps {
  tasks: Task[];
  focusSessions: FocusSession[];
  onAddFocusSession: (
    taskId: string,
    mode: FocusMode,
    durationMinutes: number,
    startedAt: string,
    completed: boolean,
  ) => void;
}

const modes: Array<{ id: FocusMode; labelKey: string; minutes: number }> = [
  { id: "focus", labelKey: "focus.modeFocus", minutes: 25 },
  { id: "short_break", labelKey: "focus.modeShortBreak", minutes: 5 },
  { id: "long_break", labelKey: "focus.modeLongBreak", minutes: 15 },
];

function formatTimer(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function FocusPage({ tasks, focusSessions, onAddFocusSession }: FocusPageProps) {
  const { t } = useT();
  const [mode, setMode] = useState<FocusMode>("focus");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const startedAtRef = useRef("");

  const selectedMode = modes.find((item) => item.id === mode) ?? modes[0];
  const today = todayValue();
  const todaySessions = focusSessions.filter(
    (session) => session.completed && session.startedAt.slice(0, 10) === today,
  );
  const todayFocusSessions = todaySessions.filter((session) => session.mode === "focus");
  const todayFocusTime = todayFocusSessions.reduce(
    (total, session) => total + session.durationMinutes,
    0,
  );

  const openTasks = useMemo(() => tasks.filter((task) => task.status !== "done"), [tasks]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const interval = window.setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(interval);
          setIsRunning(false);
          onAddFocusSession(
            selectedTaskId,
            mode,
            selectedMode.minutes,
            startedAtRef.current || new Date().toISOString(),
            true,
          );
          return selectedMode.minutes * 60;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRunning, mode, onAddFocusSession, selectedMode.minutes, selectedTaskId]);

  function chooseMode(nextMode: FocusMode) {
    const next = modes.find((item) => item.id === nextMode) ?? modes[0];
    setMode(nextMode);
    setRemainingSeconds(next.minutes * 60);
    setIsRunning(false);
    startedAtRef.current = "";
  }

  function startTimer() {
    if (!startedAtRef.current) {
      startedAtRef.current = new Date().toISOString();
    }
    setIsRunning(true);
  }

  function resetTimer() {
    setIsRunning(false);
    setRemainingSeconds(selectedMode.minutes * 60);
    startedAtRef.current = "";
  }

  return (
    <section className="content-stack">
      <header className="page-header">
        <h1>{t("focus.title")}</h1>
        <div className="stat-pill">{t("focus.minutesToday", { n: todayFocusTime })}</div>
      </header>
      <section className="focus-layout">
        <div className="focus-timer-card">
          <div className="mode-tabs">
            {modes.map((item) => (
              <button
                key={item.id}
                className={mode === item.id ? "active" : ""}
                onClick={() => chooseMode(item.id)}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </div>
          <div className="timer-display">{formatTimer(remainingSeconds)}</div>
          <label>
            {t("focus.focusTask")}
            <select value={selectedTaskId} onChange={(event) => setSelectedTaskId(event.target.value)}>
              <option value="">{t("focus.noLinkedTask")}</option>
              {openTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </label>
          <div className="timer-actions">
            <button onClick={startTimer} disabled={isRunning}>
              {t("focus.start")}
            </button>
            <button onClick={() => setIsRunning(false)} disabled={!isRunning}>
              {t("focus.pause")}
            </button>
            <button onClick={resetTimer}>{t("focus.reset")}</button>
          </div>
        </div>
        <div className="focus-summary">
          <Metric label={t("focus.sessionsToday")} value={todaySessions.length} />
          <Metric label={t("focus.focusSessions")} value={todayFocusSessions.length} />
          <Metric label={t("focus.focusMinutes")} value={todayFocusTime} />
        </div>
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
