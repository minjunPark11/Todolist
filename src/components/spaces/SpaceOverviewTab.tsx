import type { FocusSession, Task } from "../../types";
import type { SpaceActivity, SpaceNote, SpaceTab, SpaceTypePreset } from "../../lib/spaceHubTypes";
import {
  formatSeconds,
  isTaskDone,
  relativeTime,
  sessionSeconds,
  type SpaceCalendarItem,
} from "../../lib/spaceSelectors";
import { formatDate } from "../../utils/date";

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
  calendarItems,
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
  onOpenFullCalendar,
  onOpenTab,
  onGenerateAiSummary,
  onAiSuggestSchedule,
  onGenerateNextAction,
}: {
  preset: SpaceTypePreset;
  spaceTasks: Task[];
  activities: SpaceActivity[];
  calendarItems: SpaceCalendarItem[];
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
  onOpenFullCalendar: () => void;
  onOpenTab: (tab: SpaceTab) => void;
  onGenerateAiSummary: () => void;
  onAiSuggestSchedule: () => void;
  onGenerateNextAction: () => void;
}) {
  const openTasks = spaceTasks.filter((task) => !isTaskDone(task));
  const previewTasks = [...openTasks]
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
    .slice(0, 5);

  return (
    <div className="sdv-content-grid">
      <div className="sdv-main-col">
        {/* Tasks card (§15) */}
        <section className="sdv-card">
          <header className="sdv-card-head">
            <h2>{preset.primaryTaskSectionLabel}</h2>
            <div className="sdv-card-head-actions">
              <button type="button" className="sdv-btn sdv-btn-sm" onClick={onAddTask}>
                {preset.addTaskLabel}
              </button>
              <button type="button" className="sdv-link" onClick={() => onOpenTab("tasks")}>
                View all
              </button>
            </div>
          </header>
          {previewTasks.length === 0 ? (
            <div className="sdv-empty">
              <p>No tasks in this Space yet. Add the first one.</p>
              <button type="button" className="sdv-btn sdv-btn-primary sdv-btn-sm" onClick={onAddTask}>
                {preset.addTaskLabel}
              </button>
            </div>
          ) : (
            <ul className="sdv-task-list">
              {previewTasks.map((task) => (
                <li key={task.id} className="sdv-task-row">
                  <input
                    type="checkbox"
                    checked={false}
                    aria-label={`Complete ${task.title}`}
                    onChange={() => onToggleDone(task.id)}
                  />
                  <button type="button" className="sdv-task-title" onClick={() => onOpenTask(task.id)}>
                    {task.title}
                  </button>
                  <span className="sdv-task-meta">
                    {task.status === "doing" ? "In progress" : task.scheduledDate ? "Scheduled" : "To schedule"}
                  </span>
                  <span className="sdv-task-est">{estOf(task)}m</span>
                  {task.scheduledDate ? (
                    <button type="button" className="sdv-btn sdv-btn-sm sdv-btn-primary" onClick={() => onStartFocus(task.id)}>
                      Start Focus
                    </button>
                  ) : (
                    <button type="button" className="sdv-btn sdv-btn-sm" onClick={() => onSchedule(task.id)}>
                      Schedule
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="sdv-bottom-row">
          {/* Activity timeline (§16) */}
          <section className="sdv-card">
            <header className="sdv-card-head">
              <h2>Activity Timeline</h2>
              <button type="button" className="sdv-link" onClick={() => onOpenTab("records")}>
                View all
              </button>
            </header>
            {activities.length === 0 ? (
              <div className="sdv-empty">
                <p>No activity yet. Task, focus, and note events will show up here.</p>
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
                      <small>{relativeTime(activity.createdAt)}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Space calendar preview (§17) — read-only */}
          <section className="sdv-card">
            <header className="sdv-card-head">
              <h2>Space Calendar</h2>
              <button type="button" className="sdv-link" onClick={onOpenFullCalendar}>
                Open full calendar
              </button>
            </header>
            {calendarItems.length === 0 ? (
              <div className="sdv-empty">
                <p>No Space events scheduled this week. Place a task on the calendar.</p>
              </div>
            ) : (
              <ul className="sdv-calendar-list">
                {calendarItems.slice(0, 6).map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => (item.taskId ? onOpenTask(item.taskId) : undefined)}>
                      <span className={`sdv-cal-dot sdv-kind-${item.kind}`} aria-hidden="true" />
                      <span className="sdv-cal-when">
                        {formatDate(item.date)}
                        {item.time ? ` ${item.time}` : ""}
                      </span>
                      <strong>{item.title}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <aside className="sdv-insight-col">
        {/* AI Space Summary (§18) — never auto-runs */}
        <section className="sdv-card sdv-ai-card">
          <header className="sdv-card-head">
            <h2>{preset.aiSummaryLabel}</h2>
          </header>
          {aiSummary.state === "idle" ? (
            <div className="sdv-empty">
              <p>Generate a summary of this Space and get next-step suggestions.</p>
              <button type="button" className="sdv-btn sdv-btn-primary sdv-btn-sm" onClick={onGenerateAiSummary}>
                Generate summary
              </button>
            </div>
          ) : aiSummary.state === "loading" ? (
            <p className="sdv-empty-inline">Building the Space summary...</p>
          ) : aiSummary.state === "error" ? (
            <div className="sdv-empty">
              <p>Could not build the summary. Try again.</p>
              <button type="button" className="sdv-btn sdv-btn-sm" onClick={onGenerateAiSummary}>
                Retry
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
                  Suggest schedule
                </button>
                <button type="button" className="sdv-btn sdv-btn-sm" onClick={onGenerateNextAction}>
                  Generate next action
                </button>
              </div>
            </>
          )}
        </section>

        {/* Focus records (§19) */}
        <section className="sdv-card">
          <header className="sdv-card-head">
            <h2>Focus Records</h2>
            <button type="button" className="sdv-link" onClick={() => onOpenTab("focus")}>
              View all
            </button>
          </header>
          {recentSessions.length === 0 ? (
            <div className="sdv-empty">
              <p>No focus records for this Space yet.</p>
            </div>
          ) : (
            <ul className="sdv-record-list">
              {recentSessions.map((session) => (
                <li key={session.id}>
                  <button type="button" onClick={() => onOpenSession(session.id)}>
                    <strong>{session.title || "Untitled focus"}</strong>
                    <small>{relativeTime(session.endAt || session.createdAt)}</small>
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
            <h2>Notes / Resources</h2>
            <button type="button" className="sdv-link" onClick={() => onOpenTab("notes")}>
              View all
            </button>
          </header>
          {spaceNotes.length === 0 ? (
            <div className="sdv-empty">
              <p>No notes yet. Add feedback, meeting notes, or reference links.</p>
              <button type="button" className="sdv-btn sdv-btn-sm" onClick={onAddNote}>
                {preset.addNoteLabel}
              </button>
            </div>
          ) : (
            <ul className="sdv-record-list">
              {spaceNotes.slice(0, 3).map((note) => (
                <li key={note.id}>
                  <button type="button" onClick={() => onOpenNote(note.id)}>
                    <strong>{note.title}</strong>
                    <small>{note.type}</small>
                    {note.url ? <span aria-hidden="true">🔗</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
