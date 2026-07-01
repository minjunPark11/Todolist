import { FormEvent, useState } from "react";
import type { Project } from "../../types";
import { formatDate } from "../../utils/date";
import { Modal, useAutoFocus } from "../kit";

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
      title={defaults.allDay ? `New item — ${formatDate(defaults.date)}` : `New task — ${formatDate(defaults.date)}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="ff-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="ff-btn ff-btn-primary" onClick={() => submit()}>
            Save
          </button>
        </>
      }
    >
      <form className="gcal-quick-create-form" onSubmit={submit}>
        <label>
          <span>Title</span>
          <input
            ref={titleRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
              if (event.key === "Escape") onClose();
            }}
            placeholder="What do you need to do?"
          />
        </label>

        {defaults.allDay ? (
          <label>
            <span>Type</span>
            <select value={type} onChange={(event) => setType(event.target.value as "task" | "deadline")}>
              <option value="task">Task (scheduled)</option>
              <option value="deadline">Deadline</option>
            </select>
          </label>
        ) : null}

        <label>
          <span>Date</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>

        {!defaults.allDay ? (
          <>
            <label>
              <span>Start time</span>
              <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </label>
            <label>
              <span>End time</span>
              <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </label>
          </>
        ) : null}

        <label>
          <span>Project</span>
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Inbox</option>
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
