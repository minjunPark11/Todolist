import { FormEvent, ReactNode, useState } from "react";
import type { Task, TaskPriority } from "../../types";
import type { SpaceTypePreset } from "../../lib/spaceHubTypes";
import type { SpaceNoteDraft } from "../../hooks/useSpaceHubData";
import { isTaskDone, isTaskUnscheduled } from "../../lib/spaceSelectors";
import { formatDate, todayValue } from "../../utils/date";
import { useT } from "../../i18n";
import { groupText, noteTypeText } from "../../lib/spaceHubI18n";

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useT();
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
          <button type="button" aria-label={t("spaceHub.aria.close", { title })} onClick={onClose}>
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
  const { t } = useT();
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
      setError(t("spaceHub.error.titleRequired"));
      return;
    }
    onSubmit({ title: title.trim(), group, durationMinutes, dueDate, priority, notes });
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
          <label>
            {t("spaceHub.field.estimated")}
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
  const { t } = useT();
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
      setError(t("spaceHub.error.titleRequired"));
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
    <ModalShell title={t("spaceHub.modal.addNoteTitle")} onClose={onClose}>
      <form className="sdv-form" onSubmit={submit}>
        <label>
          {t("spaceHub.field.title")}
          <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </label>
        <div className="sdv-form-row">
          <label>
            {t("spaceHub.field.type")}
            <select value={type} onChange={(event) => setType(event.target.value)}>
              {preset.noteTypes.map((item) => (
                <option key={item} value={item}>
                  {noteTypeText(t, item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("spaceHub.field.relatedTask")}
            <select value={relatedTaskId} onChange={(event) => setRelatedTaskId(event.target.value)}>
              <option value="">{t("spaceHub.option.none")}</option>
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
          {t("spaceHub.field.body")}
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={4} />
        </label>
        <label>
          {t("spaceHub.field.url")}
          <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
        </label>
        <label>
          {t("spaceHub.field.tags")}
          <input value={tagsText} onChange={(event) => setTagsText(event.target.value)} />
        </label>
        {error ? <p className="sdv-form-error">{error}</p> : null}
        <div className="sdv-modal-actions">
          <button type="button" className="sdv-btn" onClick={onClose}>
            {t("spaceHub.action.cancel")}
          </button>
          <button type="submit" className="sdv-btn sdv-btn-primary">
            {t("spaceHub.action.addNote")}
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
  const { t } = useT();
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
    <ModalShell title={t("spaceHub.modal.scheduleTitle")} onClose={onClose}>
      <form className="sdv-form" onSubmit={submit}>
        <label>
          {t("spaceHub.field.task")}
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
            {t("spaceHub.field.date")}
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            {t("spaceHub.field.startTime")}
            <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </label>
          <label>
            {t("spaceHub.field.duration")}
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
            {t("spaceHub.action.cancel")}
          </button>
          <button type="submit" className="sdv-btn sdv-btn-primary" disabled={!selectedId}>
            {t("spaceHub.action.schedule")}
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
  const { t } = useT();
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
    <ModalShell title={t("spaceHub.modal.suggestTitle")} onClose={onClose}>
      <p className="sdv-modal-copy">{t("spaceHub.modal.suggestBody")}</p>
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
          {t("spaceHub.action.cancel")}
        </button>
        <button
          type="button"
          className="sdv-btn sdv-btn-primary"
          disabled={selected.size === 0}
          onClick={() => onApply(suggestions.filter((item) => selected.has(item.taskId)))}
        >
          {t("spaceHub.action.applyN", { n: selected.size })}
        </button>
      </div>
    </ModalShell>
  );
}
