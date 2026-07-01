import { FormEvent, useState } from "react";
import type { Project, Subtask, Task, TaskDraft } from "../types";
import { formatDate } from "../utils/date";
import { useT } from "../i18n";

interface BoardViewProps {
  tasks: Task[];
  projects: Project[];
  subtasks: Subtask[];
  onSelectTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
  onAddTask: (draft: TaskDraft) => void;
}

const columns = [
  { id: "inbox", labelKey: "status.inbox" },
  { id: "todo", labelKey: "status.todo" },
  { id: "doing", labelKey: "status.doing" },
  { id: "waiting", labelKey: "status.waiting" },
  { id: "done", labelKey: "status.done" },
] as const;

export function BoardView({ tasks, projects, subtasks, onSelectTask, onUpdateTask, onAddTask }: BoardViewProps) {
  const { t, lang } = useT();
  const [draftByColumn, setDraftByColumn] = useState<Record<string, string>>({});
  const projectMap = new Map(projects.map((project) => [project.id, project]));

  function submitColumnTask(event: FormEvent, columnId: (typeof columns)[number]["id"]) {
    event.preventDefault();
    const title = (draftByColumn[columnId] ?? "").trim();
    if (!title || columnId === "done") {
      return;
    }

    onAddTask(
      columnId === "inbox"
        ? { title, status: "todo", projectId: "", dueDate: "" }
        : { title, status: columnId },
    );
    setDraftByColumn((current) => ({ ...current, [columnId]: "" }));
  }

  return (
    <div className="board-grid">
      {columns.map((column) => {
        const columnTasks = tasks.filter((task) => {
          if (column.id === "inbox") {
            return task.status !== "done" && task.status !== "archived" && !task.projectId && !task.dueDate;
          }
          return task.status === column.id;
        });

        return (
          <section
            key={column.id}
            className="board-column"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const taskId = event.dataTransfer.getData("text/plain");
              if (taskId) {
                onUpdateTask(
                  taskId,
                  column.id === "inbox"
                    ? { status: "todo", projectId: "", dueDate: "" }
                    : { status: column.id },
                );
              }
            }}
          >
            <div className="board-column-header">
              <h2>{t(column.labelKey)}</h2>
              <span>{columnTasks.length}</span>
            </div>
            {column.id !== "done" ? (
              <form className="board-inline-add" onSubmit={(event) => submitColumnTask(event, column.id)}>
                <input
                  aria-label={t("board.addTaskToColumnAria", { column: t(column.labelKey) })}
                  placeholder={t("board.addTaskPlaceholder")}
                  value={draftByColumn[column.id] ?? ""}
                  onChange={(event) =>
                    setDraftByColumn((current) => ({ ...current, [column.id]: event.target.value }))
                  }
                />
              </form>
            ) : null}
            <div className="board-card-list">
              {columnTasks.length === 0 ? <p className="empty-state">{t("board.noTasks")}</p> : null}
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
                      <span>{formatDate(task.dueDate, lang)}</span>
                      <span className={`priority priority-${task.priority}`}>{t(`priority.${task.priority}`)}</span>
                      <span>{project?.name ?? t("status.inbox")}</span>
                    </div>
                    {taskSubtasks.length > 0 ? (
                      <div className="mini-progress" aria-label={t("taskList.subtaskProgress")}>
                        <span style={{ width: `${(completed / taskSubtasks.length) * 100}%` }} />
                      </div>
                    ) : null}
                    <select
                      value={task.status}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        onUpdateTask(task.id, { status: event.target.value as Task["status"] })
                      }
                    >
                      {columns.filter((option) => option.id !== "inbox").map((option) => (
                        <option key={option.id} value={option.id}>
                          {t(option.labelKey)}
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
