import { useMemo, useState } from "react";
import type { Project, Subtask, Task, TaskDraft, TaskPriority } from "../types";
import { todayValue } from "../utils/date";
import {
  ConfirmModal,
  EmptyState,
  Modal,
  Popover,
  PriorityBadge,
  TaskRow,
  ToastState,
  useAutoFocus,
} from "./kit";

interface InboxPageProps {
  tasks: Task[];
  projects: Project[];
  subtasks: Subtask[];
  selectedTaskId: string;
  onOpenTask: (id: string) => void;
  onToggleDone: (id: string) => void;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onCreateTask: (draft: TaskDraft) => string;
  onArchiveTask: (id: string) => void;
  onDuplicateTask: (id: string) => void;
  onRequestDelete: (id: string) => void;
  showToast: (toast: ToastState) => void;
}

type NeedsFilter = "all" | "date" | "project" | "priority";

export function InboxPage({
  tasks,
  projects,
  subtasks,
  selectedTaskId,
  onOpenTask,
  onToggleDone,
  onUpdateTask,
  onCreateTask,
  onArchiveTask,
  onDuplicateTask,
  onRequestDelete,
  showToast,
}: InboxPageProps) {
  const [filter, setFilter] = useState<NeedsFilter>("all");
  const [cleanupOpen, setCleanupOpen] = useState(false);

  const inboxTasks = useMemo(
    () => tasks.filter((task) => task.status === "inbox" && !task.deletedAt),
    [tasks],
  );

  const needsDate = inboxTasks.filter((task) => !task.dueDate && !task.scheduledDate);
  const needsProject = inboxTasks.filter((task) => !task.projectId);
  const needsPriority = inboxTasks.filter((task) => task.priority === "none");

  const filtered = useMemo(() => {
    if (filter === "date") return needsDate;
    if (filter === "project") return needsProject;
    if (filter === "priority") return needsPriority;
    return inboxTasks;
  }, [filter, inboxTasks, needsDate, needsProject, needsPriority]);

  const recentlyAdded = useMemo(
    () =>
      [...tasks]
        .filter((task) => !task.deletedAt && task.status !== "archived")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 4),
    [tasks],
  );

  function subProgress(taskId: string) {
    const subs = subtasks.filter((s) => s.taskId === taskId);
    return { done: subs.filter((s) => s.completed).length, total: subs.length };
  }

  function moreItems(task: Task) {
    return [
      { label: "Edit", onClick: () => onOpenTask(task.id) },
      { label: "Duplicate", onClick: () => onDuplicateTask(task.id) },
      { separator: true },
      { label: "Archive", onClick: () => onArchiveTask(task.id) },
      { label: "Delete", danger: true, onClick: () => onRequestDelete(task.id) },
    ];
  }

  function handleAdd(draft: TaskDraft) {
    const id = onCreateTask({ ...draft, status: "inbox" });
    if (id) {
      showToast({ message: "Added to Inbox", actionLabel: "Edit", onAction: () => onOpenTask(id) });
    }
  }

  return (
    <div className="ff-page">
      <header className="ff-page-head">
        <div>
          <h1 className="ff-page-title">Inbox</h1>
          <p className="ff-page-sub">Capture tasks quickly. Organize them when you are ready.</p>
        </div>
        <div className="ff-page-actions">
          <button
            type="button"
            className="ff-btn ff-btn-primary"
            onClick={() => document.querySelector<HTMLInputElement>(".ff-quickadd input")?.focus()}
          >
            + Add Task
          </button>
          <button type="button" className="ff-icon-btn ff-icon-btn-bordered" onClick={() => setCleanupOpen(true)}>
            ⋯
          </button>
        </div>
      </header>

      <QuickAddBar projects={projects} onAdd={handleAdd} />

      <section className="ff-section">
        <h2 className="ff-section-title">Needs attention</h2>
        <div className="ff-attention-grid">
          <AttentionCard
            tone="accent"
            icon="📅"
            label="Needs Date"
            count={needsDate.length}
            hint="Tasks missing a date"
            active={filter === "date"}
            onClick={() => setFilter(filter === "date" ? "all" : "date")}
          />
          <AttentionCard
            tone="warning"
            icon="📁"
            label="Needs Project"
            count={needsProject.length}
            hint="Tasks not assigned to a project"
            active={filter === "project"}
            onClick={() => setFilter(filter === "project" ? "all" : "project")}
          />
          <AttentionCard
            tone="purple"
            icon="🏳"
            label="Needs Priority"
            count={needsPriority.length}
            hint="Tasks with no priority"
            active={filter === "priority"}
            onClick={() => setFilter(filter === "priority" ? "all" : "priority")}
          />
        </div>
      </section>

      <section className="ff-section">
        <div className="ff-section-head">
          <h2 className="ff-section-title">Unsorted Tasks</h2>
          {filter !== "all" ? (
            <button type="button" className="ff-link" onClick={() => setFilter("all")}>
              Clear filter
            </button>
          ) : (
            <button type="button" className="ff-link" onClick={() => setCleanupOpen(true)}>
              Clean Up
            </button>
          )}
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            icon="📥"
            title="Inbox is clear"
            text="Nothing waiting to be organized. Capture new tasks whenever they come up."
          />
        ) : (
          <div className="ff-task-list">
            {filtered.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                projects={projects}
                subtaskProgress={subProgress(task.id)}
                selected={task.id === selectedTaskId}
                onOpen={onOpenTask}
                onToggleDone={onToggleDone}
                onUpdate={onUpdateTask}
                moreItems={moreItems(task)}
                rightSlot={<span className="ff-loc">📥 Inbox</span>}
              />
            ))}
          </div>
        )}
      </section>

      {recentlyAdded.length > 0 ? (
        <section className="ff-section">
          <h2 className="ff-section-title">Recently Added</h2>
          <div className="ff-task-list">
            {recentlyAdded.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                projects={projects}
                selected={task.id === selectedTaskId}
                onOpen={onOpenTask}
                onToggleDone={onToggleDone}
                onUpdate={onUpdateTask}
                metaSlot={<span className="ff-ago">{relativeTime(task.createdAt)}</span>}
              />
            ))}
          </div>
        </section>
      ) : null}

      {cleanupOpen ? (
        <CleanUpFlow
          tasks={inboxTasks.filter(
            (task) => !task.projectId || (!task.dueDate && !task.scheduledDate) || task.priority === "none",
          )}
          projects={projects}
          onUpdateTask={onUpdateTask}
          onClose={() => setCleanupOpen(false)}
          onDone={() => {
            setCleanupOpen(false);
            showToast({ message: "Inbox cleaned up" });
          }}
        />
      ) : null}
    </div>
  );
}

function AttentionCard({
  tone,
  icon,
  label,
  count,
  hint,
  active,
  onClick,
}: {
  tone: string;
  icon: string;
  label: string;
  count: number;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`ff-attention ff-attention-${tone}${active ? " active" : ""}`} onClick={onClick}>
      <span className="ff-attention-icon">{icon}</span>
      <span className="ff-attention-body">
        <span className="ff-attention-top">
          <strong>{label}</strong>
          <span className="ff-attention-count">{count}</span>
        </span>
        <span className="ff-attention-hint">{hint}</span>
      </span>
      <span className="ff-attention-arrow">›</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Quick Add bar (spec §0.5.2)
// ---------------------------------------------------------------------------
function QuickAddBar({ projects, onAdd }: { projects: Project[]; onAdd: (draft: TaskDraft) => void }) {
  const [title, setTitle] = useState("");
  const [scheduledToday, setScheduledToday] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [projOpen, setProjOpen] = useState(false);
  const [error, setError] = useState(false);

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError(true);
      return;
    }
    onAdd({
      title: trimmed,
      scheduledDate: scheduledToday ? todayValue() : undefined,
      projectId: projectId || undefined,
      priority,
    });
    setTitle("");
    setScheduledToday(false);
    setProjectId("");
    setPriority("none");
    setError(false);
  }

  const selectedProject = projects.find((p) => p.id === projectId);

  return (
    <div className={`ff-quickadd${error ? " has-error" : ""}`}>
      <span className="ff-quickadd-check" />
      <input
        placeholder="Add a task..."
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (error) setError(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      <div className="ff-quickadd-chips">
        <button
          type="button"
          className={scheduledToday ? "ff-chip active" : "ff-chip"}
          onClick={() => setScheduledToday((v) => !v)}
        >
          📅 Today
        </button>
        <div className="ff-anchor">
          <button type="button" className={projectId ? "ff-chip active" : "ff-chip"} onClick={() => setProjOpen((v) => !v)}>
            📁 {selectedProject ? selectedProject.name : "Project"}
          </button>
          <Popover open={projOpen} onClose={() => setProjOpen(false)}>
            <button type="button" className="ff-menu-item" onClick={() => { setProjectId(""); setProjOpen(false); }}>
              No project
            </button>
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                className="ff-menu-item"
                onClick={() => { setProjectId(p.id); setProjOpen(false); }}
              >
                <span className="ff-dot" style={{ backgroundColor: p.color }} />
                {p.name}
              </button>
            ))}
          </Popover>
        </div>
        <PriorityBadge priority={priority} onChange={setPriority} />
      </div>
      <button type="button" className="ff-btn ff-btn-primary ff-quickadd-add" onClick={submit}>
        Add
      </button>
      {error ? <span className="ff-quickadd-error">Task title is required</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clean Up flow (spec §0.5.3)
// ---------------------------------------------------------------------------
function CleanUpFlow({
  tasks,
  projects,
  onUpdateTask,
  onClose,
  onDone,
}: {
  tasks: Task[];
  projects: Project[];
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [confirmClose, setConfirmClose] = useState(false);
  const firstRef = useAutoFocus<HTMLSelectElement>();
  const task = tasks[index];

  const [projectId, setProjectId] = useState(task?.projectId ?? "");
  const [date, setDate] = useState(task?.scheduledDate || task?.dueDate || "");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "none");
  const [status, setStatus] = useState<Task["status"]>(task?.status ?? "inbox");
  const [dirty, setDirty] = useState(false);

  if (!task) {
    return (
      <Modal title="Clean up Inbox" onClose={onClose} footer={<button className="ff-btn ff-btn-primary" onClick={onDone}>Done</button>}>
        <EmptyState icon="✨" title="Nothing to clean up" text="Every inbox task already has a project, date, and priority." />
      </Modal>
    );
  }

  function loadTask(next: Task | undefined) {
    setProjectId(next?.projectId ?? "");
    setDate(next?.scheduledDate || next?.dueDate || "");
    setPriority(next?.priority ?? "none");
    setStatus(next?.status ?? "inbox");
    setDirty(false);
  }

  function goNext() {
    if (index + 1 >= tasks.length) {
      onDone();
      return;
    }
    const next = tasks[index + 1];
    setIndex(index + 1);
    loadTask(next);
  }

  function saveAndNext() {
    onUpdateTask(task.id, {
      projectId,
      scheduledDate: date,
      priority,
      status: status === "inbox" ? "todo" : status,
    });
    goNext();
  }

  function requestClose() {
    if (dirty) {
      setConfirmClose(true);
    } else {
      onClose();
    }
  }

  return (
    <>
      <Modal
        title="Clean up Inbox"
        onClose={requestClose}
        footer={
          <>
            <button type="button" className="ff-btn" onClick={goNext}>
              Skip
            </button>
            <button type="button" className="ff-btn ff-btn-primary" onClick={saveAndNext}>
              {index + 1 >= tasks.length ? "Save & Done" : "Save & Next"}
            </button>
          </>
        }
      >
        <p className="ff-cleanup-progress">
          {index + 1} of {tasks.length}
        </p>
        <div className="ff-cleanup-card">
          <strong>{task.title}</strong>
          {task.description ? <p>{task.description}</p> : null}
        </div>
        <div className="ff-form-grid">
          <label>
            Project
            <select
              ref={firstRef}
              value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setDirty(true); }}
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setDirty(true); }} />
          </label>
          <label>
            Priority
            <select value={priority} onChange={(e) => { setPriority(e.target.value as TaskPriority); setDirty(true); }}>
              <option value="none">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => { setStatus(e.target.value as Task["status"]); setDirty(true); }}>
              <option value="inbox">Inbox</option>
              <option value="todo">To Do</option>
              <option value="doing">Doing</option>
              <option value="waiting">Waiting</option>
            </select>
          </label>
        </div>
      </Modal>
      {confirmClose ? (
        <ConfirmModal
          title="Discard unsaved changes?"
          body="This task has unsaved changes. Close anyway?"
          confirmLabel="Discard"
          onCancel={() => setConfirmClose(false)}
          onConfirm={() => { setConfirmClose(false); onClose(); }}
        />
      ) : null}
    </>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
