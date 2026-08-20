import { ReactNode, useState } from "react";
import type { CustomStatus, FocusSession, Folder, List, Project, Task } from "../../types";
import type { SpaceCustomConfig } from "../../lib/spaceHubTypes";
import {
  formatSeconds,
  sessionSeconds,
} from "../../lib/spaceSelectors";
import { FolderManager } from "../projects/FolderManager";
import { formatDate } from "../../utils/date";
import { useT } from "../../i18n";

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

/**
 * Folder management for one Project (SPACE_REMOVAL_IA D-2).
 *
 * A drawer of its own rather than a section of `SpaceSettingsDrawer`: that one
 * drafts its fields behind a Save and offers a Cancel, and the actions here
 * land the moment they are made.
 */
export function FoldersDrawer({
  projectId,
  folders,
  lists,
  onCreate,
  onRename,
  onArchive,
  onClose,
}: {
  projectId: string;
  folders: Folder[];
  lists: List[];
  onCreate: (projectId: string, name: string) => void;
  onRename: (folderId: string, name: string) => void;
  onArchive: (folderId: string) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  return (
    <DrawerShell title={t("spaceHub.drawer.folders")} onClose={onClose}>
      <FolderManager
        projectId={projectId}
        folders={folders}
        lists={lists}
        onCreate={onCreate}
        onRename={onRename}
        onArchive={onArchive}
      />
    </DrawerShell>
  );
}

/**
 * The custom statuses of one Project (SPACE_REMOVAL_IA D-3).
 *
 * One panel, opened from two entry points: the Board tab of the Project screen,
 * and the global Matrix when its scope selector names a Project. The drawer
 * handles its own visibility — no toggle button inside.
 */
export function StatusesDrawer({
  project,
  onCreate,
  onRename,
  onReorder,
  onArchive,
  onClose,
}: {
  project: Project;
  onCreate: (name: string) => void;
  onRename: (statusId: string, name: string) => void;
  onReorder: (statusId: string, order: number) => void;
  onArchive: (statusId: string) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState("");
  const active: CustomStatus[] = (project.boardLists ?? [])
    .filter((status) => !status.archivedAt)
    .sort((a, b) => a.order - b.order);

  return (
    <DrawerShell title={t("spaceHub.drawer.statuses")} onClose={onClose}>
      <div className="sdv-statuses-body">
        {active.map((status, index) => (
          <div key={status.id} className="sdv-status-row">
            <input
              defaultValue={status.name}
              aria-label={t("spaceGoals.statusName")}
              onBlur={(event) => {
                const name = event.target.value.trim();
                if (name && name !== status.name) onRename(status.id, name);
              }}
            />
            <button type="button" disabled={index === 0} onClick={() => onReorder(status.id, status.order - 1)}>↑</button>
            <button type="button" disabled={index === active.length - 1} onClick={() => onReorder(status.id, status.order + 1)}>↓</button>
            <button type="button" onClick={() => onArchive(status.id)}>{t("common.archive")}</button>
          </div>
        ))}
        <form
          className="sdv-status-add"
          onSubmit={(event) => {
            event.preventDefault();
            const name = draft.trim();
            if (!name) return;
            onCreate(name);
            setDraft("");
          }}
        >
          <input
            value={draft}
            placeholder={t("spaceGoals.statusPlaceholder")}
            aria-label={t("spaceGoals.statusPlaceholder")}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit">+ {t("spaceGoals.addStatus")}</button>
        </form>
      </div>
    </DrawerShell>
  );
}

// § 32.4 Task Detail Drawer
export function TaskDetailDrawer({
  task,
  parentTask,
  childTasks,
  projects,
  sessions,
  isPinned,
  onStartFocus,
  onComplete,
  onPin,
  onArchive,
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
  isPinned: boolean;
  onStartFocus: () => void;
  onComplete: () => void;
  onPin: () => void;
  onArchive: () => void;
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
