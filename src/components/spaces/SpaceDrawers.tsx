import { ReactNode, useState } from "react";
import type { FocusSession, Project, Task } from "../../types";
import type { SpaceCustomConfig, SpaceNote, SpaceSectionGroup } from "../../lib/spaceHubTypes";
import {
  formatSeconds,
  sessionSeconds,
  type SpaceSignal,
  type SpaceTaskCounts,
  type UpcomingItem,
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
  projects,
  sessions,
  notes,
  isPinned,
  onStartFocus,
  onSchedule,
  onComplete,
  onPin,
  onArchive,
  onOpenNote,
  onClose,
}: {
  task: Task;
  projects: Project[];
  sessions: FocusSession[];
  notes: SpaceNote[];
  isPinned: boolean;
  onStartFocus: () => void;
  onSchedule: () => void;
  onComplete: () => void;
  onPin: () => void;
  onArchive: () => void;
  onOpenNote: (noteId: string) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const project = projects.find((item) => item.id === task.projectId);
  const done = task.status === "done";
  return (
    <DrawerShell title={t("spaceHub.drawer.task")} onClose={onClose}>
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
          <dt>{t("spaceHub.field.scheduled")}</dt>
          <dd>
            {task.scheduledDate ? `${formatDate(task.scheduledDate)}${task.startTime ? ` ${task.startTime}` : ""}` : t("spaceHub.value.unscheduled")}
          </dd>
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
            <button type="button" className="sdv-btn" onClick={onSchedule}>
              {t("spaceHub.action.schedule")}
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

// § 32.7 Space AI Drawer — command-driven, never mutates without confirmation.
export function SpaceAiDrawer({
  spaceName,
  signal,
  counts,
  nextAction,
  upcoming,
  weekFocusSeconds,
  onSuggestSchedule,
  onGenerateNextAction,
  onClose,
}: {
  spaceName: string;
  signal: SpaceSignal;
  counts: SpaceTaskCounts;
  nextAction: Task | null;
  upcoming: UpcomingItem[];
  weekFocusSeconds: number;
  onSuggestSchedule: () => void;
  onGenerateNextAction: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [messages, setMessages] = useState<{ id: number; command: string; reply: string }[]>([]);

  function respond(command: string, reply: string) {
    setMessages((current) => [...current, { id: Date.now(), command, reply }]);
  }

  const commands: { label: string; run: () => void }[] = [
    {
      label: t("spaceHub.cmd.summarize"),
      run: () =>
        respond(
          t("spaceHub.cmd.summarize"),
          t("spaceHub.cmd.summarizeReply", {
            name: spaceName,
            label: signal.label,
            detail: signal.detail,
            open: counts.open,
            unscheduled: counts.unscheduled,
            overdue: counts.overdue,
            focus: formatSeconds(weekFocusSeconds),
          }),
        ),
    },
    {
      label: t("spaceHub.cmd.recommend"),
      run: () =>
        respond(
          t("spaceHub.cmd.recommend"),
          nextAction ? t("spaceHub.cmd.recommendReply", { title: nextAction.title }) : t("spaceHub.cmd.recommendEmpty"),
        ),
    },
    {
      label: t("spaceHub.cmd.deadline"),
      run: () =>
        respond(
          t("spaceHub.cmd.deadline"),
          counts.overdue > 0
            ? t("spaceHub.cmd.deadlineOverdue", { n: counts.overdue })
            : upcoming.length > 0
              ? t("spaceHub.cmd.deadlineNearest", { title: upcoming[0].title, date: formatDate(upcoming[0].when) })
              : t("spaceHub.cmd.deadlineNone"),
        ),
    },
    {
      label: t("spaceHub.cmd.review"),
      run: () =>
        respond(
          t("spaceHub.cmd.review"),
          t("spaceHub.cmd.reviewReply", { focus: formatSeconds(weekFocusSeconds), done: counts.done }),
        ),
    },
  ];

  return (
    <DrawerShell title={t("spaceHub.drawer.aiTitle", { name: spaceName })} onClose={onClose}>
      <p className="sdv-modal-copy">{t("spaceHub.ai.drawerIntro")}</p>
      <div className="sdv-ai-commands">
        {commands.map((command) => (
          <button key={command.label} type="button" className="sdv-chip" onClick={command.run}>
            {command.label}
          </button>
        ))}
        <button type="button" className="sdv-chip" onClick={onSuggestSchedule}>
          {t("spaceHub.cmd.placeWeek")}
        </button>
        <button type="button" className="sdv-chip" onClick={onGenerateNextAction}>
          {t("spaceHub.ai.generateNextAction")}
        </button>
      </div>
      <div className="sdv-ai-log" aria-live="polite">
        {messages.length === 0 ? (
          <p className="sdv-empty-inline">{t("spaceHub.ai.pickCommand")}</p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="sdv-ai-message">
              <small>{message.command}</small>
              <p>{message.reply}</p>
            </div>
          ))
        )}
      </div>
    </DrawerShell>
  );
}

// § 28 Space Settings Drawer
export function SpaceSettingsDrawer({
  name,
  description,
  color,
  groups,
  overviewCards,
  defaults,
  onSave,
  onRequestDelete,
  onClose,
}: {
  name: string;
  description: string;
  color: string;
  groups: SpaceSectionGroup[];
  overviewCards: SpaceCustomConfig["overviewCards"];
  defaults: SpaceCustomConfig["defaults"];
  onSave: (input: {
    name: string;
    description: string;
    color: string;
    groups: SpaceSectionGroup[];
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
  const [draftGroups, setDraftGroups] = useState<SpaceSectionGroup[]>(groups.map((group) => ({ ...group })));
  const [draftCards, setDraftCards] = useState({ ...overviewCards });
  const [draftDefaults, setDraftDefaults] = useState({ ...defaults });
  const [newGroupLabel, setNewGroupLabel] = useState("");

  function moveGroup(index: number, direction: -1 | 1) {
    setDraftGroups((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((group, order) => ({ ...group, order }));
    });
  }

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

        <h4>{t("spaceHub.settings.taskGroups")}</h4>
        <ul className="sdv-group-editor">
          {draftGroups.map((group, index) => (
            <li key={group.id}>
              <input
                value={group.label}
                aria-label={t("spaceHub.aria.groupName", { n: index + 1 })}
                onChange={(event) =>
                  setDraftGroups((current) => current.map((item) => (item.id === group.id ? { ...item, label: event.target.value } : item)))
                }
              />
              <button type="button" aria-label={t("spaceHub.aria.moveUp")} onClick={() => moveGroup(index, -1)} disabled={index === 0}>
                ↑
              </button>
              <button type="button" aria-label={t("spaceHub.aria.moveDown")} onClick={() => moveGroup(index, 1)} disabled={index === draftGroups.length - 1}>
                ↓
              </button>
              <button
                type="button"
                className={group.hidden ? "sdv-hidden-toggle hidden" : "sdv-hidden-toggle"}
                onClick={() =>
                  setDraftGroups((current) => current.map((item) => (item.id === group.id ? { ...item, hidden: !item.hidden } : item)))
                }
              >
                {group.hidden ? t("spaceHub.settings.hidden") : t("spaceHub.settings.visible")}
              </button>
            </li>
          ))}
        </ul>
        <div className="sdv-form-row sdv-add-group">
          <input
            value={newGroupLabel}
            placeholder={t("spaceHub.settings.newGroupName")}
            aria-label={t("spaceHub.settings.newGroupName")}
            onChange={(event) => setNewGroupLabel(event.target.value)}
          />
          <button
            type="button"
            className="sdv-btn sdv-btn-sm"
            disabled={!newGroupLabel.trim()}
            onClick={() => {
              setDraftGroups((current) => [
                ...current,
                { id: `custom-${Date.now()}`, label: newGroupLabel.trim(), order: current.length },
              ]);
              setNewGroupLabel("");
            }}
          >
            {t("spaceHub.action.addGroup")}
          </button>
        </div>

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
                groups: draftGroups.map((group, order) => ({ ...group, order })),
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
