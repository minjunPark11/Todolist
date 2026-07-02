import type { ToastState } from "../components/kit";
import { useT } from "../i18n";

type AppModalsProps = {
  pendingDeleteTaskId: string;
  pendingDeleteProjectId: string;
  toast: ToastState | null;
  onCancelDeleteTask: () => void;
  onConfirmDeleteTask: () => void;
  onCancelDeleteProject: () => void;
  onConfirmDeleteProject: () => void;
  onDismissToast: () => void;
};

export function AppModals({
  pendingDeleteTaskId,
  pendingDeleteProjectId,
  toast,
  onCancelDeleteTask,
  onConfirmDeleteTask,
  onCancelDeleteProject,
  onConfirmDeleteProject,
  onDismissToast,
}: AppModalsProps) {
  const { t } = useT();

  return (
    <>
      {pendingDeleteTaskId ? (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-task-title">
            <h2 id="delete-task-title">{t("app.deleteTaskTitle")}</h2>
            <p>{t("app.deleteTaskBody")}</p>
            <div className="confirm-actions">
              <button onClick={onCancelDeleteTask}>{t("common.cancel")}</button>
              <button className="danger-button-inline" onClick={onConfirmDeleteTask}>
                {t("common.delete")}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingDeleteProjectId ? (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-project-title">
            <h2 id="delete-project-title">{t("app.deleteProjectTitle")}</h2>
            <p>{t("app.deleteProjectBody")}</p>
            <div className="confirm-actions">
              <button onClick={onCancelDeleteProject}>{t("common.cancel")}</button>
              <button className="danger-button-inline" onClick={onConfirmDeleteProject}>
                {t("app.deleteProjectConfirm")}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {toast ? (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.actionLabel && toast.onAction ? (
            <button
              onClick={() => {
                toast.onAction?.();
                onDismissToast();
              }}
            >
              {toast.actionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
