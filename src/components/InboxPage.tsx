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
import { useT } from "../i18n";

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
  const { t } = useT();
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
      { label: t("common.edit"), onClick: () => onOpenTask(task.id) },
      { label: t("common.duplicate"), onClick: () => onDuplicateTask(task.id) },
      { separator: true },
      { label: t("common.archive"), onClick: () => onArchiveTask(task.id) },
      { label: t("common.delete"), danger: true, onClick: () => onRequestDelete(task.id) },
    ];
  }

  function handleAdd(draft: TaskDraft) {
    const id = onCreateTask({ ...draft, status: "inbox" });
    if (id) {
      showToast({ message: t("inbox.addedToInbox"), actionLabel: t("common.edit"), onAction: () => onOpenTask(id) });
    }
  }

  return (
    <div className="ff-page">
      <header className="ff-page-head">
        <div>
          <h1 className="ff-page-title">{t("inbox.title")}</h1>
          <p className="ff-page-sub">{t("inbox.subtitle")}</p>
        </div>
        <div className="ff-page-actions">
          <button
            type="button"
            className="ff-btn ff-btn-primary"
            onClick={() => document.querySelector<HTMLInputElement>(".ff-quickadd input")?.focus()}
          >
            + {t("inbox.addTask")}
          </button>
          <button type="button" className="ff-icon-btn ff-icon-btn-bordered" onClick={() => setCleanupOpen(true)}>
            ⋯
          </button>
        </div>
      </header>

      <QuickAddBar projects={projects} onAdd={handleAdd} />

      <section className="ff-section">
        <h2 className="ff-section-title">{t("inbox.needsAttention")}</h2>
        <div className="ff-attention-grid">
          <AttentionCard
            tone="accent"
            icon="📅"
            label={t("inbox.needsDate")}
            count={needsDate.length}
            hint={t("inbox.needsDateHint")}
            active={filter === "date"}
            onClick={() => setFilter(filter === "date" ? "all" : "date")}
          />
          <AttentionCard
            tone="warning"
            icon="📁"
            label={t("inbox.needsProject")}
            count={needsProject.length}
            hint={t("inbox.needsProjectHint")}
            active={filter === "project"}
            onClick={() => setFilter(filter === "project" ? "all" : "project")}
          />
          <AttentionCard
            tone="purple"
            icon="🏳"
            label={t("inbox.needsPriority")}
            count={needsPriority.length}
            hint={t("inbox.needsPriorityHint")}
            active={filter === "priority"}
            onClick={() => setFilter(filter === "priority" ? "all" : "priority")}
          />
        </div>
      </section>

      <section className="ff-section">
        <div className="ff-section-head">
          <h2 className="ff-section-title">{t("inbox.unsortedTasks")}</h2>
          {filter !== "all" ? (
            <button type="button" className="ff-link" onClick={() => setFilter("all")}>
              {t("inbox.clearFilter")}
            </button>
          ) : (
            <button type="button" className="ff-link" onClick={() => setCleanupOpen(true)}>
              {t("inbox.cleanUp")}
            </button>
          )}
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            icon="📥"
            title={t("inbox.inboxClear")}
            text={t("inbox.inboxClearHint")}
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
                rightSlot={<span className="ff-loc">📥 {t("inbox.inboxBadge")}</span>}
              />
            ))}
          </div>
        )}
      </section>

      {recentlyAdded.length > 0 ? (
        <section className="ff-section">
          <h2 className="ff-section-title">{t("inbox.recentlyAdded")}</h2>
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
                metaSlot={<span className="ff-ago">{relativeTime(task.createdAt, t)}</span>}
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
  const { t } = useT();
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
        placeholder={t("inbox.addTaskPlaceholder")}
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
          📅 {t("common.today")}
        </button>
        <div className="ff-anchor">
          <button type="button" className={projectId ? "ff-chip active" : "ff-chip"} onClick={() => setProjOpen((v) => !v)}>
            📁 {selectedProject ? selectedProject.name : t("common.project")}
          </button>
          <Popover open={projOpen} onClose={() => setProjOpen(false)}>
            <button type="button" className="ff-menu-item" onClick={() => { setProjectId(""); setProjOpen(false); }}>
              {t("common.noProject")}
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
        {t("common.add")}
      </button>
      {error ? <span className="ff-quickadd-error">{t("inbox.titleRequired")}</span> : null}
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
  const { t } = useT();
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
      <Modal title={t("inbox.cleanUpTitle")} onClose={onClose} footer={<button className="ff-btn ff-btn-primary" onClick={onDone}>{t("common.done")}</button>}>
        <EmptyState icon="✨" title={t("inbox.nothingToCleanUp")} text={t("inbox.nothingToCleanUpHint")} />
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
        title={t("inbox.cleanUpTitle")}
        onClose={requestClose}
        footer={
          <>
            <button type="button" className="ff-btn" onClick={goNext}>
              {t("common.skip")}
            </button>
            <button type="button" className="ff-btn ff-btn-primary" onClick={saveAndNext}>
              {index + 1 >= tasks.length ? t("common.saveAndDone") : t("common.saveAndNext")}
            </button>
          </>
        }
      >
        <p className="ff-cleanup-progress">
          {t("inbox.progressLabel", { current: index + 1, total: tasks.length })}
        </p>
        <div className="ff-cleanup-card">
          <strong>{task.title}</strong>
          {task.description ? <p>{task.description}</p> : null}
        </div>
        <div className="ff-form-grid">
          <label>
            {t("common.project")}
            <select
              ref={firstRef}
              value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setDirty(true); }}
            >
              <option value="">{t("common.noProject")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label>
            {t("inbox.date")}
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setDirty(true); }} />
          </label>
          <label>
            {t("common.priority")}
            <select value={priority} onChange={(e) => { setPriority(e.target.value as TaskPriority); setDirty(true); }}>
              <option value="none">{t("priority.none")}</option>
              <option value="low">{t("priority.low")}</option>
              <option value="medium">{t("priority.medium")}</option>
              <option value="high">{t("priority.high")}</option>
            </select>
          </label>
          <label>
            {t("common.status")}
            <select value={status} onChange={(e) => { setStatus(e.target.value as Task["status"]); setDirty(true); }}>
              <option value="inbox">{t("status.inbox")}</option>
              <option value="todo">{t("status.todo")}</option>
              <option value="doing">{t("status.doing")}</option>
              <option value="waiting">{t("status.waiting")}</option>
            </select>
          </label>
        </div>
      </Modal>
      {confirmClose ? (
        <ConfirmModal
          title={t("inbox.discardChangesTitle")}
          body={t("inbox.discardChangesBody")}
          confirmLabel={t("inbox.discard")}
          onCancel={() => setConfirmClose(false)}
          onConfirm={() => { setConfirmClose(false); onClose(); }}
        />
      ) : null}
    </>
  );
}

function relativeTime(iso: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return t("inbox.justNow");
  if (min < 60) return t("inbox.minutesAgo", { n: min });
  const hr = Math.round(min / 60);
  if (hr < 24) return t("inbox.hoursAgo", { n: hr });
  const day = Math.round(hr / 24);
  return t("inbox.daysAgo", { n: day });
}
