import { useEffect, useState } from "react";
import type { MiniFocusTimerSnapshot } from "../lib/miniFocusTimer";
import { platform } from "../platform";

async function closeMiniFocusWindow() {
  if (platform.kind !== "desktop") {
    window.close();
    return;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("close_focus_mini_timer");
    return;
  } catch {
    // Fall through to the window API below.
  }

  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  } catch {
    window.close();
  }
}

export function MiniFocusTimerWindow() {
  const [snapshot, setSnapshot] = useState<MiniFocusTimerSnapshot | null>(null);
  const [connectionError, setConnectionError] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    platform.miniFocusTimer.getSnapshot().then((current) => {
      if (!cancelled) setSnapshot(current);
    });
    platform.miniFocusTimer.subscribeSnapshot((next) => {
      setSnapshot(next);
      setConnectionError(false);
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
  }, []);

  const hasSession = Boolean(snapshot?.sessionId);
  const isPaused = snapshot?.status === "paused";

  function dispatch(action: "pause" | "resume" | "finish") {
    if (!snapshot?.sessionId) return;
    void platform.miniFocusTimer.dispatchAction({ action, sessionId: snapshot.sessionId, revision: snapshot.revision }).catch(() => setConnectionError(true));
  }

  return (
    <main className="mini-focus-window">
      <section className="mini-focus-card">
        <header>
          <span>FocusFlow</span>
          <div className="mini-focus-head-actions">
            <strong>{connectionError ? "Connection lost" : hasSession ? snapshot?.phase === "break" ? (isPaused ? "Break paused" : "Taking a break") : (isPaused ? "Paused" : "Running") : "Idle"}</strong>
            <button type="button" className="mini-focus-close" aria-label="Close" onClick={() => void closeMiniFocusWindow()}>
              x
            </button>
          </div>
        </header>
        <div className="mini-focus-time">{snapshot?.time ?? "--:--"}</div>
        <div className="mini-focus-title">{snapshot?.title || "No active focus session"}</div>
        <div className="mini-focus-actions">
          <button
            type="button"
            disabled={!hasSession || connectionError}
            onClick={() => dispatch(isPaused ? "resume" : "pause")}
          >
            {isPaused ? "Resume" : "Pause"}
          </button>
          <button type="button" className="danger" disabled={!hasSession || connectionError} onClick={() => dispatch("finish")}>
            {snapshot?.phase === "break" ? "End break" : "Finish"}
          </button>
        </div>
      </section>
    </main>
  );
}
