import { ConfirmModal, type ToastState } from "../components/kit";
import { useT } from "../i18n";

type AppModalsProps = {
  pendingDeleteTaskId: string;
  pendingDeleteProjectId: string;
  pendingResetAllData: boolean;
  toast: ToastState | null;
  onCancelDeleteTask: () => void;
  onConfirmDeleteTask: () => void;
  onCancelDeleteProject: () => void;
  onConfirmDeleteProject: () => void;
  onCancelResetAllData: () => void;
  onConfirmResetAllData: () => void;
  onDismissToast: () => void;
};

export function AppModals({
  pendingDeleteTaskId,
  pendingDeleteProjectId,
  pendingResetAllData,
  toast,
  onCancelDeleteTask,
  onConfirmDeleteTask,
  onCancelDeleteProject,
  onConfirmDeleteProject,
  onCancelResetAllData,
  onConfirmResetAllData,
  onDismissToast,
}: AppModalsProps) {
  const { t } = useT();

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
          body={t("app.resetAllDataBody")}
          confirmLabel={t("app.resetAllDataConfirm")}
          onCancel={onCancelResetAllData}
          onConfirm={onConfirmResetAllData}
        />
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
