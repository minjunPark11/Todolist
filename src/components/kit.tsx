import {
  ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Project, Task, TaskPriority, TaskStatus } from "../types";
import { formatDate, todayValue } from "../utils/date";

// ============================================================================
// Primitives
// ============================================================================

export function useOutsideClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handle(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);
  return ref;
}

export function Popover({
  open,
  onClose,
  children,
  align = "start",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "start" | "end";
}) {
  const ref = useOutsideClose(onClose);
  if (!open) return null;
  return (
    <div ref={ref} className={`ff-popover ff-popover-${align}`} role="menu">
      {children}
    </div>
  );
}

export function MoreMenu({ items, label = "More" }: { items: MoreMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ff-anchor" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="ff-icon-btn"
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      <Popover open={open} onClose={() => setOpen(false)} align="end">
        {items.map((item, index) =>
          item.separator ? (
            <div key={index} className="ff-menu-sep" />
          ) : (
            <button
              key={index}
              type="button"
              className={item.danger ? "ff-menu-item danger" : "ff-menu-item"}
              onClick={() => {
                setOpen(false);
                item.onClick?.();
              }}
            >
              {item.label}
            </button>
          ),
        )}
      </Popover>
    </div>
  );
}

export interface MoreMenuItem {
  label?: string;
  onClick?: () => void;
  danger?: boolean;
  separator?: boolean;
}

// ============================================================================
// Badges & pills
// ============================================================================

const PRIORITY_META: Record<TaskPriority, { label: string; tone: string; arrow: string }> = {
  high: { label: "High", tone: "danger", arrow: "↑" },
  medium: { label: "Medium", tone: "warning", arrow: "—" },
  low: { label: "Low", tone: "success", arrow: "↓" },
  none: { label: "No priority", tone: "muted", arrow: "" },
};

export function PriorityBadge({
  priority,
  onChange,
}: {
  priority: TaskPriority;
  onChange?: (next: TaskPriority) => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = PRIORITY_META[priority];
  return (
    <div className="ff-anchor" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`ff-badge ff-badge-${meta.tone}${priority === "none" ? " ff-badge-ghost" : ""}`}
        onClick={() => onChange && setOpen((v) => !v)}
      >
        {meta.arrow ? <span className="ff-badge-arrow">{meta.arrow}</span> : null}
        {meta.label}
      </button>
      {onChange ? (
        <Popover open={open} onClose={() => setOpen(false)}>
          {(["high", "medium", "low", "none"] as TaskPriority[]).map((p) => (
            <button
              key={p}
              type="button"
              className="ff-menu-item"
              onClick={() => {
                setOpen(false);
                onChange(p);
              }}
            >
              <span className={`ff-dot ff-dot-${PRIORITY_META[p].tone}`} />
              {PRIORITY_META[p].label}
            </button>
          ))}
        </Popover>
      ) : null}
    </div>
  );
}

const STATUS_META: Record<string, { label: string; tone: string }> = {
  inbox: { label: "Inbox", tone: "muted" },
  todo: { label: "To Do", tone: "muted" },
  doing: { label: "In Progress", tone: "accent" },
  waiting: { label: "Waiting", tone: "purple" },
  done: { label: "Done", tone: "success" },
  archived: { label: "Archived", tone: "muted" },
};
const STATUS_OPTIONS: TaskStatus[] = ["inbox", "todo", "doing", "waiting", "done"];

export function StatusBadge({
  status,
  onChange,
}: {
  status: TaskStatus;
  onChange?: (next: TaskStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[status] ?? STATUS_META.todo;
  return (
    <div className="ff-anchor" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`ff-badge ff-badge-${meta.tone}`}
        onClick={() => onChange && setOpen((v) => !v)}
      >
        {meta.label}
      </button>
      {onChange ? (
        <Popover open={open} onClose={() => setOpen(false)}>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="ff-menu-item"
              onClick={() => {
                setOpen(false);
                onChange(s);
              }}
            >
              {STATUS_META[s].label}
            </button>
          ))}
        </Popover>
      ) : null}
    </div>
  );
}

export function DueDatePill({
  task,
  field = "dueDate",
  onChange,
}: {
  task: Task;
  field?: "dueDate" | "scheduledDate";
  onChange?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const value = field === "dueDate" ? task.dueDate : task.scheduledDate;
  const today = todayValue();
  let tone = "muted";
  let label: string;
  if (!value) {
    label = field === "dueDate" ? "Needs date" : "Not scheduled";
    tone = field === "dueDate" ? "danger-ghost" : "muted";
  } else if (value < today) {
    label = formatDate(value);
    tone = "danger";
  } else if (value === today) {
    label = field === "dueDate" ? "Today" : "Planned Today";
    tone = field === "dueDate" ? "warning" : "accent";
  } else {
    label = formatDate(value);
    tone = "muted";
  }

  return (
    <div className="ff-anchor" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`ff-pill ff-pill-${tone}`}
        onClick={() => onChange && setOpen((v) => !v)}
      >
        <span className="ff-pill-icon">{field === "dueDate" ? "📅" : "🗓"}</span>
        {label}
      </button>
      {onChange ? (
        <Popover open={open} onClose={() => setOpen(false)}>
          <div className="ff-datepicker">
            <input
              type="date"
              value={value || ""}
              onChange={(e) => {
                onChange(e.target.value);
              }}
            />
            <div className="ff-datepicker-quick">
              <button type="button" onClick={() => { onChange(today); setOpen(false); }}>Today</button>
              <button type="button" onClick={() => { onChange(addDaysLocal(today, 1)); setOpen(false); }}>
                Tomorrow
              </button>
              <button type="button" className="danger" onClick={() => { onChange(""); setOpen(false); }}>
                Clear
              </button>
            </div>
          </div>
        </Popover>
      ) : null}
    </div>
  );
}

export function ProjectBadge({
  task,
  projects,
  onChange,
}: {
  task: Task;
  projects: Project[];
  onChange?: (projectId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const project = projects.find((p) => p.id === task.projectId);
  return (
    <div className="ff-anchor" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={project ? "ff-projbadge" : "ff-projbadge ff-projbadge-empty"}
        onClick={() => onChange && setOpen((v) => !v)}
      >
        {project ? <span className="ff-dot" style={{ backgroundColor: project.color }} /> : null}
        {project ? project.name : "No project"}
      </button>
      {onChange ? (
        <Popover open={open} onClose={() => setOpen(false)}>
          <button
            type="button"
            className="ff-menu-item"
            onClick={() => { setOpen(false); onChange(""); }}
          >
            No project
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className="ff-menu-item"
              onClick={() => { setOpen(false); onChange(p.id); }}
            >
              <span className="ff-dot" style={{ backgroundColor: p.color }} />
              {p.name}
            </button>
          ))}
        </Popover>
      ) : null}
    </div>
  );
}

function addDaysLocal(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ============================================================================
// Task row (spec §7.3)
// ============================================================================

export interface TaskRowProps {
  task: Task;
  projects: Project[];
  subtaskProgress?: { done: number; total: number };
  selected?: boolean;
  dateField?: "dueDate" | "scheduledDate" | "both";
  onOpen: (taskId: string) => void;
  onToggleDone: (taskId: string) => void;
  onUpdate?: (taskId: string, patch: Partial<Task>) => void;
  moreItems?: MoreMenuItem[];
  rightSlot?: ReactNode;
  metaSlot?: ReactNode;
}

export function TaskRow({
  task,
  projects,
  subtaskProgress,
  selected,
  dateField = "dueDate",
  onOpen,
  onToggleDone,
  onUpdate,
  moreItems,
  rightSlot,
  metaSlot,
}: TaskRowProps) {
  const done = task.status === "done";
  const update = onUpdate ? (patch: Partial<Task>) => onUpdate(task.id, patch) : undefined;

  return (
    <div
      className={`ff-task-row${done ? " is-done" : ""}${selected ? " is-selected" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(task.id);
        }
      }}
    >
      <button
        type="button"
        className={`ff-check${done ? " checked" : ""}`}
        aria-label={done ? "Mark not done" : "Mark done"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleDone(task.id);
        }}
      >
        {done ? "✓" : ""}
      </button>

      <div className="ff-task-main">
        <span className="ff-task-title">{task.title}</span>
        {subtaskProgress && subtaskProgress.total > 0 ? (
          <span className="ff-subcount">
            {subtaskProgress.done}/{subtaskProgress.total}
          </span>
        ) : null}
      </div>

      <div className="ff-task-meta">
        {metaSlot}
        <ProjectBadge task={task} projects={projects} onChange={update ? (id) => update({ projectId: id }) : undefined} />
        {dateField === "both" ? (
          <>
            <DueDatePill task={task} field="dueDate" onChange={update ? (v) => update({ dueDate: v }) : undefined} />
            {task.scheduledDate ? (
              <DueDatePill
                task={task}
                field="scheduledDate"
                onChange={update ? (v) => update({ scheduledDate: v }) : undefined}
              />
            ) : null}
          </>
        ) : (
          <DueDatePill task={task} field={dateField} onChange={update ? (v) => update({ [dateField]: v }) : undefined} />
        )}
        <PriorityBadge priority={task.priority} onChange={update ? (p) => update({ priority: p }) : undefined} />
        {rightSlot}
        {moreItems && moreItems.length > 0 ? <MoreMenu items={moreItems} /> : null}
      </div>
    </div>
  );
}

// ============================================================================
// Empty state, tabs, modal, toast
// ============================================================================

export function EmptyState({
  title,
  text,
  actionLabel,
  onAction,
  icon = "✦",
}: {
  title: string;
  text?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}) {
  return (
    <div className="ff-empty">
      <div className="ff-empty-icon">{icon}</div>
      <strong>{title}</strong>
      {text ? <p>{text}</p> : null}
      {actionLabel && onAction ? (
        <button type="button" className="ff-btn ff-btn-primary" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function SegmentedTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<[T, string]>;
  active: T;
  onChange: (tab: T) => void;
}) {
  return (
    <div className="ff-segmented" role="tablist">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={active === id}
          className={active === id ? "active" : ""}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function ConfirmModal({
  title,
  body,
  confirmLabel = "Confirm",
  danger = true,
  onCancel,
  onConfirm,
}: {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useOutsideClose(onCancel);
  return (
    <div className="ff-modal-backdrop" role="presentation">
      <section ref={ref} className="ff-modal ff-confirm" role="dialog" aria-modal="true">
        <h2>{title}</h2>
        {body ? <div className="ff-confirm-body">{body}</div> : null}
        <div className="ff-modal-actions">
          <button type="button" className="ff-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? "ff-btn ff-btn-danger" : "ff-btn ff-btn-primary"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export interface ToastState {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  return (
    <div className="ff-toast" role="status">
      <span>{toast.message}</span>
      {toast.actionLabel && toast.onAction ? (
        <button
          type="button"
          onClick={() => {
            toast.onAction?.();
            onDismiss();
          }}
        >
          {toast.actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  footer,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useOutsideClose(onClose);
  return (
    <div className="ff-modal-backdrop" role="presentation">
      <section
        ref={ref}
        className={`ff-modal${wide ? " ff-modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
      >
        <header className="ff-modal-head">
          <h2>{title}</h2>
          <button type="button" className="ff-icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="ff-modal-body">{children}</div>
        {footer ? <div className="ff-modal-actions">{footer}</div> : null}
      </section>
    </div>
  );
}

// Auto-focus helper for first input in a panel/modal.
export function useAutoFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}
