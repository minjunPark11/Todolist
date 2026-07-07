import { useMemo, useState } from "react";
import type { FocusSession, Task } from "../../types";
import type { SpaceSectionGroup, SpaceTypePreset } from "../../lib/spaceHubTypes";
import {
  formatSeconds,
  isTaskDone,
  relativeTime,
  resolveTaskGroupLabel,
  sessionSeconds,
} from "../../lib/spaceSelectors";
import { formatDate, getWeekStart, todayValue } from "../../utils/date";
import { useT } from "../../i18n";
import { presetText, groupText } from "../../lib/spaceHubI18n";
import { MoreMenu } from "../kit";

type StatusFilter = "all" | "open" | "done";
type SortMode = "updated" | "due" | "title";

// === Tasks tab (§21) ===
export function SpaceTasksTab({
  preset,
  groups,
  spaceTasks,
  onOpenTask,
  onToggleDone,
  onStartFocus,
  onAddTask,
}: {
  preset: SpaceTypePreset;
  groups: SpaceSectionGroup[];
  spaceTasks: Task[];
  onOpenTask: (taskId: string) => void;
  onToggleDone: (taskId: string) => void;
  onStartFocus: (taskId: string) => void;
  onAddTask: () => void;
}) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("updated");

  const groupLabels = groups.map((group) => group.label);
  const normalizedQuery = query.trim().toLowerCase();
  const hasTasks = spaceTasks.length > 0;

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
      if (groupFilter !== "all" && resolveTaskGroupLabel(task, groupLabels) !== groupFilter) return false;
      return true;
    });
  }, [spaceTasks, sortMode, normalizedQuery, statusFilter, groupFilter, groupLabels]);

  function resetFilters() {
    setQuery("");
    setStatusFilter("all");
    setGroupFilter("all");
  }

  return (
    <section className="sdv-card sdv-tab-panel sdv-tasks-tab">
      {/* Count header. With zero tasks the empty-state CTA is the single add
          entry point, so the header button only renders once tasks exist. */}
      <header className="sdv-tasks-head">
        <h2>{t("spaceHub.tasks.count", { n: spaceTasks.length })}</h2>
        {hasTasks ? (
          <button type="button" className="sdv-btn sdv-btn-primary sdv-btn-sm" onClick={onAddTask}>
            {presetText(t, preset.addTaskLabel)}
          </button>
        ) : null}
      </header>

      {!hasTasks ? (
        <div className="sdv-tasks-empty">
          <div className="sdv-tasks-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
              <path d="M8.2 12.2l2.6 2.6 5-5.4" />
            </svg>
          </div>
          <strong>{t("spaceHub.tasksEmpty.title")}</strong>
          <p>{t("spaceHub.tasksEmpty.desc")}</p>
          <button type="button" className="sdv-btn sdv-btn-primary" onClick={onAddTask}>
            {t("spaceHub.tasksEmpty.cta")}
          </button>
          <small>{t("spaceHub.tasksEmpty.hint", { examples: presetText(t, preset.emptyTaskExamples) })}</small>
        </div>
      ) : (
        <>
          <div className="sdv-toolbar sdv-toolbar-compact">
            <input
              type="search"
              placeholder={t("spaceHub.search.tasks")}
              aria-label={t("spaceHub.aria.searchTasks")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select aria-label={t("spaceHub.aria.statusFilter")} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              <option value="all">{t("spaceHub.filter.allStatuses")}</option>
              <option value="open">{t("spaceHub.filter.open")}</option>
              <option value="done">{t("spaceHub.filter.done")}</option>
            </select>
            <select aria-label={t("spaceHub.aria.groupFilter")} value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
              <option value="all">{t("spaceHub.filter.allGroups")}</option>
              {groupLabels.map((label) => (
                <option key={label} value={label}>
                  {groupText(t, label)}
                </option>
              ))}
            </select>
            <select aria-label={t("spaceHub.aria.sortTasks")} value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
              <option value="updated">{t("spaceHub.sort.updated")}</option>
              <option value="due">{t("spaceHub.sort.due")}</option>
              <option value="title">{t("spaceHub.sort.title")}</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="sdv-tasks-nomatch">
              <p>{t("spaceHub.tasksEmpty.noMatch")}</p>
              <button type="button" className="sdv-btn sdv-btn-sm" onClick={resetFilters}>
                {t("spaceHub.tasksEmpty.resetFilters")}
              </button>
            </div>
          ) : (
            // Flat list: sorting stays global instead of per-section, and each
            // row carries its group as a chip (the group filter still scopes).
            <ul className="sdv-task-list sdv-task-list-flat">
              {filtered.map((task) => {
                const done = isTaskDone(task);
                const group = resolveTaskGroupLabel(task, groupLabels);
                return (
                  <li key={task.id} className={done ? "sdv-task-row done" : "sdv-task-row"}>
                    <input
                      type="checkbox"
                      checked={done}
                      aria-label={t("spaceHub.aria.complete", { title: task.title })}
                      onChange={() => onToggleDone(task.id)}
                      disabled={done}
                    />
                    <button type="button" className="sdv-task-title" onClick={() => onOpenTask(task.id)}>
                      {task.title}
                    </button>
                    {group ? <span className="sdv-task-group-chip">{groupText(t, group)}</span> : null}
                    {task.dueDate || task.scheduledDate ? (
                      <span className={task.dueDate ? "sdv-task-date-chip due" : "sdv-task-date-chip"}>
                        {task.dueDate ? t("spaceHub.meta.due", { date: formatDate(task.dueDate) }) : formatDate(task.scheduledDate)}
                      </span>
                    ) : (
                      <span className="sdv-task-meta">—</span>
                    )}
                    {done ? (
                      <span className="sdv-task-done-label">{t("spaceHub.taskDone")}</span>
                    ) : (
                      <div className="sdv-row-actions">
                        <button type="button" className="sdv-btn sdv-btn-sm sdv-btn-primary" onClick={() => onStartFocus(task.id)}>
                          {presetText(t, preset.startFocusLabel)}
                        </button>
                        <MoreMenu
                          items={[
                            { label: t("spaceHub.rowMenu.open"), onClick: () => onOpenTask(task.id) },
                            { label: t("spaceHub.rowMenu.markDone"), onClick: () => onToggleDone(task.id) },
                          ]}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
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
  onStartFocus,
  onOpenSession,
  onOpenFocusPage,
}: {
  preset: SpaceTypePreset;
  spaceTasks: Task[];
  spaceSessions: FocusSession[];
  activeFocusSession: FocusSession | null;
  weeklyGoalSeconds: number;
  onStartFocus: (taskId: string) => void;
  onOpenSession: (sessionId: string) => void;
  onOpenFocusPage: () => void;
}) {
  const { t } = useT();
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
          <small>{t("spaceHub.focusStat.today")}</small>
          <strong>{formatSeconds(todaySeconds)}</strong>
        </div>
        <div>
          <small>{t("spaceHub.focusStat.thisWeek")}</small>
          <strong>{formatSeconds(weekSeconds)}</strong>
        </div>
        <div>
          <small>{t("spaceHub.focusStat.sessions")}</small>
          <strong>{completed.length}</strong>
        </div>
        <div>
          <small>{t("spaceHub.focusStat.average")}</small>
          <strong>{formatSeconds(average)}</strong>
        </div>
        <div>
          <small>{t("spaceHub.focusStat.goal")}</small>
          <strong>{goalPct}%</strong>
        </div>
      </div>

      {activeFocusSession ? (
        <div className="sdv-active-focus">
          <span className="sdv-pulse" aria-hidden="true" />
          <strong>{t("spaceHub.focus.inProgress", { title: activeFocusSession.title || t("spaceHub.untitled") })}</strong>
          <button type="button" className="sdv-btn sdv-btn-sm" onClick={onOpenFocusPage}>
            {t("spaceHub.action.openFocusPage")}
          </button>
        </div>
      ) : null}

      <div className="sdv-focus-grid">
        <div>
          <h3>{t("spaceHub.section.startQueue")}</h3>
          {openTasks.length === 0 ? (
            <p className="sdv-empty-inline">{t("spaceHub.empty.noOpenTasksAddOne")}</p>
          ) : (
            <ul className="sdv-record-list">
              {openTasks.slice(0, 6).map((task) => (
                <li key={task.id}>
                  <button type="button" onClick={() => onStartFocus(task.id)}>
                    <strong>{task.title}</strong>
                    <span className="sdv-btn sdv-btn-sm sdv-btn-primary">{presetText(t, preset.startFocusLabel)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>{t("spaceHub.field.actual")}</h3>
          {actualRows.length === 0 ? (
            <p className="sdv-empty-inline">{t("spaceHub.empty.noFocusPick")}</p>
          ) : (
            <ul className="sdv-record-list">
              {actualRows.map((row) => (
                <li key={row.task.id}>
                  <div className="sdv-actual-row">
                    <strong>{row.task.title}</strong>
                    <small>{formatSeconds(row.seconds)}</small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <h3>{t("spaceHub.section.recentSessions")}</h3>
      {completed.length === 0 ? (
        <div className="sdv-empty">
          <p>{t("spaceHub.empty.noFocusPick")}</p>
        </div>
      ) : (
        <ul className="sdv-record-list">
          {completed
            .sort((a, b) => (b.endAt || b.createdAt).localeCompare(a.endAt || a.createdAt))
            .slice(0, 8)
            .map((session) => (
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
  );
}
