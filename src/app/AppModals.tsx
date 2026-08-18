import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ConfirmModal } from "../components/kit";
import { toastLifetime, type QueuedToast } from "../lib/toastQueue";
import { useT } from "../i18n";
import { reducedTransition, transitions } from "../motion/transitions";
import { toastVariants } from "../motion/variants";
import { useMotionEnabled } from "../motion/reducedMotion";

type AppModalsProps = {
  pendingDeleteTaskId: string;
  pendingDeleteProjectId: string;
  pendingResetAllData: boolean;
  /**
   * The signed-in account, or "" on a local-only device.
   *
   * Resetting is not a device-local act while signed in: the store empties,
   * the next save diffs that against the account and deletes every row it
   * holds. The dialog said "on this device" and meant "everywhere", which is
   * the one sentence that has to be right on a screen with no undo.
   */
  resetReachesAccount: string;
  toasts: QueuedToast[];
  onCancelDeleteTask: () => void;
  onConfirmDeleteTask: () => void;
  onCancelDeleteProject: () => void;
  onConfirmDeleteProject: () => void;
  onCancelResetAllData: () => void;
  onConfirmResetAllData: () => void;
  onDismissToast: (id: number) => void;
};

export function AppModals({
  pendingDeleteTaskId,
  pendingDeleteProjectId,
  pendingResetAllData,
  resetReachesAccount,
  toasts,
  onCancelDeleteTask,
  onConfirmDeleteTask,
  onCancelDeleteProject,
  onConfirmDeleteProject,
  onCancelResetAllData,
  onConfirmResetAllData,
  onDismissToast,
}: AppModalsProps) {
  const { t } = useT();
  const motionEnabled = useMotionEnabled();

  return (
    <>
      {pendingDeleteTaskId ? (
        <ConfirmModal
          title={t("app.deleteTaskTitle")}
          body={t("app.deleteTaskBody")}
          confirmLabel={t("common.delete")}
          onCancel={onCancelDeleteTask}
          onConfirm={onConfirmDeleteTask}
        />
      ) : null}

      {pendingDeleteProjectId ? (
        <ConfirmModal
          title={t("app.deleteProjectTitle")}
          body={t("app.deleteProjectBody")}
          confirmLabel={t("app.deleteProjectConfirm")}
          onCancel={onCancelDeleteProject}
          onConfirm={onConfirmDeleteProject}
        />
      ) : null}

      {pendingResetAllData ? (
        <ConfirmModal
          title={t("app.resetAllDataTitle")}
          body={
            resetReachesAccount
              ? t("app.resetAllDataBodySignedIn", { email: resetReachesAccount })
              : t("app.resetAllDataBody")
          }
          confirmLabel={t("app.resetAllDataConfirm")}
          onCancel={onCancelResetAllData}
          onConfirm={onConfirmResetAllData}
        />
      ) : null}

      <div className="toast-stack">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={onDismissToast} />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: QueuedToast;
  onDismiss: (id: number) => void;
}) {
  const motionEnabled = useMotionEnabled();
  // Hovering holds the toast open — an undo button that expires while being
  // read is the whole problem this queue exists to fix.
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return undefined;
    const timer = window.setTimeout(() => onDismiss(toast.id), toastLifetime(toast));
    return () => window.clearTimeout(timer);
  }, [paused, toast, onDismiss]);

  return (
    <motion.div
      className="toast"
      role="status"
      variants={motionEnabled ? toastVariants : undefined}
      initial={motionEnabled ? "initial" : false}
      animate={motionEnabled ? "animate" : undefined}
      exit={motionEnabled ? "exit" : undefined}
      transition={motionEnabled ? transitions.soft : reducedTransition}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <span>{toast.message}</span>
      {toast.actionLabel && toast.onAction ? (
        <button
          type="button"
          onClick={() => {
            toast.onAction?.();
            onDismiss(toast.id);
          }}
        >
          {toast.actionLabel}
        </button>
      ) : null}
    </motion.div>
  );
}
