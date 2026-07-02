import type { Task } from "../../types";
import type { TodayPlanResult } from "../../utils/todayView";
import { Modal } from "../kit";
import { useT } from "../../i18n";

interface PlanTodayPreviewModalProps {
  plan: TodayPlanResult;
  tasks: Task[];
  onApply: () => void;
  onDismiss: () => void;
  onRefresh: () => void;
}

export function PlanTodayPreviewModal({
  plan,
  tasks,
  onApply,
  onDismiss,
  onRefresh,
}: PlanTodayPreviewModalProps) {
  const { t } = useT();
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const groups: Array<{ bucket: "now" | "next" | "later"; ids: string[] }> = [
    { bucket: "now", ids: plan.nowTaskIds },
    { bucket: "next", ids: plan.nextTaskIds },
    { bucket: "later", ids: plan.laterTaskIds },
  ];

  return (
    <Modal
      title={t("todayv.planPreviewTitle")}
      onClose={onDismiss}
      wide
      footer={
        <>
          <button type="button" className="ff-btn" onClick={onDismiss}>
            {t("todayv.dismissPlan")}
          </button>
          <button type="button" className="ff-btn" onClick={onRefresh}>
            {t("todayv.replan")}
          </button>
          <button type="button" className="ff-btn ff-btn-primary" onClick={onApply}>
            {t("todayv.applyPlan")}
          </button>
        </>
      }
    >
      <p className="tdy-plan-summary">
        {t("todayv.planSummary", {
          now: plan.nowTaskIds.length,
          next: plan.nextTaskIds.length,
          later: plan.laterTaskIds.length,
        })}
      </p>

      <div className="tdy-plan-groups">
        {groups.map(({ bucket, ids }) => (
          <div key={bucket} className="tdy-plan-group">
            <div className="tdy-bucket-head">
              <span className={`tdy-bucket-dot tdy-bucket-dot-${bucket}`} aria-hidden="true" />
              <strong>{t(`todayv.bucket.${bucket}`)}</strong>
              <span className="tdy-bucket-count">{ids.length}</span>
            </div>
            {ids.length === 0 ? (
              <p className="tdy-bucket-empty">{t("todayv.planGroupEmpty")}</p>
            ) : (
              <ul>
                {ids.map((id) => {
                  const task = taskById.get(id);
                  return task ? <li key={id}>{task.title}</li> : null;
                })}
              </ul>
            )}
          </div>
        ))}
      </div>

      {plan.reasonKeys.length > 0 ? (
        <div className="tdy-plan-reasons">
          <strong>{t("todayv.planReasoning")}</strong>
          <ul>
            {plan.reasonKeys.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Modal>
  );
}
