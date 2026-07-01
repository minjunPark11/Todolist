import { FormEvent, useState } from "react";
import type { Project } from "../../types";
import type { CalendarDraftBlock } from "../../utils/calendarTime";
import { formatDate } from "../../utils/date";
import { useAutoFocus } from "../kit";
import { useT } from "../../i18n";

export interface NewTaskFormResult {
  title: string;
  projectId: string;
  dueDate: string;
}

interface NewTaskFormProps {
  draft: CalendarDraftBlock;
  projects: Project[];
  onCancel: () => void;
  onCreate: (result: NewTaskFormResult) => void;
}

// CALENDAR_V3_DESIGN.md §3/§6: draft time info lives in CalendarView state;
// this form only owns "what" (title/project/dueDate), so Cancel/remount never
// touches the draft's time range.
export function NewTaskForm({ draft, projects, onCancel, onCreate }: NewTaskFormProps) {
  const { t, lang } = useT();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const titleRef = useAutoFocus<HTMLInputElement>();

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t("calendar.taskTitleRequired"));
      return;
    }
    onCreate({ title: trimmed, projectId, dueDate });
  }

  return (
    <form className="gcal-newtask-form" onSubmit={submit}>
      <header className="gcal-newtask-head">
        <h2>{t("calendar.quickCreateTitle")}</h2>
        <button type="button" className="ff-icon-btn" aria-label={t("calendar.cancelNewTaskAria")} onClick={onCancel}>
          ✕
        </button>
      </header>

      <label>
        <span>{t("common.titleLabel")}</span>
        <input
          ref={titleRef}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (error) setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") onCancel();
          }}
          placeholder={t("calendar.titlePlaceholderQuestion")}
        />
      </label>
      {error ? <p className="gcal-newtask-error">{error}</p> : null}

      <div className="gcal-newtask-when">
        <span className="gcal-newtask-when-label">{t("calendar.when")}</span>
        <strong>{formatDate(draft.date, lang)}</strong>
        <span>
          {draft.startTime} – {draft.endTime}
        </span>
      </div>

      <label>
        <span>{t("common.project")}</span>
        <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          <option value="">{t("inbox.title")}</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>{t("common.dueDate")}</span>
        <input
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          placeholder={t("calendar.optional")}
        />
      </label>

      <div className="gcal-newtask-actions">
        <button type="button" className="ff-btn" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="ff-btn ff-btn-primary">
          {t("calendar.createTask")}
        </button>
      </div>
    </form>
  );
}
