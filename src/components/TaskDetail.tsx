import { FormEvent, useMemo, useState } from "react";
import type { Project, RepeatType, Subtask, Task, TaskLevel, TaskPriority, TaskStatus } from "../types";
import { todayValue } from "../utils/date";

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
        <h2>Task Detail</h2>
        <p>Select a task to review its details and planning fields.</p>
      </aside>
    );
  }

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
          aria-label="Task title"
          onChange={(event) => onUpdateTask(task.id, { title: event.target.value })}
        />
        <textarea
          className="detail-description-input"
          placeholder="Add description"
          value={task.description}
          aria-label="Task description"
          onChange={(event) => onUpdateTask(task.id, { description: event.target.value })}
        />
      </header>

      <section className="detail-section">
        <h3>Schedule</h3>
        <div className="detail-field-list">
          <label>
            <span>Scheduled date</span>
            <input
              type="date"
              value={task.scheduledDate}
              onChange={(event) => onUpdateTask(task.id, { scheduledDate: event.target.value })}
            />
          </label>
          <label>
            <span>Start time</span>
            <input
              type="time"
              value={task.startTime}
              onChange={(event) => onUpdateTask(task.id, { startTime: event.target.value })}
            />
          </label>
          <label>
            <span>End time</span>
            <input
              type="time"
              value={task.endTime}
              onChange={(event) => onUpdateTask(task.id, { endTime: event.target.value })}
            />
          </label>
          <label>
            <span>Due date</span>
            <input
              type="date"
              value={task.dueDate}
              onChange={(event) => onUpdateTask(task.id, { dueDate: event.target.value })}
            />
          </label>
          <label>
            <span>Repeat</span>
            <select
              value={task.repeatType}
              onChange={(event) =>
                onUpdateTask(task.id, { repeatType: event.target.value as RepeatType })
              }
            >
              {repeatTypes.map((repeatType) => (
                <option key={repeatType} value={repeatType}>
                  {repeatType}
                </option>
              ))}
            </select>
          </label>
          {task.repeatType !== "none" ? (
            <>
              <label>
                <span>Repeat interval</span>
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
                <span>Repeat end</span>
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
        <h3>Planning</h3>
        <div className="detail-field-list">
          <label>
            <span>Status</span>
            <select
              value={task.status}
              onChange={(event) => onUpdateTask(task.id, { status: event.target.value as TaskStatus })}
            >
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Priority</span>
            <select
              value={task.priority}
              onChange={(event) =>
                onUpdateTask(task.id, { priority: event.target.value as TaskPriority })
              }
            >
              {priorities.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>List</span>
            <select
              value={task.projectId}
              onChange={(event) => onUpdateTask(task.id, { projectId: event.target.value })}
            >
              <option value="">Inbox</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Importance</span>
            <select
              value={task.importance}
              onChange={(event) =>
                onUpdateTask(task.id, { importance: event.target.value as TaskLevel })
              }
            >
              {levels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Urgency</span>
            <select
              value={task.urgency}
              onChange={(event) => onUpdateTask(task.id, { urgency: event.target.value as TaskLevel })}
            >
              {levels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Blocked by</span>
            <select
              value={task.blockedByTaskId}
              onChange={(event) =>
                onUpdateTask(task.id, {
                  blockedByTaskId: event.target.value,
                  status: event.target.value ? "waiting" : task.status === "waiting" ? "todo" : task.status,
                })
              }
            >
              <option value="">No dependency</option>
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
          <strong>Blocked by:</strong> {blockingTask.title}
          {blockingTask.status === "done" ? (
            <button onClick={() => onUpdateTask(task.id, { blockedByTaskId: "", status: "todo" })}>
              Clear block
            </button>
          ) : null}
        </div>
      ) : null}
      <section className="subtask-panel detail-section">
        <div className="subtask-heading">
          <h3>Subtasks</h3>
          <span>
            {completedSubtasks}/{taskSubtasks.length} done
          </span>
        </div>
        <div className="progress-bar">
          <span style={{ width: `${subtaskProgress}%` }} />
        </div>
        <p className="progress-label">{subtaskProgress}% complete</p>
        <form className="subtask-form" onSubmit={handleAddSubtask}>
          <input
            placeholder="Add subtask"
            value={subtaskTitle}
            onChange={(event) => setSubtaskTitle(event.target.value)}
          />
          <button type="submit">Add</button>
        </form>
        <div className="subtask-list">
          {taskSubtasks.length === 0 ? <p className="empty-state">No subtasks yet.</p> : null}
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
              <button onClick={() => onDeleteSubtask(subtask.id)}>Delete</button>
            </div>
          ))}
        </div>
      </section>
      <section className="detail-section">
        <h3>Notes</h3>
        <textarea
          className="detail-notes"
          placeholder="Add notes"
          value={task.notes}
          onChange={(event) => onUpdateTask(task.id, { notes: event.target.value })}
        />
      </section>
      <section className="detail-section task-actions-section">
        <h3>Actions</h3>
        <div className="task-action-row">
          <button onClick={() => onUpdateTask(task.id, { scheduledDate: todayValue() })}>
            Move to Today
          </button>
          <button onClick={() => onDuplicateTask(task.id)}>Duplicate</button>
          <button onClick={() => onArchiveTask(task.id)}>Archive</button>
          <button className="danger-button-inline" onClick={() => onRequestDeleteTask(task.id)}>
            Delete
          </button>
        </div>
      </section>
    </aside>
  );
}
