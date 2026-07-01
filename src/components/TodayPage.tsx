import { ReactNode, useMemo, useState } from "react";
import type { Project, Subtask, Task, TaskDraft, TaskStatus } from "../types";
import { getDayLabel, todayValue } from "../utils/date";
import { getTodayBuckets } from "../utils/planner";
import {
  ConfirmModal,
  EmptyState,
  Modal,
  TaskRow,
  ToastState,
  useAutoFocus,
} from "./kit";

interface TodayPageProps {
  tasks: Task[];
  projects: Project[];
  subtasks: Subtask[];
  selectedTaskId: string;
  showCompleted: boolean;
  onOpenTask: (id: string) => void;
  onToggleDone: (id: string) => void;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onCreateTask: (draft: TaskDraft) => string;
  onUpdateStatus: (id: string, status: TaskStatus) => void;
  onSnooze: (id: string) => void;
  onMoveToWaiting: (id: string, reason: string, followUp: string) => void;
  onSetFocus: (id: string, value: boolean) => void;
  onArchiveTask: (id: string) => void;
  onDuplicateTask: (id: string) => void;
  onRequestDelete: (id: string) => void;
  showToast: (toast: ToastState) => void;
  onViewInCalendar?: (taskId: string) => void;
}

export function TodayPage(props: TodayPageProps) {
  const {
    tasks,
    projects,
    subtasks,
    selectedTaskId,
    showCompleted,
    onOpenTask,
    onToggleDone,
    onUpdateTask,
    onCreateTask,
    onUpdateStatus,
    onSnooze,
    onMoveToWaiting,
    onSetFocus,
    onArchiveTask,
    onDuplicateTask,
    onRequestDelete,
    showToast,
    onViewInCalendar,
  } = props;

  const today = todayValue();
  const [waitingFor, setWaitingFor] = useState<Task | null>(null);
  const [startDayOpen, setStartDayOpen] = useState(false);
  const [endDayOpen, setEndDayOpen] = useState(false);
  const [clearDoneConfirm, setClearDoneConfirm] = useState(false);
  const [hideDone, setHideDone] = useState(false);

  const buckets = useMemo(() => getTodayBuckets(tasks, today), [tasks, today]);

  function subProgress(taskId: string) {
    const subs = subtasks.filter((s) => s.taskId === taskId);
    return { done: subs.filter((s) => s.completed).length, total: subs.length };
  }

  const baseMore = (task: Task) => [
    { label: "Open", onClick: () => onOpenTask(task.id) },
    ...(onViewInCalendar ? [{ label: "View in Calendar", onClick: () => onViewInCalendar(task.id) }] : []),
    { label: "Duplicate", onClick: () => onDuplicateTask(task.id) },
    { separator: true },
    { label: "Archive", onClick: () => onArchiveTask(task.id) },
    { label: "Delete", danger: true, onClick: () => onRequestDelete(task.id) },
  ];

  function rowFor(task: Task, opts: {
    dateField?: "dueDate" | "scheduledDate";
    extraMore?: { label: string; onClick: () => void }[];
    meta?: ReactNode;
  } = {}) {
    return (
      <TaskRow
        key={task.id}
        task={task}
        projects={projects}
        subtaskProgress={subProgress(task.id)}
        selected={task.id === selectedTaskId}
        dateField={opts.dateField ?? "dueDate"}
        onOpen={onOpenTask}
        onToggleDone={onToggleDone}
        onUpdate={onUpdateTask}
        metaSlot={opts.meta}
        moreItems={[...(opts.extraMore ?? []), ...(opts.extraMore?.length ? [{ separator: true }] : []), ...baseMore(task)]}
      />
    );
  }

  const focusMore = (task: Task) => [
    { label: "Start Focus", onClick: () => { onUpdateStatus(task.id, "doing"); onOpenTask(task.id); showToast({ message: "Focus started" }); } },
    { label: "Remove from Focus", onClick: () => onSetFocus(task.id, false) },
    { label: "Move to Waiting", onClick: () => setWaitingFor(task) },
  ];
  const dueMore = (task: Task) => [
    { label: "Snooze to tomorrow", onClick: () => { onSnooze(task.id); showToast({ message: "Snoozed to tomorrow", actionLabel: "Undo", onAction: () => onUpdateTask(task.id, { scheduledDate: task.scheduledDate }) }); } },
    { label: "Move to Focus", onClick: () => onSetFocus(task.id, true) },
    { label: "Move to Waiting", onClick: () => setWaitingFor(task) },
  ];
  const progressMore = (task: Task) => [
    { label: "Pause (To Do)", onClick: () => onUpdateStatus(task.id, "todo") },
    { label: "Move to Waiting", onClick: () => setWaitingFor(task) },
  ];
  const waitingMore = (task: Task) => [
    { label: "Resume (To Do)", onClick: () => onUpdateStatus(task.id, "todo") },
    { label: "Resume (Doing)", onClick: () => onUpdateStatus(task.id, "doing") },
  ];
  const overdueMore = (task: Task) => [
    { label: "Move to Today", onClick: () => onUpdateTask(task.id, { dueDate: today }) },
    { label: "Snooze to tomorrow", onClick: () => onSnooze(task.id) },
  ];

  const hasOverdue = buckets.overdue.length > 0;

  return (
    <div className="ff-page">
      <header className="ff-page-head">
        <div>
          <h1 className="ff-page-title">Today</h1>
          <p className="ff-page-date">{getDayLabel(today)}</p>
          <p className="ff-page-sub">Focus on what matters today.</p>
        </div>
        <div className="ff-page-actions">
          <button type="button" className="ff-btn" onClick={() => setStartDayOpen(true)}>
            ▶ Start Day
          </button>
          <button type="button" className="ff-btn ff-btn-primary" onClick={() => setStartDayOpen(true)}>
            + Add Task
          </button>
          <button type="button" className="ff-icon-btn ff-icon-btn-bordered" onClick={() => setEndDayOpen(true)}>
            ⋯
          </button>
        </div>
      </header>

      <TodaySection
        title="Focus"
        icon="🎯"
        tone="purple"
        count={buckets.focus.length}
        emptyText="Pick one high-priority task for today."
        onAdd={(title) => onCreateTask({ title, status: "todo", isFocus: true, scheduledDate: today })}
      >
        {buckets.focus.map((task) => rowFor(task, { dateField: "scheduledDate", extraMore: focusMore(task) }))}
      </TodaySection>

      <TodaySection
        title="Due Today"
        icon="📅"
        tone="warning"
        count={buckets.dueToday.length}
        emptyText="Nothing due today."
        onAdd={(title) => onCreateTask({ title, status: "todo", dueDate: today })}
      >
        {buckets.dueToday.map((task) => rowFor(task, { dateField: "dueDate", extraMore: dueMore(task) }))}
      </TodaySection>

      <TodaySection
        title="Scheduled Today"
        icon="🗓"
        tone="accent"
        count={buckets.scheduledToday.length}
        emptyText="Nothing planned for today."
        onAdd={(title) => onCreateTask({ title, status: "todo", scheduledDate: today })}
      >
        {buckets.scheduledToday.map((task) => rowFor(task, { dateField: "scheduledDate", extraMore: dueMore(task) }))}
      </TodaySection>

      <TodaySection
        title="In Progress"
        icon="▶"
        tone="success"
        count={buckets.inProgress.length}
        emptyText="No active task yet."
        onAdd={(title) => onCreateTask({ title, status: "doing", scheduledDate: today })}
      >
        {buckets.inProgress.map((task) => rowFor(task, { extraMore: progressMore(task) }))}
      </TodaySection>

      <TodaySection
        title="Waiting"
        icon="⏳"
        tone="purple"
        count={buckets.waiting.length}
        emptyText="No waiting tasks."
      >
        {buckets.waiting.map((task) =>
          rowFor(task, {
            extraMore: waitingMore(task),
            meta: task.waitingReason ? <span className="ff-ago">⏳ {task.waitingReason}</span> : undefined,
          }),
        )}
      </TodaySection>

      {hasOverdue ? (
        <TodaySection title="Overdue" icon="⚠" tone="danger" count={buckets.overdue.length} emptyText="">
          {buckets.overdue.map((task) => rowFor(task, { dateField: "dueDate", extraMore: overdueMore(task) }))}
        </TodaySection>
      ) : null}

      {showCompleted ? (
        <TodaySection
          title="Done Today"
          icon="✓"
          tone="muted"
          count={buckets.doneToday.length}
          emptyText="Completed tasks will land here."
          headerAction={
            buckets.doneToday.length > 0 ? (
              <button type="button" className="ff-link" onClick={() => setClearDoneConfirm(true)}>
                Clear
              </button>
            ) : null
          }
        >
          {!hideDone && buckets.doneToday.map((task) => rowFor(task))}
        </TodaySection>
      ) : null}

      {waitingFor ? (
        <WaitingModal
          task={waitingFor}
          onClose={() => setWaitingFor(null)}
          onSave={(reason, follow) => {
            onMoveToWaiting(waitingFor.id, reason, follow);
            setWaitingFor(null);
            showToast({ message: "Moved to Waiting" });
          }}
        />
      ) : null}

      {startDayOpen ? (
        <StartDayModal
          buckets={buckets}
          projects={projects}
          onClose={() => setStartDayOpen(false)}
          onCreateTask={onCreateTask}
          onSetFocus={onSetFocus}
        />
      ) : null}

      {endDayOpen ? (
        <Modal
          title="End Day Review"
          onClose={() => setEndDayOpen(false)}
          footer={<button className="ff-btn ff-btn-primary" onClick={() => setEndDayOpen(false)}>Done</button>}
        >
          <p className="ff-page-sub" style={{ margin: 0 }}>
            You completed <strong>{buckets.doneToday.length}</strong> task(s) today.
          </p>
          {buckets.waiting.length > 0 ? (
            <p className="ff-page-sub" style={{ margin: 0 }}>
              {buckets.waiting.length} task(s) still waiting.
            </p>
          ) : null}
          {hasOverdue ? (
            <p className="ff-page-sub" style={{ margin: 0, color: "var(--danger)" }}>
              {buckets.overdue.length} overdue task(s) to reschedule.
            </p>
          ) : null}
        </Modal>
      ) : null}

      {clearDoneConfirm ? (
        <ConfirmModal
          title="Clear Done Today?"
          body="This only hides completed tasks from Today. It does not delete them."
          confirmLabel="Clear"
          danger={false}
          onCancel={() => setClearDoneConfirm(false)}
          onConfirm={() => { setHideDone(true); setClearDoneConfirm(false); }}
        />
      ) : null}
    </div>
  );
}

function TodaySection({
  title,
  icon,
  tone,
  count,
  emptyText,
  children,
  onAdd,
  headerAction,
}: {
  title: string;
  icon: string;
  tone: string;
  count: number;
  emptyText: string;
  children: ReactNode;
  onAdd?: (title: string) => void;
  headerAction?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const childArray = Array.isArray(children) ? children.flat().filter(Boolean) : children;
  const isEmpty = Array.isArray(childArray) ? childArray.length === 0 : !childArray;

  function submit() {
    const trimmed = value.trim();
    if (trimmed && onAdd) onAdd(trimmed);
    setValue("");
    setAdding(false);
  }

  return (
    <section className={`ff-today-card ff-tone-${tone}`}>
      <header className="ff-today-card-head">
        <button type="button" className="ff-today-card-toggle" onClick={() => setCollapsed((v) => !v)}>
          <span className="ff-today-icon">{icon}</span>
          <strong>{title}</strong>
          <span className="ff-today-count">{count}</span>
          <span className={`ff-chevron${collapsed ? "" : " open"}`}>⌄</span>
        </button>
        {headerAction}
      </header>
      {!collapsed ? (
        <div className="ff-today-card-body">
          {isEmpty ? <p className="ff-today-empty">{emptyText}</p> : <div className="ff-task-list ff-task-list-flat">{children}</div>}
          {onAdd ? (
            adding ? (
              <div className="ff-inline-add">
                <input
                  autoFocus
                  placeholder="Add task..."
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                    if (e.key === "Escape") { setValue(""); setAdding(false); }
                  }}
                  onBlur={submit}
                />
              </div>
            ) : (
              <button type="button" className="ff-inline-add-btn" onClick={() => setAdding(true)}>
                + Add task
              </button>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function WaitingModal({
  task,
  onClose,
  onSave,
}: {
  task: Task;
  onClose: () => void;
  onSave: (reason: string, followUp: string) => void;
}) {
  const ref = useAutoFocus<HTMLInputElement>();
  const [reason, setReason] = useState(task.waitingReason ?? "");
  const [follow, setFollow] = useState(task.waitingFollowUpDate ?? "");
  return (
    <Modal
      title="Move to Waiting"
      onClose={onClose}
      footer={
        <>
          <button className="ff-btn" onClick={onClose}>Cancel</button>
          <button className="ff-btn ff-btn-primary" onClick={() => onSave(reason, follow)}>Save</button>
        </>
      }
    >
      <div className="ff-form">
        <label>
          Waiting reason (optional)
          <input ref={ref} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Waiting for lab data" />
        </label>
        <label>
          Follow-up date (optional)
          <input type="date" value={follow} onChange={(e) => setFollow(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}

function StartDayModal({
  buckets,
  projects,
  onClose,
  onCreateTask,
  onSetFocus,
}: {
  buckets: ReturnType<typeof getTodayBuckets>;
  projects: Project[];
  onClose: () => void;
  onCreateTask: (draft: TaskDraft) => string;
  onSetFocus: (id: string, value: boolean) => void;
}) {
  const today = todayValue();
  const [title, setTitle] = useState("");
  const candidates = [...buckets.dueToday, ...buckets.scheduledToday];

  return (
    <Modal title="Start Day" onClose={onClose} footer={<button className="ff-btn ff-btn-primary" onClick={onClose}>Let's go</button>}>
      <div className="ff-form">
        <label>
          Add a focus task for today
          <div className="ff-inline-add" style={{ marginTop: 4 }}>
            <input
              value={title}
              placeholder="What's the one thing today?"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && title.trim()) {
                  onCreateTask({ title: title.trim(), status: "todo", isFocus: true, scheduledDate: today });
                  setTitle("");
                }
              }}
            />
          </div>
        </label>
      </div>
      {candidates.length > 0 ? (
        <>
          <p className="ff-section-title" style={{ marginTop: 8 }}>Promote to Focus</p>
          <div className="ff-task-list ff-task-list-flat">
            {candidates.slice(0, 6).map((task) => {
              const project = projects.find((p) => p.id === task.projectId);
              return (
                <div key={task.id} className="ff-task-row" style={{ cursor: "default" }}>
                  <div className="ff-task-main">
                    <span className="ff-task-title">{task.title}</span>
                    {project ? <span className="ff-projbadge"><span className="ff-dot" style={{ background: project.color }} />{project.name}</span> : null}
                  </div>
                  <button className="ff-btn ff-btn-sm" onClick={() => onSetFocus(task.id, true)}>★ Focus</button>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <EmptyState icon="🌅" title="No tasks scheduled" text="Add a focus task above to begin your day." />
      )}
    </Modal>
  );
}
