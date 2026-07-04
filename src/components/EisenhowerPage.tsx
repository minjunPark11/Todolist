// Eisenhower matrix page (FOCUSFLOW_EISENHOWER_CALENDAR_DRAG_SPEC §3–§6).
// Judgement screen: capture fast, classify by priority x date, then hand
// off to the calendar for time-blocking. The quadrant is derived, never
// stored — dragging a card between quadrants mutates the underlying fields.
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { Project, Task, TaskDraft, TaskPriority } from "../types";
import { todayValue, addDays } from "../utils/date";
import {
  getDraftMatrixPosition,
  getMatrixPosition,
  patchForQuadrant,
  type MatrixGroup,
  type MatrixQuadrant,
} from "../utils/eisenhower";
import { MoreMenu, type MoreMenuItem, type ToastState } from "./kit";
import { useT } from "../i18n";
import { MotionDropZone } from "./motion/MotionDropZone";
import { MotionTaskRow } from "./motion/MotionTaskRow";

const QUADRANTS: MatrixQuadrant[] = ["I", "II", "III", "IV"];
const IV_GROUPS: MatrixGroup[] = ["unclassified", "onHold", "completed"];
const COMPLETED_CAP = 10;

interface EisenhowerPageProps {
  tasks: Task[];
  projects: Project[];
  selectedTaskId: string;
  onOpenTask: (id: string) => void;
  onToggleDone: (id: string) => void;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onCreateTask: (draft: TaskDraft) => string;
  onScheduleInCalendar: (taskId: string) => void;
  showToast: (toast: ToastState) => void;
}

export function EisenhowerPage({
  tasks,
  projects,
  selectedTaskId,
  onOpenTask,
  onToggleDone,
  onUpdateTask,
  onCreateTask,
  onScheduleInCalendar,
  showToast,
}: EisenhowerPageProps) {
  const { t } = useT();
  const today = todayValue();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState("");

  const positioned = useMemo(
    () =>
      tasks
        .filter((task) => !task.deletedAt && task.status !== "archived")
        .map((task) => ({ task, position: getMatrixPosition(task, today) })),
    [tasks, today],
  );

  function tasksFor(quadrant: MatrixQuadrant, group?: MatrixGroup) {
    return positioned
      .filter((entry) => entry.position.quadrant === quadrant && (quadrant !== "IV" || entry.position.group === group))
      .map((entry) => entry.task);
  }

  function handleDropOnQuadrant(taskId: string, quadrant: MatrixQuadrant) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    const patch = patchForQuadrant(task, quadrant, today);
    if (Object.keys(patch).length > 0) onUpdateTask(taskId, patch);
  }

  function handleQuickAdd(title: string) {
    const id = onCreateTask({ title, status: "inbox" });
    showToast({
      message: t("eis.toastQuickAdded"),
      actionLabel: t("eis.toastConfigure"),
      onAction: () => onOpenTask(id),
    });
    setQuickAddOpen(false);
  }

  function handleDetailAdd(draft: TaskDraft) {
    onCreateTask(draft);
    const position = getDraftMatrixPosition(draft, today);
    showToast({ message: t("eis.toastAdded", { quadrant: t(`eis.q${position.quadrant}`) }) });
    setPanelOpen(false);
  }

  function rowMenu(task: Task): MoreMenuItem[] {
    const done = task.status === "done";
    return [
      { label: t("eis.menuOpen"), onClick: () => onOpenTask(task.id) },
      { separator: true },
      ...(task.scheduledDate !== today && !done
        ? [{ label: t("eis.menuToday"), onClick: () => onUpdateTask(task.id, { status: task.status === "inbox" || task.status === "waiting" ? "todo" : task.status, scheduledDate: today }) }]
        : []),
      ...(!done ? [{ label: t("eis.menuSchedule"), onClick: () => onScheduleInCalendar(task.id) }] : []),
      { separator: true },
      ...(!done
        ? [
            task.status === "waiting"
              ? { label: t("eis.menuResume"), onClick: () => onUpdateTask(task.id, { status: "todo" as const }) }
              : { label: t("eis.menuHold"), onClick: () => onUpdateTask(task.id, { status: "waiting" as const }) },
          ]
        : []),
      {
        label: done ? t("eis.menuReopen") : t("eis.menuComplete"),
        onClick: () => onToggleDone(task.id),
      },
    ];
  }

  return (
    <div className="ff-page eis-page">
      <header className="ff-page-head">
        <div>
          <h1 className="ff-page-title">{t("eis.title")}</h1>
          <p className="ff-page-sub">{t("eis.subtitle")}</p>
        </div>
        <div className="eis-head-actions">
          <div className="eis-quickadd-wrap">
            <button type="button" className="ff-btn" onClick={() => setQuickAddOpen((open) => !open)}>
              ⚡ {t("eis.quickAdd")}
            </button>
            {quickAddOpen ? (
              <QuickAddPopover onAdd={handleQuickAdd} onClose={() => setQuickAddOpen(false)} />
            ) : null}
          </div>
          <button type="button" className="ff-btn ff-btn-primary" onClick={() => setPanelOpen(true)}>
            + {t("eis.addTask")}
          </button>
        </div>
      </header>

      <div className="eis-matrix">
        {QUADRANTS.map((quadrant) => (
          <QuadrantCard
            key={quadrant}
            quadrant={quadrant}
            onDropTask={(taskId) => handleDropOnQuadrant(taskId, quadrant)}
          >
            {quadrant === "IV" ? (
              IV_GROUPS.map((group) => (
                <QuadrantGroup
                  key={group}
                  label={t(`eis.group.${group}`)}
                  tasks={tasksFor("IV", group)}
                  cap={group === "completed" ? COMPLETED_CAP : undefined}
                  defaultOpen={group === "unclassified"}
                  renderRow={(task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      today={today}
                      projects={projects}
                      selected={task.id === selectedTaskId}
                      isDragging={task.id === draggingTaskId}
                      menu={rowMenu(task)}
                      onOpen={() => onOpenTask(task.id)}
                      onToggleDone={() => onToggleDone(task.id)}
                      onDragStart={() => setDraggingTaskId(task.id)}
                      onDragEnd={() => setDraggingTaskId("")}
                    />
                  )}
                />
              ))
            ) : (
              <>
                {tasksFor(quadrant).length === 0 ? (
                  <p className="eis-empty">{t("eis.empty")}</p>
                ) : null}
                <AnimatePresence initial={false}>
                  {tasksFor(quadrant).map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      today={today}
                      projects={projects}
                      selected={task.id === selectedTaskId}
                      isDragging={task.id === draggingTaskId}
                      menu={rowMenu(task)}
                      onOpen={() => onOpenTask(task.id)}
                      onToggleDone={() => onToggleDone(task.id)}
                      onDragStart={() => setDraggingTaskId(task.id)}
                      onDragEnd={() => setDraggingTaskId("")}
                    />
                  ))}
                </AnimatePresence>
              </>
            )}
          </QuadrantCard>
        ))}
      </div>

      {panelOpen ? (
        <AddTaskSidePanel
          projects={projects}
          today={today}
          onAdd={handleDetailAdd}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}
    </div>
  );
}

function QuadrantCard({
  quadrant,
  onDropTask,
  children,
}: {
  quadrant: MatrixQuadrant;
  onDropTask: (taskId: string) => void;
  children: React.ReactNode;
}) {
  const { t } = useT();
  const [over, setOver] = useState(false);
  return (
    <MotionDropZone
      as="section"
      isOver={over}
      className={`eis-cell eis-cell-${quadrant}${over ? " is-over" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const id = event.dataTransfer.getData("text/task");
        if (id) onDropTask(id);
      }}
    >
      <header className="eis-cell-head">
        <strong>
          <span className="eis-cell-roman">{quadrant}</span> {t(`eis.q${quadrant}`)}
        </strong>
        <small>{t(`eis.q${quadrant}Hint`)}</small>
      </header>
      <div className="eis-cell-body">{children}</div>
    </MotionDropZone>
  );
}

function QuadrantGroup({
  label,
  tasks,
  cap,
  defaultOpen,
  renderRow,
}: {
  label: string;
  tasks: Task[];
  cap?: number;
  defaultOpen: boolean;
  renderRow: (task: Task) => React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const visible = cap ? tasks.slice(0, cap) : tasks;
  return (
    <div className="eis-group">
      <button type="button" className="eis-group-head" onClick={() => setOpen((value) => !value)}>
        <span className="eis-group-caret">{open ? "⌄" : "›"}</span>
        <span>{label}</span>
        <span className="ff-board-count">{tasks.length}</span>
      </button>
      <AnimatePresence initial={false}>{open ? visible.map(renderRow) : null}</AnimatePresence>
    </div>
  );
}

function TaskRow({
  task,
  today,
  projects,
  selected,
  isDragging,
  menu,
  onOpen,
  onToggleDone,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  today: string;
  projects: Project[];
  selected: boolean;
  isDragging: boolean;
  menu: MoreMenuItem[];
  onOpen: () => void;
  onToggleDone: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const { t } = useT();
  const project = projects.find((item) => item.id === task.projectId);
  const done = task.status === "done";
  const dateLabel = task.dueDate
    ? task.dueDate < today
      ? t("eis.overdue")
      : task.dueDate === today
        ? t("eis.today")
        : task.dueDate.slice(5).replace("-", ".")
    : task.scheduledDate
      ? task.scheduledDate === today
        ? t("eis.today")
        : task.scheduledDate.slice(5).replace("-", ".")
      : "";

  return (
    <MotionTaskRow
      taskId={task.id}
      isDragging={isDragging}
      className={`eis-row${done ? " is-done" : ""}${selected ? " is-selected" : ""}`}
      draggable={!done}
      onNativeDragStart={(event) => {
        event.dataTransfer.setData("text/task", task.id);
        onDragStart();
      }}
      onNativeDragEnd={onDragEnd}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
      }}
    >
      <button
        type="button"
        className={`tdy-check${done ? " checked" : ""}`}
        aria-label={t("todayv.checkAria", { title: task.title })}
        onClick={(event) => {
          event.stopPropagation();
          onToggleDone();
        }}
      >
        {done ? "✓" : ""}
      </button>
      <span className="eis-row-title">{task.title}</span>
      {task.estimatedMinutes > 0 ? (
        <span className="eis-row-estimate">{t("eis.minutes", { n: task.estimatedMinutes })}</span>
      ) : null}
      {project ? (
        <span className="ff-projbadge">
          <span className="ff-dot" style={{ background: project.color }} />
          {project.name}
        </span>
      ) : null}
      {dateLabel ? (
        <span className={`eis-row-date${task.dueDate && task.dueDate < today && !done ? " is-overdue" : ""}`}>
          {dateLabel}
        </span>
      ) : null}
      <MoreMenu items={menu} />
    </MotionTaskRow>
  );
}

function QuickAddPopover({ onAdd, onClose }: { onAdd: (title: string) => void; onClose: () => void }) {
  const { t } = useT();
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function handlePointerDown(event: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) onClose();
    }
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [onClose]);

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed);
  }

  return (
    <div ref={wrapRef} className="eis-quickadd" role="dialog" aria-label={t("eis.quickAdd")}>
      <strong>⚡ {t("eis.quickAdd")}</strong>
      <p>{t("eis.quickAddHint")}</p>
      <input
        ref={inputRef}
        value={title}
        placeholder={t("eis.quickAddPlaceholder")}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();
          if (event.key === "Escape") onClose();
        }}
      />
      <small>{t("eis.quickAddDefault")}</small>
      <div className="eis-quickadd-actions">
        <button type="button" className="ff-btn" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button type="button" className="ff-btn ff-btn-primary" disabled={!title.trim()} onClick={submit}>
          {t("common.add")}
        </button>
      </div>
    </div>
  );
}

const PRIORITY_OPTIONS: TaskPriority[] = ["none", "low", "medium", "high"];

function AddTaskSidePanel({
  projects,
  today,
  onAdd,
  onClose,
}: {
  projects: Project[];
  today: string;
  onAdd: (draft: TaskDraft) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [title, setTitle] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [projectId, setProjectId] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState(0);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const tomorrow = addDays(today, 1);

  useEffect(() => {
    titleRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const preview = getDraftMatrixPosition({ priority, scheduledDate }, today);

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t("eis.titleRequired"));
      return;
    }
    onAdd({
      title: trimmed,
      status: "todo",
      scheduledDate: scheduledDate || undefined,
      priority,
      projectId: projectId || undefined,
      estimatedMinutes: estimatedMinutes || undefined,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <div className="eis-panel-backdrop" onClick={onClose}>
      <aside className="eis-panel" onClick={(event) => event.stopPropagation()}>
        <header className="eis-panel-head">
          <div>
            <strong>{t("eis.panelTitle")}</strong>
            <p>{t("eis.panelSub")}</p>
          </div>
          <button type="button" className="gcal-popover-close" aria-label={t("common.close")} onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="ff-form">
          <label>
            {t("eis.fieldTitle")}
            <input
              ref={titleRef}
              value={title}
              placeholder={t("eis.fieldTitlePlaceholder")}
              onChange={(event) => {
                setTitle(event.target.value);
                if (error) setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
            />
          </label>
          {error ? <p className="tdy-form-error">{error}</p> : null}

          <label>
            {t("eis.fieldDate")}
            <div className="eis-chiprow" role="group" aria-label={t("eis.fieldDate")}>
              <button type="button" className={scheduledDate === "" ? "active" : ""} onClick={() => setScheduledDate("")}>
                {t("eis.dateNone")}
              </button>
              <button type="button" className={scheduledDate === today ? "active" : ""} onClick={() => setScheduledDate(today)}>
                {t("eis.dateToday")}
              </button>
              <button type="button" className={scheduledDate === tomorrow ? "active" : ""} onClick={() => setScheduledDate(tomorrow)}>
                {t("eis.dateTomorrow")}
              </button>
              <input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} />
            </div>
          </label>

          <label>
            {t("eis.fieldPriority")}
            <div className="eis-chiprow" role="group" aria-label={t("eis.fieldPriority")}>
              {PRIORITY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={priority === option ? "active" : ""}
                  onClick={() => setPriority(option)}
                >
                  {option === "none" ? t("eis.dateNone") : t(`priority.${option}`)}
                </button>
              ))}
            </div>
          </label>

          <label>
            {t("eis.fieldSpace")}
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">{t("eis.noSpace")}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t("eis.fieldEstimate")}
            <div className="eis-chiprow" role="group" aria-label={t("eis.fieldEstimate")}>
              <button type="button" className={estimatedMinutes === 0 ? "active" : ""} onClick={() => setEstimatedMinutes(0)}>
                {t("eis.dateNone")}
              </button>
              <button type="button" className={estimatedMinutes === 30 ? "active" : ""} onClick={() => setEstimatedMinutes(30)}>
                {t("eis.minutes", { n: 30 })}
              </button>
              <button type="button" className={estimatedMinutes === 60 ? "active" : ""} onClick={() => setEstimatedMinutes(60)}>
                {t("eis.minutes", { n: 60 })}
              </button>
              <input
                type="number"
                min={0}
                step={5}
                value={estimatedMinutes || ""}
                placeholder={t("eis.estimateCustom")}
                onChange={(event) => setEstimatedMinutes(Math.max(0, Number(event.target.value) || 0))}
              />
            </div>
          </label>

          <label>
            {t("eis.fieldNotes")}
            <textarea rows={3} value={notes} placeholder={t("eis.notesPlaceholder")} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </div>

        <div className="eis-panel-preview">
          <small>{t("eis.preview")}</small>
          <span className={`eis-preview-badge eis-q-${preview.quadrant}`}>
            <span className="eis-cell-roman">{preview.quadrant}</span> {t(`eis.q${preview.quadrant}`)}
            {preview.group ? ` · ${t(`eis.group.${preview.group}`)}` : ""}
          </span>
        </div>

        <footer className="eis-panel-actions">
          <button type="button" className="ff-btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="button" className="ff-btn ff-btn-primary" disabled={!title.trim()} onClick={submit}>
            {t("common.add")}
          </button>
        </footer>
      </aside>
    </div>
  );
}
