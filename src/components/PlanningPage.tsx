import { useState } from "react";
import type { Project, Task, TaskDraft, TaskLevel, TaskStatus } from "../types";
import { isActiveTask } from "../utils/planner";
import { MoreMenu, SegmentedTabs } from "./kit";

interface PlanningPageProps {
  tasks: Task[];
  projects: Project[];
  selectedTaskId: string;
  view: "board" | "matrix";
  onChangeView: (view: "board" | "matrix") => void;
  onOpenTask: (id: string) => void;
  onUpdateStatus: (id: string, status: TaskStatus) => void;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onCreateTask: (draft: TaskDraft) => string;
}

const BOARD_COLUMNS: Array<{ status: TaskStatus; label: string }> = [
  { status: "inbox", label: "Inbox" },
  { status: "todo", label: "To Do" },
  { status: "doing", label: "Doing" },
  { status: "waiting", label: "Waiting" },
  { status: "done", label: "Done" },
];

const QUADRANTS: Array<{ key: string; label: string; hint: string; importance: TaskLevel; urgency: TaskLevel }> = [
  { key: "do", label: "Do Now", hint: "Important · Urgent", importance: "high", urgency: "high" },
  { key: "schedule", label: "Schedule", hint: "Important · Not urgent", importance: "high", urgency: "low" },
  { key: "delegate", label: "Quick Handle", hint: "Not important · Urgent", importance: "low", urgency: "high" },
  { key: "later", label: "Later", hint: "Not important · Not urgent", importance: "low", urgency: "low" },
];

export function PlanningPage({
  tasks,
  projects,
  selectedTaskId,
  view,
  onChangeView,
  onOpenTask,
  onUpdateStatus,
  onUpdateTask,
  onCreateTask,
}: PlanningPageProps) {
  const active = tasks.filter(isActiveTask);

  return (
    <div className="ff-page">
      <header className="ff-page-head">
        <div>
          <h1 className="ff-page-title">Planning</h1>
          <p className="ff-page-sub">Prioritize, schedule, and keep work moving.</p>
        </div>
      </header>

      <SegmentedTabs
        tabs={[["board", "Board"], ["matrix", "Matrix"]]}
        active={view}
        onChange={onChangeView}
      />

      {view === "board" ? (
        <div className="ff-board">
          {BOARD_COLUMNS.map((col) => {
            const colTasks = active.filter((t) => t.status === col.status);
            return (
              <BoardColumn
                key={col.status}
                label={col.label}
                count={colTasks.length}
                onDropTask={(taskId) => onUpdateStatus(taskId, col.status)}
                onAdd={(title) => onCreateTask({ title, status: col.status })}
              >
                {colTasks.map((task) => (
                  <BoardCard
                    key={task.id}
                    task={task}
                    project={projects.find((p) => p.id === task.projectId)}
                    selected={task.id === selectedTaskId}
                    onOpen={() => onOpenTask(task.id)}
                    moveMenu={BOARD_COLUMNS.filter((c) => c.status !== task.status).map((c) => ({
                      label: `Move to ${c.label}`,
                      onClick: () => onUpdateStatus(task.id, c.status),
                    }))}
                  />
                ))}
              </BoardColumn>
            );
          })}
        </div>
      ) : (
        <div className="ff-matrix">
          {QUADRANTS.map((q) => {
            const qTasks = active.filter(
              (t) => t.importance === q.importance && t.urgency === q.urgency && t.status !== "done",
            );
            return (
              <MatrixCell
                key={q.key}
                label={q.label}
                hint={q.hint}
                count={qTasks.length}
                onDropTask={(taskId) => onUpdateTask(taskId, { importance: q.importance, urgency: q.urgency })}
                onAdd={(title) => onCreateTask({ title, status: "todo", importance: q.importance, urgency: q.urgency })}
              >
                {qTasks.map((task) => (
                  <BoardCard
                    key={task.id}
                    task={task}
                    project={projects.find((p) => p.id === task.projectId)}
                    selected={task.id === selectedTaskId}
                    onOpen={() => onOpenTask(task.id)}
                    moveMenu={QUADRANTS.filter((other) => other.key !== q.key).map((other) => ({
                      label: `Move to ${other.label}`,
                      onClick: () => onUpdateTask(task.id, { importance: other.importance, urgency: other.urgency }),
                    }))}
                  />
                ))}
              </MatrixCell>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BoardColumn({
  label,
  count,
  children,
  onDropTask,
  onAdd,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
  onDropTask: (taskId: string) => void;
  onAdd: (title: string) => void;
}) {
  const [over, setOver] = useState(false);
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");

  return (
    <section
      className={`ff-board-col${over ? " is-over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/task");
        if (id) onDropTask(id);
      }}
    >
      <header className="ff-board-col-head">
        <strong>{label}</strong>
        <span className="ff-board-count">{count}</span>
      </header>
      <div className="ff-board-col-body">{children}</div>
      {adding ? (
        <input
          className="ff-board-add-input"
          autoFocus
          placeholder="Task title..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) { onAdd(value.trim()); setValue(""); setAdding(false); }
            if (e.key === "Escape") { setValue(""); setAdding(false); }
          }}
          onBlur={() => { if (value.trim()) onAdd(value.trim()); setValue(""); setAdding(false); }}
        />
      ) : (
        <button type="button" className="ff-board-add" onClick={() => setAdding(true)}>+ Add Task</button>
      )}
    </section>
  );
}

function MatrixCell({
  label,
  hint,
  count,
  children,
  onDropTask,
  onAdd,
}: {
  label: string;
  hint: string;
  count: number;
  children: React.ReactNode;
  onDropTask: (taskId: string) => void;
  onAdd: (title: string) => void;
}) {
  const [over, setOver] = useState(false);
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  return (
    <section
      className={`ff-matrix-cell${over ? " is-over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/task");
        if (id) onDropTask(id);
      }}
    >
      <header className="ff-matrix-head">
        <div>
          <strong>{label}</strong>
          <small>{hint}</small>
        </div>
        <span className="ff-board-count">{count}</span>
      </header>
      <div className="ff-matrix-body">{children}</div>
      {adding ? (
        <input
          className="ff-board-add-input"
          autoFocus
          value={value}
          placeholder="Task title..."
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) { onAdd(value.trim()); setValue(""); setAdding(false); }
            if (e.key === "Escape") { setValue(""); setAdding(false); }
          }}
          onBlur={() => { if (value.trim()) onAdd(value.trim()); setValue(""); setAdding(false); }}
        />
      ) : (
        <button type="button" className="ff-board-add" onClick={() => setAdding(true)}>+ Add Task</button>
      )}
    </section>
  );
}

function BoardCard({
  task,
  project,
  selected,
  onOpen,
  moveMenu,
}: {
  task: Task;
  project?: Project;
  selected: boolean;
  onOpen: () => void;
  moveMenu: { label: string; onClick: () => void }[];
}) {
  const priorityTone =
    task.priority === "high" ? "danger" : task.priority === "medium" ? "warning" : task.priority === "low" ? "success" : "muted";
  return (
    <article
      className={`ff-board-card${selected ? " is-selected" : ""}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/task", task.id)}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
    >
      <div className="ff-board-card-top">
        <span className="ff-board-card-title">{task.title}</span>
        <MoreMenu items={moveMenu} />
      </div>
      <div className="ff-board-card-meta">
        {project ? <span className="ff-projbadge"><span className="ff-dot" style={{ background: project.color }} />{project.name}</span> : null}
        {task.priority !== "none" ? <span className={`ff-badge ff-badge-${priorityTone}`}>{task.priority}</span> : null}
        {task.dueDate ? <span className="ff-pill ff-pill-muted">{task.dueDate.slice(5)}</span> : null}
      </div>
    </article>
  );
}
