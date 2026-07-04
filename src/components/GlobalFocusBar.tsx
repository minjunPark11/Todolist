import { AnimatePresence, motion } from "framer-motion";
import type { FocusSession, Task } from "../types";
import type { FocusUserSettings } from "../lib/focusSettingsStorage";
import { formatFocusDuration, getDisplayedFocusSeconds, useNowTick } from "../lib/focusTimer";
import { reducedTransition, transitions } from "../motion/transitions";
import { toastVariants } from "../motion/variants";
import { useMotionEnabled } from "../motion/reducedMotion";
import { platform } from "../platform";

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
      aria-label={`Current focus session: ${task.title}, ${formatFocusDuration(elapsed, true)} elapsed`}
      variants={motionEnabled ? toastVariants : undefined}
      initial={motionEnabled ? "initial" : false}
      animate={motionEnabled ? "animate" : undefined}
      exit={motionEnabled ? "exit" : undefined}
      transition={motionEnabled ? transitions.soft : reducedTransition}
    >
      <button type="button" className="foc-global-main" onClick={onOpenFocus}>
        <span className={session.status === "paused" ? "is-paused" : ""}>{session.status === "paused" ? "▶" : "||"}</span>
        <strong>{session.status === "paused" ? "일시정지" : "진행 중"} · {task.title}</strong>
      </button>
      <button type="button" className="foc-global-time" onClick={onOpenFocus}>
        {formatFocusDuration(elapsed)}
      </button>
      <div className="foc-global-actions">
        {session.status === "paused" ? (
          <button type="button" className="foc-global-icon-action" aria-label="재개" title="재개" onClick={() => onResume(session.id)}>
            ▶
          </button>
        ) : (
          <button type="button" className="foc-global-icon-action" aria-label="일시정지" title="일시정지" onClick={() => onPause(session.id)}>
            ||
          </button>
        )}
        <button type="button" className="foc-global-icon-action danger" aria-label="끝내기" title="끝내기" onClick={() => onStop(session.id)}>
          ■
        </button>
        {canOpenMiniTimer ? (
          <button type="button" className="foc-global-icon-action" aria-label="미니 타이머 열기" title="미니 타이머 열기" onClick={openMiniTimer}>
            ↗
          </button>
        ) : null}
      </div>
    </motion.aside>
  );
}
