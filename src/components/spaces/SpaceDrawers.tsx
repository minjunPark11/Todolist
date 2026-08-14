import { ReactNode, useState } from "react";
import type { FocusSession, Project, Task } from "../../types";
import type { SpaceCustomConfig, SpaceNote } from "../../lib/spaceHubTypes";
import {
  formatSeconds,
  sessionSeconds,
} from "../../lib/spaceSelectors";
import { formatDate } from "../../utils/date";
import { useT } from "../../i18n";
import { noteTypeText } from "../../lib/spaceHubI18n";

function DrawerShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useT();
  return (
    <div className="sdv-drawer-backdrop" onClick={onClose}>
      <aside className="sdv-drawer" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <header className="sdv-drawer-head">
          <h2>{title}</h2>
          <button type="button" aria-label={t("spaceHub.aria.close", { title })} onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="sdv-drawer-body">{children}</div>
      </aside>
    </div>
  );
}

// § 32.4 Task Detail Drawer
export function TaskDetailDrawer({
  task,
  parentTask,
  childTasks,
  projects,
  sessions,
  notes,
  isPinned,
  onStartFocus,
  onComplete,
  onPin,
  onArchive,
  onOpenNote,
  onAddChildTask,
  onToggleChildDone,
  onOpenTask,
  onClose,
}: {
  task: Task;
  // Sub-task wiring: one level deep only — a task that has a parent never
  // offers its own "add sub-task" input (children are full Tasks so they
  // flow through Eisenhower / Today / focus like any other task).
  parentTask: Task | null;
  childTasks: Task[];
  projects: Project[];
  sessions: FocusSession[];
  notes: SpaceNote[];
  isPinned: boolean;
  onStartFocus: () => void;
  onComplete: () => void;
  onPin: () => void;
  onArchive: () => void;
  onOpenNote: (noteId: string) => void;
  onAddChildTask: (title: string) => void;
  onToggleChildDone: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [childTitle, setChildTitle] = useState("");
  const project = projects.find((item) => item.id === task.projectId);
  const done = task.status === "done";
  const canAddChildren = !task.parentTaskId;
  const childDone = childTasks.filter((child) => child.status === "done").length;

  function submitChild() {
    const title = childTitle.trim();
    if (!title) return;
    onAddChildTask(title);
    setChildTitle("");
  }

  return (
    <DrawerShell title={t("spaceHub.drawer.task")} onClose={onClose}>
      {parentTask ? (
        <button type="button" className="sdv-parent-link" onClick={() => onOpenTask(parentTask.id)}>
          ↖ {parentTask.title}
        </button>
      ) : null}
      <h3 className="sdv-drawer-title">{task.title}</h3>
      <dl className="sdv-detail-list">
        <div>
          <dt>{t("spaceHub.field.status")}</dt>
          <dd>{t(`spaceHub.taskStatus.${task.status}`)}</dd>
        </div>
        <div>
          <dt>{t("spaceHub.field.actual")}</dt>
          <dd>{task.actualSeconds ? formatSeconds(task.actualSeconds) : "—"}</dd>
        </div>
        <div>
          <dt>{t("spaceHub.field.dueDate")}</dt>
          <dd>{task.dueDate ? formatDate(task.dueDate) : "—"}</dd>
        </div>
        <div>
          <dt>{t("spaceHub.field.priority")}</dt>
          <dd>{t(`spaceHub.priority.${task.priority}`)}</dd>
        </div>
        {project ? (
          <div>
            <dt>{t("spaceHub.field.project")}</dt>
            <dd>{project.name}</dd>
          </div>
        ) : null}
      </dl>
      {task.notes ? <p className="sdv-drawer-notes">{task.notes}</p> : null}

      {canAddChildren ? (
        <>
          <h4>
            {t("spaceHub.section.subtasks")}
            {childTasks.length > 0 ? (
              <span className="sdv-subtask-progress">
                {childDone}/{childTasks.length}
              </span>
            ) : null}
          </h4>
          {childTasks.length > 0 ? (
            <ul className="sdv-subtask-list">
              {childTasks.map((child) => {
                const isChildDone = child.status === "done";
                return (
                  <li key={child.id} className={isChildDone ? "done" : undefined}>
                    <input
                      type="checkbox"
                      checked={isChildDone}
                      aria-label={t("spaceHub.aria.complete", { title: child.title })}
                      onChange={() => onToggleChildDone(child.id)}
                      disabled={isChildDone}
                    />
                    <button type="button" onClick={() => onOpenTask(child.id)}>
                      {child.title}
                    </button>
                    {child.dueDate ? <small>{formatDate(child.dueDate)}</small> : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="sdv-form-row sdv-subtask-add">
            <input
              value={childTitle}
              placeholder={t("spaceHub.subtasks.placeholder")}
              aria-label={t("spaceHub.subtasks.placeholder")}
              onChange={(event) => setChildTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                // isComposing: an IME's composition-commit Enter must not save.
                if (event.nativeEvent.isComposing) return;
                submitChild();
              }}
            />
            <button type="button" className="sdv-btn sdv-btn-sm" disabled={!childTitle.trim()} onClick={submitChild}>
              {t("spaceHub.subtasks.add")}
            </button>
          </div>
        </>
      ) : null}

      {sessions.length > 0 ? (
        <>
          <h4>{t("spaceHub.section.focusSessions")}</h4>
          <ul className="sdv-record-list">
            {sessions.slice(0, 4).map((session) => (
              <li key={session.id}>
                <div className="sdv-actual-row">
                  <strong>{formatSeconds(sessionSeconds(session))}</strong>
                  <small>{formatDate(session.startAt.slice(0, 10))}</small>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {notes.length > 0 ? (
        <>
          <h4>{t("spaceHub.section.linkedNotes")}</h4>
          <ul className="sdv-record-list">
            {notes.map((note) => (
              <li key={note.id}>
                <button type="button" onClick={() => onOpenNote(note.id)}>
                  <strong>{note.title}</strong>
                  <small>{noteTypeText(t, note.type)}</small>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="sdv-drawer-actions">
        {!done ? (
          <>
            <button type="button" className="sdv-btn sdv-btn-primary" onClick={onStartFocus}>
              {t("spaceHub.action.startFocus")}
            </button>
            <button type="button" className="sdv-btn" onClick={onComplete}>
              {t("spaceHub.action.markComplete")}
            </button>
            <button type="button" className="sdv-btn" onClick={onPin} disabled={isPinned}>
              {isPinned ? t("spaceHub.action.pinnedNext") : t("spaceHub.action.pinNext")}
            </button>
          </>
        ) : null}
        <button type="button" className="sdv-btn sdv-btn-danger" onClick={onArchive}>
          {t("spaceHub.action.archive")}
        </button>
      </div>
    </DrawerShell>
  );
}

// § 32.5 Session Detail Drawer
export function SessionDetailDrawer({
  session,
  task,
  onClose,
}: {
  session: FocusSession;
  task: Task | null;
  onClose: () => void;
}) {
  const { t } = useT();
  return (
    <DrawerShell title={t("spaceHub.drawer.session")} onClose={onClose}>
      <h3 className="sdv-drawer-title">{session.title || task?.title || t("spaceHub.untitledFocus")}</h3>
      <dl className="sdv-detail-list">
        <div>
          <dt>{t("spaceHub.field.duration2")}</dt>
          <dd>{formatSeconds(sessionSeconds(session))}</dd>
        </div>
        <div>
          <dt>{t("spaceHub.field.started")}</dt>
          <dd>{new Date(session.startAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt>{t("spaceHub.field.ended")}</dt>
          <dd>{session.endAt ? new Date(session.endAt).toLocaleString() : t("spaceHub.value.inProgress")}</dd>
        </div>
        <div>
          <dt>{t("spaceHub.field.status")}</dt>
          <dd>{t(`spaceHub.sessionStatus.${session.status}`)}</dd>
        </div>
      </dl>
      {session.focusNote ? <p className="sdv-drawer-notes">{session.focusNote}</p> : null}
    </DrawerShell>
  );
}

// § 32.6 Note Detail Drawer
export function NoteDetailDrawer({
  note,
  relatedTask,
  onUpdate,
  onDelete,
  onClose,
}: {
  note: SpaceNote;
  relatedTask: Task | null;
  onUpdate: (patch: Partial<SpaceNote>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);

  return (
    <DrawerShell title={t("spaceHub.drawer.note")} onClose={onClose}>
      {editing ? (
        <div className="sdv-form">
          <label>
            {t("spaceHub.field.title")}
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            {t("spaceHub.field.body")}
            <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={6} />
          </label>
          <div className="sdv-drawer-actions">
            <button
              type="button"
              className="sdv-btn sdv-btn-primary"
              onClick={() => {
                onUpdate({ title: title.trim() || note.title, body });
                setEditing(false);
              }}
            >
              {t("spaceHub.action.save")}
            </button>
            <button type="button" className="sdv-btn" onClick={() => setEditing(false)}>
              {t("spaceHub.action.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <h3 className="sdv-drawer-title">{note.title}</h3>
          <span className="sdv-note-type">{noteTypeText(t, note.type)}</span>
          {note.body ? <p className="sdv-drawer-notes">{note.body}</p> : null}
          {note.url ? (
            <a className="sdv-btn sdv-btn-sm" href={note.url} target="_blank" rel="noreferrer">
              {t("spaceHub.action.openLink")}
            </a>
          ) : null}
          {relatedTask ? (
            <dl className="sdv-detail-list">
              <div>
                <dt>{t("spaceHub.field.relatedTask")}</dt>
                <dd>{relatedTask.title}</dd>
              </div>
            </dl>
          ) : null}
          {note.tags.length > 0 ? (
            <div className="sdv-chip-row">
              {note.tags.map((tag) => (
                <span key={tag} className="sdv-chip">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          <div className="sdv-drawer-actions">
            <button type="button" className="sdv-btn" onClick={() => setEditing(true)}>
              {t("spaceHub.action.edit")}
            </button>
            <button type="button" className="sdv-btn sdv-btn-danger" onClick={onDelete}>
              {t("spaceHub.action.delete")}
            </button>
          </div>
        </>
      )}
    </DrawerShell>
  );
}

// § 28 Space Settings Drawer
export function SpaceSettingsDrawer({
  name,
  description,
  color,
  overviewCards,
  defaults,
  onSave,
  onRequestDelete,
  onClose,
}: {
  name: string;
  description: string;
  color: string;
  overviewCards: SpaceCustomConfig["overviewCards"];
  defaults: SpaceCustomConfig["defaults"];
  onSave: (input: {
    name: string;
    description: string;
    color: string;
    overviewCards: SpaceCustomConfig["overviewCards"];
    defaults: SpaceCustomConfig["defaults"];
  }) => void;
  onRequestDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [draftName, setDraftName] = useState(name);
  const [draftDescription, setDraftDescription] = useState(description);
  const [draftColor, setDraftColor] = useState(color);
  const [draftCards, setDraftCards] = useState({ ...overviewCards });
  const [draftDefaults, setDraftDefaults] = useState({ ...defaults });

  return (
    <DrawerShell title={t("spaceHub.drawer.settings")} onClose={onClose}>
      <div className="sdv-form">
        <h4>{t("spaceHub.settings.general")}</h4>
        <label>
          {t("spaceHub.field.name")}
          <input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
        </label>
        <label>
          {t("spaceHub.field.description")}
          <textarea value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} rows={2} />
        </label>
        <label>
          {t("spaceHub.field.color")}
          <input type="color" value={normalizeColor(draftColor)} onChange={(event) => setDraftColor(event.target.value)} />
        </label>

        <h4>{t("spaceHub.settings.overviewCards")}</h4>
        {(
          [
            ["nextAction", "spaceHub.settings.card.nextAction"],
            ["signal", "spaceHub.settings.card.signal"],
            ["focusTime", "spaceHub.settings.card.focusTime"],
            ["upcoming", "spaceHub.settings.card.upcoming"],
          ] as const
        ).map(([key, labelKey]) => (
          <label key={key} className="sdv-check-row">
            <input
              type="checkbox"
              checked={draftCards[key]}
              onChange={(event) => setDraftCards((current) => ({ ...current, [key]: event.target.checked }))}
            />
            {t(labelKey)}
          </label>
        ))}

        <h4>{t("spaceHub.settings.defaults")}</h4>
        <div className="sdv-form-row">
          <label>
            {t("spaceHub.settings.weeklyGoal")}
            <input
              type="number"
              min={1}
              step={0.5}
              value={draftDefaults.weeklyFocusGoalSeconds / 3600}
              onChange={(event) =>
                setDraftDefaults((current) => ({
                  ...current,
                  weeklyFocusGoalSeconds: Math.max(0.5, Number(event.target.value) || 5) * 3600,
                }))
              }
            />
          </label>
        </div>

        <div className="sdv-drawer-actions">
          <button
            type="button"
            className="sdv-btn sdv-btn-primary"
            onClick={() =>
              onSave({
                name: draftName.trim() || name,
                description: draftDescription,
                color: draftColor,
                overviewCards: draftCards,
                defaults: draftDefaults,
              })
            }
          >
            {t("spaceHub.action.saveSettings")}
          </button>
          <button type="button" className="sdv-btn" onClick={onClose}>
            {t("spaceHub.action.cancel")}
          </button>
          <button type="button" className="sdv-btn sdv-btn-danger" onClick={onRequestDelete}>
            {t("spaceHub.action.deleteSpace")}
          </button>
        </div>
      </div>
    </DrawerShell>
  );
}

function normalizeColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#7c3aed";
}
