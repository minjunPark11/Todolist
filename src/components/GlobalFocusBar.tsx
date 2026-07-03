import { useEffect } from "react";
import type { FocusSession, Task } from "../types";
import {
  formatFocusDuration,
  getDisplayedFocusSeconds,
  getFocusRemainingSeconds,
  getFocusTargetSeconds,
  useNowTick,
} from "../lib/focusTimer";

interface GlobalFocusBarProps {
  session: FocusSession | null;
  task: Task | null;
  onOpenFocus: () => void;
  onPause: (sessionId: string) => void;
  onResume: (sessionId: string) => void;
  onStop: (sessionId: string) => void;
}

export function GlobalFocusBar({ session, task, onOpenFocus, onPause, onResume, onStop }: GlobalFocusBarProps) {
  const now = useNowTick(Boolean(session && session.status === "running"));
  const elapsed = getDisplayedFocusSeconds(session, now);
  const remaining = getFocusRemainingSeconds(session, now);

  useEffect(() => {
    if (!session) return;
    if (session.status !== "running") return;
    if (elapsed < getFocusTargetSeconds(session)) return;
    onStop(session.id);
  }, [elapsed, onStop, session]);

  if (!session || !task) return null;

  return (
    <aside
      className="foc-global-bar"
      aria-label={`Current focus session: ${task.title}, ${formatFocusDuration(remaining, true)} remaining`}
    >
      <button type="button" className="foc-global-main" onClick={onOpenFocus}>
        <span className={session.status === "paused" ? "is-paused" : ""}>{session.status === "paused" ? "▶" : "||"}</span>
        <strong>{session.status === "paused" ? "일시정지" : "진행 중"} · {task.title}</strong>
      </button>
      <button type="button" className="foc-global-time" onClick={onOpenFocus}>
        {formatFocusDuration(remaining)}
      </button>
      <div className="foc-global-actions">
        {session.status === "paused" ? (
          <button type="button" onClick={() => onResume(session.id)}>재개</button>
        ) : (
          <button type="button" onClick={() => onPause(session.id)}>일시정지</button>
        )}
        <button type="button" className="danger" onClick={() => onStop(session.id)}>끝</button>
      </div>
    </aside>
  );
}
