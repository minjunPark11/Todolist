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

function DrawerShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sdv-drawer-backdrop" onClick={onClose}>
      <aside className="sdv-drawer" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <header className="sdv-drawer-head">
          <h2>{title}</h2>
          <button type="button" aria-label={`Close ${title}`} onClick={onClose}>
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
  estMinutes,
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
  estMinutes: number;
  isPinned: boolean;
  onStartFocus: () => void;
  onSchedule: () => void;
  onComplete: () => void;
  onPin: () => void;
  onArchive: () => void;
  onOpenNote: (noteId: string) => void;
  onClose: () => void;
}) {
  const project = projects.find((item) => item.id === task.projectId);
  const done = task.status === "done";
  return (
    <DrawerShell title="Task" onClose={onClose}>
      <h3 className="sdv-drawer-title">{task.title}</h3>
      <dl className="sdv-detail-list">
        <div>
          <dt>Status</dt>
          <dd>{task.status}</dd>
        </div>
        <div>
          <dt>Estimated</dt>
          <dd>{estMinutes}m</dd>
        </div>
        <div>
          <dt>Actual</dt>
          <dd>{task.actualSeconds ? formatSeconds(task.actualSeconds) : "—"}</dd>
        </div>
        <div>
          <dt>Due date</dt>
          <dd>{task.dueDate ? formatDate(task.dueDate) : "—"}</dd>
        </div>
        <div>
          <dt>Scheduled</dt>
          <dd>
            {task.scheduledDate ? `${formatDate(task.scheduledDate)}${task.startTime ? ` ${task.startTime}` : ""}` : "Unscheduled"}
          </dd>
        </div>
        <div>
          <dt>Priority</dt>
          <dd>{task.priority}</dd>
        </div>
        {project ? (
          <div>
            <dt>Project</dt>
            <dd>{project.name}</dd>
          </div>
        ) : null}
      </dl>
      {task.notes ? <p className="sdv-drawer-notes">{task.notes}</p> : null}

      {sessions.length > 0 ? (
        <>
          <h4>Focus sessions</h4>
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
          <h4>Linked notes</h4>
          <ul className="sdv-record-list">
            {notes.map((note) => (
              <li key={note.id}>
                <button type="button" onClick={() => onOpenNote(note.id)}>
                  <strong>{note.title}</strong>
                  <small>{note.type}</small>
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
              Start Focus
            </button>
            <button type="button" className="sdv-btn" onClick={onSchedule}>
              Schedule
            </button>
            <button type="button" className="sdv-btn" onClick={onComplete}>
              Mark complete
            </button>
            <button type="button" className="sdv-btn" onClick={onPin} disabled={isPinned}>
              {isPinned ? "Pinned as next action" : "Pin as next action"}
            </button>
          </>
        ) : null}
        <button type="button" className="sdv-btn sdv-btn-danger" onClick={onArchive}>
          Archive
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
  return (
    <DrawerShell title="Focus session" onClose={onClose}>
      <h3 className="sdv-drawer-title">{session.title || task?.title || "Untitled focus"}</h3>
      <dl className="sdv-detail-list">
        <div>
          <dt>Duration</dt>
          <dd>{formatSeconds(sessionSeconds(session))}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{new Date(session.startAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Ended</dt>
          <dd>{session.endAt ? new Date(session.endAt).toLocaleString() : "In progress"}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{session.status}</dd>
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
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);

  return (
    <DrawerShell title="Note" onClose={onClose}>
      {editing ? (
        <div className="sdv-form">
          <label>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            Body
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
              Save
            </button>
            <button type="button" className="sdv-btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <h3 className="sdv-drawer-title">{note.title}</h3>
          <span className="sdv-note-type">{note.type}</span>
          {note.body ? <p className="sdv-drawer-notes">{note.body}</p> : null}
          {note.url ? (
            <a className="sdv-btn sdv-btn-sm" href={note.url} target="_blank" rel="noreferrer">
              Open link ↗
            </a>
          ) : null}
          {relatedTask ? (
            <dl className="sdv-detail-list">
              <div>
                <dt>Related task</dt>
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
              Edit
            </button>
            <button type="button" className="sdv-btn sdv-btn-danger" onClick={onDelete}>
              Delete
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
  const [messages, setMessages] = useState<{ id: number; command: string; reply: string }[]>([]);

  function respond(command: string, reply: string) {
    setMessages((current) => [...current, { id: Date.now(), command, reply }]);
  }

  const commands: { label: string; run: () => void }[] = [
    {
      label: "Summarize this Space",
      run: () =>
        respond(
          "Summarize this Space",
          `${spaceName}: ${signal.label} (${signal.detail}). ${counts.open} open tasks, ${counts.unscheduled} unscheduled, ${counts.overdue} overdue. ${formatSeconds(weekFocusSeconds)} focused this week.`,
        ),
    },
    {
      label: "Recommend next action",
      run: () =>
        respond(
          "Recommend next action",
          nextAction ? `Start with "${nextAction.title}". Use the button below to pin it as the next action.` : "No open tasks to recommend — add a task first.",
        ),
    },
    {
      label: "Check deadline risk",
      run: () =>
        respond(
          "Check deadline risk",
          counts.overdue > 0
            ? `${counts.overdue} tasks are overdue — handle these first.`
            : upcoming.length > 0
              ? `Nearest item: "${upcoming[0].title}" on ${formatDate(upcoming[0].when)}. No overdue tasks.`
              : "No deadlines at risk this week.",
        ),
    },
    {
      label: "Review recent records",
      run: () =>
        respond(
          "Review recent records",
          `This week: ${formatSeconds(weekFocusSeconds)} of focus. ${counts.done} tasks done in this Space overall. Check the Records tab for the full timeline.`,
        ),
    },
  ];

  return (
    <DrawerShell title={`${spaceName} AI`} onClose={onClose}>
      <p className="sdv-modal-copy">Ask about this Space. Suggestions never change data until you apply them.</p>
      <div className="sdv-ai-commands">
        {commands.map((command) => (
          <button key={command.label} type="button" className="sdv-chip" onClick={command.run}>
            {command.label}
          </button>
        ))}
        <button type="button" className="sdv-chip" onClick={onSuggestSchedule}>
          Place this week's tasks
        </button>
        <button type="button" className="sdv-chip" onClick={onGenerateNextAction}>
          Generate next action
        </button>
      </div>
      <div className="sdv-ai-log" aria-live="polite">
        {messages.length === 0 ? (
          <p className="sdv-empty-inline">Pick a command above to get started.</p>
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
  onClose: () => void;
}) {
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
    <DrawerShell title="Space settings" onClose={onClose}>
      <div className="sdv-form">
        <h4>General</h4>
        <label>
          Name
          <input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
        </label>
        <label>
          Description
          <textarea value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} rows={2} />
        </label>
        <label>
          Color
          <input type="color" value={normalizeColor(draftColor)} onChange={(event) => setDraftColor(event.target.value)} />
        </label>

        <h4>Task groups</h4>
        <ul className="sdv-group-editor">
          {draftGroups.map((group, index) => (
            <li key={group.id}>
              <input
                value={group.label}
                aria-label={`Group ${index + 1} name`}
                onChange={(event) =>
                  setDraftGroups((current) => current.map((item) => (item.id === group.id ? { ...item, label: event.target.value } : item)))
                }
              />
              <button type="button" aria-label="Move up" onClick={() => moveGroup(index, -1)} disabled={index === 0}>
                ↑
              </button>
              <button type="button" aria-label="Move down" onClick={() => moveGroup(index, 1)} disabled={index === draftGroups.length - 1}>
                ↓
              </button>
              <button
                type="button"
                className={group.hidden ? "sdv-hidden-toggle hidden" : "sdv-hidden-toggle"}
                onClick={() =>
                  setDraftGroups((current) => current.map((item) => (item.id === group.id ? { ...item, hidden: !item.hidden } : item)))
                }
              >
                {group.hidden ? "Hidden" : "Visible"}
              </button>
            </li>
          ))}
        </ul>
        <div className="sdv-form-row sdv-add-group">
          <input
            value={newGroupLabel}
            placeholder="New group name"
            aria-label="New group name"
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
            Add group
          </button>
        </div>

        <h4>Overview cards</h4>
        {(
          [
            ["nextAction", "Next Action"],
            ["signal", "Signal"],
            ["focusTime", "Focus Time"],
            ["upcoming", "Upcoming"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="sdv-check-row">
            <input
              type="checkbox"
              checked={draftCards[key]}
              onChange={(event) => setDraftCards((current) => ({ ...current, [key]: event.target.checked }))}
            />
            {label}
          </label>
        ))}

        <h4>Defaults</h4>
        <div className="sdv-form-row">
          <label>
            Default duration (min)
            <input
              type="number"
              min={5}
              step={5}
              value={draftDefaults.defaultDurationMinutes}
              onChange={(event) =>
                setDraftDefaults((current) => ({
                  ...current,
                  defaultDurationMinutes: Math.max(5, Number(event.target.value) || current.defaultDurationMinutes),
                }))
              }
            />
          </label>
          <label>
            Weekly focus goal (hours)
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
            Save settings
          </button>
          <button type="button" className="sdv-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </DrawerShell>
  );
}

function normalizeColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#7c3aed";
}
