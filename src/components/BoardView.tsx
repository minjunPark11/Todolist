import type { Project, Subtask, Task, TaskStatus } from "../types";
import { formatDate } from "../utils/date";

interface BoardViewProps {
  tasks: Task[];
  projects: Project[];
  subtasks: Subtask[];
  onSelectTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
}

const columns: Array<{ status: TaskStatus; label: string }> = [
  { status: "todo", label: "To Do" },
  { status: "in_progress", label: "In Progress" },
  { status: "waiting", label: "Waiting" },
  { status: "blocked", label: "Blocked" },
  { status: "done", label: "Done" },
];

export function BoardView({ tasks, projects, subtasks, onSelectTask, onUpdateTask }: BoardViewProps) {
  const projectMap = new Map(projects.map((project) => [project.id, project]));

  return (
    <div className="board-grid">
      {columns.map((column) => {
        const columnTasks = tasks.filter((task) => task.status === column.status);

        return (
          <section
            key={column.status}
            className="board-column"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const taskId = event.dataTransfer.getData("text/plain");
              if (taskId) {
                onUpdateTask(taskId, { status: column.status });
              }
            }}
          >
            <div className="board-column-header">
              <h2>{column.label}</h2>
              <span>{columnTasks.length}</span>
            </div>
            <div className="board-card-list">
              {columnTasks.length === 0 ? <p className="empty-state">No tasks.</p> : null}
              {columnTasks.map((task) => {
                const project = projectMap.get(task.projectId);
                const taskSubtasks = subtasks.filter((subtask) => subtask.taskId === task.id);
                const completed = taskSubtasks.filter((subtask) => subtask.completed).length;

                return (
                  <article
                    key={task.id}
                    className="board-card"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", task.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => onSelectTask(task.id)}
                  >
                    <h3>{task.title}</h3>
                    <div className="task-meta">
                      <span>{formatDate(task.dueDate)}</span>
                      <span className={`priority priority-${task.priority}`}>{task.priority}</span>
                      <span>{project?.name ?? "Inbox"}</span>
                    </div>
                    {taskSubtasks.length > 0 ? (
                      <div className="mini-progress" aria-label="Subtask progress">
                        <span style={{ width: `${(completed / taskSubtasks.length) * 100}%` }} />
                      </div>
                    ) : null}
                    <select
                      value={task.status}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        onUpdateTask(task.id, { status: event.target.value as TaskStatus })
                      }
                    >
                      {columns.map((option) => (
                        <option key={option.status} value={option.status}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
