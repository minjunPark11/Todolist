import { useState } from "react";
import type { TaskPriority } from "../../types";
import { Modal, useAutoFocus } from "../kit";
import { useT } from "../../i18n";

export interface QuickAddInput {
  title: string;
  priority: TaskPriority;
  dueDate: string;
  notes: string;
  // Checked: creates a Today task right away. Unchecked (default): a
  // title-only capture becomes an Inbox item instead (spec §10).
}

interface QuickAddTaskModalProps {
  /** Prefilled when the capture bar hands its text over (Alt+Enter). */
  initialTitle?: string;
  onCreate: (input: QuickAddInput) => void;
  onClose: () => void;
}

export function QuickAddTaskModal({
  initialTitle = "",
  onCreate,
  onClose,
}: QuickAddTaskModalProps) {
  const { t } = useT();
  const titleRef = useAutoFocus<HTMLInputElement>();
  const [title, setTitle] = useState(initialTitle);
  // "none", matching the capture bar. Defaulting to "medium" meant every task
  // saved through this form claimed a priority the user never picked, and the
  // two entry points disagreed about the same field.
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const canSave = Boolean(title.trim());

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t("todayv.titleRequired"));
      return;
    }
    onCreate({
      title: trimmed,
      priority,
      dueDate,
      notes: notes.trim(),
    });
  }

  return (
    <Modal
      title={t("todayv.quickAddTitle")}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="ff-btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="button" className="ff-btn ff-btn-primary" disabled={!canSave} onClick={submit}>
            {t("common.save")}
          </button>
        </>
      }
    >
      <div className="ff-form">
        <label>
          {t("todayv.fieldTitle")}
          <input
            ref={titleRef}
            value={title}
            placeholder={t("todayv.fieldTitlePlaceholder")}
            onChange={(event) => {
              setTitle(event.target.value);
              if (error) setError("");
            }}
            onKeyDown={(event) => {
              // isComposing: an IME's composition-commit Enter must not save.
              if (event.key === "Enter" && !event.nativeEvent.isComposing) submit();
            }}
          />
        </label>
        {error ? <p className="tdy-form-error">{error}</p> : null}

        <label>
          {t("todayv.fieldPriority")}
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as TaskPriority)}
          >
            <option value="high">{t("priority.high")}</option>
            <option value="medium">{t("priority.medium")}</option>
            <option value="low">{t("priority.low")}</option>
            <option value="none">{t("priority.none")}</option>
          </select>
        </label>

        <label>
          {t("todayv.fieldDue")}
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>

        <label>
          {t("todayv.fieldNotes")}
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}
