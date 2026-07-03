import { DragEvent, FormEvent, ReactNode, useMemo, useState } from "react";
import type { Project, Task } from "../../types";
import type { CalendarDraftBlock } from "../../utils/calendarTime";
import type { CalendarLayerToggles, ProjectFilter } from "../../utils/calendarItems";
import { formatDate } from "../../utils/date";
import { NewTaskForm, type NewTaskFormResult } from "./NewTaskForm";
import { useT } from "../../i18n";

export interface TodaySummary {
  scheduled: number;
  deadlines: number;
  reviews: number;
}

interface CalendarRightPanelProps {
  draft: CalendarDraftBlock | null;
  taskDetail: ReactNode;
  unscheduled: Task[];
  todaySummary: TodaySummary;
  projects: Project[];
  dragOverUnscheduled: boolean;
  onDragOverUnscheduled: (event: DragEvent) => void;
  onDragLeaveUnscheduled: () => void;
  onDropUnscheduled: (event: DragEvent) => void;
  onCancelDraft: () => void;
  onCreateFromDraft: (result: NewTaskFormResult) => void;
  onSelectTask: (taskId: string) => void;
  onDragStartTask: (event: DragEvent, taskId: string) => void;
  onDragEndTask: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  layerFilters: CalendarLayerToggles;
  projectFilter: ProjectFilter;
  currentWeekDays: string[];
  onOpenScheduleModal: (taskId: string) => void;
  onQuickAddTask: (title: string) => void;
  aiStatus: "idle" | "loading" | "preview" | "error";
  aiPlacementsCount: number;
  onSuggestSchedule: () => void;
  onApplySuggestion: () => void;
  onCancelSuggestion: () => void;
}

type TaskGroup = {
  id: string;
  title: string;
  hint: string;
  tasks: Task[];
};

function projectName(task: Task, projects: Project[]) {
  return projects.find((project) => project.id === task.projectId)?.name ?? "";
}

function estimateMinutes(task: Task) {
  const match = `${task.title} ${task.description} ${task.notes}`.match(/(\d+)\s*(m|min|분)/i);
  if (!match) return 40;
  return Math.max(10, Math.round(Number(match[1]) / 10) * 10);
}

function isReviewTask(task: Task, project: string) {
  const haystack = `${task.title} ${task.description} ${task.tags.join(" ")} ${project}`.toLowerCase();
  return ["review", "복습", "leetcode", "study", "algorithm"].some((token) => haystack.includes(token));
}

function isDueThisWeek(task: Task, days: string[]) {
  return Boolean(task.dueDate && days.includes(task.dueDate));
}

export function CalendarRightPanel({
  draft,
  taskDetail,
  unscheduled,
  todaySummary,
  projects,
  dragOverUnscheduled,
  onDragOverUnscheduled,
  onDragLeaveUnscheduled,
  onDropUnscheduled,
  onCancelDraft,
  onCreateFromDraft,
  onSelectTask,
  onDragStartTask,
  onDragEndTask,
  searchQuery,
  onSearchChange,
  layerFilters,
  projectFilter,
  currentWeekDays,
  onOpenScheduleModal,
  onQuickAddTask,
  aiStatus,
  aiPlacementsCount,
  onSuggestSchedule,
  onApplySuggestion,
  onCancelSuggestion,
}: CalendarRightPanelProps) {
  const { t, lang } = useT();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [quickTitle, setQuickTitle] = useState("");

  const projectCount = projectFilter === "all" ? projects.length : projectFilter.size;
  const activeLayers = Object.values(layerFilters).filter(Boolean).length;

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return unscheduled;
    return unscheduled.filter((task) => {
      const project = projectName(task, projects);
      return `${task.title} ${task.description} ${task.notes} ${task.tags.join(" ")} ${project}`
        .toLowerCase()
        .includes(query);
    });
  }, [projects, searchQuery, unscheduled]);

  const groups = useMemo<TaskGroup[]>(() => {
    const due: Task[] = [];
    const review: Task[] = [];
    const projectWork: Task[] = [];
    const other: Task[] = [];

    for (const task of filtered) {
      const project = projectName(task, projects);
      if (isDueThisWeek(task, currentWeekDays) || task.priority === "high") due.push(task);
      else if (isReviewTask(task, project)) review.push(task);
      else if (task.projectId) projectWork.push(task);
      else other.push(task);
    }

    return [
      { id: "deadline", title: t("calendar.groupDeadline"), hint: t("calendar.groupDeadlineHint"), tasks: due },
      { id: "review", title: t("calendar.groupReview"), hint: t("calendar.groupReviewHint"), tasks: review },
      { id: "project", title: t("calendar.groupSpaces"), hint: t("calendar.groupSpacesHint"), tasks: projectWork },
      { id: "other", title: t("calendar.groupOther"), hint: t("calendar.groupOtherHint"), tasks: other },
    ].filter((group) => group.tasks.length > 0);
  }, [currentWeekDays, filtered, projects, t]);

  function toggleGroup(groupId: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function submitQuickTask(event: FormEvent) {
    event.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    onQuickAddTask(title);
    setQuickTitle("");
  }

  if (draft) {
    return (
      <aside className="gcal-panel" data-calendar-interactive="true">
        <NewTaskForm
          key={`${draft.date}-${draft.startTime}-${draft.endTime}`}
          draft={draft}
          projects={projects}
          onCancel={onCancelDraft}
          onCreate={onCreateFromDraft}
        />
      </aside>
    );
  }

  if (taskDetail) {
    return (
      <aside className="gcal-panel" data-calendar-interactive="true">
        {taskDetail}
      </aside>
    );
  }

  return (
    <aside
      className={dragOverUnscheduled ? "gcal-panel gcal-panel-summary is-drop" : "gcal-panel gcal-panel-summary"}
      data-calendar-interactive="true"
      onDragOver={onDragOverUnscheduled}
      onDragLeave={onDragLeaveUnscheduled}
      onDrop={onDropUnscheduled}
    >
      <div className="gcal-schedule-head">
        <div>
          <span className="gcal-panel-kicker">{t("calendar.scheduleKicker")}</span>
          <h2>{t("calendar.scheduleTitle")}</h2>
          <p>
            {t("calendar.scheduleSummary", {
              unscheduled: unscheduled.length,
              today: todaySummary.scheduled,
              deadlines: todaySummary.deadlines,
            })}
          </p>
        </div>
        <button
          type="button"
          className="gcal-icon-button"
          onClick={onSuggestSchedule}
          disabled={aiStatus === "loading" || unscheduled.length === 0}
          title={t("calendar.suggestSchedule")}
        >
          {aiStatus === "loading" ? "..." : "AI"}
        </button>
      </div>

      {aiStatus === "preview" ? (
        <div className="gcal-suggestion-bar">
          <div>
            <strong>{t("calendar.suggestionCount", { n: aiPlacementsCount })}</strong>
            <span>{t("calendar.suggestionPreview")}</span>
          </div>
          <button type="button" onClick={onApplySuggestion}>
            {t("calendar.apply")}
          </button>
          <button type="button" onClick={onCancelSuggestion}>
            {t("common.cancel")}
          </button>
        </div>
      ) : null}

      {aiStatus === "error" ? <p className="gcal-alert">{t("calendar.noOpenSlots")}</p> : null}

      <label className="gcal-schedule-search">
        <span>{t("calendar.search")}</span>
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t("calendar.scheduleSearchPlaceholder")}
        />
      </label>

      <div className="gcal-filter-note">
        <span>{t("calendar.layersOn", { n: activeLayers })}</span>
        <span>{projectFilter === "all" ? t("calendar.allSpaces") : t("calendar.spacesCount", { n: projectCount })}</span>
      </div>

      <div className="gcal-task-groups">
        {groups.length === 0 ? (
          <p className="gcal-hint">{searchQuery ? t("calendar.noMatchingTasks") : t("calendar.allClear")}</p>
        ) : (
          groups.map((group) => {
            const isCollapsed = collapsed.has(group.id);
            return (
              <section key={group.id} className="gcal-task-group">
                <button type="button" className="gcal-task-group-head" onClick={() => toggleGroup(group.id)}>
                  <span>{isCollapsed ? "+" : "-"}</span>
                  <strong>{group.title}</strong>
                  <small>{group.tasks.length}</small>
                </button>
                {!isCollapsed ? (
                  <div className="gcal-schedule-list">
                    {group.tasks.map((task) => {
                      const project = projectName(task, projects);
                      return (
                        <article
                          key={task.id}
                          className={`gcal-schedule-card priority-${task.priority}`}
                          draggable
                          tabIndex={0}
                          onDragStart={(event) => onDragStartTask(event, task.id)}
                          onDragEnd={onDragEndTask}
                          onClick={() => onSelectTask(task.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") onSelectTask(task.id);
                          }}
                        >
                          <span className="gcal-drag-handle">::</span>
                          <div className="gcal-task-card-main">
                            <strong>{task.title}</strong>
                            <span>
                              {project || t("calendar.inbox")}
                              {task.dueDate
                                ? ` · ${t("calendar.dueShort", { date: formatDate(task.dueDate, lang) })}`
                                : ` · ${t("calendar.noDeadlineShort")}`}
                            </span>
                          </div>
                          <span className="gcal-task-duration">{estimateMinutes(task)}m</span>
                          <button
                            type="button"
                            className="gcal-schedule-menu"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenScheduleModal(task.id);
                            }}
                            title={t("calendar.scheduleTask")}
                          >
                            +
                          </button>
                        </article>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })
        )}
      </div>

      <form className="gcal-quick-add-row" onSubmit={submitQuickTask}>
        <input
          value={quickTitle}
          onChange={(event) => setQuickTitle(event.target.value)}
          placeholder={t("calendar.quickAddTaskPlaceholder")}
        />
        <button type="submit">{t("common.add")}</button>
      </form>
    </aside>
  );
}
