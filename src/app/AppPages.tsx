import { ReactNode, useMemo, useState } from "react";
import { ArchivePage } from "../components/ArchivePage";
import { BoardView } from "../components/BoardView";
import { CalendarView } from "../components/CalendarView";
import { DashboardView } from "../components/DashboardView";
import { FocusPage } from "../components/FocusPage";
import { HabitsPage } from "../components/HabitsPage";
import { InboxPage } from "../components/InboxPage";
import { PlanningPage } from "../components/PlanningPage";
import { ProjectsPage } from "../components/ProjectsPage";
import { QuickAdd } from "../components/QuickAdd";
import { SettingsPage } from "../components/SettingsPage";
import { StudyPage } from "../components/StudyPage";
import { TaskList, type GroupBy } from "../components/TaskList";
import { TodayPage } from "../components/TodayPage";
import type { ToastState } from "../components/kit";
import type { usePlannerData } from "../hooks/usePlannerData";
import type { AppSettings, ConceptNote, PageId, Project, Task, TaskLevel, TaskPriority, TaskStatus, TaskTemplate } from "../types";
import { addDays, isOverdue, isThisWeek, todayValue } from "../utils/date";

type Planner = ReturnType<typeof usePlannerData>;
type SortKey = "dueDate" | "priority" | "createdAt" | "updatedAt" | "title";
type SortDirection = "asc" | "desc";

const statusOptions: Array<TaskStatus | "all"> = [
  "all",
  "inbox",
  "todo",
  "doing",
  "waiting",
  "done",
  "archived",
];
const priorityOptions: Array<TaskPriority | "all"> = ["all", "none", "low", "medium", "high"];
const levelOptions: Array<TaskLevel | "all"> = ["all", "low", "high"];
const priorityRank: Record<TaskPriority, number> = { none: 0, low: 1, medium: 2, high: 3 };

function sortTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    if (!a.dueDate && b.dueDate) {
      return 1;
    }
    if (a.dueDate && !b.dueDate) {
      return -1;
    }
    return a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt);
  });
}

type AppPagesProps = {
  activePage: PageId;
  planner: Planner;
  appSettings: AppSettings;
  activeProjects: Project[];
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  isProjectDetailOpen: boolean;
  setIsProjectDetailOpen: (open: boolean) => void;
  planningTab: "board" | "matrix";
  setPlanningTab: (tab: "board" | "matrix") => void;
  studyTab: "topics" | "notes" | "reviews";
  setStudyTab: (tab: "topics" | "notes" | "reviews") => void;
  studyFocusNoteId: string;
  setStudyFocusNoteId: (id: string) => void;
  renderTaskDetail: () => ReactNode;
  showToast: (toast: ToastState) => void;
  handleArchiveTask: (taskId: string) => void;
  handleDuplicateTask: (taskId: string) => void;
  handleArchiveProject: (projectId: string) => void;
  requestDeleteTask: (taskId: string) => void;
  requestDeleteProject: (projectId: string) => void;
  openProjectFromCalendar: (projectId: string) => void;
  openStudyReviewFromCalendar: (noteId: string) => void;
  viewTaskInCalendar: (taskId: string) => void;
  exportJson: () => void;
  handleImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  importMessage: string;
  accountSlot: ReactNode;
};

export function AppPages({
  activePage,
  planner,
  appSettings,
  activeProjects,
  selectedProjectId,
  setSelectedProjectId,
  isProjectDetailOpen,
  setIsProjectDetailOpen,
  planningTab,
  setPlanningTab,
  studyTab,
  setStudyTab,
  studyFocusNoteId,
  setStudyFocusNoteId,
  renderTaskDetail,
  showToast,
  handleArchiveTask,
  handleDuplicateTask,
  handleArchiveProject,
  requestDeleteTask,
  requestDeleteProject,
  openProjectFromCalendar,
  openStudyReviewFromCalendar,
  viewTaskInCalendar,
  exportJson,
  handleImport,
  importMessage,
  accountSlot,
}: AppPagesProps) {
  const today = todayValue();
  const tomorrow = addDays(today, 1);
  const activeTasks = planner.tasks.filter((task) => task.status !== "archived");
  const openTasks = activeTasks.filter((task) => task.status !== "done");
  const tomorrowTasks = sortTasks(planner.tasks.filter((task) => task.dueDate === tomorrow));
  const thisWeekTasks = sortTasks(openTasks.filter((task) => isThisWeek(task.dueDate)));

  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState<"all" | "today" | "week" | "overdue" | "none">("all");
  const [tagFilter, setTagFilter] = useState("");
  const [importanceFilter, setImportanceFilter] = useState<TaskLevel | "all">("all");
  const [urgencyFilter, setUrgencyFilter] = useState<TaskLevel | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("dueDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [groupKey, setGroupKey] = useState<GroupBy>("date");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filteredTasks = useMemo(() => {
    const sourceTasks = statusFilter === "archived" ? planner.tasks : activeTasks;
    return sortTasks(
      sourceTasks.filter((task) => {
        const statusMatch = statusFilter === "all" || task.status === statusFilter;
        const priorityMatch = priorityFilter === "all" || task.priority === priorityFilter;
        const projectMatch = projectFilter === "all" || task.projectId === projectFilter;
        const tagMatch =
          !tagFilter.trim() ||
          task.tags.some((tag) => tag.toLowerCase().includes(tagFilter.trim().toLowerCase()));
        const importanceMatch = importanceFilter === "all" || task.importance === importanceFilter;
        const urgencyMatch = urgencyFilter === "all" || task.urgency === urgencyFilter;
        const dueMatch =
          dueFilter === "all" ||
          (dueFilter === "today" && task.dueDate === today) ||
          (dueFilter === "week" && isThisWeek(task.dueDate)) ||
          (dueFilter === "overdue" && isOverdue(task.dueDate)) ||
          (dueFilter === "none" && !task.dueDate);

        return (
          statusMatch &&
          priorityMatch &&
          projectMatch &&
          tagMatch &&
          importanceMatch &&
          urgencyMatch &&
          dueMatch
        );
      }),
    ).sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      if (sortKey === "priority") {
        return (priorityRank[a.priority] - priorityRank[b.priority]) * direction;
      }
      if (sortKey === "title") {
        return a.title.localeCompare(b.title) * direction;
      }
      const left = a[sortKey] || "";
      const right = b[sortKey] || "";
      return left.localeCompare(right) * direction;
    });
  }, [
    activeTasks,
    dueFilter,
    importanceFilter,
    planner.tasks,
    priorityFilter,
    projectFilter,
    sortDirection,
    sortKey,
    statusFilter,
    tagFilter,
    today,
    urgencyFilter,
  ]);

  function resetFilters() {
    setStatusFilter("all");
    setPriorityFilter("all");
    setProjectFilter("all");
    setDueFilter("all");
    setTagFilter("");
    setImportanceFilter("all");
    setUrgencyFilter("all");
    setSortKey("dueDate");
    setSortDirection("asc");
    setGroupKey("date");
  }

  function pageGridClass(extra = "") {
    const base = planner.selectedTask ? "page-grid" : "page-grid no-detail";
    return extra ? `${base} ${extra}` : base;
  }

  if (activePage === "today") {
    return (
      <section className={pageGridClass()}>
        <TodayPage
          tasks={planner.tasks}
          projects={activeProjects}
          subtasks={planner.subtasks}
          selectedTaskId={planner.selectedTask?.id ?? ""}
          showCompleted={appSettings.showCompletedInToday}
          onOpenTask={planner.selectTask}
          onToggleDone={planner.toggleTaskDone}
          onUpdateTask={planner.updateTask}
          onCreateTask={planner.createTask}
          onUpdateStatus={planner.updateTaskStatus}
          onSnooze={planner.snoozeTask}
          onMoveToWaiting={planner.moveToWaiting}
          onSetFocus={planner.setTaskFocus}
          onArchiveTask={handleArchiveTask}
          onDuplicateTask={handleDuplicateTask}
          onRequestDelete={requestDeleteTask}
          showToast={showToast}
          onViewInCalendar={viewTaskInCalendar}
        />
        {renderTaskDetail()}
      </section>
    );
  }

  if (activePage === "tomorrow") {
    return (
      <section className={pageGridClass()}>
        <div className="content-stack">
          <header className="page-header">
            <h1>Tomorrow</h1>
            <div className="stat-pill">{tomorrowTasks.length} tasks</div>
          </header>
          <QuickAdd projects={activeProjects} defaultDueDate={tomorrow} onAddTask={planner.addTask} />
          <TaskList
            tasks={tomorrowTasks}
            projects={planner.projects}
            subtasks={planner.subtasks}
            emptyMessage="Nothing due tomorrow."
            onToggleDone={planner.toggleTaskDone}
            onSelectTask={planner.selectTask}
          />
        </div>
        {renderTaskDetail()}
      </section>
    );
  }

  if (activePage === "next7") {
    return (
      <section className={pageGridClass()}>
        <div className="content-stack">
          <header className="page-header">
            <h1>Next 7 Days</h1>
            <div className="stat-pill">{thisWeekTasks.length} tasks</div>
          </header>
          <TaskList
            tasks={thisWeekTasks}
            projects={planner.projects}
            subtasks={planner.subtasks}
            emptyMessage="No tasks in the next 7 days."
            onToggleDone={planner.toggleTaskDone}
            onSelectTask={planner.selectTask}
          />
        </div>
        {renderTaskDetail()}
      </section>
    );
  }

  if (activePage === "inbox") {
    return (
      <section className={pageGridClass()}>
        <InboxPage
          tasks={planner.tasks}
          projects={activeProjects}
          subtasks={planner.subtasks}
          selectedTaskId={planner.selectedTask?.id ?? ""}
          onOpenTask={planner.selectTask}
          onToggleDone={planner.toggleTaskDone}
          onUpdateTask={planner.updateTask}
          onCreateTask={planner.createTask}
          onArchiveTask={handleArchiveTask}
          onDuplicateTask={handleDuplicateTask}
          onRequestDelete={requestDeleteTask}
          showToast={showToast}
        />
        {renderTaskDetail()}
      </section>
    );
  }

  if (activePage === "tasks") {
    return (
      <section className={pageGridClass()}>
        <div className="content-stack">
          <header className="page-header">
            <div>
              <p className="eyebrow">All lists</p>
              <h1>Tasks</h1>
            </div>
            <div className="task-toolbar">
              <button
                className={filtersOpen ? "toolbar-button active" : "toolbar-button"}
                onClick={() => setFiltersOpen((open) => !open)}
              >
                Filter
              </button>
              <label>
                Sort
                <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                  <option value="dueDate">Due date</option>
                  <option value="priority">Priority</option>
                  <option value="createdAt">Created</option>
                  <option value="updatedAt">Updated</option>
                  <option value="title">Title</option>
                </select>
              </label>
              <label>
                Group
                <select value={groupKey} onChange={(event) => setGroupKey(event.target.value as GroupBy)}>
                  <option value="date">Date</option>
                  <option value="priority">Priority</option>
                  <option value="project">Project</option>
                  <option value="none">None</option>
                </select>
              </label>
              <div className="stat-pill">{filteredTasks.length} shown</div>
            </div>
          </header>
          <QuickAdd projects={activeProjects} onAddTask={planner.addTask} />
          <TemplateControls
            templates={planner.taskTemplates}
            selectedTask={planner.selectedTask}
            onCreateFromTemplate={planner.createTaskFromTemplate}
            onSaveTemplate={planner.saveTaskAsTemplate}
          />
          {filtersOpen ? (
            <div className="filters">
              <FilterSelect label="Status" value={statusFilter} options={statusOptions} onChange={setStatusFilter} />
              <FilterSelect
                label="Priority"
                value={priorityFilter}
                options={priorityOptions}
                onChange={setPriorityFilter}
              />
              <label>
                Project
                <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
                  <option value="all">all</option>
                  <option value="">Inbox</option>
                  {activeProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Due
                <select value={dueFilter} onChange={(event) => setDueFilter(event.target.value as typeof dueFilter)}>
                  <option value="all">all</option>
                  <option value="today">today</option>
                  <option value="week">this week</option>
                  <option value="overdue">overdue</option>
                  <option value="none">no date</option>
                </select>
              </label>
              <label>
                Tags
                <input
                  placeholder="tag"
                  value={tagFilter}
                  onChange={(event) => setTagFilter(event.target.value)}
                />
              </label>
              <FilterSelect
                label="Importance"
                value={importanceFilter}
                options={levelOptions}
                onChange={setImportanceFilter}
              />
              <FilterSelect
                label="Urgency"
                value={urgencyFilter}
                options={levelOptions}
                onChange={setUrgencyFilter}
              />
              <label>
                Direction
                <select
                  value={sortDirection}
                  onChange={(event) => setSortDirection(event.target.value as SortDirection)}
                >
                  <option value="asc">ascending</option>
                  <option value="desc">descending</option>
                </select>
              </label>
              <button className="filter-reset" onClick={resetFilters}>
                Reset filters
              </button>
            </div>
          ) : null}
          <TaskList
            tasks={filteredTasks}
            projects={planner.projects}
            subtasks={planner.subtasks}
            emptyMessage="No tasks match these filters."
            groupBy={groupKey}
            onToggleDone={planner.toggleTaskDone}
            onSelectTask={planner.selectTask}
          />
        </div>
        {renderTaskDetail()}
      </section>
    );
  }

  if (activePage === "planning") {
    return (
      <section className={pageGridClass()}>
        <PlanningPage
          tasks={planner.tasks}
          projects={activeProjects}
          selectedTaskId={planner.selectedTask?.id ?? ""}
          view={planningTab}
          onChangeView={(v) => setPlanningTab(v)}
          onOpenTask={planner.selectTask}
          onUpdateStatus={planner.updateTaskStatus}
          onUpdateTask={planner.updateTask}
          onCreateTask={planner.createTask}
        />
        {renderTaskDetail()}
      </section>
    );
  }

  if (activePage === "study") {
    return (
      <section className={pageGridClass()}>
        <StudyPage
          topics={planner.studyTopics}
          notes={planner.conceptNotes}
          tab={studyTab}
          onChangeTab={setStudyTab}
          onCreateTopic={planner.createTopic}
          onDeleteTopic={planner.deleteTopic}
          onCreateNote={planner.createNote}
          onUpdateNote={planner.updateNote}
          onDeleteNote={planner.deleteNote}
          onMarkReviewed={planner.markNoteReviewed}
          showToast={showToast}
          focusNoteId={studyFocusNoteId}
          onFocusNoteHandled={() => setStudyFocusNoteId("")}
        />
      </section>
    );
  }

  if (activePage === "archive") {
    return (
      <section className={pageGridClass()}>
        <ArchivePage
          tasks={planner.tasks}
          projects={planner.projects}
          onOpenTask={planner.selectTask}
          onRestoreTask={planner.restoreTask}
          onRestoreProject={planner.restoreProject}
          onDeleteTask={requestDeleteTask}
          onDeleteProject={requestDeleteProject}
        />
        {renderTaskDetail()}
      </section>
    );
  }

  if (activePage === "board") {
    return (
      <section className={pageGridClass("wide-detail")}>
        <div className="content-stack">
          <header className="page-header">
            <h1>Board</h1>
            <div className="stat-pill">{openTasks.length} open tasks</div>
          </header>
          <BoardView
            tasks={planner.tasks}
            projects={planner.projects}
            subtasks={planner.subtasks}
            onSelectTask={planner.selectTask}
            onUpdateTask={planner.updateTask}
            onAddTask={planner.addTask}
          />
        </div>
        {renderTaskDetail()}
      </section>
    );
  }

  if (activePage === "calendar") {
    return (
      <section className="gcal-page-shell">
        <CalendarView
          tasks={planner.tasks}
          projects={activeProjects}
          conceptNotes={planner.conceptNotes}
          onSelectTask={planner.selectTask}
          onUpdateTask={planner.updateTask}
          onCreateTask={planner.createTask}
          onOpenProject={openProjectFromCalendar}
          onOpenStudyReview={openStudyReviewFromCalendar}
          taskDetail={renderTaskDetail()}
          showToast={showToast}
        />
      </section>
    );
  }

  if (activePage === "matrix") {
    const quadrants = [
      ["Important & Urgent", "high", "high"],
      ["Important & Not Urgent", "high", "low"],
      ["Not Important & Urgent", "low", "high"],
      ["Not Important & Not Urgent", "low", "low"],
    ] as const;

    return (
      <section className="content-stack">
        <header className="page-header">
          <h1>Eisenhower Matrix</h1>
          <div className="stat-pill">{openTasks.length} open tasks</div>
        </header>
        <div className="matrix-grid">
          {quadrants.map(([title, importance, urgency]) => {
            const tasks = openTasks.filter(
              (task) => task.importance === importance && task.urgency === urgency,
            );
            return (
              <section key={title} className="matrix-cell">
                <h2>{title}</h2>
                <TaskList
                  tasks={tasks}
                  projects={planner.projects}
                  subtasks={planner.subtasks}
                  emptyMessage="No tasks here."
                  onToggleDone={planner.toggleTaskDone}
                  onSelectTask={planner.selectTask}
                />
              </section>
            );
          })}
        </div>
      </section>
    );
  }

  if (activePage === "projects") {
    return (
      <ProjectsPage
        projects={planner.projects}
        tasks={planner.tasks}
        subtasks={planner.subtasks}
        selectedTaskId={planner.selectedTask?.id ?? ""}
        taskDetail={renderTaskDetail()}
        selectedProjectId={selectedProjectId}
        detailOpen={isProjectDetailOpen}
        onOpenProject={(id) => {
          setSelectedProjectId(id);
          setIsProjectDetailOpen(true);
          planner.selectTask("");
        }}
        onCloseProject={() => {
          setIsProjectDetailOpen(false);
          planner.selectTask("");
        }}
        onOpenTask={planner.selectTask}
        onToggleDone={planner.toggleTaskDone}
        onUpdateTask={planner.updateTask}
        onCreateTask={planner.createTask}
        onCreateProject={planner.createProject}
        onUpdateProject={planner.updateProject}
        onToggleStar={planner.toggleProjectPinned}
        onArchiveProject={handleArchiveProject}
        onRequestDeleteProject={requestDeleteProject}
        onSaveNotes={(id, value) => planner.updateProject(id, { notes: value })}
        showToast={showToast}
      />
    );
  }

  if (activePage === "dashboard") {
    return (
      <DashboardView
        tasks={planner.tasks}
        projects={planner.projects}
        habits={planner.habits}
        habitLogs={planner.habitLogs}
        focusSessions={planner.focusSessions}
        onExport={exportJson}
      />
    );
  }

  if (activePage === "habits") {
    return (
      <HabitsPage
        habits={planner.habits}
        habitLogs={planner.habitLogs}
        onAddHabit={planner.addHabit}
        onToggleHabit={planner.toggleHabitLog}
      />
    );
  }

  if (activePage === "focus") {
    return (
      <FocusPage
        tasks={planner.tasks}
        focusSessions={planner.focusSessions}
        onAddFocusSession={planner.addFocusSession}
      />
    );
  }

  return (
    <SettingsPage
      settings={appSettings}
      onUpdate={planner.updateAppSettings}
      onExport={exportJson}
      onImport={handleImport}
      onLoadSamples={planner.loadSamples}
      onReset={planner.resetData}
      importMessage={importMessage}
      accountSlot={accountSlot}
    />
  );
}

function TemplateControls({
  templates,
  selectedTask,
  onCreateFromTemplate,
  onSaveTemplate,
}: {
  templates: TaskTemplate[];
  selectedTask: Task | null;
  onCreateFromTemplate: (templateId: string) => void;
  onSaveTemplate: (taskId: string, name: string) => void;
}) {
  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");

  return (
    <div className="template-tools">
      <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
        <option value="">Choose template</option>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => {
          if (templateId) {
            onCreateFromTemplate(templateId);
            setTemplateId("");
          }
        }}
      >
        Use template
      </button>
      <input
        placeholder="Template name"
        value={templateName}
        onChange={(event) => setTemplateName(event.target.value)}
      />
      <button
        disabled={!selectedTask}
        onClick={() => {
          if (selectedTask) {
            onSaveTemplate(selectedTask.id, templateName);
            setTemplateName("");
          }
        }}
      >
        Save selected
      </button>
    </div>
  );
}

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  onChange: (value: T) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replace("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
}
