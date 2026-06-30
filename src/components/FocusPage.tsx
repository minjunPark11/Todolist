import { useEffect, useMemo, useRef, useState } from "react";
import type { FocusMode, FocusSession, Task } from "../types";
import { todayValue } from "../utils/date";

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

const modes: Array<{ id: FocusMode; label: string; minutes: number }> = [
  { id: "focus", label: "Focus", minutes: 25 },
  { id: "short_break", label: "Short Break", minutes: 5 },
  { id: "long_break", label: "Long Break", minutes: 15 },
];

function formatTimer(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function FocusPage({ tasks, focusSessions, onAddFocusSession }: FocusPageProps) {
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
        <h1>Focus</h1>
        <div className="stat-pill">{todayFocusTime} min today</div>
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
                {item.label}
              </button>
            ))}
          </div>
          <div className="timer-display">{formatTimer(remainingSeconds)}</div>
          <label>
            Focus task
            <select value={selectedTaskId} onChange={(event) => setSelectedTaskId(event.target.value)}>
              <option value="">No linked task</option>
              {openTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </label>
          <div className="timer-actions">
            <button onClick={startTimer} disabled={isRunning}>
              Start
            </button>
            <button onClick={() => setIsRunning(false)} disabled={!isRunning}>
              Pause
            </button>
            <button onClick={resetTimer}>Reset</button>
          </div>
        </div>
        <div className="focus-summary">
          <Metric label="Sessions today" value={todaySessions.length} />
          <Metric label="Focus sessions" value={todayFocusSessions.length} />
          <Metric label="Focus minutes" value={todayFocusTime} />
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
