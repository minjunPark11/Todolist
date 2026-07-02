import { useMemo, useState } from "react";
import type { ConceptNote, FocusSession, Task } from "../../types";
import type { SpaceSectionGroup, SpaceTypePreset } from "../../lib/spaceHubTypes";
import {
  formatSeconds,
  getSpaceCalendarItems,
  getSpaceTaskCounts,
  isTaskDone,
  isTaskUnscheduled,
  relativeTime,
  resolveTaskGroupLabel,
  sessionSeconds,
} from "../../lib/spaceSelectors";
import { addDays, formatDate, getWeekDays, getWeekStart, todayValue } from "../../utils/date";

type StatusFilter = "all" | "open" | "scheduled" | "unscheduled" | "done";
type SortMode = "updated" | "due" | "title";

// === Tasks tab (§21) ===
export function SpaceTasksTab({
  preset,
  groups,
  spaceTasks,
  estOf,
  onOpenTask,
  onToggleDone,
  onStartFocus,
  onSchedule,
  onAddTask,
}: {
  preset: SpaceTypePreset;
  groups: SpaceSectionGroup[];
  spaceTasks: Task[];
  estOf: (task: Task) => number;
  onOpenTask: (taskId: string) => void;
  onToggleDone: (taskId: string) => void;
  onStartFocus: (taskId: string) => void;
  onSchedule: (taskId: string) => void;
  onAddTask: () => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("updated");

  const groupLabels = groups.map((group) => group.label);
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    const sorted = [...spaceTasks].sort((a, b) => {
      if (sortMode === "due") return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
      if (sortMode === "title") return a.title.localeCompare(b.title);
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });
    return sorted.filter((task) => {
      if (normalizedQuery && !`${task.title} ${task.notes}`.toLowerCase().includes(normalizedQuery)) return false;
      if (statusFilter === "open" && isTaskDone(task)) return false;
      if (statusFilter === "done" && !isTaskDone(task)) return false;
      if (statusFilter === "scheduled" && !task.scheduledDate) return false;
      if (statusFilter === "unscheduled" && !isTaskUnscheduled(task)) return false;
      if (groupFilter !== "all" && resolveTaskGroupLabel(task, groupLabels) !== groupFilter) return false;
      return true;
    });
  }, [spaceTasks, sortMode, normalizedQuery, statusFilter, groupFilter, groupLabels]);

  const grouped = groupLabels.map((label) => ({
    label,
    tasks: filtered.filter((task) => resolveTaskGroupLabel(task, groupLabels) === label),
  }));

  return (
    <section className="sdv-card sdv-tab-panel">
      <header className="sdv-toolbar">
        <input
          type="search"
          placeholder="Search tasks..."
          aria-label="Search tasks in this Space"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select aria-label="Status filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="scheduled">Scheduled</option>
          <option value="unscheduled">Unscheduled</option>
          <option value="done">Done</option>
        </select>
        <select aria-label="Group filter" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
          <option value="all">All groups</option>
          {groupLabels.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
        <select aria-label="Sort tasks" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
          <option value="updated">Recently updated</option>
          <option value="due">Due date</option>
          <option value="title">Title</option>
        </select>
        <button type="button" className="sdv-btn sdv-btn-primary sdv-btn-sm" onClick={onAddTask}>
          {preset.addTaskLabel}
        </button>
      </header>

      {spaceTasks.length === 0 ? (
        <div className="sdv-empty">
          <p>No tasks in this Space yet. Add the first one.</p>
          <button type="button" className="sdv-btn sdv-btn-primary sdv-btn-sm" onClick={onAddTask}>
            {preset.addTaskLabel}
          </button>
        </div>
      ) : (
        grouped.map((section) =>
          section.tasks.length === 0 ? null : (
            <div key={section.label} className="sdv-task-group">
              <h3>
                {section.label} <span>{section.tasks.length}</span>
              </h3>
              <ul className="sdv-task-list">
                {section.tasks.map((task) => (
                  <li key={task.id} className={isTaskDone(task) ? "sdv-task-row done" : "sdv-task-row"}>
                    <input
                      type="checkbox"
                      checked={isTaskDone(task)}
                      aria-label={`Complete ${task.title}`}
                      onChange={() => onToggleDone(task.id)}
                      disabled={isTaskDone(task)}
                    />
                    <button type="button" className="sdv-task-title" onClick={() => onOpenTask(task.id)}>
                      {task.title}
                    </button>
                    <span className="sdv-task-meta">
                      {task.dueDate ? `due ${formatDate(task.dueDate)}` : task.scheduledDate ? formatDate(task.scheduledDate) : "—"}
                    </span>
                    <span className="sdv-task-est">{isTaskDone(task) ? "—" : `${estOf(task)}m`}</span>
                    {isTaskDone(task) ? (
                      <span className="sdv-task-done-label">Done</span>
                    ) : (
                      <div className="sdv-row-actions">
                        <button type="button" className="sdv-btn sdv-btn-sm sdv-btn-primary" onClick={() => onStartFocus(task.id)}>
                          {preset.startFocusLabel}
                        </button>
                        <button type="button" className="sdv-btn sdv-btn-sm" onClick={() => onSchedule(task.id)}>
                          Schedule
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ),
        )
      )}
    </section>
  );
}

// === Calendar tab (§22) — schedule-modal centric, no drag/drop (§22.7) ===
export function SpaceCalendarTab({
  spaceTasks,
  reviewNotes,
  onOpenTask,
  onSchedule,
  onOpenFullCalendar,
}: {
  spaceTasks: Task[];
  reviewNotes: ConceptNote[];
  onOpenTask: (taskId: string) => void;
  onSchedule: (taskId: string) => void;
  onOpenFullCalendar: () => void;
}) {
  const today = todayValue();
  const [weekAnchor, setWeekAnchor] = useState(getWeekStart(today));
  const weekDays = getWeekDays(weekAnchor);
  const weekEnd = addDays(weekAnchor, 6);
  const items = getSpaceCalendarItems(spaceTasks, reviewNotes, weekAnchor, weekEnd);
  const counts = getSpaceTaskCounts(spaceTasks, today);
  const dueSoon = spaceTasks.filter(
    (task) => !isTaskDone(task) && task.dueDate && task.dueDate >= today && task.dueDate <= addDays(today, 3),
  );
  const unscheduled = spaceTasks.filter(isTaskUnscheduled);

  return (
    <section className="sdv-card sdv-tab-panel">
      <header className="sdv-cal-head">
        <div className="sdv-cal-summary">
          <span>
            <strong>{items.filter((item) => item.kind === "scheduled").length}</strong> scheduled this week
          </span>
          <span>
            <strong>{dueSoon.length}</strong> due soon
          </span>
          <span>
            <strong>{counts.unscheduled}</strong> unscheduled
          </span>
        </div>
        <div className="sdv-cal-nav">
          <button type="button" className="sdv-btn sdv-btn-sm" onClick={() => setWeekAnchor(addDays(weekAnchor, -7))} aria-label="Previous week">
            ←
          </button>
          <span>
            {formatDate(weekAnchor)} – {formatDate(weekEnd)}
          </span>
          <button type="button" className="sdv-btn sdv-btn-sm" onClick={() => setWeekAnchor(addDays(weekAnchor, 7))} aria-label="Next week">
            →
          </button>
          <button type="button" className="sdv-link" onClick={onOpenFullCalendar}>
            Open full calendar
          </button>
        </div>
      </header>

      <div className="sdv-week-strip" role="list" aria-label="This week">
        {weekDays.map((day) => {
          const dayItems = items.filter((item) => item.date === day);
          return (
            <div key={day} role="listitem" className={day === today ? "sdv-week-day today" : "sdv-week-day"}>
              <strong>{formatDate(day)}</strong>
              {dayItems.length === 0 ? (
                <small>—</small>
              ) : (
                dayItems.slice(0, 3).map((item) => (
                  <button key={item.id} type="button" className={`sdv-week-item sdv-kind-${item.kind}`} onClick={() => (item.taskId ? onOpenTask(item.taskId) : undefined)}>
                    {item.time ? `${item.time} ` : ""}
                    {item.title}
                  </button>
                ))
              )}
            </div>
          );
        })}
      </div>

      {items.length === 0 ? (
        <div className="sdv-empty">
          <p>No Space events this week. Place a task on the calendar.</p>
        </div>
      ) : null}

      <div className="sdv-cal-lists">
        <div>
          <h3>Deadlines</h3>
          {dueSoon.length === 0 ? (
            <p className="sdv-empty-inline">No deadlines in the next 3 days.</p>
          ) : (
            <ul className="sdv-record-list">
              {dueSoon.map((task) => (
                <li key={task.id}>
                  <button type="button" onClick={() => onOpenTask(task.id)}>
                    <strong>{task.title}</strong>
                    <small>due {formatDate(task.dueDate)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>Unscheduled tasks</h3>
          {unscheduled.length === 0 ? (
            <p className="sdv-empty-inline">Everything is placed. Nice.</p>
          ) : (
            <ul className="sdv-record-list">
              {unscheduled.map((task) => (
                <li key={task.id}>
                  <button type="button" onClick={() => onOpenTask(task.id)}>
                    <strong>{task.title}</strong>
                  </button>
                  <button type="button" className="sdv-btn sdv-btn-sm" onClick={() => onSchedule(task.id)}>
                    Schedule
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

// === Focus tab (§23) ===
export function SpaceFocusTab({
  preset,
  spaceTasks,
  spaceSessions,
  activeFocusSession,
  weeklyGoalSeconds,
  estOf,
  onStartFocus,
  onOpenSession,
  onOpenFocusPage,
}: {
  preset: SpaceTypePreset;
  spaceTasks: Task[];
  spaceSessions: FocusSession[];
  activeFocusSession: FocusSession | null;
  weeklyGoalSeconds: number;
  estOf: (task: Task) => number;
  onStartFocus: (taskId: string) => void;
  onOpenSession: (sessionId: string) => void;
  onOpenFocusPage: () => void;
}) {
  const today = todayValue();
  const weekStart = getWeekStart(today);
  const completed = spaceSessions.filter((session) => session.status === "completed");
  const todaySeconds = completed
    .filter((session) => session.startAt.slice(0, 10) === today)
    .reduce((sum, session) => sum + sessionSeconds(session), 0);
  const weekSeconds = completed
    .filter((session) => session.startAt.slice(0, 10) >= weekStart)
    .reduce((sum, session) => sum + sessionSeconds(session), 0);
  const average = completed.length ? Math.round(completed.reduce((sum, session) => sum + sessionSeconds(session), 0) / completed.length) : 0;
  const goalPct = Math.min(100, Math.round((weekSeconds / Math.max(weeklyGoalSeconds, 1)) * 100));

  const openTasks = spaceTasks.filter((task) => !isTaskDone(task) && task.status !== "waiting");
  const byTask = new Map<string, number>();
  for (const session of completed) {
    byTask.set(session.taskId, (byTask.get(session.taskId) ?? 0) + sessionSeconds(session));
  }
  const actualRows = [...byTask.entries()]
    .map(([taskId, seconds]) => ({ task: spaceTasks.find((task) => task.id === taskId), seconds }))
    .filter((row): row is { task: Task; seconds: number } => Boolean(row.task))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 5);

  return (
    <section className="sdv-card sdv-tab-panel">
      <div className="sdv-focus-stats">
        <div>
          <small>Today</small>
          <strong>{formatSeconds(todaySeconds)}</strong>
        </div>
        <div>
          <small>This week</small>
          <strong>{formatSeconds(weekSeconds)}</strong>
        </div>
        <div>
          <small>Sessions</small>
          <strong>{completed.length}</strong>
        </div>
        <div>
          <small>Average</small>
          <strong>{formatSeconds(average)}</strong>
        </div>
        <div>
          <small>Goal</small>
          <strong>{goalPct}%</strong>
        </div>
      </div>

      {activeFocusSession ? (
        <div className="sdv-active-focus">
          <span className="sdv-pulse" aria-hidden="true" />
          <strong>Focus in progress: {activeFocusSession.title || "Untitled"}</strong>
          <button type="button" className="sdv-btn sdv-btn-sm" onClick={onOpenFocusPage}>
            Open Focus page
          </button>
        </div>
      ) : null}

      <div className="sdv-focus-grid">
        <div>
          <h3>Start queue</h3>
          {openTasks.length === 0 ? (
            <p className="sdv-empty-inline">No open tasks. Add one first.</p>
          ) : (
            <ul className="sdv-record-list">
              {openTasks.slice(0, 6).map((task) => (
                <li key={task.id}>
                  <button type="button" onClick={() => onStartFocus(task.id)}>
                    <strong>{task.title}</strong>
                    <small>{estOf(task)}m expected</small>
                    <span className="sdv-btn sdv-btn-sm sdv-btn-primary">{preset.startFocusLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>Expected vs actual</h3>
          {actualRows.length === 0 ? (
            <p className="sdv-empty-inline">No focus records for this Space yet. Pick a task and start.</p>
          ) : (
            <ul className="sdv-record-list">
              {actualRows.map((row) => (
                <li key={row.task.id}>
                  <div className="sdv-actual-row">
                    <strong>{row.task.title}</strong>
                    <small>
                      {estOf(row.task)}m expected · {formatSeconds(row.seconds)} actual
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <h3>Recent sessions</h3>
      {completed.length === 0 ? (
        <div className="sdv-empty">
          <p>No focus records for this Space yet. Pick a task and start a focus.</p>
        </div>
      ) : (
        <ul className="sdv-record-list">
          {completed
            .sort((a, b) => (b.endAt || b.createdAt).localeCompare(a.endAt || a.createdAt))
            .slice(0, 8)
            .map((session) => (
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
  );
}
