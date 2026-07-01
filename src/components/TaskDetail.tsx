import { FormEvent, useMemo, useState } from "react";
import type { Project, RepeatType, Subtask, Task, TaskLevel, TaskPriority, TaskStatus } from "../types";
import { todayValue } from "../utils/date";
import { useT } from "../i18n";

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
}

const statuses: TaskStatus[] = ["inbox", "todo", "doing", "waiting", "done", "archived"];
const priorities: TaskPriority[] = ["none", "low", "medium", "high"];
const levels: TaskLevel[] = ["low", "high"];
const repeatTypes: RepeatType[] = ["none", "daily", "weekly", "monthly"];

export function TaskDetail({
  task,
  tasks,
  projects,
  subtasks,
  onUpdateTask,
  onRequestDeleteTask,
  onArchiveTask,
  onDuplicateTask,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
}: TaskDetailProps) {
  const { t } = useT();
  const [subtaskTitle, setSubtaskTitle] = useState("");

  const taskSubtasks = useMemo(
    () => (task ? subtasks.filter((subtask) => subtask.taskId === task.id) : []),
    [subtasks, task],
  );
  const completedSubtasks = taskSubtasks.filter((subtask) => subtask.completed).length;
  const subtaskProgress =
    taskSubtasks.length > 0 ? Math.round((completedSubtasks / taskSubtasks.length) * 100) : 0;
  const blockingTask = task?.blockedByTaskId
    ? tasks.find((candidate) => candidate.id === task.blockedByTaskId)
    : null;

  if (!task) {
    return (
      <aside className="detail-panel muted-panel">
        <h2>{t("taskDetail.title")}</h2>
        <p>{t("taskDetail.selectTaskHint")}</p>
      </aside>
    );
  }

  const repeatLabels: Record<RepeatType, string> = {
    none: t("taskDetail.repeatNone"),
    daily: t("taskDetail.repeatDaily"),
    weekly: t("taskDetail.repeatWeekly"),
    monthly: t("taskDetail.repeatMonthly"),
  };
  const levelLabels: Record<TaskLevel, string> = {
    low: t("taskDetail.levelLow"),
    high: t("taskDetail.levelHigh"),
  };
  const statusLabels: Record<TaskStatus, string> = {
    inbox: t("status.inbox"),
    todo: t("status.todo"),
    doing: t("status.doing"),
    waiting: t("status.waiting"),
    done: t("status.done"),
    archived: t("status.archived"),
    // Legacy values normalized away on load (see migrateStatus); kept here
    // only so this satisfies Record<TaskStatus, string>.
    in_progress: t("status.doing"),
    blocked: t("status.waiting"),
  };
  const priorityLabels: Record<TaskPriority, string> = {
    high: t("priority.high"),
    medium: t("priority.medium"),
    low: t("priority.low"),
    none: t("priority.none"),
  };

  function handleAddSubtask(event: FormEvent) {
    event.preventDefault();
    if (!task) {
      return;
    }

    onAddSubtask(task.id, subtaskTitle);
    setSubtaskTitle("");
  }

  return (
    <aside className="detail-panel">
      <div className="detail-handle" />
      <header className="detail-header">
        <input
          className="detail-title-input"
          value={task.title}
          aria-label={t("taskDetail.taskTitleAria")}
          onChange={(event) => onUpdateTask(task.id, { title: event.target.value })}
        />
        <textarea
          className="detail-description-input"
          placeholder={t("taskDetail.addDescription")}
          value={task.description}
          aria-label={t("taskDetail.taskDescriptionAria")}
          onChange={(event) => onUpdateTask(task.id, { description: event.target.value })}
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
              value={task.startTime}
              onChange={(event) => onUpdateTask(task.id, { startTime: event.target.value })}
            />
          </label>
          <label>
            <span>{t("taskDetail.endTime")}</span>
            <input
              type="time"
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
          <label>
            <span>{t("common.status")}</span>
            <select
              value={task.status}
              onChange={(event) => onUpdateTask(task.id, { status: event.target.value as TaskStatus })}
            >
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("common.priority")}</span>
            <select
              value={task.priority}
              onChange={(event) =>
                onUpdateTask(task.id, { priority: event.target.value as TaskPriority })
              }
            >
              {priorities.map((priority) => (
                <option key={priority} value={priority}>
                  {priorityLabels[priority]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("taskDetail.list")}</span>
            <select
              value={task.projectId}
              onChange={(event) => onUpdateTask(task.id, { projectId: event.target.value })}
            >
              <option value="">{t("status.inbox")}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("taskDetail.importance")}</span>
            <select
              value={task.importance}
              onChange={(event) =>
                onUpdateTask(task.id, { importance: event.target.value as TaskLevel })
              }
            >
              {levels.map((level) => (
                <option key={level} value={level}>
                  {levelLabels[level]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("taskDetail.urgency")}</span>
            <select
              value={task.urgency}
              onChange={(event) => onUpdateTask(task.id, { urgency: event.target.value as TaskLevel })}
            >
              {levels.map((level) => (
                <option key={level} value={level}>
                  {levelLabels[level]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("taskDetail.blockedBy")}</span>
            <select
              value={task.blockedByTaskId}
              onChange={(event) =>
                onUpdateTask(task.id, {
                  blockedByTaskId: event.target.value,
                  status: event.target.value ? "waiting" : task.status === "waiting" ? "todo" : task.status,
                })
              }
            >
              <option value="">{t("taskDetail.noDependency")}</option>
              {tasks
                .filter((candidate) => candidate.id !== task.id)
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </section>
      {blockingTask ? (
        <div className={blockingTask.status === "done" ? "dependency-note ready" : "dependency-note"}>
          <strong>{t("taskDetail.blockedByLabel")}</strong> {blockingTask.title}
          {blockingTask.status === "done" ? (
            <button onClick={() => onUpdateTask(task.id, { blockedByTaskId: "", status: "todo" })}>
              {t("taskDetail.clearBlock")}
            </button>
          ) : null}
        </div>
      ) : null}
      <section className="subtask-panel detail-section">
        <div className="subtask-heading">
          <h3>{t("taskDetail.subtasks")}</h3>
          <span>
            {t("taskDetail.subtasksDone", { done: completedSubtasks, total: taskSubtasks.length })}
          </span>
        </div>
        <div className="progress-bar">
          <span style={{ width: `${subtaskProgress}%` }} />
        </div>
        <p className="progress-label">{t("taskDetail.percentComplete", { percent: subtaskProgress })}</p>
        <form className="subtask-form" onSubmit={handleAddSubtask}>
          <input
            placeholder={t("taskDetail.addSubtask")}
            value={subtaskTitle}
            onChange={(event) => setSubtaskTitle(event.target.value)}
          />
          <button type="submit">{t("common.add")}</button>
        </form>
        <div className="subtask-list">
          {taskSubtasks.length === 0 ? <p className="empty-state">{t("taskDetail.noSubtasksYet")}</p> : null}
          {taskSubtasks.map((subtask) => (
            <div key={subtask.id} className="subtask-row">
              <label>
                <input
                  type="checkbox"
                  checked={subtask.completed}
                  onChange={() => onToggleSubtask(subtask.id)}
                />
                <span>{subtask.title}</span>
              </label>
              <button onClick={() => onDeleteSubtask(subtask.id)}>{t("common.delete")}</button>
            </div>
          ))}
        </div>
      </section>
      <section className="detail-section">
        <h3>{t("taskDetail.notes")}</h3>
        <textarea
          className="detail-notes"
          placeholder={t("taskDetail.addNotes")}
          value={task.notes}
          onChange={(event) => onUpdateTask(task.id, { notes: event.target.value })}
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
    </aside>
  );
}
