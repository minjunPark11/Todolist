import { FormEvent, ReactNode, useState } from "react";
import type { Task, TaskPriority } from "../../types";
import type { SpaceTypePreset } from "../../lib/spaceHubTypes";
import type { SpaceNoteDraft } from "../../hooks/useSpaceHubData";
import { isTaskDone, isTaskUnscheduled } from "../../lib/spaceSelectors";
import { formatDate, todayValue } from "../../utils/date";
import { useT } from "../../i18n";

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sdv-modal-backdrop" onClick={onClose}>
      <section
        className="sdv-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sdv-modal-head">
          <h2>{title}</h2>
          <button type="button" aria-label={`Close ${title}`} onClick={onClose}>
            ✕
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

// § 32.1 Add Space Task Modal — spaceId is injected by the caller.
export interface SpaceTaskInput {
  title: string;
  group: string;
  durationMinutes: number;
  dueDate: string;
  priority: TaskPriority;
  notes: string;
}

export function AddSpaceTaskModal({
  preset,
  groups,
  defaultDuration,
  onSubmit,
  onClose,
}: {
  preset: SpaceTypePreset;
  groups: string[];
  defaultDuration: number;
  onSubmit: (input: SpaceTaskInput) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [group, setGroup] = useState(groups[0] ?? "");
  const [durationMinutes, setDurationMinutes] = useState(defaultDuration);
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    onSubmit({ title: title.trim(), group, durationMinutes, dueDate, priority, notes });
  }

  return (
    <ModalShell title={preset.addTaskLabel.replace(/^\+\s*/, "Add ")} onClose={onClose}>
      <form className="sdv-form" onSubmit={submit}>
        <label>
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </label>
        <div className="sdv-form-row">
          <label>
            Group
            <select value={group} onChange={(event) => setGroup(event.target.value)}>
              {groups.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Estimated (min)
            <input
              type="number"
              min={5}
              step={5}
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(Math.max(5, Number(event.target.value) || defaultDuration))}
            />
          </label>
        </div>
        <div className="sdv-form-row">
          <label>
            Due date
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <label>
            Priority
            <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
              <option value="none">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
        <label>
          Notes
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
        </label>
        {error ? <p className="sdv-form-error">{error}</p> : null}
        <div className="sdv-modal-actions">
          <button type="button" className="sdv-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="sdv-btn sdv-btn-primary">
            Add task
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// § 32.2 Add Space Note Modal
export function AddSpaceNoteModal({
  preset,
  spaceTasks,
  onSubmit,
  onClose,
}: {
  preset: SpaceTypePreset;
  spaceTasks: Task[];
  onSubmit: (input: SpaceNoteDraft) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState(preset.noteTypes[0] ?? "Quick Note");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [relatedTaskId, setRelatedTaskId] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    onSubmit({
      title,
      type,
      body,
      url,
      relatedTaskId,
      tags: tagsText.split(",").map((tag) => tag.trim()).filter(Boolean),
    });
  }

  return (
    <ModalShell title={preset.addNoteLabel.replace(/^\+\s*/, "Add ")} onClose={onClose}>
      <form className="sdv-form" onSubmit={submit}>
        <label>
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </label>
        <div className="sdv-form-row">
          <label>
            Type
            <select value={type} onChange={(event) => setType(event.target.value)}>
              {preset.noteTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Related task
            <select value={relatedTaskId} onChange={(event) => setRelatedTaskId(event.target.value)}>
              <option value="">None</option>
              {spaceTasks
                .filter((task) => !isTaskDone(task))
                .map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <label>
          Body
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={4} />
        </label>
        <label>
          URL (optional)
          <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
        </label>
        <label>
          Tags (comma separated)
          <input value={tagsText} onChange={(event) => setTagsText(event.target.value)} />
        </label>
        {error ? <p className="sdv-form-error">{error}</p> : null}
        <div className="sdv-modal-actions">
          <button type="button" className="sdv-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="sdv-btn sdv-btn-primary">
            Add note
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// § 32.3 Schedule Space Task Modal
export interface ScheduleInput {
  date: string;
  startTime: string;
  endTime: string;
}

export function ScheduleSpaceTaskModal({
  taskId,
  spaceTasks,
  defaultDuration,
  estOf,
  onSubmit,
  onClose,
}: {
  taskId: string;
  spaceTasks: Task[];
  defaultDuration: number;
  estOf: (task: Task) => number;
  onSubmit: (taskId: string, input: ScheduleInput) => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(taskId);
  const selected = spaceTasks.find((task) => task.id === selectedId);
  const [date, setDate] = useState(selected?.scheduledDate || todayValue());
  const [startTime, setStartTime] = useState(selected?.startTime || "14:00");
  const [duration, setDuration] = useState(selected ? estOf(selected) : defaultDuration);
  const candidates = spaceTasks.filter((task) => isTaskUnscheduled(task) || task.id === taskId);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedId || !date || !startTime) return;
    const [hours, minutes] = startTime.split(":").map(Number);
    const endTotal = hours * 60 + minutes + duration;
    const endTime = `${String(Math.floor(endTotal / 60) % 24).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}`;
    onSubmit(selectedId, { date, startTime, endTime });
  }

  return (
    <ModalShell title="Schedule task" onClose={onClose}>
      <form className="sdv-form" onSubmit={submit}>
        <label>
          Task
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {candidates.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
        </label>
        <div className="sdv-form-row">
          <label>
            Date
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            Start time
            <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </label>
          <label>
            Duration (min)
            <input
              type="number"
              min={5}
              step={5}
              value={duration}
              onChange={(event) => setDuration(Math.max(5, Number(event.target.value) || defaultDuration))}
            />
          </label>
        </div>
        <div className="sdv-modal-actions">
          <button type="button" className="sdv-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="sdv-btn sdv-btn-primary" disabled={!selectedId}>
            Schedule
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// § 25.3 Manual record
export function ManualRecordModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (input: { title: string; description: string }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    onSubmit({ title: title.trim(), description: description.trim() });
  }

  return (
    <ModalShell title="Add manual record" onClose={onClose}>
      <form className="sdv-form" onSubmit={submit}>
        <label>
          What happened?
          <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </label>
        <label>
          Details (optional)
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
        </label>
        {error ? <p className="sdv-form-error">{error}</p> : null}
        <div className="sdv-modal-actions">
          <button type="button" className="sdv-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="sdv-btn sdv-btn-primary">
            Add record
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
  const open = spaceTasks.filter((task) => !isTaskDone(task) && task.status !== "waiting");
  return (
    <ModalShell title="Pick a task to focus on" onClose={onClose}>
      {open.length === 0 ? (
        <p className="sdv-empty-inline">No open tasks in this Space. Add a task first.</p>
      ) : (
        <ul className="sdv-record-list sdv-picker-list">
          {open.map((task) => (
            <li key={task.id}>
              <button type="button" onClick={() => onPick(task.id)}>
                <strong>{task.title}</strong>
                {task.dueDate ? <small>due {formatDate(task.dueDate)}</small> : null}
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
  return (
    <ModalShell title="Focus already running" onClose={onClose}>
      <p className="sdv-modal-copy">A focus session is already in progress. Finish or stop it before starting a new one.</p>
      <div className="sdv-modal-actions">
        <button type="button" className="sdv-btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="sdv-btn sdv-btn-primary" onClick={onGoToFocus}>
          Go to current focus
        </button>
      </div>
    </ModalShell>
  );
}

export function DeleteSpaceConfirmModal({
  spaceName,
  isProject,
  onConfirm,
  onClose,
}: {
  spaceName: string;
  isProject: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  return (
    <ModalShell title={t("spaces.delete.title")} onClose={onClose}>
      <p className="sdv-modal-copy">
        {t("spaces.delete.body", { name: spaceName })}{" "}
        {isProject
          ? t("spaces.delete.projectHint")
          : t("spaces.delete.localHint")}
      </p>
      <div className="sdv-modal-actions">
        <button type="button" className="sdv-btn" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button type="button" className="sdv-btn sdv-btn-danger" onClick={onConfirm}>
          {t("spaces.delete.confirm")}
        </button>
      </div>
    </ModalShell>
  );
}

// § 18.7 AI schedule suggestion preview — nothing is applied until confirmed.
export interface ScheduleSuggestion {
  taskId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
}

export function ScheduleSuggestionModal({
  suggestions,
  onApply,
  onClose,
}: {
  suggestions: ScheduleSuggestion[];
  onApply: (suggestions: ScheduleSuggestion[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(suggestions.map((item) => item.taskId)));

  function toggle(taskId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  return (
    <ModalShell title="Suggested schedule (preview)" onClose={onClose}>
      <p className="sdv-modal-copy">Nothing is placed until you apply. Uncheck anything you don't want scheduled.</p>
      <ul className="sdv-record-list sdv-picker-list">
        {suggestions.map((item) => (
          <li key={item.taskId}>
            <label className="sdv-suggestion-row">
              <input type="checkbox" checked={selected.has(item.taskId)} onChange={() => toggle(item.taskId)} />
              <strong>{item.title}</strong>
              <small>
                {formatDate(item.date)} {item.startTime}–{item.endTime}
              </small>
            </label>
          </li>
        ))}
      </ul>
      <div className="sdv-modal-actions">
        <button type="button" className="sdv-btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="sdv-btn sdv-btn-primary"
          disabled={selected.size === 0}
          onClick={() => onApply(suggestions.filter((item) => selected.has(item.taskId)))}
        >
          Apply {selected.size} task{selected.size === 1 ? "" : "s"}
        </button>
      </div>
    </ModalShell>
  );
}
