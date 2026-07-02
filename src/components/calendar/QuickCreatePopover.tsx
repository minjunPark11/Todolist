import { FormEvent, useState } from "react";
import type { Project } from "../../types";
import { formatDate } from "../../utils/date";
import { Modal, useAutoFocus } from "../kit";
import { useT } from "../../i18n";

export interface QuickCreateDefaults {
  date: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
}

export interface QuickCreateResult {
  title: string;
  type: "task" | "deadline";
  date: string;
  startTime: string;
  endTime: string;
  projectId: string;
}

interface QuickCreatePopoverProps {
  defaults: QuickCreateDefaults;
  projects: Project[];
  onClose: () => void;
  onSave: (result: QuickCreateResult) => void;
}

export function QuickCreatePopover({ defaults, projects, onClose, onSave }: QuickCreatePopoverProps) {
  const { t, lang } = useT();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"task" | "deadline">("task");
  const [date, setDate] = useState(defaults.date);
  const [startTime, setStartTime] = useState(defaults.startTime ?? "");
  const [endTime, setEndTime] = useState(defaults.endTime ?? "");
  const [projectId, setProjectId] = useState("");
  const titleRef = useAutoFocus<HTMLInputElement>();

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onSave({ title: trimmed, type, date, startTime, endTime, projectId });
  }

  return (
    <Modal
      title={
        defaults.allDay
          ? t("calendar.newItemOn", { date: formatDate(defaults.date, lang) })
          : t("calendar.newTaskOn", { date: formatDate(defaults.date, lang) })
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" className="ff-btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="button" className="ff-btn ff-btn-primary" onClick={() => submit()}>
            {t("common.save")}
          </button>
        </>
      }
    >
      <form className="gcal-quick-create-form" onSubmit={submit}>
        <label>
          <span>{t("common.titleLabel")}</span>
          <input
            ref={titleRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
              if (event.key === "Escape") onClose();
            }}
            placeholder={t("calendar.titlePlaceholderQuestion")}
          />
        </label>

        {defaults.allDay ? (
          <label>
            <span>{t("calendar.type")}</span>
            <select value={type} onChange={(event) => setType(event.target.value as "task" | "deadline")}>
              <option value="task">{t("calendar.typeTaskScheduled")}</option>
              <option value="deadline">{t("calendar.typeDeadline")}</option>
            </select>
          </label>
        ) : null}

        <label>
          <span>{t("calendar.date")}</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>

        {!defaults.allDay ? (
          <>
            <label>
              <span>{t("calendar.startTime")}</span>
              <input type="time" step={600} value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </label>
            <label>
              <span>{t("calendar.endTime")}</span>
              <input type="time" step={600} value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </label>
          </>
        ) : null}

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
      </form>
    </Modal>
  );
}
