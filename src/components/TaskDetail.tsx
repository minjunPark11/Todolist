import type { Project, RepeatType, Subtask, Task, TaskPriority } from "../types";
import { todayValue } from "../utils/date";
import { getMatrixPosition, patchForQuadrant, type MatrixQuadrant } from "../utils/eisenhower";
import { useT } from "../i18n";
import { DeferredInput, DeferredTextarea } from "./kit";
import { MotionPanelShell } from "./motion/MotionPanelShell";

interface TaskDetailProps {
  task: Task | null;
  tasks: Task[];
  projects: Project[];
  subtasks: Subtask[];
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
  onRequestDeleteTask: (taskId: string) => void;
  onArchiveTask: (taskId: string) => void;
  onDuplicateTask: (taskId: string) => void;
  onAddSubtask: (taskId: string, title: string) => void;
  onToggleSubtask: (subtaskId: string) => void;
  onDeleteSubtask: (subtaskId: string) => void;
  onClose?: () => void;
}

const repeatTypes: RepeatType[] = ["none", "daily", "weekly", "monthly"];
// Highest first: the value most worth picking should not be last in the list.
const taskPriorities: TaskPriority[] = ["high", "medium", "low", "none"];
const matrixQuadrants: Array<{ key: MatrixQuadrant; labelKey: string; hintKey: string }> = [
  { key: "I", labelKey: "eis.qI", hintKey: "eis.qIHint" },
  { key: "II", labelKey: "eis.qII", hintKey: "eis.qIIHint" },
  { key: "III", labelKey: "eis.qIII", hintKey: "eis.qIIIHint" },
  { key: "IV", labelKey: "eis.qIV", hintKey: "eis.qIVHint" },
];

export function TaskDetail({
  task,
  onUpdateTask,
  onRequestDeleteTask,
  onArchiveTask,
  onDuplicateTask,
  onClose,
}: TaskDetailProps) {
  const { t } = useT();

  if (!task) {
    return (
      <MotionPanelShell className="detail-panel muted-panel">
        <h2>{t("taskDetail.title")}</h2>
        <p>{t("taskDetail.selectTaskHint")}</p>
      </MotionPanelShell>
    );
  }

  const repeatLabels: Record<RepeatType, string> = {
    none: t("taskDetail.repeatNone"),
    daily: t("taskDetail.repeatDaily"),
    weekly: t("taskDetail.repeatWeekly"),
    monthly: t("taskDetail.repeatMonthly"),
  };
  const today = todayValue();
  const selectedQuadrant = getMatrixPosition(task, today).quadrant;

  return (
    <MotionPanelShell className="detail-panel">
      <div className="detail-handle" />
      {onClose ? (
        <button type="button" className="detail-close-button" aria-label="Close task detail" onClick={onClose}>
          x
        </button>
      ) : null}
      <header className="detail-header">
        <DeferredInput
          className="detail-title-input"
          value={task.title}
          resetKey={task.id}
          aria-label={t("taskDetail.taskTitleAria")}
          onCommit={(title) => onUpdateTask(task.id, { title })}
        />
        <DeferredTextarea
          className="detail-description-input"
          placeholder={t("taskDetail.addDescription")}
          value={task.description}
          resetKey={task.id}
          aria-label={t("taskDetail.taskDescriptionAria")}
          onCommit={(description) => onUpdateTask(task.id, { description })}
        />
      </header>

      <section className="detail-section">
        <h3>{t("taskDetail.schedule")}</h3>
        <div className="detail-field-list">
          <label>
            <span>{t("taskDetail.scheduledDate")}</span>
            <input
              type="date"
              value={task.scheduledDate}
              onChange={(event) => onUpdateTask(task.id, { scheduledDate: event.target.value })}
            />
          </label>
          <label>
            <span>{t("taskDetail.startTime")}</span>
            <input
              type="time"
              step={600}
              value={task.startTime}
              onChange={(event) => onUpdateTask(task.id, { startTime: event.target.value })}
            />
          </label>
          <label>
            <span>{t("taskDetail.endTime")}</span>
            <input
              type="time"
              step={600}
              value={task.endTime}
              onChange={(event) => onUpdateTask(task.id, { endTime: event.target.value })}
            />
          </label>
          <label>
            <span>{t("common.dueDate")}</span>
            <input
              type="date"
              value={task.dueDate}
              onChange={(event) => onUpdateTask(task.id, { dueDate: event.target.value })}
            />
          </label>
          <label>
            <span>{t("taskDetail.repeat")}</span>
            <select
              value={task.repeatType}
              onChange={(event) =>
                onUpdateTask(task.id, { repeatType: event.target.value as RepeatType })
              }
            >
              {repeatTypes.map((repeatType) => (
                <option key={repeatType} value={repeatType}>
                  {repeatLabels[repeatType]}
                </option>
              ))}
            </select>
          </label>
          {task.repeatType !== "none" ? (
            <>
              <label>
                <span>{t("taskDetail.repeatInterval")}</span>
                <input
                  type="number"
                  min="1"
                  value={task.repeatInterval}
                  onChange={(event) =>
                    onUpdateTask(task.id, { repeatInterval: Number(event.target.value) || 1 })
                  }
                />
              </label>
              <label>
                <span>{t("taskDetail.repeatEnd")}</span>
                <input
                  type="date"
                  value={task.repeatEndDate}
                  onChange={(event) => onUpdateTask(task.id, { repeatEndDate: event.target.value })}
                />
              </label>
            </>
          ) : null}
        </div>
      </section>

      <section className="detail-section">
        <h3>{t("taskDetail.planning")}</h3>
        <div className="detail-field-list">
          {/* Priority was settable in four creation forms and nowhere after —
              the only way to change it was the quadrant below, which can only
              produce "high" or "medium" (patchForQuadrant), so a task saved as
              Low or None could never be seen or corrected again. The quadrant
              is derived from this field plus the due date, so the two controls
              cannot disagree: setting Low here immediately reads as Unsorted
              below. */}
          <label>
            <span>{t("taskDetail.priority")}</span>
            <select
              value={task.priority}
              onChange={(event) => onUpdateTask(task.id, { priority: event.target.value as TaskPriority })}
            >
              {taskPriorities.map((priority) => (
                <option key={priority} value={priority}>
                  {t(`priority.${priority}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("taskDetail.quadrant")}</span>
            <select
              value={selectedQuadrant}
              onChange={(event) => {
                const quadrant = matrixQuadrants.find((item) => item.key === event.target.value);
                if (quadrant) {
                  onUpdateTask(task.id, patchForQuadrant(task, quadrant.key, today));
                }
              }}
            >
              {matrixQuadrants.map((quadrant) => (
                <option key={quadrant.key} value={quadrant.key}>
                  {t(quadrant.labelKey)} ({t(quadrant.hintKey)})
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section className="detail-section">
        <h3>{t("taskDetail.notes")}</h3>
        <DeferredTextarea
          className="detail-notes"
          placeholder={t("taskDetail.addNotes")}
          value={task.notes}
          resetKey={task.id}
          onCommit={(notes) => onUpdateTask(task.id, { notes })}
        />
      </section>
      <section className="detail-section task-actions-section">
        <h3>{t("taskDetail.actions")}</h3>
        <div className="task-action-row">
          <button onClick={() => onUpdateTask(task.id, { scheduledDate: todayValue() })}>
            {t("today.moveToToday")}
          </button>
          <button onClick={() => onDuplicateTask(task.id)}>{t("common.duplicate")}</button>
          <button onClick={() => onArchiveTask(task.id)}>{t("common.archive")}</button>
          <button className="danger-button-inline" onClick={() => onRequestDeleteTask(task.id)}>
            {t("common.delete")}
          </button>
        </div>
      </section>
    </MotionPanelShell>
  );
}
