import { useMemo, useState } from "react";
import type { Task } from "../../types";
import type { SpaceSectionGroup, SpaceTypePreset } from "../../lib/spaceHubTypes";
import {
  isTaskDone,
  resolveTaskGroupLabel,
} from "../../lib/spaceSelectors";
import { formatDate } from "../../utils/date";
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

  // Sub-tasks nest under their parent: sorting/filtering drives parent rows
  // (search also matches child titles), and children of a visible parent are
  // always listed beneath it, sorted by the same mode.
  const filtered = useMemo(() => {
    const compare = (a: Task, b: Task) => {
      if (sortMode === "due") return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
      if (sortMode === "title") return a.title.localeCompare(b.title);
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    };
    const spaceIds = new Set(spaceTasks.map((task) => task.id));
    const childrenByParent = new Map<string, Task[]>();
    for (const task of spaceTasks) {
      if (!task.parentTaskId || !spaceIds.has(task.parentTaskId)) continue;
      const siblings = childrenByParent.get(task.parentTaskId) ?? [];
      siblings.push(task);
      childrenByParent.set(task.parentTaskId, siblings);
    }
    for (const siblings of childrenByParent.values()) siblings.sort(compare);

    const topLevel = spaceTasks
      .filter((task) => !task.parentTaskId || !spaceIds.has(task.parentTaskId))
      .sort(compare)
      .filter((task) => {
        const children = childrenByParent.get(task.id) ?? [];
        if (normalizedQuery) {
          const haystack = [task.title, task.notes, ...children.map((child) => child.title)].join(" ").toLowerCase();
          if (!haystack.includes(normalizedQuery)) return false;
        }
        if (statusFilter === "open" && isTaskDone(task)) return false;
        if (statusFilter === "done" && !isTaskDone(task)) return false;
        if (groupFilter !== "all" && resolveTaskGroupLabel(task, groupLabels) !== groupFilter) return false;
        return true;
      });
    return topLevel.map((task) => ({ task, children: childrenByParent.get(task.id) ?? [] }));
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
            // Flat list: sorting stays global instead of per-section. Tags are
            // intentionally not surfaced here (the group filter still scopes).
            // Sub-tasks render indented under their parent row.
            <ul className="sdv-task-list sdv-task-list-flat">
              {filtered.flatMap(({ task, children }) => {
                const renderRow = (row: Task, isChild: boolean) => {
                  const done = isTaskDone(row);
                  const childDone = isChild ? 0 : children.filter(isTaskDone).length;
                  return (
                    <li
                      key={row.id}
                      className={`sdv-task-row${done ? " done" : ""}${isChild ? " sdv-task-row-child" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={done}
                        aria-label={t("spaceHub.aria.complete", { title: row.title })}
                        onChange={() => onToggleDone(row.id)}
                        disabled={done}
                      />
                      <button type="button" className="sdv-task-title" onClick={() => onOpenTask(row.id)}>
                        {row.title}
                      </button>
                      {!isChild && children.length > 0 ? (
                        <span className="sdv-subtask-progress">
                          {childDone}/{children.length}
                        </span>
                      ) : null}
                      {row.dueDate || row.scheduledDate ? (
                        <span className={row.dueDate ? "sdv-task-date-chip due" : "sdv-task-date-chip"}>
                          {row.dueDate ? t("spaceHub.meta.due", { date: formatDate(row.dueDate) }) : formatDate(row.scheduledDate)}
                        </span>
                      ) : (
                        <span className="sdv-task-meta">—</span>
                      )}
                      {done ? (
                        <span className="sdv-task-done-label">{t("spaceHub.taskDone")}</span>
                      ) : (
                        <div className="sdv-row-actions">
                          <button type="button" className="sdv-btn sdv-btn-sm sdv-btn-primary" onClick={() => onStartFocus(row.id)}>
                            {presetText(t, preset.startFocusLabel)}
                          </button>
                          <MoreMenu
                            items={[
                              { label: t("spaceHub.rowMenu.open"), onClick: () => onOpenTask(row.id) },
                              { label: t("spaceHub.rowMenu.markDone"), onClick: () => onToggleDone(row.id) },
                            ]}
                          />
                        </div>
                      )}
                    </li>
                  );
                };
                return [renderRow(task, false), ...children.map((child) => renderRow(child, true))];
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
