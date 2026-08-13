import { AnimatePresence, motion } from "framer-motion";
import type { FocusSession, Task } from "../types";
import type { FocusUserSettings } from "../lib/focusSettingsStorage";
import { formatFocusDuration, getDisplayedFocusSeconds, useNowTick } from "../lib/focusTimer";
import { reducedTransition, transitions } from "../motion/transitions";
import { toastVariants } from "../motion/variants";
import { useMotionEnabled } from "../motion/reducedMotion";
import { platform } from "../platform";
import { useT } from "../i18n";

interface GlobalFocusBarProps {
  session: FocusSession | null;
  task: Task | null;
  onOpenFocus: () => void;
  onPause: (sessionId: string) => void;
  onResume: (sessionId: string) => void;
  onStop: (sessionId: string) => void;
  settings: FocusUserSettings;
}

export function GlobalFocusBar({ session, task, ...rest }: GlobalFocusBarProps) {
  return (
    <AnimatePresence>
      {session && task ? <FocusBarContent key="focus-bar" session={session} task={task} {...rest} /> : null}
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
}: Omit<GlobalFocusBarProps, "session" | "task"> & { session: FocusSession; task: Task }) {
  const now = useNowTick(session.status === "running");
  const elapsed = getDisplayedFocusSeconds(session, now);
  const motionEnabled = useMotionEnabled();
  const canOpenMiniTimer = settings.showMiniTimerButton && platform.miniFocusTimer.supported();
  const { t } = useT();

  function openMiniTimer() {
    void platform.miniFocusTimer.open({
      sessionId: session.id,
      title: task.title,
      time: formatFocusDuration(elapsed),
      status: session.status,
    });
  }

  return (
    <motion.aside
      className="foc-global-bar"
      aria-label={t("focus.globalAria", { title: task.title, time: formatFocusDuration(elapsed, true) })}
      variants={motionEnabled ? toastVariants : undefined}
      initial={motionEnabled ? "initial" : false}
      animate={motionEnabled ? "animate" : undefined}
      exit={motionEnabled ? "exit" : undefined}
      transition={motionEnabled ? transitions.soft : reducedTransition}
    >
      <button type="button" className="foc-global-main" onClick={onOpenFocus}>
        <span className={session.status === "paused" ? "is-paused" : ""}>{session.status === "paused" ? "▶" : "||"}</span>
        <strong>{session.status === "paused" ? t("focus.pause") : t("focus.runningShort")} · {task.title}</strong>
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
