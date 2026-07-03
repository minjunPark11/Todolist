import type { FocusSession, Task } from "../../types";
import type { SpaceActivity, SpaceNote, SpaceTab, SpaceTypePreset } from "../../lib/spaceHubTypes";
import {
  formatSeconds,
  isTaskDone,
  relativeTime,
  sessionSeconds,
} from "../../lib/spaceSelectors";
import { useT } from "../../i18n";
import { presetText, noteTypeText } from "../../lib/spaceHubI18n";

const activityIcons: Record<SpaceActivity["type"], string> = {
  task_created: "＋",
  task_updated: "✎",
  task_completed: "✓",
  task_scheduled: "📅",
  focus_started: "⏱",
  focus_completed: "⏱",
  note_created: "📝",
  note_updated: "📝",
  manual_record: "•",
  ai_suggestion_applied: "✦",
};

export function SpaceOverviewTab({
  preset,
  spaceTasks,
  activities,
  recentSessions,
  spaceNotes,
  aiSummary,
  estOf,
  onOpenTask,
  onToggleDone,
  onStartFocus,
  onSchedule,
  onAddTask,
  onAddNote,
  onOpenNote,
  onOpenSession,
  onOpenTab,
  onGenerateAiSummary,
  onAiSuggestSchedule,
  onGenerateNextAction,
}: {
  preset: SpaceTypePreset;
  spaceTasks: Task[];
  activities: SpaceActivity[];
  recentSessions: FocusSession[];
  spaceNotes: SpaceNote[];
  aiSummary: { state: "idle" | "loading" | "ready" | "error"; text: string; tips: string[] };
  estOf: (task: Task) => number;
  onOpenTask: (taskId: string) => void;
  onToggleDone: (taskId: string) => void;
  onStartFocus: (taskId: string) => void;
  onSchedule: (taskId: string) => void;
  onAddTask: () => void;
  onAddNote: () => void;
  onOpenNote: (noteId: string) => void;
  onOpenSession: (sessionId: string) => void;
  onOpenTab: (tab: SpaceTab) => void;
  onGenerateAiSummary: () => void;
  onAiSuggestSchedule: () => void;
  onGenerateNextAction: () => void;
}) {
  const { t } = useT();
  const openTasks = spaceTasks.filter((task) => !isTaskDone(task));
  const previewTasks = [...openTasks]
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
    .slice(0, 5);

  return (
    <div className="sdv-overview-layout">
      {/* Row 1: tasks + AI summary */}
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
                    {task.status === "doing" ? t("spaceHub.taskMeta.inProgress") : task.scheduledDate ? t("spaceHub.taskMeta.scheduled") : t("spaceHub.taskMeta.toSchedule")}
                  </span>
                  <span className="sdv-task-est">{estOf(task)}m</span>
                  {task.scheduledDate ? (
                    <button type="button" className="sdv-btn sdv-btn-sm sdv-btn-primary" onClick={() => onStartFocus(task.id)}>
                      {t("spaceHub.action.startFocus")}
                    </button>
                  ) : (
                    <button type="button" className="sdv-btn sdv-btn-sm" onClick={() => onSchedule(task.id)}>
                      {t("spaceHub.action.schedule")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* AI Space Summary (§18) — never auto-runs */}
        <section className="sdv-card sdv-ai-card">
          <header className="sdv-card-head">
            <h2>{presetText(t, preset.aiSummaryLabel)}</h2>
          </header>
          {aiSummary.state === "idle" ? (
            <div className="sdv-empty">
              <p>{t("spaceHub.ai.generatePrompt")}</p>
              <button type="button" className="sdv-btn sdv-btn-primary sdv-btn-sm" onClick={onGenerateAiSummary}>
                {t("spaceHub.ai.generate")}
              </button>
            </div>
          ) : aiSummary.state === "loading" ? (
            <p className="sdv-empty-inline">{t("spaceHub.ai.building")}</p>
          ) : aiSummary.state === "error" ? (
            <div className="sdv-empty">
              <p>{t("spaceHub.ai.error")}</p>
              <button type="button" className="sdv-btn sdv-btn-sm" onClick={onGenerateAiSummary}>
                {t("spaceHub.action.retry")}
              </button>
            </div>
          ) : (
            <>
              <p className="sdv-ai-text">{aiSummary.text}</p>
              <ul className="sdv-ai-tips">
                {aiSummary.tips.map((tip) => (
                  <li key={tip}>✓ {tip}</li>
                ))}
              </ul>
              <div className="sdv-metric-actions">
                <button type="button" className="sdv-btn sdv-btn-primary sdv-btn-sm" onClick={onAiSuggestSchedule}>
                  {t("spaceHub.ai.suggestSchedule")}
                </button>
                <button type="button" className="sdv-btn sdv-btn-sm" onClick={onGenerateNextAction}>
                  {t("spaceHub.ai.generateNextAction")}
                </button>
              </div>
            </>
          )}
        </section>

      </div>

      {/* Row 2: activity timeline, focus records, notes */}
      <div className="sdv-overview-bottom">
        {/* Activity timeline (§16) */}
        <section className="sdv-card">
          <header className="sdv-card-head">
            <h2>{t("spaceHub.section.activityTimeline")}</h2>
            <button type="button" className="sdv-link" onClick={() => onOpenTab("records")}>
              {t("spaceHub.action.viewAll")}
            </button>
          </header>
          {activities.length === 0 ? (
            <div className="sdv-empty">
              <p>{t("spaceHub.empty.noActivity")}</p>
            </div>
          ) : (
            <ul className="sdv-activity-list">
              {activities.slice(0, 6).map((activity) => (
                <li key={activity.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (activity.relatedTaskId) onOpenTask(activity.relatedTaskId);
                      else if (activity.relatedSessionId) onOpenSession(activity.relatedSessionId);
                      else if (activity.relatedNoteId) onOpenNote(activity.relatedNoteId);
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
            <button type="button" className="sdv-link" onClick={() => onOpenTab("focus")}>
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

        {/* Notes / resources (§20) */}
        <section className="sdv-card">
          <header className="sdv-card-head">
            <h2>{t("spaceHub.section.notesResources")}</h2>
            <button type="button" className="sdv-link" onClick={() => onOpenTab("notes")}>
              {t("spaceHub.action.viewAll")}
            </button>
          </header>
          {spaceNotes.length === 0 ? (
            <div className="sdv-empty">
              <p>{t("spaceHub.empty.noNotes")}</p>
              <button type="button" className="sdv-btn sdv-btn-sm" onClick={onAddNote}>
                {presetText(t, preset.addNoteLabel)}
              </button>
            </div>
          ) : (
            <ul className="sdv-record-list">
              {spaceNotes.slice(0, 3).map((note) => (
                <li key={note.id}>
                  <button type="button" onClick={() => onOpenNote(note.id)}>
                    <strong>{note.title}</strong>
                    <small>{noteTypeText(t, note.type)}</small>
                    {note.url ? <span aria-hidden="true">🔗</span> : null}
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
