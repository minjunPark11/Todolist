import type { FocusSession, Task } from "../../types";
import type { SpaceActivity, SpaceTab, SpaceTypePreset } from "../../lib/spaceHubTypes";
import {
  formatSeconds,
  isTaskDone,
  relativeTime,
  sessionSeconds,
} from "../../lib/spaceSelectors";
import { useT } from "../../i18n";
import { presetText } from "../../lib/spaceHubI18n";
import { formatDate } from "../../utils/date";

const activityIcons: Record<SpaceActivity["type"], string> = {
  task_created: "＋",
  task_updated: "✎",
  task_completed: "✓",
  task_scheduled: "📅",
  focus_started: "⏱",
  focus_completed: "⏱",
  manual_record: "•",
  ai_suggestion_applied: "✦",
};

export function SpaceOverviewTab({
  preset,
  spaceTasks,
  activities,
  recentSessions,
  onOpenTask,
  onToggleDone,
  onStartFocus,
  onAddTask,
  onOpenSession,
  onOpenFocusPage,
  onOpenTab,
}: {
  preset: SpaceTypePreset;
  spaceTasks: Task[];
  activities: SpaceActivity[];
  recentSessions: FocusSession[];
  onOpenTask: (taskId: string) => void;
  onToggleDone: (taskId: string) => void;
  onStartFocus: (taskId: string) => void;
  onAddTask: () => void;
  onOpenSession: (sessionId: string) => void;
  onOpenFocusPage: () => void;
  onOpenTab: (tab: SpaceTab) => void;
}) {
  const { t } = useT();
  const openTasks = spaceTasks.filter((task) => !isTaskDone(task));
  const previewTasks = [...openTasks]
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
    .slice(0, 5);

  return (
    <div className="sdv-overview-layout">
      {/* Primary task preview. Space AI uses the global assistant instead of
          maintaining a second summary state in this page. */}
      <div className="sdv-overview-top">
        {/* Tasks card (§15) */}
        <section className="sdv-card">
          <header className="sdv-card-head">
            <h2>{presetText(t, preset.primaryTaskSectionLabel)}</h2>
            <div className="sdv-card-head-actions">
              <button type="button" className="sdv-btn sdv-btn-sm" onClick={onAddTask}>
                {presetText(t, preset.addTaskLabel)}
              </button>
              <button type="button" className="sdv-link" onClick={() => onOpenTab("tasks")}>
                {t("spaceHub.action.viewAll")}
              </button>
            </div>
          </header>
          {previewTasks.length === 0 ? (
            <div className="sdv-empty">
              <p>{t("spaceHub.empty.noTasks")}</p>
              <button type="button" className="sdv-btn sdv-btn-primary sdv-btn-sm" onClick={onAddTask}>
                {presetText(t, preset.addTaskLabel)}
              </button>
            </div>
          ) : (
            <ul className="sdv-task-list">
              {previewTasks.map((task) => (
                <li key={task.id} className="sdv-task-row">
                  <input
                    type="checkbox"
                    checked={false}
                    aria-label={t("spaceHub.aria.complete", { title: task.title })}
                    onChange={() => onToggleDone(task.id)}
                  />
                  <button type="button" className="sdv-task-title" onClick={() => onOpenTask(task.id)}>
                    {task.title}
                  </button>
                  <span className="sdv-task-meta">
                    {task.status === "doing" ? t("spaceHub.taskMeta.inProgress") : task.dueDate ? t("spaceHub.meta.due", { date: formatDate(task.dueDate) }) : "—"}
                  </span>
                  <button type="button" className="sdv-btn sdv-btn-sm sdv-btn-primary" onClick={() => onStartFocus(task.id)}>
                    {t("spaceHub.action.startFocus")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>

      {/* Row 2: activity timeline, focus records, notes */}
      <div className="sdv-overview-bottom">
        {/* Activity timeline (§16) */}
        <section className="sdv-card">
          <header className="sdv-card-head">
            <h2>{t("spaceHub.section.activityTimeline")}</h2>
          </header>
          {activities.length === 0 ? (
            <div className="sdv-empty">
              <p>{t("spaceHub.empty.noActivity")}</p>
            </div>
          ) : (
            <ul className="sdv-activity-list">
              {activities.slice(0, 5).map((activity) => (
                <li key={activity.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (activity.relatedTaskId) onOpenTask(activity.relatedTaskId);
                      else if (activity.relatedSessionId) onOpenSession(activity.relatedSessionId);
                    }}
                  >
                    <span className="sdv-activity-icon" aria-hidden="true">
                      {activityIcons[activity.type]}
                    </span>
                    <span className="sdv-activity-body">
                      <strong>{activity.title}</strong>
                      {activity.description ? <em>{activity.description}</em> : null}
                    </span>
                    <small>{relativeTime(activity.createdAt, t)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Focus records (§19) */}
        <section className="sdv-card">
          <header className="sdv-card-head">
            <h2>{t("spaceHub.section.focusRecords")}</h2>
            <button type="button" className="sdv-link" onClick={onOpenFocusPage}>
              {t("spaceHub.action.viewAll")}
            </button>
          </header>
          {recentSessions.length === 0 ? (
            <div className="sdv-empty">
              <p>{t("spaceHub.empty.noFocusRecords")}</p>
            </div>
          ) : (
            <ul className="sdv-record-list">
              {recentSessions.map((session) => (
                <li key={session.id}>
                  <button type="button" onClick={() => onOpenSession(session.id)}>
                    <strong>{session.title || t("spaceHub.untitledFocus")}</strong>
                    <small>{relativeTime(session.endAt || session.createdAt, t)}</small>
                    <span>{formatSeconds(sessionSeconds(session))}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>
    </div>
  );
}
