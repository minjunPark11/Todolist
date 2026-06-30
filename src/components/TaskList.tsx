import type { Project, Subtask, Task } from "../types";
import { formatDate, isOverdue, isToday, isThisWeek } from "../utils/date";

interface TaskListProps {
  tasks: Task[];
  projects: Project[];
  subtasks?: Subtask[];
  emptyMessage: string;
  onToggleDone: (taskId: string) => void;
  onSelectTask: (taskId: string) => void;
}

export function TaskList({
  tasks,
  projects,
  subtasks = [],
  emptyMessage,
  onToggleDone,
  onSelectTask,
}: TaskListProps) {
  const projectMap = new Map(projects.map((project) => [project.id, project]));

  if (tasks.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>;
  }

  return (
    <div className="task-list">
      {tasks.map((task) => {
        const project = projectMap.get(task.projectId);
        const taskSubtasks = subtasks.filter((subtask) => subtask.taskId === task.id);
        const completedSubtasks = taskSubtasks.filter((subtask) => subtask.completed).length;
        const dateTone = isOverdue(task.dueDate)
          ? "danger"
          : isToday(task.dueDate)
            ? "accent"
            : isThisWeek(task.dueDate)
              ? "soft"
              : "";

        return (
          <article
            key={task.id}
            className={task.status === "done" ? "task-row is-done" : "task-row"}
            onClick={() => onSelectTask(task.id)}
          >
            <button
              className="check-button"
              aria-label={task.status === "done" ? "Mark task incomplete" : "Mark task done"}
              onClick={(event) => {
                event.stopPropagation();
                onToggleDone(task.id);
              }}
            >
              {task.status === "done" ? "✓" : ""}
            </button>
            <div className="task-main">
              <div className="task-title-line">
                <h3>{task.title}</h3>
                <span className={`priority priority-${task.priority}`}>{task.priority}</span>
              </div>
              {task.description ? <p>{task.description}</p> : null}
              <div className="task-meta">
                <span className={dateTone}>{formatDate(task.dueDate)}</span>
                <span>{project?.name ?? "Inbox"}</span>
                <span>{task.status.replace("_", " ")}</span>
                {taskSubtasks.length > 0 ? (
                  <span>
                    {completedSubtasks}/{taskSubtasks.length} subtasks
                  </span>
                ) : null}
              </div>
              {taskSubtasks.length > 0 ? (
                <div className="mini-progress" aria-label="Subtask progress">
                  <span style={{ width: `${(completedSubtasks / taskSubtasks.length) * 100}%` }} />
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
