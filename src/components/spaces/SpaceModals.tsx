import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { Task, TaskPriority } from "../../types";
import type { SpaceTypePreset } from "../../lib/spaceHubTypes";
import { isTaskDone } from "../../lib/spaceSelectors";
import { formatDate } from "../../utils/date";
import { useT } from "../../i18n";
import { groupText } from "../../lib/spaceHubI18n";
import { reducedTransition, transitions } from "../../motion/transitions";
import { backdropVariants, modalVariants } from "../../motion/variants";
import { useMotionEnabled } from "../../motion/reducedMotion";

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useT();
  const motionEnabled = useMotionEnabled();
  // Same dismissal contract as the kit Modal: ✕/backdrop play the exit
  // variant before onClose unmounts; submit flows close instantly.
  const [closing, setClosing] = useState(false);
  const requestClose = () => {
    if (!motionEnabled) onClose();
    else setClosing(true);
  };
  return (
    <motion.div
      className="sdv-modal-backdrop"
      onClick={requestClose}
      variants={motionEnabled ? backdropVariants : undefined}
      initial={motionEnabled ? "initial" : false}
      animate={motionEnabled ? (closing ? "exit" : "animate") : undefined}
      transition={motionEnabled ? transitions.fast : reducedTransition}
    >
      <motion.section
        className="sdv-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        variants={motionEnabled ? modalVariants : undefined}
        initial={motionEnabled ? "initial" : false}
        animate={motionEnabled ? (closing ? "exit" : "animate") : undefined}
        transition={motionEnabled ? transitions.soft : reducedTransition}
        onAnimationComplete={(definition) => {
          if (definition === "exit") onClose();
        }}
      >
        <header className="sdv-modal-head">
          <h2>{title}</h2>
          <button type="button" aria-label={t("spaceHub.aria.close", { title })} onClick={requestClose}>
            ✕
          </button>
        </header>
        {children}
      </motion.section>
    </motion.div>
  );
}

// § 32.1 Add Space Task Modal — spaceId is injected by the caller.
export interface SpaceTaskInput {
  title: string;
  group: string;
  dueDate: string;
  priority: TaskPriority;
  notes: string;
}

export function AddSpaceTaskModal({
  preset,
  groups,
  onSubmit,
  onClose,
}: {
  preset: SpaceTypePreset;
  groups: string[];
  onSubmit: (input: SpaceTaskInput) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [title, setTitle] = useState("");
  const [group, setGroup] = useState(groups[0] ?? "");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError(t("spaceHub.error.titleRequired"));
      return;
    }
    onSubmit({ title: title.trim(), group, dueDate, priority, notes });
  }

  return (
    <ModalShell title={t("spaceHub.modal.addTaskTitle")} onClose={onClose}>
      <form className="sdv-form" onSubmit={submit}>
        <label>
          {t("spaceHub.field.title")}
          <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </label>
        <div className="sdv-form-row">
          <label>
            {t("spaceHub.field.group")}
            <select value={group} onChange={(event) => setGroup(event.target.value)}>
              {groups.map((label) => (
                <option key={label} value={label}>
                  {groupText(t, label)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="sdv-form-row">
          <label>
            {t("spaceHub.field.dueDate")}
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <label>
            {t("spaceHub.field.priority")}
            <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
              <option value="none">{t("spaceHub.priority.none")}</option>
              <option value="low">{t("spaceHub.priority.low")}</option>
              <option value="medium">{t("spaceHub.priority.medium")}</option>
              <option value="high">{t("spaceHub.priority.high")}</option>
            </select>
          </label>
        </div>
        <label>
          {t("spaceHub.field.notes")}
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
        </label>
        {error ? <p className="sdv-form-error">{error}</p> : null}
        <div className="sdv-modal-actions">
          <button type="button" className="sdv-btn" onClick={onClose}>
            {t("spaceHub.action.cancel")}
          </button>
          <button type="submit" className="sdv-btn sdv-btn-primary">
            {t("spaceHub.action.addTask")}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// § 32.2 note modal was replaced by NoteQuickCreateModal (SpaceNotesPanel.tsx).

// § 25.3 Manual record
export function ManualRecordModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (input: { title: string; description: string }) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError(t("spaceHub.error.titleRequired"));
      return;
    }
    onSubmit({ title: title.trim(), description: description.trim() });
  }

  return (
    <ModalShell title={t("spaceHub.modal.manualTitle")} onClose={onClose}>
      <form className="sdv-form" onSubmit={submit}>
        <label>
          {t("spaceHub.field.whatHappened")}
          <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </label>
        <label>
          {t("spaceHub.field.details")}
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
        </label>
        {error ? <p className="sdv-form-error">{error}</p> : null}
        <div className="sdv-modal-actions">
          <button type="button" className="sdv-btn" onClick={onClose}>
            {t("spaceHub.action.cancel")}
          </button>
          <button type="submit" className="sdv-btn sdv-btn-primary">
            {t("spaceHub.action.addRecord")}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// § 7.5 Start Focus without a next action -> task picker
export function FocusStartPickerModal({
  spaceTasks,
  onPick,
  onClose,
}: {
  spaceTasks: Task[];
  onPick: (taskId: string) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const open = spaceTasks.filter((task) => !isTaskDone(task) && task.status !== "waiting");
  return (
    <ModalShell title={t("spaceHub.modal.pickTitle")} onClose={onClose}>
      {open.length === 0 ? (
        <p className="sdv-empty-inline">{t("spaceHub.empty.noOpenTasksAdd")}</p>
      ) : (
        <ul className="sdv-record-list sdv-picker-list">
          {open.map((task) => (
            <li key={task.id}>
              <button type="button" onClick={() => onPick(task.id)}>
                <strong>{task.title}</strong>
                {task.dueDate ? <small>{t("spaceHub.meta.due", { date: formatDate(task.dueDate) })}</small> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </ModalShell>
  );
}

// § 33.9 Focus conflict — only one active session allowed.
export function FocusConflictModal({ onGoToFocus, onClose }: { onGoToFocus: () => void; onClose: () => void }) {
  const { t } = useT();
  return (
    <ModalShell title={t("spaceHub.modal.conflictTitle")} onClose={onClose}>
      <p className="sdv-modal-copy">{t("spaceHub.modal.conflictBody")}</p>
      <div className="sdv-modal-actions">
        <button type="button" className="sdv-btn" onClick={onClose}>
          {t("spaceHub.action.cancel")}
        </button>
        <button type="button" className="sdv-btn sdv-btn-primary" onClick={onGoToFocus}>
          {t("spaceHub.action.goToFocus")}
        </button>
      </div>
    </ModalShell>
  );
}

export function DeleteSpaceConfirmModal({
  spaceName,
  isProject,
  isStudy = false,
  onConfirm,
  onClose,
}: {
  spaceName: string;
  isProject: boolean;
  isStudy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Same keyboard contract as ConfirmModal: the confirm button is focused on
  // open so Enter deletes right away; Escape cancels.
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Enter") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "BUTTON" || target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      event.preventDefault();
      onConfirm();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, onConfirm]);

  return (
    <ModalShell title={t("spaces.delete.title")} onClose={onClose}>
      <p className="sdv-modal-copy">
        {t("spaces.delete.body", { name: spaceName })}{" "}
        {isProject
          ? t("spaces.delete.projectHint")
          : isStudy
            ? t("spaces.delete.studyHint")
            : t("spaces.delete.localHint")}
      </p>
      <div className="sdv-modal-actions">
        <button type="button" className="sdv-btn" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button ref={confirmRef} type="button" className="sdv-btn sdv-btn-danger" onClick={onConfirm}>
          {t("spaces.delete.confirm")}
        </button>
      </div>
    </ModalShell>
  );
}
