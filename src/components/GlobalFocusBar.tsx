import { breakRemaining, focusDisplaySeconds } from "../domain/focus/engine";
import { AnimatePresence, motion } from "framer-motion";
import type { FocusFlow, FocusSession, Task } from "../types";
import type { FocusUserSettings } from "../lib/focusSettingsStorage";
import { formatFocusDuration, getDisplayedFocusSeconds, useNowTick } from "../lib/focusTimer";
import { reducedTransition, transitions } from "../motion/transitions";
import { toastVariants } from "../motion/variants";
import { useMotionEnabled } from "../motion/reducedMotion";
import { platform } from "../platform";
import { useT } from "../i18n";

interface GlobalFocusBarProps {
  flow?: FocusFlow | null;
  onFlowAction?: (id: string, action: string) => void;
  session: FocusSession | null;
  task: Task | null;
  onOpenFocus: () => void;
  onPause: (sessionId: string) => void;
  onResume: (sessionId: string) => void;
  onStop: (sessionId: string) => void;
  settings: FocusUserSettings;
}

export function GlobalFocusBar({ session, task, flow, onFlowAction, ...rest }: GlobalFocusBarProps) {
  const now = useNowTick(flow?.phase === "break_running");
  return (
    <AnimatePresence>
      {session ? <FocusBarContent key="focus-bar" session={session} task={task} {...rest} /> : flow?.phase.startsWith("break_") ? <aside className="foc-global-bar"><button onClick={rest.onOpenFocus}>Break · {formatFocusDuration(breakRemaining(flow, now))}</button><button onClick={() => onFlowAction?.(flow.id, flow.phase === "break_running" ? "pause" : "resume")}>{flow.phase === "break_running" ? "Pause" : "Resume"}</button><button onClick={() => onFlowAction?.(flow.id, "finish")}>End break</button></aside> : null}
    </AnimatePresence>
  );
}

function FocusBarContent({
  session,
  task,
  onOpenFocus,
  onPause,
  onResume,
  onStop,
  settings,
}: Omit<GlobalFocusBarProps, "session" | "task"> & { session: FocusSession; task: Task | null }) {
  const now = useNowTick(session.status === "running");
  const elapsed = focusDisplaySeconds(session, now);
  const motionEnabled = useMotionEnabled();
  const canOpenMiniTimer = settings.showMiniTimerButton && platform.miniFocusTimer.supported();
  const { t } = useT();

  function openMiniTimer() {
    void platform.miniFocusTimer.open({
      sessionId: session.id,
      title: (task?.title || session.title || "Focus"),
      time: formatFocusDuration(elapsed),
      status: session.status,
      phase: "focus",
      revision: session.revision ?? 0,
    });
  }

  return (
    <motion.aside
      className="foc-global-bar"
      aria-label={t("focus.globalAria", { title: (task?.title || session.title || "Focus"), time: formatFocusDuration(elapsed, true) })}
      variants={motionEnabled ? toastVariants : undefined}
      initial={motionEnabled ? "initial" : false}
      animate={motionEnabled ? "animate" : undefined}
      exit={motionEnabled ? "exit" : undefined}
      transition={motionEnabled ? transitions.soft : reducedTransition}
    >
      <button type="button" className="foc-global-main" onClick={onOpenFocus}>
        <span className={session.status === "paused" ? "is-paused" : ""}>{session.status === "paused" ? "▶" : "||"}</span>
        <strong>{session.status === "paused" ? t("focus.pause") : t("focus.runningShort")} · {(task?.title || session.title || "Focus")}</strong>
      </button>
      <button type="button" className="foc-global-time" onClick={onOpenFocus}>
        {formatFocusDuration(elapsed)}
      </button>
      <div className="foc-global-actions">
        {session.status === "paused" ? (
          <button type="button" className="foc-global-icon-action" aria-label={t("focus.resume")} title={t("focus.resume")} onClick={() => onResume(session.id)}>
            ▶
          </button>
        ) : (
          <button type="button" className="foc-global-icon-action" aria-label={t("focus.pause")} title={t("focus.pause")} onClick={() => onPause(session.id)}>
            ||
          </button>
        )}
        <button type="button" className="foc-global-icon-action danger" aria-label={t("focus.stop")} title={t("focus.stop")} onClick={() => onStop(session.id)}>
          ■
        </button>
        {canOpenMiniTimer ? (
          <button type="button" className="foc-global-icon-action" aria-label={t("focus.openMiniTimer")} title={t("focus.openMiniTimer")} onClick={openMiniTimer}>
            ↗
          </button>
        ) : null}
      </div>
    </motion.aside>
  );
}
