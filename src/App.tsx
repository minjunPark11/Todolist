import { ChangeEvent, FormEvent, RefObject, useEffect, useMemo, useRef, useState } from "react";
import { BoardView } from "./components/BoardView";
import { CalendarView } from "./components/CalendarView";
import { DashboardView } from "./components/DashboardView";
import { FocusPage } from "./components/FocusPage";
import { getHabitStreak, HabitsPage } from "./components/HabitsPage";
import { QuickAdd } from "./components/QuickAdd";
import { InboxPage } from "./components/InboxPage";
import { TodayPage } from "./components/TodayPage";
import { ProjectsPage } from "./components/ProjectsPage";
import { PlanningPage } from "./components/PlanningPage";
import { StudyPage } from "./components/StudyPage";
import { ArchivePage } from "./components/ArchivePage";
import { SettingsPage } from "./components/SettingsPage";
import { Sidebar } from "./components/Sidebar";
import { TaskDetail } from "./components/TaskDetail";
import { TaskList, type GroupBy } from "./components/TaskList";
import { usePlannerData } from "./hooks/usePlannerData";
import type {
  ConceptNote,
  Habit,
  HabitLog,
  PageId,
  Project,
  StudyTopic,
  Subtask,
  Task,
  TaskLevel,
  TaskPriority,
  TaskStatus,
  TaskTemplate,
} from "./types";
import { addDays, formatDate, isOverdue, isThisWeek, todayValue } from "./utils/date";
import { getDueReviewCount } from "./utils/planner";

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
type SortKey = "dueDate" | "priority" | "createdAt" | "updatedAt" | "title";
type SortDirection = "asc" | "desc";

function getProjectName(projects: Project[], projectId: string) {
  return projects.find((project) => project.id === projectId)?.name ?? "Inbox";
}

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

function getTodayBuckets(tasks: Task[], today: string) {
  const buckets = {
    doneToday: [] as Task[],
    waiting: [] as Task[],
    inProgress: [] as Task[],
    overdue: [] as Task[],
    focus: [] as Task[],
    dueToday: [] as Task[],
    scheduledToday: [] as Task[],
  };

  for (const task of tasks) {
    const scheduledDate = (task as Task & { scheduledDate?: string }).scheduledDate;

    if (task.completedAt.startsWith(today)) {
      buckets.doneToday.push(task);
      continue;
    }
    if (task.status === "done") {
      continue;
    }
    if (task.status === "waiting") {
      buckets.waiting.push(task);
      continue;
    }
    if (task.status === "doing") {
      buckets.inProgress.push(task);
      continue;
    }
    if (isOverdue(task.dueDate)) {
      buckets.overdue.push(task);
      continue;
    }
    if ((task as Task & { isFocus?: boolean }).isFocus || (task.dueDate === today && task.priority === "high")) {
      buckets.focus.push(task);
      continue;
    }
    if (task.dueDate === today) {
      buckets.dueToday.push(task);
      continue;
    }
    if (scheduledDate === today) {
      buckets.scheduledToday.push(task);
    }
  }

  return buckets;
}

export default function App() {
  const planner = usePlannerData();
  const appSettings = planner.appSettings;
  const dueReviewCount = getDueReviewCount(planner.conceptNotes);
  const [activePage, setActivePage] = useState<PageId>(
    appSettings.defaultView === "/inbox" ? "inbox" : "today",
  );
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
  const [searchQuery, setSearchQuery] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [isProjectDetailOpen, setIsProjectDetailOpen] = useState(false);
  const [planningTab, setPlanningTab] = useState<"board" | "matrix">("board");
  const [studyTab, setStudyTab] = useState<"topics" | "notes" | "reviews">("topics");
  const [pendingDeleteTaskId, setPendingDeleteTaskId] = useState("");
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState("");
  const [toast, setToast] = useState<{ message: string; actionLabel?: string; onAction?: () => void } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const today = todayValue();
  const tomorrow = addDays(today, 1);
  const activeTasks = planner.tasks.filter((task) => task.status !== "archived");
  const activeProjects = planner.projects.filter((project) => project.status !== "archived");
  const archivedProjects = planner.projects.filter((project) => project.status === "archived");
  const openTasks = activeTasks.filter((task) => task.status !== "done");
  const tomorrowTasks = sortTasks(planner.tasks.filter((task) => task.dueDate === tomorrow));
  const overdueTasks = sortTasks(openTasks.filter((task) => isOverdue(task.dueDate)));
  const thisWeekTasks = sortTasks(openTasks.filter((task) => isThisWeek(task.dueDate)));
  const inboxTasks = sortTasks(openTasks.filter((task) => !task.projectId && !task.dueDate));
  const todayBuckets = getTodayBuckets(activeTasks, today);
  const focusTasks = sortTasks(todayBuckets.focus).slice(0, 3);
  const dueTodayTasks = sortTasks(todayBuckets.dueToday);
  const waitingTasks = sortTasks(todayBuckets.waiting);
  const inProgressTodayTasks = sortTasks(todayBuckets.inProgress);
  const overdueTodayTasks = sortTasks(todayBuckets.overdue);
  const doneTodayTasks = sortTasks(todayBuckets.doneToday);
  const dueReviewNotes = planner.conceptNotes.filter(
    (note) => note.nextReviewDate && note.nextReviewDate <= today && note.reviewStatus !== "mastered",
  );
  const completedToday = planner.tasks.filter((task) => task.completedAt.startsWith(today)).length;
  const completedTasks = activeTasks.filter((task) => task.status === "done");
  const archivedTasks = planner.tasks.filter((task) => task.status === "archived");
  const inProgressTasks = activeTasks.filter((task) => task.status === "doing");
  const blockedTasks = activeTasks.filter((task) => task.status === "waiting");
  const currentHabitStreak = Math.max(
    0,
    ...planner.habits.map((habit) => getHabitStreak(habit.id, planner.habitLogs)),
  );

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return { tasks: [], projects: [], topics: [], notes: [] };
    }

    return {
      tasks: planner.tasks.filter((task) =>
        [task.title, task.description, task.notes, task.tags.join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(query),
      ),
      projects: activeProjects.filter((project) =>
        [project.name, project.description].join(" ").toLowerCase().includes(query),
      ),
      topics: planner.studyTopics.filter((topic) =>
        [topic.name, topic.description, topic.category].join(" ").toLowerCase().includes(query),
      ),
      notes: planner.conceptNotes.filter((note) =>
        [note.title, note.summary, note.content, note.tags.join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(query),
      ),
    };
  }, [activeProjects, planner.conceptNotes, planner.studyTopics, planner.tasks, searchQuery]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT";

      if (event.key === "Escape") {
        planner.selectTask("");
        setSearchQuery("");
        return;
      }

      if (isTyping) {
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (event.key.toLowerCase() === "t") {
        setActivePage("today");
      } else if (event.key.toLowerCase() === "i") {
        setActivePage("inbox");
      } else if (event.key.toLowerCase() === "n") {
        setActivePage("inbox");
        window.setTimeout(() => {
          document.querySelector<HTMLInputElement>('[aria-label="Task title"]')?.focus();
        }, 0);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [planner]);

  useEffect(() => {
    const root = document.documentElement;
    const resolvedTheme =
      appSettings.theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : appSettings.theme;
    root.dataset.theme = resolvedTheme;
    root.dataset.accent = appSettings.accentColor;
    root.dataset.font = appSettings.fontSize;
    root.dataset.reduceMotion = appSettings.reduceMotion ? "true" : "false";
  }, [appSettings.theme, appSettings.accentColor, appSettings.fontSize, appSettings.reduceMotion]);

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
    dueFilter,
    importanceFilter,
    activeTasks,
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

  function exportJson() {
    const payload = JSON.stringify(planner.exportData(), null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `todo-planner-backup-${today}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const success = planner.importData(parsed);
        setImportMessage(success ? "Import complete." : "Import failed: invalid file.");
      } catch {
        setImportMessage("Import failed: invalid JSON.");
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  }

  function showToast(nextToast: { message: string; actionLabel?: string; onAction?: () => void }) {
    setToast(nextToast);
    window.setTimeout(() => {
      setToast((current) => (current === nextToast ? null : current));
    }, 4500);
  }

  function handleArchiveTask(taskId: string) {
    planner.archiveTask(taskId);
    showToast({
      message: "Task archived.",
      actionLabel: "Undo",
      onAction: () => planner.restoreTask(taskId),
    });
  }

  function handleDuplicateTask(taskId: string) {
    planner.duplicateTask(taskId);
    showToast({ message: "Task duplicated." });
  }

  function handleArchiveProject(projectId: string) {
    planner.archiveProject(projectId);
    setIsProjectDetailOpen(false);
    setSelectedProjectId("");
    planner.selectTask("");
    showToast({
      message: "Project archived.",
      actionLabel: "Undo",
      onAction: () => planner.restoreProject(projectId),
    });
  }

  function requestDeleteTask(taskId: string) {
    if (appSettings.confirmBeforeDelete) {
      setPendingDeleteTaskId(taskId);
    } else {
      planner.deleteTask(taskId);
      showToast({ message: "Task deleted." });
    }
  }

  function requestDeleteProject(projectId: string) {
    if (appSettings.confirmBeforeDelete) {
      setPendingDeleteProjectId(projectId);
    } else {
      planner.deleteProject(projectId);
      setIsProjectDetailOpen(false);
      setSelectedProjectId("");
      planner.selectTask("");
      showToast({ message: "Project deleted. Tasks moved to Inbox." });
    }
  }

  function confirmDeleteTask() {
    if (!pendingDeleteTaskId) {
      return;
    }
    planner.deleteTask(pendingDeleteTaskId);
    setPendingDeleteTaskId("");
    showToast({ message: "Task deleted." });
  }

  function confirmDeleteProject() {
    if (!pendingDeleteProjectId) {
      return;
    }
    planner.deleteProject(pendingDeleteProjectId);
    setPendingDeleteProjectId("");
    setIsProjectDetailOpen(false);
    setSelectedProjectId("");
    planner.selectTask("");
    showToast({ message: "Project deleted. Tasks were moved to Inbox." });
  }

  function openTaskInOfficialPage(taskId: string) {
    const task = planner.tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    planner.selectTask(taskId);
    setSearchQuery("");

    if (task.status === "inbox") {
      setActivePage("inbox");
      return;
    }

    if (task.status === "archived" || task.archivedAt) {
      setActivePage("archive");
      return;
    }

    if (task.projectId) {
      setSelectedProjectId(task.projectId);
      setIsProjectDetailOpen(true);
      setActivePage("projects");
      return;
    }

    setActivePage("planning");
  }

  function openStudyResult(note?: ConceptNote) {
    if (note) {
      setStudyTab(note.nextReviewDate ? "reviews" : "notes");
    } else {
      setStudyTab("topics");
    }
    setActivePage("study");
    setSearchQuery("");
  }

  if (planner.auth.isConfigured && !planner.auth.isSignedIn) {
    return (
      <AuthGate
        auth={planner.auth}
        onSignIn={planner.signIn}
        onSignUp={planner.signUp}
      />
    );
  }

  function renderTaskDetail() {
    if (!planner.selectedTask) {
      return null;
    }

    return (
      <TaskDetail
        task={planner.selectedTask}
        tasks={planner.tasks}
        projects={activeProjects}
        subtasks={planner.subtasks}
        onUpdateTask={planner.updateTask}
        onRequestDeleteTask={setPendingDeleteTaskId}
        onArchiveTask={handleArchiveTask}
        onDuplicateTask={handleDuplicateTask}
        onAddSubtask={planner.addSubtask}
        onToggleSubtask={planner.toggleSubtask}
        onDeleteSubtask={planner.deleteSubtask}
      />
    );
  }

  function pageGridClass(extra = "") {
    const base = planner.selectedTask ? "page-grid" : "page-grid no-detail";
    return extra ? `${base} ${extra}` : base;
  }

  function renderPage() {
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
        <section className="content-stack">
          <header className="page-header">
            <h1>Calendar</h1>
            <div className="legend">
              <span className="danger">overdue</span>
              <span className="accent">today</span>
              <span className="soft">this week</span>
            </div>
          </header>
            <CalendarView
              tasks={planner.tasks}
              projects={planner.projects}
              onSelectTask={planner.selectTask}
              onUpdateTask={planner.updateTask}
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
        accountSlot={
          <AccountSection
            auth={planner.auth}
            onSignIn={planner.signIn}
            onSignUp={planner.signUp}
            onSignOut={planner.signOut}
            onUploadLocal={planner.uploadLocalDataToSupabase}
            onRefresh={planner.refreshSupabaseData}
          />
        }
      />
    );
  }

  return (
    <div className={mobileMenuOpen ? "app-shell mobile-menu-open" : "app-shell"}>
      <button
        type="button"
        className="mobile-menu-button"
        aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        aria-expanded={mobileMenuOpen}
        onClick={() => setMobileMenuOpen((open) => !open)}
      >
        <span />
        <span />
        <span />
      </button>
      {mobileMenuOpen ? (
        <button
          type="button"
          className="mobile-menu-backdrop"
          aria-label="Close menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}
      <Sidebar
        activePage={activePage}
        onNavigate={(page) => {
          setActivePage(page);
          setMobileMenuOpen(false);
        }}
        tasks={planner.tasks}
        projects={activeProjects}
        selectedProjectId={selectedProjectId}
        userEmail={planner.auth.userEmail}
        dueReviewCount={dueReviewCount}
        showCounts={appSettings.showSidebarCounts}
        onSelectProject={(projectId) => {
          setSelectedProjectId(projectId);
          setIsProjectDetailOpen(true);
          setActivePage("projects");
          setMobileMenuOpen(false);
        }}
        onAddProject={(name) => planner.addProject(name, "#0066cc")}
        onOpenSettings={() => {
          setActivePage("settings");
          setMobileMenuOpen(false);
        }}
        search={
          <SearchBox
            query={searchQuery}
            inputRef={searchInputRef}
            results={searchResults}
            onChange={setSearchQuery}
            onSelectTask={openTaskInOfficialPage}
            onSelectProject={(projectId) => {
              setSelectedProjectId(projectId);
              setIsProjectDetailOpen(true);
              setActivePage("projects");
              setSearchQuery("");
            }}
            onSelectTopic={() => openStudyResult()}
            onSelectNote={openStudyResult}
          />
        }
      />
      <main>{renderPage()}</main>
      {pendingDeleteTaskId ? (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-task-title">
            <h2 id="delete-task-title">Delete task?</h2>
            <p>This removes the task and its subtasks. This action cannot be undone.</p>
            <div className="confirm-actions">
              <button onClick={() => setPendingDeleteTaskId("")}>Cancel</button>
              <button className="danger-button-inline" onClick={confirmDeleteTask}>
                Delete
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {pendingDeleteProjectId ? (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-project-title">
            <h2 id="delete-project-title">Delete project?</h2>
            <p>This removes the project only. Its tasks will stay unchanged and move to Inbox.</p>
            <div className="confirm-actions">
              <button onClick={() => setPendingDeleteProjectId("")}>Cancel</button>
              <button className="danger-button-inline" onClick={confirmDeleteProject}>
                Delete Project
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {toast ? (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.actionLabel && toast.onAction ? (
            <button
              onClick={() => {
                toast.onAction?.();
                setToast(null);
              }}
            >
              {toast.actionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AuthGate({
  auth,
  onSignIn,
  onSignUp,
}: {
  auth: ReturnType<typeof usePlannerData>["auth"];
  onSignIn: (email: string, password: string) => Promise<boolean>;
  onSignUp: (email: string, password: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isSignUp = mode === "signUp";
  const canSubmit = Boolean(email.trim()) && password.length >= 6 && !submitting && !auth.isLoading;
  const authError = formatAuthError(auth.syncError);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      setMessage(password && password.length < 6 ? "Password must be at least 6 characters." : "Enter your email and password.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    const success = isSignUp
      ? await onSignUp(email.trim(), password)
      : await onSignIn(email.trim(), password);
    setSubmitting(false);

    if (!success) {
      setMessage(isSignUp ? "Sign up failed. Please check your details." : "Login failed. Please check your email and password.");
      return;
    }

    setMessage(isSignUp ? "Account created." : "Signed in.");
    setPassword("");
  }

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <div className="auth-logo" aria-hidden="true">
            <span />
          </div>
          <h1 id="auth-title">FOCUSFLOW</h1>
          <p>{isSignUp ? "Create your personal focus space" : "Your day starts here"}</p>
        </div>

        <form className="auth-gate-form" onSubmit={submit}>
          <label>
            Email
            <div className="auth-input-wrap">
              <span aria-hidden="true">M</span>
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </label>

          <label>
            Password
            <div className="auth-input-wrap">
              <span aria-hidden="true">L</span>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="auth-icon-button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <div className="auth-options">
            <label className="auth-check">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              Keep me signed in
            </label>
            <button type="button" className="auth-link" onClick={() => setMessage("Password reset will be connected in a later step.")}>
              Forgot password
            </button>
          </div>

          <button type="submit" className="auth-submit" disabled={!canSubmit}>
            {submitting || auth.isLoading ? "Processing..." : isSignUp ? "Sign up" : "Log in"}
          </button>
        </form>

        <div className="auth-divider">
          <span />
          <em>or</em>
          <span />
        </div>

        <p className="auth-switch">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(isSignUp ? "signIn" : "signUp");
              setMessage("");
            }}
          >
            {isSignUp ? "Log in" : "Sign up"}
          </button>
        </p>

        {message || authError ? (
          <p className={authError ? "auth-message error" : "auth-message"}>
            {authError || message}
          </p>
        ) : null}
      </section>
    </main>
  );
}

function formatAuthError(error: string): string {
  if (!error) {
    return "";
  }

  if (error.includes("Invalid path specified")) {
    return "Supabase URL is misconfigured. Use the project URL in the form https://...supabase.co.";
  }

  if (error.toLowerCase().includes("invalid login credentials")) {
    return "Email or password is incorrect.";
  }

  return error;
}

function AccountSection({
  auth,
  onSignIn,
  onSignUp,
  onSignOut,
  onUploadLocal,
  onRefresh,
}: {
  auth: ReturnType<typeof usePlannerData>["auth"];
  onSignIn: (email: string, password: string) => Promise<boolean>;
  onSignUp: (email: string, password: string) => Promise<boolean>;
  onSignOut: () => Promise<void>;
  onUploadLocal: () => Promise<boolean>;
  onRefresh: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit(action: "signIn" | "signUp") {
    const success = action === "signIn" ? await onSignIn(email, password) : await onSignUp(email, password);
    setMessage(success ? (action === "signIn" ? "Signed in." : "Account created.") : "Authentication failed.");
    if (success) {
      setPassword("");
    }
  }

  return (
    <section className="settings-card account-card">
      <div className="section-title">
        <h2>Account</h2>
        <span>{auth.mode}</span>
      </div>
      {!auth.isConfigured ? (
        <p className="empty-state">Supabase env vars are not configured. The app is using localStorage.</p>
      ) : null}
      {auth.isSignedIn ? (
        <div className="account-stack">
          <p>
            Signed in as <strong>{auth.userEmail}</strong>
          </p>
          <div className="settings-actions">
            <button onClick={onRefresh}>Refresh cloud data</button>
            <button onClick={onSignOut}>Log out</button>
          </div>
        </div>
      ) : (
        <div className="auth-form">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button onClick={() => submit("signIn")} disabled={!auth.isConfigured || auth.isLoading}>
            Log in
          </button>
          <button onClick={() => submit("signUp")} disabled={!auth.isConfigured || auth.isLoading}>
            Sign up
          </button>
        </div>
      )}
      {auth.migrationPreviewCount > 0 && auth.isSignedIn ? (
        <div className="migration-box">
          <strong>{auth.migrationPreviewCount} local items can be uploaded.</strong>
          <p>Upload your existing localStorage data to Supabase. Matching ids are upserted to avoid duplicates.</p>
          <button
            onClick={async () => {
              const success = await onUploadLocal();
              setMessage(success ? "Local data uploaded to Supabase." : "No local data to upload.");
            }}
          >
            Upload local data
          </button>
        </div>
      ) : null}
      <p className="settings-message">{auth.syncStatus}</p>
      {auth.syncError ? <p className="settings-error">{auth.syncError}</p> : null}
      {message ? <p className="settings-message">{message}</p> : null}
    </section>
  );
}

function TaskSection({
  title,
  tasks,
  projects,
  subtasks,
  emptyMessage,
  planner,
}: {
  title: string;
  tasks: Task[];
  projects: Project[];
  subtasks: Subtask[];
  emptyMessage: string;
  planner: ReturnType<typeof usePlannerData>;
}) {
  return (
    <section className="panel-section">
      <div className="section-title">
        <h2>{title}</h2>
        <span>{tasks.length}</span>
      </div>
      <TaskList
        tasks={tasks}
        projects={projects}
        subtasks={subtasks}
        emptyMessage={emptyMessage}
        onToggleDone={planner.toggleTaskDone}
        onSelectTask={planner.selectTask}
      />
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function SegmentedTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<[string, string]>;
  active: string;
  onChange: (tab: string) => void;
}) {
  return (
    <div className="segmented-tabs">
      {tabs.map(([id, label]) => (
        <button key={id} className={active === id ? "active" : ""} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function SearchBox({
  query,
  inputRef,
  results,
  onChange,
  onSelectTask,
  onSelectProject,
  onSelectTopic,
  onSelectNote,
}: {
  query: string;
  inputRef: RefObject<HTMLInputElement>;
  results: { tasks: Task[]; projects: Project[]; topics: StudyTopic[]; notes: ConceptNote[] };
  onChange: (value: string) => void;
  onSelectTask: (taskId: string) => void;
  onSelectProject: (projectId: string) => void;
  onSelectTopic: (topicId: string) => void;
  onSelectNote: (note: ConceptNote) => void;
}) {
  const hasResults =
    results.tasks.length > 0 ||
    results.projects.length > 0 ||
    results.topics.length > 0 ||
    results.notes.length > 0;

  return (
    <div className="global-search">
      <input
        ref={inputRef}
        aria-label="Global search"
        placeholder="Search /"
        value={query}
        onChange={(event) => onChange(event.target.value)}
      />
      {query.trim() ? (
        <div className="search-results">
          {!hasResults ? <p className="empty-state">No results.</p> : null}
          {results.tasks.slice(0, 6).map((task) => (
            <button key={task.id} onClick={() => onSelectTask(task.id)}>
              <strong>{task.title}</strong>
              <small>Task - {task.status} - {task.tags.join(", ") || "no tags"}</small>
            </button>
          ))}
          {results.projects.slice(0, 4).map((project) => (
            <button key={project.id} onClick={() => onSelectProject(project.id)}>
              <strong>{project.name}</strong>
              <small>Project</small>
            </button>
          ))}
          {results.topics.slice(0, 4).map((topic) => (
            <button key={topic.id} onClick={() => onSelectTopic(topic.id)}>
              <strong>{topic.name}</strong>
              <small>Study topic - {topic.category}</small>
            </button>
          ))}
          {results.notes.slice(0, 4).map((note) => (
            <button key={note.id} onClick={() => onSelectNote(note)}>
              <strong>{note.title}</strong>
              <small>Study note - {note.noteType}</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
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

function TodayHabits({
  habits,
  habitLogs,
  onToggleHabit,
}: {
  habits: Habit[];
  habitLogs: HabitLog[];
  onToggleHabit: (habitId: string, date: string) => void;
}) {
  const today = todayValue();

  return (
    <section className="panel-section">
      <div className="section-title">
        <h2>Today's Habits</h2>
        <span>{habitLogs.filter((log) => log.date === today && log.completed).length}</span>
      </div>
      <div className="today-habit-list">
        {habits.length === 0 ? <p className="empty-state">No habits yet.</p> : null}
        {habits.map((habit) => {
          const completed = habitLogs.some(
            (log) => log.habitId === habit.id && log.date === today && log.completed,
          );

          return (
            <button
              key={habit.id}
              className={completed ? "today-habit done" : "today-habit"}
              onClick={() => onToggleHabit(habit.id, today)}
            >
              <span style={{ backgroundColor: habit.color }} />
              <strong>{habit.name}</strong>
              <small>{completed ? "Done" : "Open"}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ProjectDetailSummary({
  project,
  total,
  completed,
  overdue,
  upcoming,
}: {
  project: Project;
  total: number;
  completed: number;
  overdue: number;
  upcoming: number;
}) {
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="project-detail-summary">
      <p>{project.description || "No description yet."}</p>
      <div className="metric-grid">
        <MetricCard label="Total" value={total} />
        <MetricCard label="Completed" value={completed} />
        <MetricCard label="Overdue" value={overdue} tone="danger" />
        <MetricCard label="Upcoming" value={upcoming} />
      </div>
      <div className="chart-row">
        <div>
          <strong>Completion rate</strong>
          <span>{completionRate}%</span>
        </div>
        <div className="progress-bar">
          <span style={{ width: `${completionRate}%` }} />
        </div>
      </div>
    </div>
  );
}

function ProjectInfoPanel({
  project,
  total,
  completed,
  overdue,
  upcoming,
  onArchive,
  onDelete,
}: {
  project: Project;
  total: number;
  completed: number;
  overdue: number;
  upcoming: number;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <aside className="detail-panel project-info-panel">
      <div className="detail-handle" />
      <div className="detail-header">
        <h2>Project Info</h2>
        <p>{project.description || "No description yet."}</p>
      </div>
      <div className="detail-section">
        <h3>Progress</h3>
        <div className="progress-bar">
          <span style={{ width: `${completionRate}%` }} />
        </div>
        <p className="progress-label">{completionRate}% complete</p>
      </div>
      <div className="detail-section project-info-list">
        <h3>Status</h3>
        <div><span>Total</span><strong>{total}</strong></div>
        <div><span>Completed</span><strong>{completed}</strong></div>
        <div><span>Overdue</span><strong className="danger">{overdue}</strong></div>
        <div><span>This week</span><strong>{upcoming}</strong></div>
      </div>
      <div className="detail-section task-actions-section">
        <h3>Actions</h3>
        <div className="task-action-row">
          <button onClick={onArchive}>Archive Project</button>
          <button className="danger-button-inline" onClick={onDelete}>Delete Project</button>
        </div>
      </div>
    </aside>
  );
}

function MetricCard({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </article>
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
