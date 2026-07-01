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
import { useT } from "../i18n";

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

  const { t, lang } = useT();
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
    { label: t("common.open"), onClick: () => onOpenTask(task.id) },
    ...(onViewInCalendar ? [{ label: t("today.viewInCalendar"), onClick: () => onViewInCalendar(task.id) }] : []),
    { label: t("common.duplicate"), onClick: () => onDuplicateTask(task.id) },
    { separator: true },
    { label: t("common.archive"), onClick: () => onArchiveTask(task.id) },
    { label: t("common.delete"), danger: true, onClick: () => onRequestDelete(task.id) },
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
    { label: t("today.startFocus"), onClick: () => { onUpdateStatus(task.id, "doing"); onOpenTask(task.id); showToast({ message: t("today.focusStarted") }); } },
    { label: t("today.removeFromFocus"), onClick: () => onSetFocus(task.id, false) },
    { label: t("today.moveToWaiting"), onClick: () => setWaitingFor(task) },
  ];
  const dueMore = (task: Task) => [
    { label: t("today.snoozeToTomorrow"), onClick: () => { onSnooze(task.id); showToast({ message: t("today.snoozedToTomorrow"), actionLabel: t("app.undo"), onAction: () => onUpdateTask(task.id, { scheduledDate: task.scheduledDate }) }); } },
    { label: t("today.moveToFocus"), onClick: () => onSetFocus(task.id, true) },
    { label: t("today.moveToWaiting"), onClick: () => setWaitingFor(task) },
  ];
  const progressMore = (task: Task) => [
    { label: t("today.pauseToDo"), onClick: () => onUpdateStatus(task.id, "todo") },
    { label: t("today.moveToWaiting"), onClick: () => setWaitingFor(task) },
  ];
  const waitingMore = (task: Task) => [
    { label: t("today.resumeToDo"), onClick: () => onUpdateStatus(task.id, "todo") },
    { label: t("today.resumeDoing"), onClick: () => onUpdateStatus(task.id, "doing") },
  ];
  const overdueMore = (task: Task) => [
    { label: t("today.moveToToday"), onClick: () => onUpdateTask(task.id, { dueDate: today }) },
    { label: t("today.snoozeToTomorrow"), onClick: () => onSnooze(task.id) },
  ];

  const hasOverdue = buckets.overdue.length > 0;

  return (
    <div className="ff-page">
      <header className="ff-page-head">
        <div>
          <h1 className="ff-page-title">{t("today.title")}</h1>
          <p className="ff-page-date">{getDayLabel(today, lang)}</p>
          <p className="ff-page-sub">{t("today.subtitle")}</p>
        </div>
        <div className="ff-page-actions">
          <button type="button" className="ff-btn" onClick={() => setStartDayOpen(true)}>
            ▶ {t("today.startDay")}
          </button>
          <button type="button" className="ff-btn ff-btn-primary" onClick={() => setStartDayOpen(true)}>
            + {t("today.addTask")}
          </button>
          <button type="button" className="ff-icon-btn ff-icon-btn-bordered" onClick={() => setEndDayOpen(true)}>
            ⋯
          </button>
        </div>
      </header>

      <TodaySection
        title={t("today.focus")}
        icon="🎯"
        tone="purple"
        count={buckets.focus.length}
        emptyText={t("today.focusEmpty")}
        onAdd={(title) => onCreateTask({ title, status: "todo", isFocus: true, scheduledDate: today })}
      >
        {buckets.focus.map((task) => rowFor(task, { dateField: "scheduledDate", extraMore: focusMore(task) }))}
      </TodaySection>

      <TodaySection
        title={t("today.dueToday")}
        icon="📅"
        tone="warning"
        count={buckets.dueToday.length}
        emptyText={t("today.dueTodayEmpty")}
        onAdd={(title) => onCreateTask({ title, status: "todo", dueDate: today })}
      >
        {buckets.dueToday.map((task) => rowFor(task, { dateField: "dueDate", extraMore: dueMore(task) }))}
      </TodaySection>

      <TodaySection
        title={t("today.scheduledToday")}
        icon="🗓"
        tone="accent"
        count={buckets.scheduledToday.length}
        emptyText={t("today.scheduledTodayEmpty")}
        onAdd={(title) => onCreateTask({ title, status: "todo", scheduledDate: today })}
      >
        {buckets.scheduledToday.map((task) => rowFor(task, { dateField: "scheduledDate", extraMore: dueMore(task) }))}
      </TodaySection>

      <TodaySection
        title={t("today.inProgress")}
        icon="▶"
        tone="success"
        count={buckets.inProgress.length}
        emptyText={t("today.inProgressEmpty")}
        onAdd={(title) => onCreateTask({ title, status: "doing", scheduledDate: today })}
      >
        {buckets.inProgress.map((task) => rowFor(task, { extraMore: progressMore(task) }))}
      </TodaySection>

      <TodaySection
        title={t("today.waiting")}
        icon="⏳"
        tone="purple"
        count={buckets.waiting.length}
        emptyText={t("today.waitingEmpty")}
      >
        {buckets.waiting.map((task) =>
          rowFor(task, {
            extraMore: waitingMore(task),
            meta: task.waitingReason ? <span className="ff-ago">⏳ {task.waitingReason}</span> : undefined,
          }),
        )}
      </TodaySection>

      {hasOverdue ? (
        <TodaySection title={t("today.overdue")} icon="⚠" tone="danger" count={buckets.overdue.length} emptyText="">
          {buckets.overdue.map((task) => rowFor(task, { dateField: "dueDate", extraMore: overdueMore(task) }))}
        </TodaySection>
      ) : null}

      {showCompleted ? (
        <TodaySection
          title={t("today.doneToday")}
          icon="✓"
          tone="muted"
          count={buckets.doneToday.length}
          emptyText={t("today.doneTodayEmpty")}
          headerAction={
            buckets.doneToday.length > 0 ? (
              <button type="button" className="ff-link" onClick={() => setClearDoneConfirm(true)}>
                {t("today.clear")}
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
            showToast({ message: t("today.moveToWaitingTitle") });
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
          title={t("today.endDayReviewTitle")}
          onClose={() => setEndDayOpen(false)}
          footer={<button className="ff-btn ff-btn-primary" onClick={() => setEndDayOpen(false)}>{t("common.done")}</button>}
        >
          <p className="ff-page-sub" style={{ margin: 0 }}>
            {t("today.completedTodaySummary", { n: buckets.doneToday.length })}
          </p>
          {buckets.waiting.length > 0 ? (
            <p className="ff-page-sub" style={{ margin: 0 }}>
              {t("today.stillWaitingSummary", { n: buckets.waiting.length })}
            </p>
          ) : null}
          {hasOverdue ? (
            <p className="ff-page-sub" style={{ margin: 0, color: "var(--danger)" }}>
              {t("today.overdueSummary", { n: buckets.overdue.length })}
            </p>
          ) : null}
        </Modal>
      ) : null}

      {clearDoneConfirm ? (
        <ConfirmModal
          title={t("today.clearDoneTitle")}
          body={t("today.clearDoneBody")}
          confirmLabel={t("today.clear")}
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
  const { t } = useT();
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
                  placeholder={t("today.addTaskPlaceholder")}
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
                {t("today.addTaskInline")}
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
  const { t } = useT();
  const ref = useAutoFocus<HTMLInputElement>();
  const [reason, setReason] = useState(task.waitingReason ?? "");
  const [follow, setFollow] = useState(task.waitingFollowUpDate ?? "");
  return (
    <Modal
      title={t("today.moveToWaitingTitle")}
      onClose={onClose}
      footer={
        <>
          <button className="ff-btn" onClick={onClose}>{t("common.cancel")}</button>
          <button className="ff-btn ff-btn-primary" onClick={() => onSave(reason, follow)}>{t("common.save")}</button>
        </>
      }
    >
      <div className="ff-form">
        <label>
          {t("today.waitingReasonLabel")}
          <input ref={ref} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("today.waitingReasonPlaceholder")} />
        </label>
        <label>
          {t("today.followUpDateLabel")}
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
  const { t } = useT();
  const today = todayValue();
  const [title, setTitle] = useState("");
  const candidates = [...buckets.dueToday, ...buckets.scheduledToday];

  return (
    <Modal title={t("today.startDayTitle")} onClose={onClose} footer={<button className="ff-btn ff-btn-primary" onClick={onClose}>{t("common.letsGo")}</button>}>
      <div className="ff-form">
        <label>
          {t("today.addFocusLabel")}
          <div className="ff-inline-add" style={{ marginTop: 4 }}>
            <input
              value={title}
              placeholder={t("today.addFocusPlaceholder")}
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
          <p className="ff-section-title" style={{ marginTop: 8 }}>{t("today.promoteToFocus")}</p>
          <div className="ff-task-list ff-task-list-flat">
            {candidates.slice(0, 6).map((task) => {
              const project = projects.find((p) => p.id === task.projectId);
              return (
                <div key={task.id} className="ff-task-row" style={{ cursor: "default" }}>
                  <div className="ff-task-main">
                    <span className="ff-task-title">{task.title}</span>
                    {project ? <span className="ff-projbadge"><span className="ff-dot" style={{ background: project.color }} />{project.name}</span> : null}
                  </div>
                  <button className="ff-btn ff-btn-sm" onClick={() => onSetFocus(task.id, true)}>{t("today.focusStar")}</button>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <EmptyState icon="🌅" title={t("today.noTasksScheduled")} text={t("today.noTasksScheduledHint")} />
      )}
    </Modal>
  );
}
