import type { Task } from "../../types";
import type { TodayPlanResult } from "../../utils/todayView";
import { getMatrixPosition, type MatrixQuadrant } from "../../utils/eisenhower";
import { todayValue } from "../../utils/date";
import { Modal } from "../kit";
import { useT } from "../../i18n";

const QUADRANTS: MatrixQuadrant[] = ["I", "II", "III", "IV"];

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
  const today = todayValue();
  const taskById = new Map(tasks.map((task) => [task.id, task]));

  // Re-bucket every proposed task onto its derived Eisenhower quadrant so the
  // preview mirrors the Planning matrix instead of the old now/next/later split.
  const quadrantIds: Record<MatrixQuadrant, string[]> = { I: [], II: [], III: [], IV: [] };
  for (const id of [...plan.nowTaskIds, ...plan.nextTaskIds, ...plan.laterTaskIds]) {
    const task = taskById.get(id);
    if (!task) continue;
    quadrantIds[getMatrixPosition(task, today).quadrant].push(id);
  }

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
        {t("todayv.planSummaryEis", {
          q1: quadrantIds.I.length,
          q2: quadrantIds.II.length,
          q3: quadrantIds.III.length,
          q4: quadrantIds.IV.length,
        })}
      </p>

      <div className="tdy-plan-groups tdy-plan-groups-eis">
        {QUADRANTS.map((quadrant) => {
          const ids = quadrantIds[quadrant];
          return (
            <div key={quadrant} className="tdy-plan-group">
              <div className="tdy-bucket-head">
                <span className={`tdy-bucket-dot tdy-bucket-dot-q${quadrant}`} aria-hidden="true" />
                <strong>{t(`eis.q${quadrant}`)}</strong>
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
          );
        })}
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
