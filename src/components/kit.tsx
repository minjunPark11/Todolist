import {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Project, Task, TaskPriority, TaskStatus } from "../types";
import { formatDate, todayValue } from "../utils/date";
import { useDeferredTextField } from "../hooks/useDeferredTextField";
import { useT } from "../i18n";
import { reducedTransition, transitions } from "../motion/transitions";
import { backdropVariants, modalVariants, popoverVariants } from "../motion/variants";
import { useMotionEnabled } from "../motion/reducedMotion";

// ============================================================================
// Primitives
// ============================================================================

// Free-text inputs that commit on pause/blur instead of on every keystroke.
// They exist as components rather than a bare hook because their callers
// (TaskDetail) return early when nothing is selected, which rules out calling
// the hook at the top level. `resetKey` must identify the record being edited
// so switching records doesn't carry the previous one's text over.
type DeferredFieldProps = {
  value: string;
  onCommit: (next: string) => void;
  resetKey?: string;
  delayMs?: number;
};

export function DeferredInput({
  value,
  onCommit,
  resetKey,
  delayMs,
  ...rest
}: DeferredFieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const field = useDeferredTextField(value, onCommit, { resetKey, delayMs });
  return (
    <input
      {...rest}
      value={field.value}
      onChange={(event) => field.onChange(event.target.value)}
      onBlur={field.onBlur}
    />
  );
}

export function DeferredTextarea({
  value,
  onCommit,
  resetKey,
  delayMs,
  ...rest
}: DeferredFieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const field = useDeferredTextField(value, onCommit, { resetKey, delayMs });
  return (
    <textarea
      {...rest}
      value={field.value}
      onChange={(event) => field.onChange(event.target.value)}
      onBlur={field.onBlur}
    />
  );
}

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
  const motionEnabled = useMotionEnabled();
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={ref}
          className={`ff-popover ff-popover-${align}`}
          role="menu"
          variants={motionEnabled ? popoverVariants : undefined}
          initial={motionEnabled ? "initial" : false}
          animate={motionEnabled ? "animate" : undefined}
          exit={motionEnabled ? "exit" : undefined}
          transition={motionEnabled ? transitions.fast : reducedTransition}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function MoreMenu({ items, label }: { items: MoreMenuItem[]; label?: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const resolvedLabel = label ?? t("common.more");
  return (
    <div className="ff-anchor" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="ff-icon-btn"
        aria-label={resolvedLabel}
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

function usePriorityMeta(): Record<TaskPriority, { label: string; tone: string; arrow: string }> {
  const { t } = useT();
  return {
    high: { label: t("priority.high"), tone: "danger", arrow: "↑" },
    medium: { label: t("priority.medium"), tone: "warning", arrow: "—" },
    low: { label: t("priority.low"), tone: "success", arrow: "↓" },
    none: { label: t("priority.none"), tone: "muted", arrow: "" },
  };
}

export function PriorityBadge({
  priority,
  onChange,
}: {
  priority: TaskPriority;
  onChange?: (next: TaskPriority) => void;
}) {
  const [open, setOpen] = useState(false);
  const PRIORITY_META = usePriorityMeta();
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

function useStatusMeta(): Record<string, { label: string; tone: string }> {
  const { t } = useT();
  return {
    inbox: { label: t("status.inbox"), tone: "muted" },
    todo: { label: t("status.todo"), tone: "muted" },
    doing: { label: t("status.doing"), tone: "accent" },
    waiting: { label: t("status.waiting"), tone: "purple" },
    done: { label: t("status.done"), tone: "success" },
    archived: { label: t("status.archived"), tone: "muted" },
  };
}
const STATUS_OPTIONS: TaskStatus[] = ["inbox", "todo", "doing", "waiting", "done"];

export function StatusBadge({
  status,
  onChange,
}: {
  status: TaskStatus;
  onChange?: (next: TaskStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const STATUS_META = useStatusMeta();
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
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const value = field === "dueDate" ? task.dueDate : task.scheduledDate;
  const today = todayValue();
  let tone = "muted";
  let label: string;
  if (!value) {
    label = field === "dueDate" ? t("kit.needsDate") : t("kit.notScheduled");
    tone = field === "dueDate" ? "danger-ghost" : "muted";
  } else if (value < today) {
    label = formatDate(value, lang);
    tone = "danger";
  } else if (value === today) {
    label = field === "dueDate" ? t("common.today") : t("kit.plannedToday");
    tone = field === "dueDate" ? "warning" : "accent";
  } else {
    label = formatDate(value, lang);
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
              <button type="button" onClick={() => { onChange(today); setOpen(false); }}>{t("common.today")}</button>
              <button type="button" onClick={() => { onChange(addDaysLocal(today, 1)); setOpen(false); }}>
                {t("common.tomorrow")}
              </button>
              <button type="button" className="danger" onClick={() => { onChange(""); setOpen(false); }}>
                {t("common.clear")}
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
  const { t } = useT();
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
        {project ? project.name : t("common.noProject")}
      </button>
      {onChange ? (
        <Popover open={open} onClose={() => setOpen(false)}>
          <button
            type="button"
            className="ff-menu-item"
            onClick={() => { setOpen(false); onChange(""); }}
          >
            {t("common.noProject")}
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
  const { t } = useT();
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
        aria-label={done ? t("kit.markNotDone") : t("kit.markDone")}
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
  confirmLabel,
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
  const { t } = useT();
  const motionEnabled = useMotionEnabled();
  // Dismissals play the exit variant first, then hand control back to the
  // caller; confirms stay instant so committing never feels delayed.
  const [closing, setClosing] = useState(false);
  const requestCancel = () => {
    if (!motionEnabled) onCancel();
    else setClosing(true);
  };
  const ref = useOutsideClose(requestCancel);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus the confirm button so Enter activates it right away; Tab still
  // moves to Cancel, where Enter cancels instead.
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (!motionEnabled) onCancel();
        else setClosing(true);
        return;
      }
      if (event.key !== "Enter") return;
      const target = event.target as HTMLElement | null;
      // A focused button already activates natively on Enter — don't
      // double-fire — and typing fields keep their own Enter behavior.
      if (target && (target.tagName === "BUTTON" || target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      event.preventDefault();
      onConfirm();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel, onConfirm, motionEnabled]);

  return (
    <motion.div
      className="ff-modal-backdrop"
      role="presentation"
      variants={motionEnabled ? backdropVariants : undefined}
      initial={motionEnabled ? "initial" : false}
      animate={motionEnabled ? (closing ? "exit" : "animate") : undefined}
      transition={motionEnabled ? transitions.fast : reducedTransition}
    >
      <motion.section
        ref={ref}
        className="ff-modal ff-confirm"
        role="dialog"
        aria-modal="true"
        variants={motionEnabled ? modalVariants : undefined}
        initial={motionEnabled ? "initial" : false}
        animate={motionEnabled ? (closing ? "exit" : "animate") : undefined}
        transition={motionEnabled ? transitions.soft : reducedTransition}
        onAnimationComplete={(definition) => {
          if (definition === "exit") onCancel();
        }}
      >
        <h2>{title}</h2>
        {body ? <div className="ff-confirm-body">{body}</div> : null}
        <div className="ff-modal-actions">
          <button type="button" className="ff-btn" onClick={requestCancel}>
            {t("common.cancel")}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={danger ? "ff-btn ff-btn-danger" : "ff-btn ff-btn-primary"}
            onClick={onConfirm}
          >
            {confirmLabel ?? t("common.confirm")}
          </button>
        </div>
      </motion.section>
    </motion.div>
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
  const { t } = useT();
  const motionEnabled = useMotionEnabled();
  // Same dismissal contract as ConfirmModal: ✕/backdrop/Escape play the exit
  // variant, then onClose unmounts. Caller-driven closes (save flows) stay
  // instant.
  const [closing, setClosing] = useState(false);
  const requestClose = () => {
    if (!motionEnabled) onClose();
    else setClosing(true);
  };
  const ref = useOutsideClose(requestClose);
  return (
    <motion.div
      className="ff-modal-backdrop"
      role="presentation"
      variants={motionEnabled ? backdropVariants : undefined}
      initial={motionEnabled ? "initial" : false}
      animate={motionEnabled ? (closing ? "exit" : "animate") : undefined}
      transition={motionEnabled ? transitions.fast : reducedTransition}
    >
      <motion.section
        ref={ref}
        className={`ff-modal${wide ? " ff-modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        variants={motionEnabled ? modalVariants : undefined}
        initial={motionEnabled ? "initial" : false}
        animate={motionEnabled ? (closing ? "exit" : "animate") : undefined}
        transition={motionEnabled ? transitions.soft : reducedTransition}
        onAnimationComplete={(definition) => {
          if (definition === "exit") onClose();
        }}
      >
        <header className="ff-modal-head">
          <h2>{title}</h2>
          <button type="button" className="ff-icon-btn" aria-label={t("kit.close")} onClick={requestClose}>
            ✕
          </button>
        </header>
        <div className="ff-modal-body">{children}</div>
        {footer ? <div className="ff-modal-actions">{footer}</div> : null}
      </motion.section>
    </motion.div>
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
