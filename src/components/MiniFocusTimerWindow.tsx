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

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    platform.miniFocusTimer.getSnapshot().then((current) => {
      if (!cancelled) setSnapshot(current);
    });
    platform.miniFocusTimer.subscribeSnapshot((next) => {
      setSnapshot(next);
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
    void platform.miniFocusTimer.dispatchAction({ action, sessionId: snapshot.sessionId });
  }

  return (
    <main className="mini-focus-window">
      <section className="mini-focus-card">
        <header>
          <span>FocusFlow</span>
          <div className="mini-focus-head-actions">
            <strong>{hasSession ? (isPaused ? "Paused" : "Running") : "Idle"}</strong>
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
            disabled={!hasSession}
            onClick={() => dispatch(isPaused ? "resume" : "pause")}
          >
            {isPaused ? "Resume" : "Pause"}
          </button>
          <button type="button" className="danger" disabled={!hasSession} onClick={() => dispatch("finish")}>
            Finish
          </button>
        </div>
      </section>
    </main>
  );
}
