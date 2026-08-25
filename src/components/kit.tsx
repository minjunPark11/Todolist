import {
  forwardRef,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import type { Project, Task, TaskPriority, TaskStatus } from "../types";
import { formatDate, todayValue } from "../utils/date";
import { isCompleted } from "../domain/tasks/taskState";
import { useDeferredTextField } from "../hooks/useDeferredTextField";
import { useT } from "../i18n";
import { reducedTransition, transitions } from "../motion/transitions";
import { backdropVariants, modalVariants } from "../motion/variants";
import { useMotionEnabled } from "../motion/reducedMotion";
import { Popover, PopoverContent, PopoverTrigger, usePopoverSurface } from "./floating";

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
  /** Enter commits and pasted newlines flatten (spec §9.24). */
  singleLine?: boolean;
  /** Refuse to commit an empty value; revert instead (spec §9.21). */
  required?: boolean;
};

/**
 * `forwardRef` because the checklist moves focus between rows (§11.26–§11.28):
 * Enter goes to the next line, Backspace on an empty one goes back to the
 * previous. That is the caller's decision to make, and it needs the element.
 */
export const DeferredInput = forwardRef<HTMLInputElement, DeferredFieldProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">>(function DeferredInput({
  value,
  onCommit,
  resetKey,
  delayMs,
  // An `<input>` is one line by construction, so Enter has nothing else to
  // mean here — the caller opts out only for the rare field where it does.
  singleLine = true,
  required,
  // Chained rather than replaced. A caller that needs to react to a key or a
  // paste — the checklist does both — would otherwise have to choose between
  // its own handler and the draft behaviour, and silently lose one.
  onKeyDown,
  onPaste,
  onBlur,
  ...rest
}, ref) {
  const field = useDeferredTextField(value, onCommit, { resetKey, delayMs, singleLine, required });
  return (
    <input
      {...rest}
      ref={ref}
      value={field.value}
      onChange={(event) => field.onChange(event.target.value)}
      // The draft commits first, so a caller reacting to Enter is acting on a
      // field whose text is already saved.
      onBlur={(event) => {
        field.onBlur();
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        field.onKeyDown(event);
        onKeyDown?.(event);
      }}
      // The caller goes first here: a multi-line paste has two possible
      // answers (flatten to one line, or split into items) and only the
      // caller knows which field it is looking at. `preventDefault` is how it
      // says it handled it.
      onPaste={(event) => {
        onPaste?.(event);
        field.onPaste(event);
      }}
      onCompositionStart={field.onCompositionStart}
      onCompositionEnd={field.onCompositionEnd}
    />
  );
});

export function DeferredTextarea({
  value,
  onCommit,
  resetKey,
  delayMs,
  // Never single-line: Enter in a textarea is a paragraph break, and taking it
  // for "commit" would make multi-line text unwritable (spec §10.4).
  required,
  ...rest
}: DeferredFieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const field = useDeferredTextField(value, onCommit, { resetKey, delayMs, required });
  return (
    <textarea
      {...rest}
      value={field.value}
      onChange={(event) => field.onChange(event.target.value)}
      onBlur={field.onBlur}
      onKeyDown={field.onKeyDown}
      onCompositionStart={field.onCompositionStart}
      onCompositionEnd={field.onCompositionEnd}
    />
  );
}

/**
 * Outside click and Escape, for the two MODALS below and nothing else.
 *
 * Every popover and menu has left this hook for the layer system, which is
 * what §19.92 asks for — one central listener rather than one per feature.
 * `ConfirmModal` and `Modal` have not, and the reason is that §19.34 and
 * §19.55 give a dialog different rules: it traps focus, it dims what is
 * behind it, and whether its backdrop dismisses at all is the dialog's own
 * decision rather than the manager's.
 *
 * They are still not on the layer STACK, so an Escape with a dialog above a
 * popover is decided by registration order rather than by §19.93. Nothing in
 * the app produces that pairing today; when something does, the fix is to
 * register the dialog as a `modal` layer, which `topDismissable` already
 * understands.
 */
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


/**
 * The ⋯ menu on a row (spec §19.30, §19.39).
 *
 * On the shared layer system now. What it gains by moving is everything the
 * old one lacked: it is portalled, so a menu on the last row is no longer
 * clipped by the list's own scroll container; it flips and shifts against the
 * real viewport instead of always hanging below-right; Escape closes it and
 * only it; and the arrow keys work, which they never did here — the same
 * gesture used to do one thing in the context menu and nothing in this one.
 *
 * `stopPropagation` on the wrapper stays. The rows underneath open a Detail on
 * click, and the menu sits inside the row.
 */
export function MoreMenu({ items, label }: { items: MoreMenuItem[]; label?: string }) {
  const { t } = useT();
  const resolvedLabel = label ?? t("common.more");
  return (
    <div className="ff-anchor" onClick={(e) => e.stopPropagation()}>
      <Popover type="menu" placement="bottom-end">
        <PopoverTrigger className="ff-icon-btn" aria-label={resolvedLabel}>
          ⋯
        </PopoverTrigger>
        <PopoverContent label={resolvedLabel} role="menu">
          <MoreMenuItems items={items} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Separated so the items can close the surface they are inside (§19.90). */
function MoreMenuItems({ items }: { items: MoreMenuItem[] }) {
  const { close } = usePopoverSurface();
  return (
    <>
      {items.map((item, index) =>
        item.separator ? (
          <div key={index} className="ff-menu-sep" role="separator" />
        ) : (
          <button
            key={index}
            type="button"
            role="menuitem"
            className={item.danger ? "ff-menu-item danger" : "ff-menu-item"}
            onClick={() => {
              // Closed first, so focus is back on the trigger before the action
              // runs — several of these remove the row the menu was opened
              // from, and restoring focus afterwards would have nowhere to go.
              close();
              item.onClick?.();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </>
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
  const PRIORITY_META = usePriorityMeta();
  const meta = PRIORITY_META[priority];
  const badgeClass = `ff-badge ff-badge-${meta.tone}${priority === "none" ? " ff-badge-ghost" : ""}`;
  const body = (
    <>
      {meta.arrow ? <span className="ff-badge-arrow">{meta.arrow}</span> : null}
      {meta.label}
    </>
  );

  // Read-only unless a caller supplies `onChange`. Drawn as plain text then,
  // rather than as a button that opens nothing.
  if (!onChange) {
    return (
      <div className="ff-anchor">
        <span className={badgeClass}>{body}</span>
      </div>
    );
  }

  return (
    <div className="ff-anchor" onClick={(e) => e.stopPropagation()}>
      <Popover type="menu">
        <PopoverTrigger className={badgeClass}>{body}</PopoverTrigger>
        <PopoverContent label={meta.label} role="menu">
          <PriorityChoices meta={PRIORITY_META} onChange={onChange} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function PriorityChoices({
  meta,
  onChange,
}: {
  meta: Record<TaskPriority, { label: string; tone: string; arrow: string }>;
  onChange: (next: TaskPriority) => void;
}) {
  const { close } = usePopoverSurface();
  return (
    <>
      {(["high", "medium", "low", "none"] as TaskPriority[]).map((p) => (
        <button
          key={p}
          type="button"
          role="menuitem"
          className="ff-menu-item"
          onClick={() => {
            close();
            onChange(p);
          }}
        >
          <span className={`ff-dot ff-dot-${meta[p].tone}`} />
          {meta[p].label}
        </button>
      ))}
    </>
  );
}

// `StatusBadge` and its six-value picker stood here — the only UI that could
// ever set `doing`, `waiting` or `inbox`. Nothing rendered it, and the values
// it offered are not lifecycle any more (Ch. 26 §26.3.2): a workflow column
// is chosen on the board, and a container is chosen by moving Lists.


export function DueDatePill({
  task,
  onChange,
}: {
  task: Task;
  onChange?: (value: string) => void;
}) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  // A `field` prop chose between the deadline and the work day here. There is
  // one date now (SCHEDULE_EDITOR_PHASE0_AUDIT.md §7 Phase 11), so there is
  // nothing to choose.
  const value = task.dueDate;
  const today = todayValue();
  let tone = "muted";
  let label: string;
  if (!value) {
    label = t("kit.needsDate");
    tone = "danger-ghost";
  } else if (value < today) {
    label = formatDate(value, lang);
    tone = "danger";
  } else if (value === today) {
    label = t("common.today");
    tone = "warning";
  } else {
    label = formatDate(value, lang);
    tone = "muted";
  }

  const body = (
    <>
      <span className="ff-pill-icon">📅</span>
      {label}
    </>
  );

  if (!onChange) {
    return (
      <div className="ff-anchor">
        <span className={`ff-pill ff-pill-${tone}`}>{body}</span>
      </div>
    );
  }

  return (
    <div className="ff-anchor" onClick={(e) => e.stopPropagation()}>
      <Popover>
        <PopoverTrigger className={`ff-pill ff-pill-${tone}`}>{body}</PopoverTrigger>
        <PopoverContent label={t("kit.dueDate")}>
          <DueDateChoices value={value} today={today} onChange={onChange} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Separated so the quick choices can close the surface they sit in. */
function DueDateChoices({
  value,
  today,
  onChange,
}: {
  value: string;
  today: string;
  onChange: (next: string) => void;
}) {
  const { t } = useT();
  const { close } = usePopoverSurface();
  return (
    <div className="ff-datepicker">
      {/* The field itself does NOT close on change: a native date input fires
          while the picker is still being used, and closing on the first
          keystroke would take the control away mid-edit. */}
      <input type="date" value={value || ""} onChange={(event) => onChange(event.target.value)} />
      <div className="ff-datepicker-quick">
        <button type="button" onClick={() => { close(); onChange(today); }}>
          {t("common.today")}
        </button>
        <button type="button" onClick={() => { close(); onChange(addDaysLocal(today, 1)); }}>
          {t("common.tomorrow")}
        </button>
        <button type="button" className="danger" onClick={() => { close(); onChange(""); }}>
          {t("common.clear")}
        </button>
      </div>
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
  const project = projects.find((p) => p.id === task.projectId);
  const badgeClass = project ? "ff-projbadge" : "ff-projbadge ff-projbadge-empty";
  const body = (
    <>
      {project ? <span className="ff-dot" style={{ backgroundColor: project.color }} /> : null}
      {project ? project.name : t("common.noProject")}
    </>
  );

  if (!onChange) {
    return (
      <div className="ff-anchor">
        <span className={badgeClass}>{body}</span>
      </div>
    );
  }

  return (
    <div className="ff-anchor" onClick={(e) => e.stopPropagation()}>
      <Popover type="menu">
        <PopoverTrigger className={badgeClass}>{body}</PopoverTrigger>
        <PopoverContent label={t("common.noProject")} role="menu">
          <ProjectChoices projects={projects} onChange={onChange} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ProjectChoices({
  projects,
  onChange,
}: {
  projects: Project[];
  onChange: (projectId: string) => void;
}) {
  const { t } = useT();
  const { close } = usePopoverSurface();
  return (
    <>
      <button type="button" role="menuitem" className="ff-menu-item" onClick={() => { close(); onChange(""); }}>
        {t("common.noProject")}
      </button>
      {projects.map((p) => (
        <button
          key={p.id}
          type="button"
          role="menuitem"
          className="ff-menu-item"
          onClick={() => { close(); onChange(p.id); }}
        >
          <span className="ff-dot" style={{ backgroundColor: p.color }} />
          {p.name}
        </button>
      ))}
    </>
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
  onOpen,
  onToggleDone,
  onUpdate,
  moreItems,
  rightSlot,
  metaSlot,
}: TaskRowProps) {
  const { t } = useT();
  const done = isCompleted(task);
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
        <DueDatePill task={task} onChange={update ? (v) => update({ dueDate: v }) : undefined} />
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
