import { useState } from "react";
import type { Project, TaskPriority } from "../../types";
import type { TodayBucketId } from "../../utils/todayView";
import { todayValue } from "../../utils/date";
import { Modal, useAutoFocus } from "../kit";
import { useT } from "../../i18n";

export interface QuickAddInput {
  title: string;
  projectId: string;
  bucket: TodayBucketId;
  priority: TaskPriority;
  dueDate: string;
  notes: string;
}

interface QuickAddTaskModalProps {
  projects: Project[];
  onCreate: (input: QuickAddInput) => void;
  onClose: () => void;
}

export function QuickAddTaskModal({ projects, onCreate, onClose }: QuickAddTaskModalProps) {
  const { t } = useT();
  const titleRef = useAutoFocus<HTMLInputElement>();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [bucket, setBucket] = useState<TodayBucketId>("next");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState(todayValue());
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
      projectId,
      bucket,
      priority,
      dueDate: dueDate || todayValue(),
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
              if (event.key === "Enter") submit();
            }}
          />
        </label>
        {error ? <p className="tdy-form-error">{error}</p> : null}

        <label>
          {t("todayv.fieldSpace")}
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">{t("todayv.noSpace")}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t("todayv.fieldBucket")}
          <div className="tdy-bucket-picker" role="radiogroup" aria-label={t("todayv.fieldBucket")}>
            {(["now", "next", "later"] as TodayBucketId[]).map((candidate) => (
              <button
                key={candidate}
                type="button"
                role="radio"
                aria-checked={bucket === candidate}
                className={bucket === candidate ? "active" : ""}
                onClick={() => setBucket(candidate)}
              >
                {t(`todayv.bucket.${candidate}`)}
              </button>
            ))}
          </div>
        </label>

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
