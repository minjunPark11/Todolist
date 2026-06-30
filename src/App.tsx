import { ChangeEvent, RefObject, useEffect, useMemo, useRef, useState } from "react";
import { BoardView } from "./components/BoardView";
import { CalendarView } from "./components/CalendarView";
import { FocusPage } from "./components/FocusPage";
import { getHabitStreak, HabitsPage } from "./components/HabitsPage";
import { QuickAdd } from "./components/QuickAdd";
import { TaskDetail } from "./components/TaskDetail";
import { TaskList } from "./components/TaskList";
import { usePlannerData } from "./hooks/usePlannerData";
import type {
  Habit,
  HabitLog,
  PageId,
  Project,
  Subtask,
  Task,
  TaskLevel,
  TaskPriority,
  TaskStatus,
  TaskTemplate,
} from "./types";
import { formatDate, isDateThisWeek, isOverdue, isThisWeek, todayValue } from "./utils/date";

const navItems: Array<{ id: PageId; label: string }> = [
  { id: "today", label: "Today" },
  { id: "inbox", label: "Inbox" },
  { id: "tasks", label: "Tasks" },
  { id: "board", label: "Board" },
  { id: "calendar", label: "Calendar" },
  { id: "matrix", label: "Matrix" },
  { id: "projects", label: "Projects" },
  { id: "dashboard", label: "Dashboard" },
  { id: "habits", label: "Habits" },
  { id: "focus", label: "Focus" },
  { id: "settings", label: "Settings" },
];

const statusOptions: Array<TaskStatus | "all"> = [
  "all",
  "todo",
  "in_progress",
  "waiting",
  "blocked",
  "done",
];
const priorityOptions: Array<TaskPriority | "all"> = ["all", "none", "low", "medium", "high"];
const levelOptions: Array<TaskLevel | "all"> = ["all", "low", "high"];
const priorityRank: Record<TaskPriority, number> = { none: 0, low: 1, medium: 2, high: 3 };
type SortKey = "dueDate" | "priority" | "createdAt" | "updatedAt" | "title";
type SortDirection = "asc" | "desc";

function getProjectName(projects: Project[], projectId: string) {
  return projects.find((project) => project.id === projectId)?.name ?? "Inbox";
}

function getTaskCompletion(tasks: Task[]) {
  if (tasks.length === 0) {
    return 0;
  }

  return Math.round((tasks.filter((task) => task.status === "done").length / tasks.length) * 100);
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

export default function App() {
  const planner = usePlannerData();
  const [activePage, setActivePage] = useState<PageId>("today");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState<"all" | "today" | "week" | "overdue" | "none">("all");
  const [tagFilter, setTagFilter] = useState("");
  const [importanceFilter, setImportanceFilter] = useState<TaskLevel | "all">("all");
  const [urgencyFilter, setUrgencyFilter] = useState<TaskLevel | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("dueDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [isProjectDetailOpen, setIsProjectDetailOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const today = todayValue();
  const openTasks = planner.tasks.filter((task) => task.status !== "done");
  const todayTasks = sortTasks(planner.tasks.filter((task) => task.dueDate === today));
  const recurringTasksDueToday = sortTasks(
    planner.tasks.filter((task) => task.repeatType !== "none" && task.dueDate === today),
  );
  const overdueTasks = sortTasks(openTasks.filter((task) => isOverdue(task.dueDate)));
  const thisWeekTasks = sortTasks(openTasks.filter((task) => isThisWeek(task.dueDate)));
  const inboxTasks = sortTasks(planner.tasks.filter((task) => !task.projectId && !task.dueDate));
  const completedToday = planner.tasks.filter((task) => task.completedAt.startsWith(today)).length;
  const completedTasks = planner.tasks.filter((task) => task.status === "done");
  const inProgressTasks = planner.tasks.filter((task) => task.status === "in_progress");
  const blockedTasks = planner.tasks.filter((task) => task.status === "blocked");
  const habitsCompletedToday = planner.habitLogs.filter(
    (log) => log.date === today && log.completed,
  ).length;
  const currentHabitStreak = Math.max(
    0,
    ...planner.habits.map((habit) => getHabitStreak(habit.id, planner.habitLogs)),
  );
  const focusSessionsToday = planner.focusSessions.filter(
    (session) => session.completed && session.startedAt.slice(0, 10) === today,
  );
  const focusMinutesToday = focusSessionsToday
    .filter((session) => session.mode === "focus")
    .reduce((total, session) => total + session.durationMinutes, 0);
  const focusMinutesThisWeek = planner.focusSessions
    .filter((session) => session.completed && session.mode === "focus" && isDateThisWeek(session.startedAt.slice(0, 10)))
    .reduce((total, session) => total + session.durationMinutes, 0);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return { tasks: [], projects: [], habits: [] };
    }

    return {
      tasks: planner.tasks.filter((task) =>
        [task.title, task.description, task.notes, task.tags.join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(query),
      ),
      projects: planner.projects.filter((project) =>
        [project.name, project.description].join(" ").toLowerCase().includes(query),
      ),
      habits: planner.habits.filter((habit) =>
        [habit.name, habit.description].join(" ").toLowerCase().includes(query),
      ),
    };
  }, [planner.habits, planner.projects, planner.tasks, searchQuery]);

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

  const filteredTasks = useMemo(() => {
    return sortTasks(
      planner.tasks.filter((task) => {
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

  function renderTaskDetail() {
    return (
      <TaskDetail
        task={planner.selectedTask}
        tasks={planner.tasks}
        projects={planner.projects}
        subtasks={planner.subtasks}
        onUpdateTask={planner.updateTask}
        onDeleteTask={planner.deleteTask}
        onAddSubtask={planner.addSubtask}
        onToggleSubtask={planner.toggleSubtask}
        onDeleteSubtask={planner.deleteSubtask}
      />
    );
  }

  function renderPage() {
    if (activePage === "today") {
      return (
        <section className="page-grid">
          <div className="content-stack">
            <header className="today-hero">
              <p className="eyebrow">{formatDate(today)}</p>
              <h1>Today</h1>
              <p className="today-hero-sub">{completedToday} done today</p>
            </header>
            <QuickAdd projects={planner.projects} defaultDueDate={today} onAddTask={planner.addTask} />
            <div className="today-summary-grid">
              <SummaryCard label="Recurring due" value={recurringTasksDueToday.length} />
              <SummaryCard label="Habits done" value={`${habitsCompletedToday}/${planner.habits.length}`} />
              <SummaryCard label="Focus today" value={`${focusMinutesToday} min`} />
            </div>
            <TaskSection
              title="Today's Tasks"
              tasks={todayTasks}
              projects={planner.projects}
              subtasks={planner.subtasks}
              emptyMessage="Nothing due today."
              planner={planner}
            />
            <TaskSection
              title="Recurring Tasks Due Today"
              tasks={recurringTasksDueToday}
              projects={planner.projects}
              subtasks={planner.subtasks}
              emptyMessage="No recurring tasks due today."
              planner={planner}
            />
            <TodayHabits habits={planner.habits} habitLogs={planner.habitLogs} onToggleHabit={planner.toggleHabitLog} />
            <TaskSection
              title="Overdue"
              tasks={overdueTasks}
              projects={planner.projects}
              subtasks={planner.subtasks}
              emptyMessage="No overdue tasks."
              planner={planner}
            />
            <TaskSection
              title="This Week"
              tasks={thisWeekTasks}
              projects={planner.projects}
              subtasks={planner.subtasks}
              emptyMessage="No upcoming tasks this week."
              planner={planner}
            />
            <section className="panel-section">
              <div className="section-title">
                <h2>Focus Summary</h2>
                <span>{focusSessionsToday.length}</span>
              </div>
              <p className="empty-state">{focusMinutesToday} focus minutes completed today.</p>
            </section>
          </div>
          {renderTaskDetail()}
        </section>
      );
    }

    if (activePage === "inbox") {
      return (
        <section className="page-grid">
          <div className="content-stack">
            <header className="page-header">
              <h1>Inbox</h1>
              <div className="stat-pill">{inboxTasks.length} unsorted</div>
            </header>
            <QuickAdd projects={planner.projects} onAddTask={planner.addTask} />
            <TemplateControls
              templates={planner.taskTemplates}
              selectedTask={planner.selectedTask}
              onCreateFromTemplate={planner.createTaskFromTemplate}
              onSaveTemplate={planner.saveTaskAsTemplate}
            />
            <TaskList
              tasks={inboxTasks}
              projects={planner.projects}
              subtasks={planner.subtasks}
              emptyMessage="Your inbox is clear."
              onToggleDone={planner.toggleTaskDone}
              onSelectTask={planner.selectTask}
            />
          </div>
          {renderTaskDetail()}
        </section>
      );
    }

    if (activePage === "tasks") {
      return (
        <section className="page-grid">
          <div className="content-stack">
            <header className="page-header">
              <h1>Tasks</h1>
              <div className="stat-pill">{filteredTasks.length} shown</div>
            </header>
            <QuickAdd projects={planner.projects} onAddTask={planner.addTask} />
            <TemplateControls
              templates={planner.taskTemplates}
              selectedTask={planner.selectedTask}
              onCreateFromTemplate={planner.createTaskFromTemplate}
              onSaveTemplate={planner.saveTaskAsTemplate}
            />
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
                  {planner.projects.map((project) => (
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
                Sort by
                <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                  <option value="dueDate">due date</option>
                  <option value="priority">priority</option>
                  <option value="createdAt">created date</option>
                  <option value="updatedAt">updated date</option>
                  <option value="title">title</option>
                </select>
              </label>
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
            <TaskList
              tasks={filteredTasks}
              projects={planner.projects}
              subtasks={planner.subtasks}
              emptyMessage="No tasks match these filters."
              onToggleDone={planner.toggleTaskDone}
              onSelectTask={planner.selectTask}
            />
          </div>
          {renderTaskDetail()}
        </section>
      );
    }

    if (activePage === "board") {
      return (
        <section className="page-grid wide-detail">
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
      const currentProject = planner.projects.find((project) => project.id === selectedProjectId);
      const projectTasks = sortTasks(planner.tasks.filter((task) => task.projectId === selectedProjectId));
      const projectCompleted = projectTasks.filter((task) => task.status === "done").length;
      const projectOverdue = projectTasks.filter((task) => task.status !== "done" && isOverdue(task.dueDate)).length;
      const projectUpcoming = projectTasks.filter((task) => task.status !== "done" && isThisWeek(task.dueDate)).length;

      return (
        <section className="page-grid">
          <div className="content-stack">
            <header className="page-header">
              <h1>{isProjectDetailOpen && currentProject ? currentProject.name : "Projects"}</h1>
              <div className="stat-pill">{planner.projects.length} projects</div>
            </header>
            <form
              className="project-form"
              onSubmit={(event) => {
                event.preventDefault();
                planner.addProject(newProjectName, "#0066cc");
                setNewProjectName("");
              }}
            >
              <input
                placeholder="New project"
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
              />
              <button type="submit">Add project</button>
            </form>
            <div className="project-layout">
              <div className="project-list">
                {planner.projects.map((project) => {
                  const count = planner.tasks.filter((task) => task.projectId === project.id).length;
                  return (
                    <button
                      key={project.id}
                      className={selectedProjectId === project.id ? "project-card active" : "project-card"}
                      onClick={() => {
                        setSelectedProjectId(project.id);
                        setIsProjectDetailOpen(true);
                      }}
                    >
                      <span style={{ backgroundColor: project.color }} />
                      <strong>{project.name}</strong>
                      <small>{count} tasks</small>
                    </button>
                  );
                })}
              </div>
              <div className="project-tasks">
                {isProjectDetailOpen && currentProject ? (
                  <ProjectDetailSummary
                    project={currentProject}
                    total={projectTasks.length}
                    completed={projectCompleted}
                    overdue={projectOverdue}
                    upcoming={projectUpcoming}
                    onBack={() => setIsProjectDetailOpen(false)}
                  />
                ) : (
                  <h2>Select a project</h2>
                )}
                <TaskList
                  tasks={isProjectDetailOpen && currentProject ? projectTasks : []}
                  projects={planner.projects}
                  subtasks={planner.subtasks}
                  emptyMessage="No project selected or no tasks here."
                  onToggleDone={planner.toggleTaskDone}
                  onSelectTask={planner.selectTask}
                />
              </div>
            </div>
          </div>
          {renderTaskDetail()}
        </section>
      );
    }

    if (activePage === "dashboard") {
      return (
        <DashboardPage
          tasks={planner.tasks}
          projects={planner.projects}
          habits={planner.habits}
          habitLogs={planner.habitLogs}
          totalTasks={planner.tasks.length}
          completedTasks={completedTasks.length}
          inProgressTasks={inProgressTasks.length}
          blockedTasks={blockedTasks.length}
          overdueTasks={overdueTasks.length}
          dueThisWeek={thisWeekTasks.length}
          habitsCompletedToday={habitsCompletedToday}
          currentHabitStreak={currentHabitStreak}
          focusMinutesThisWeek={focusMinutesThisWeek}
          recurringDueToday={recurringTasksDueToday.length}
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
      <section className="content-stack settings-page">
        <header className="page-header">
          <h1>Settings</h1>
        </header>
        <AccountSection
          auth={planner.auth}
          onSignIn={planner.signIn}
          onSignUp={planner.signUp}
          onSignOut={planner.signOut}
          onUploadLocal={planner.uploadLocalDataToSupabase}
          onRefresh={planner.refreshSupabaseData}
        />
        <section className="settings-card">
          <h2>Data</h2>
          <p>Local data is stored in this browser with localStorage.</p>
          <div className="settings-actions">
            <button onClick={exportJson}>Export JSON</button>
            <label className="import-button">
              Import JSON
              <input type="file" accept="application/json" onChange={handleImport} />
            </label>
            <button onClick={planner.loadSamples}>Load sample data</button>
            <button className="danger-button" onClick={planner.resetData}>
              Reset data
            </button>
          </div>
          {importMessage ? <p className="settings-message">{importMessage}</p> : null}
        </section>
      </section>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="app-kicker">Personal MVP</p>
          <h1>Todo Planner</h1>
        </div>
        <SearchBox
          query={searchQuery}
          inputRef={searchInputRef}
          results={searchResults}
          onChange={setSearchQuery}
          onSelectTask={(taskId) => {
            planner.selectTask(taskId);
            setActivePage("tasks");
            setSearchQuery("");
          }}
          onSelectProject={(projectId) => {
            setSelectedProjectId(projectId);
            setIsProjectDetailOpen(true);
            setActivePage("projects");
            setSearchQuery("");
          }}
          onSelectHabit={() => {
            setActivePage("habits");
            setSearchQuery("");
          }}
        />
        <nav>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={activePage === item.id ? "active" : ""}
              onClick={() => setActivePage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-summary">
          <strong>{openTasks.length}</strong>
          <span>open tasks</span>
        </div>
      </aside>
      <main>{renderPage()}</main>
    </div>
  );
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

function SearchBox({
  query,
  inputRef,
  results,
  onChange,
  onSelectTask,
  onSelectProject,
  onSelectHabit,
}: {
  query: string;
  inputRef: RefObject<HTMLInputElement>;
  results: { tasks: Task[]; projects: Project[]; habits: Habit[] };
  onChange: (value: string) => void;
  onSelectTask: (taskId: string) => void;
  onSelectProject: (projectId: string) => void;
  onSelectHabit: (habitId: string) => void;
}) {
  const hasResults = results.tasks.length > 0 || results.projects.length > 0 || results.habits.length > 0;

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
              <small>Task · {task.tags.join(", ") || "no tags"}</small>
            </button>
          ))}
          {results.projects.slice(0, 4).map((project) => (
            <button key={project.id} onClick={() => onSelectProject(project.id)}>
              <strong>{project.name}</strong>
              <small>Project</small>
            </button>
          ))}
          {results.habits.slice(0, 4).map((habit) => (
            <button key={habit.id} onClick={() => onSelectHabit(habit.id)}>
              <strong>{habit.name}</strong>
              <small>Habit</small>
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
  onBack,
}: {
  project: Project;
  total: number;
  completed: number;
  overdue: number;
  upcoming: number;
  onBack: () => void;
}) {
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="project-detail-summary">
      <button className="text-button" onClick={onBack}>
        Back to projects
      </button>
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

function DashboardPage({
  tasks,
  projects,
  habits,
  habitLogs,
  totalTasks,
  completedTasks,
  inProgressTasks,
  blockedTasks,
  overdueTasks,
  dueThisWeek,
  habitsCompletedToday,
  currentHabitStreak,
  focusMinutesThisWeek,
  recurringDueToday,
}: {
  tasks: Task[];
  projects: Project[];
  habits: Habit[];
  habitLogs: HabitLog[];
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  overdueTasks: number;
  dueThisWeek: number;
  habitsCompletedToday: number;
  currentHabitStreak: number;
  focusMinutesThisWeek: number;
  recurringDueToday: number;
}) {
  const completionRate = getTaskCompletion(tasks);
  const statusCounts: Array<{ label: string; value: number }> = statusOptions
    .filter((status) => status !== "all")
    .map((status) => ({
      label: status.replace("_", " "),
      value: tasks.filter((task) => task.status === status).length,
    }));
  const priorityCounts: Array<{ label: string; value: number }> = priorityOptions
    .filter((priority) => priority !== "all")
    .map((priority) => ({
      label: priority,
      value: tasks.filter((task) => task.priority === priority).length,
    }));
  const projectCounts = projects.map((project) => ({
    label: project.name,
    value: tasks.filter((task) => task.projectId === project.id).length,
  }));
  const inboxCount = tasks.filter((task) => !task.projectId).length;

  return (
    <section className="content-stack">
      <header className="page-header">
        <h1>Dashboard</h1>
        <div className="stat-pill">{completionRate}% complete</div>
      </header>
      <div className="metric-grid dashboard-metrics">
        <MetricCard label="Total tasks" value={totalTasks} />
        <MetricCard label="Completed" value={completedTasks} />
        <MetricCard label="In progress" value={inProgressTasks} />
        <MetricCard label="Blocked" value={blockedTasks} tone="danger" />
        <MetricCard label="Overdue" value={overdueTasks} tone="danger" />
        <MetricCard label="Due this week" value={dueThisWeek} />
        <MetricCard label="Habits today" value={habitsCompletedToday} />
        <MetricCard label="Best streak" value={currentHabitStreak} />
        <MetricCard label="Focus this week" value={focusMinutesThisWeek} />
        <MetricCard label="Recurring today" value={recurringDueToday} />
      </div>
      <section className="dashboard-section">
        <h2>Completion</h2>
        <div className="chart-row">
          <div>
            <strong>All tasks</strong>
            <span>{completionRate}%</span>
          </div>
          <div className="progress-bar">
            <span style={{ width: `${completionRate}%` }} />
          </div>
        </div>
      </section>
      <div className="dashboard-grid">
        <BarPanel title="By project" items={[...projectCounts, { label: "Inbox", value: inboxCount }]} />
        <BarPanel title="By status" items={statusCounts} />
        <BarPanel title="By priority" items={priorityCounts} />
        <BarPanel
          title="Habit streaks"
          items={habits.map((habit) => ({
            label: habit.name,
            value: getHabitStreak(habit.id, habitLogs),
          }))}
        />
      </div>
    </section>
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

function BarPanel({ title, items }: { title: string; items: Array<{ label: string; value: number }> }) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <section className="dashboard-section">
      <h2>{title}</h2>
      <div className="bar-list">
        {items.map((item) => (
          <div key={item.label} className="bar-row">
            <div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
            <div className="bar-track">
              <span style={{ width: `${(item.value / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
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
