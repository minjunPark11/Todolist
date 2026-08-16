import type { List, Project, RepeatType, Subtask, Task, TaskPriority } from "../types";
import { activeLists } from "../domain/spaces/hierarchy";
import { listIdFor } from "../domain/spaces/membership";
import { childProgress, childrenOf } from "../domain/tasks/children";
import { useState } from "react";
import { todayValue } from "../utils/date";
import { getMatrixPosition, patchForQuadrant, type MatrixQuadrant } from "../utils/eisenhower";
import { dependentsOf, eligibleBlockers } from "../domain/tasks/dependencies";
import { useT } from "../i18n";
import { DeferredInput, DeferredTextarea } from "./kit";
import { MotionPanelShell } from "./motion/MotionPanelShell";

interface TaskDetailProps {
  task: Task | null;
  tasks: Task[];
  projects: Project[];
  lists: List[];
  /** The keyboard-reachable half of U9 — the tree's drop target is the other. */
  onMoveToList: (taskId: string, listId: string) => void;
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
  tasks,
  projects,
  lists,
  onMoveToList,
  onUpdateTask,
  onRequestDeleteTask,
  onArchiveTask,
  onDuplicateTask,
  subtasks,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onClose,
}: TaskDetailProps) {
  const { t } = useT();
  const [childTitle, setChildTitle] = useState("");

  if (!task) {
    return (
      <MotionPanelShell className="detail-panel muted-panel">
        <h2>{t("taskDetail.title")}</h2>
        <p>{t("taskDetail.selectTaskHint")}</p>
      </MotionPanelShell>
    );
  }

  const children = childrenOf(task.id, tasks, subtasks);
  const progress = childProgress(children);

  const repeatLabels: Record<RepeatType, string> = {
    none: t("taskDetail.repeatNone"),
    daily: t("taskDetail.repeatDaily"),
    weekly: t("taskDetail.repeatWeekly"),
    monthly: t("taskDetail.repeatMonthly"),
  };
  const today = todayValue();
  const selectedQuadrant = getMatrixPosition(task, today).quadrant;
  // The picker refuses anything that would close a loop, so the cycle rule is
  // enforced where the value is written rather than guarded at every read.
  const blockerOptions = eligibleBlockers(tasks, task.id);
  // Derived, never stored — one fact, one place (domain/tasks/dependencies).
  const blocking = dependentsOf(tasks, task.id);

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
            <span>{t("taskDetail.startDate")}</span>
            <input
              type="date"
              value={task.startDate}
              onChange={(event) => onUpdateTask(task.id, { startDate: event.target.value })}
            />
          </label>
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
          {/* Where the task LIVES. The panel had no such control at all, so a
              task could only ever be filed by dragging it. One picker rather
              than a Space picker plus a List picker: the List determines the
              Space (membership.resolveListMove), and two controls that can
              contradict each other is one more state to reconcile. */}
          <label>
            <span>{t("taskDetail.list")}</span>
            <select
              value={listIdFor(task, lists)}
              onChange={(event) => onMoveToList(task.id, event.target.value)}
            >
              {/* A task with no Space has no List either; the placeholder keeps
                  the control from showing someone else's list as its value. */}
              {listIdFor(task, lists) ? null : <option value="">{t("taskDetail.noList")}</option>}
              {projects
                .filter((project) => project.status !== "archived" && !project.archivedAt)
                .map((project) => (
                  <optgroup key={project.id} label={project.name}>
                    {activeLists(lists, project.id).map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
          </label>
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
          <label>
            <span>{t("taskDetail.blockedBy")}</span>
            <select
              value={task.blockedByTaskId}
              onChange={(event) => onUpdateTask(task.id, { blockedByTaskId: event.target.value })}
            >
              <option value="">{t("taskDetail.blockedByNone")}</option>
              {/* A blocker set earlier can fall out of the eligible list once
                  it is completed. Keeping it as an option means the select
                  still shows what it is waiting on instead of silently
                  reading "Nothing" while the field holds an id. */}
              {task.blockedByTaskId && !blockerOptions.some((item) => item.id === task.blockedByTaskId) ? (
                <option value={task.blockedByTaskId}>
                  {tasks.find((item) => item.id === task.blockedByTaskId)?.title ?? task.blockedByTaskId}
                </option>
              ) : null}
              {blockerOptions.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.title}
                </option>
              ))}
            </select>
          </label>
          {task.blockedByTaskId ? <small className="detail-hint">{t("taskDetail.blockedByHint")}</small> : null}
          {blocking.length > 0 ? (
            <div className="detail-blocking">
              <span>{t("taskDetail.blocks")}</span>
              <ul>
                {blocking.map((dependent) => (
                  <li key={dependent.id}>{dependent.title}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>
      {/* The four subtask props were declared here and never rendered, which
          is how the app came to have two subtask features and show neither in
          this panel. `childrenOf` answers with both kinds at once, so a legacy
          Subtask is visible again — and promotes to a Task the moment it is
          ticked (domain/tasks/children.ts). */}
      <section className="detail-section">
        <h3>
          {t("spaceHub.section.subtasks")}
          {progress.total > 0 ? (
            <span className="detail-subtask-progress">
              {progress.done}/{progress.total}
            </span>
          ) : null}
        </h3>
        {children.length > 0 ? (
          <ul className="detail-subtasks">
            {children.map((child) => (
              <li key={child.id}>
                <label>
                  <input type="checkbox" checked={child.done} onChange={() => onToggleSubtask(child.id)} />
                  <span className={child.done ? "is-done" : ""}>{child.title}</span>
                </label>
                <button
                  type="button"
                  aria-label={t("common.delete")}
                  onClick={() => onDeleteSubtask(child.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <form
          className="detail-subtask-add"
          onSubmit={(event) => {
            event.preventDefault();
            const title = childTitle.trim();
            if (!title) return;
            onAddSubtask(task.id, title);
            setChildTitle("");
          }}
        >
          <input
            value={childTitle}
            placeholder={t("spaceHub.action.addSubtask")}
            aria-label={t("spaceHub.action.addSubtask")}
            onChange={(event) => setChildTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
            }}
          />
          <button type="submit">{t("common.add")}</button>
        </form>
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
