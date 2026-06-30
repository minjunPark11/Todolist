import { ChangeEvent, RefObject, useEffect, useMemo, useRef, useState } from "react";
import { BoardView } from "./components/BoardView";
import { CalendarView } from "./components/CalendarView";
import { DashboardView } from "./components/DashboardView";
import { FocusPage } from "./components/FocusPage";
import { getHabitStreak, HabitsPage } from "./components/HabitsPage";
import { QuickAdd } from "./components/QuickAdd";
import { Sidebar } from "./components/Sidebar";
import { TaskDetail } from "./components/TaskDetail";
import { TaskList, type GroupBy } from "./components/TaskList";
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
import { addDays, formatDate, isOverdue, isThisWeek, todayValue } from "./utils/date";

const statusOptions: Array<TaskStatus | "all"> = [
  "all",
  "todo",
  "in_progress",
  "waiting",
  "blocked",
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
    if (task.status === "in_progress") {
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

type ConceptNote = {
  id: string;
  topic: string;
  title: string;
  summary: string;
  difficulty: "easy" | "medium" | "hard" | "unknown";
  reviewStatus: "not_scheduled" | "due" | "reviewed" | "mastered";
  nextReviewDate: string;
  lastReviewedAt: string;
};

type StudyTopic = {
  id: string;
  name: string;
  category: "Python" | "fNIRS" | "Research" | "English" | "Presentation" | "Other";
  description: string;
  status: "active" | "paused" | "mastered" | "archived";
  color: string;
};

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
  const [groupKey, setGroupKey] = useState<GroupBy>("date");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [isProjectDetailOpen, setIsProjectDetailOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [planningTab, setPlanningTab] = useState<"board" | "matrix">("board");
  const [studyTab, setStudyTab] = useState<"topics" | "notes" | "reviews">("topics");
  const [projectTab, setProjectTab] = useState<"overview" | "tasks" | "subtasks" | "notes">("overview");
  const [projectNotes, setProjectNotes] = useState<Record<string, string>>({});
  const [pendingDeleteTaskId, setPendingDeleteTaskId] = useState("");
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState("");
  const [toast, setToast] = useState<{ message: string; actionLabel?: string; onAction?: () => void } | null>(null);
  const [studyModal, setStudyModal] = useState<"" | "topic" | "note">("");
  const [topicDraft, setTopicDraft] = useState({ name: "", category: "Python" as StudyTopic["category"], description: "" });
  const [noteDraft, setNoteDraft] = useState({
    title: "",
    topic: "Python",
    summary: "",
    difficulty: "unknown" as ConceptNote["difficulty"],
    nextReviewDate: "",
  });
  const [studyTopics, setStudyTopics] = useState<StudyTopic[]>([
    { id: "topic-python", name: "Python", category: "Python", description: "Coding concepts and LeetCode patterns.", status: "active", color: "#007aff" },
    { id: "topic-fnirs", name: "fNIRS", category: "fNIRS", description: "Thesis concepts and analysis methods.", status: "active", color: "#af52de" },
    { id: "topic-research", name: "Research", category: "Research", description: "Methods, theory, and writing.", status: "active", color: "#34c759" },
    { id: "topic-english", name: "English", category: "English", description: "Academic and presentation English.", status: "active", color: "#ff9500" },
    { id: "topic-presentation", name: "Presentation", category: "Presentation", description: "Scripts, Q&A, and delivery.", status: "active", color: "#ff2d55" },
  ]);
  const [conceptNotes, setConceptNotes] = useState<ConceptNote[]>([
    {
      id: "note-gcd",
      topic: "Python",
      title: "GCD of Strings",
      summary: "Use shared divisors of string lengths to test repeated base patterns.",
      difficulty: "medium",
      reviewStatus: "due",
      nextReviewDate: todayValue(),
      lastReviewedAt: "",
    },
    {
      id: "note-fnirs-connectivity",
      topic: "fNIRS",
      title: "fNIRS connectivity",
      summary: "Connectivity describes functional relationships between measured brain regions.",
      difficulty: "hard",
      reviewStatus: "due",
      nextReviewDate: todayValue(),
      lastReviewedAt: "",
    },
    {
      id: "note-hbo-hbr",
      topic: "fNIRS",
      title: "HbO / HbR",
      summary: "Oxy- and deoxyhemoglobin signals are interpreted together in fNIRS analysis.",
      difficulty: "unknown",
      reviewStatus: "not_scheduled",
      nextReviewDate: "",
      lastReviewedAt: "",
    },
  ]);
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
  const dueReviewNotes = conceptNotes.filter(
    (note) => note.nextReviewDate && note.nextReviewDate <= today && note.reviewStatus !== "mastered",
  );
  const completedToday = planner.tasks.filter((task) => task.completedAt.startsWith(today)).length;
  const completedTasks = activeTasks.filter((task) => task.status === "done");
  const archivedTasks = planner.tasks.filter((task) => task.status === "archived");
  const inProgressTasks = activeTasks.filter((task) => task.status === "in_progress");
  const blockedTasks = activeTasks.filter((task) => task.status === "blocked");
  const currentHabitStreak = Math.max(
    0,
    ...planner.habits.map((habit) => getHabitStreak(habit.id, planner.habitLogs)),
  );

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
      projects: activeProjects.filter((project) =>
        [project.name, project.description].join(" ").toLowerCase().includes(query),
      ),
      habits: planner.habits.filter((habit) =>
        [habit.name, habit.description].join(" ").toLowerCase().includes(query),
      ),
    };
  }, [planner.habits, activeProjects, planner.tasks, searchQuery]);

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

  function markConceptReviewed(noteId: string, difficulty: ConceptNote["difficulty"]) {
    const nextReviewDate =
      difficulty === "hard"
        ? addDays(today, 1)
        : difficulty === "medium"
          ? addDays(today, 3)
          : difficulty === "easy"
            ? addDays(today, 7)
            : "";

    setConceptNotes((current) =>
      current.map((note) =>
        note.id === noteId
          ? {
              ...note,
              difficulty,
              reviewStatus: difficulty === "unknown" ? "mastered" : "reviewed",
              nextReviewDate,
              lastReviewedAt: new Date().toISOString(),
            }
          : note,
      ),
    );
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

  function createStudyTopic() {
    const name = topicDraft.name.trim();
    if (!name) {
      return;
    }

    setStudyTopics((current) => [
      ...current,
      {
        id: `topic-${crypto.randomUUID()}`,
        name,
        category: topicDraft.category,
        description: topicDraft.description.trim(),
        status: "active",
        color: "#007aff",
      },
    ]);
    setNoteDraft((current) => ({ ...current, topic: name }));
    setTopicDraft({ name: "", category: "Python", description: "" });
    setStudyModal("");
    setStudyTab("topics");
    showToast({ message: "Topic created." });
  }

  function createConceptNote() {
    const title = noteDraft.title.trim();
    if (!title) {
      return;
    }

    setConceptNotes((current) => [
      {
        id: `note-${crypto.randomUUID()}`,
        topic: noteDraft.topic,
        title,
        summary: noteDraft.summary.trim() || "No summary yet.",
        difficulty: noteDraft.difficulty,
        reviewStatus: noteDraft.nextReviewDate ? "due" : "not_scheduled",
        nextReviewDate: noteDraft.nextReviewDate,
        lastReviewedAt: "",
      },
      ...current,
    ]);
    setNoteDraft({
      title: "",
      topic: studyTopics[0]?.name ?? "Python",
      summary: "",
      difficulty: "unknown",
      nextReviewDate: "",
    });
    setStudyModal("");
    setStudyTab("notes");
    showToast({ message: "Note saved." });
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
        <section className={pageGridClass("today-focusflow")}>
          <div className="content-stack">
            <header className="today-list-header">
              <div>
                <h1>Today</h1>
                <p>{formatDate(today)}</p>
                <span>Focus on what matters today.</span>
              </div>
              <div className="today-inline-stats">
                <button className="primary-action" onClick={() => document.querySelector<HTMLInputElement>('[aria-label="Task title"]')?.focus()}>
                  + Add Task
                </button>
                <span>{completedToday} done</span>
                <span>{overdueTasks.length} overdue</span>
              </div>
            </header>
            <QuickAdd projects={activeProjects} defaultDueDate={today} onAddTask={planner.addTask} />
            <div className="today-board-grid">
              <TaskSection
                title="Focus"
                tasks={focusTasks}
                projects={planner.projects}
                subtasks={planner.subtasks}
                emptyMessage="Pick one high-priority task for today."
                planner={planner}
              />
              <TaskSection
                title="Due Today"
                tasks={dueTodayTasks}
                projects={planner.projects}
                subtasks={planner.subtasks}
                emptyMessage="Nothing due today."
                planner={planner}
              />
              <TaskSection
                title="Waiting"
                tasks={waitingTasks}
                projects={planner.projects}
                subtasks={planner.subtasks}
                emptyMessage="No waiting tasks."
                planner={planner}
              />
              <TaskSection
                title="Done Today"
                tasks={doneTodayTasks}
                projects={planner.projects}
                subtasks={planner.subtasks}
                emptyMessage="Completed tasks will land here."
                planner={planner}
              />
              <TaskSection
                title="In Progress"
                tasks={inProgressTodayTasks}
                projects={planner.projects}
                subtasks={planner.subtasks}
                emptyMessage="No active task yet."
                planner={planner}
              />
              <TaskSection
                title="Overdue"
                tasks={overdueTodayTasks}
                projects={planner.projects}
                subtasks={planner.subtasks}
                emptyMessage="No overdue tasks."
                planner={planner}
              />
            </div>
          </div>
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
          <div className="content-stack">
            <header className="page-header">
              <h1>Inbox</h1>
              <div className="stat-pill">{inboxTasks.length} unsorted</div>
            </header>
            <QuickAdd projects={activeProjects} onAddTask={planner.addTask} />
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
      const quadrants = [
        ["Do Now", "high", "high"],
        ["Schedule", "high", "low"],
        ["Quick Handle", "low", "high"],
        ["Later", "low", "low"],
      ] as const;

      return (
        <section className={pageGridClass("wide-detail")}>
          <div className="content-stack">
            <header className="page-header">
              <div>
                <h1>Planning</h1>
                <p className="page-subtitle">Prioritize, schedule, and keep work moving.</p>
              </div>
              <div className="stat-pill">{openTasks.length} open tasks</div>
            </header>
            <SegmentedTabs
              tabs={[
                ["board", "Board"],
                ["matrix", "Eisenhower Matrix"],
              ]}
              active={planningTab}
              onChange={(tab) => setPlanningTab(tab as typeof planningTab)}
            />
            {planningTab === "board" ? (
              <BoardView
                tasks={planner.tasks}
                projects={planner.projects}
                subtasks={planner.subtasks}
                onSelectTask={planner.selectTask}
                onUpdateTask={planner.updateTask}
                onAddTask={planner.addTask}
              />
            ) : null}
            {planningTab === "matrix" ? (
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
            ) : null}
          </div>
          {renderTaskDetail()}
        </section>
      );
    }

    if (activePage === "study") {
      return (
        <section className={pageGridClass()}>
          <div className="content-stack">
            <header className="page-header">
              <div>
                <h1>Study</h1>
                <p className="page-subtitle">Track topics, concept notes, and review dates.</p>
              </div>
              <div className="study-header-actions">
                <button className="toolbar-button" onClick={() => setStudyModal("topic")}>New Topic</button>
                <button className="primary-action" onClick={() => setStudyModal("note")}>New Note</button>
                <div className="stat-pill">{dueReviewNotes.length} due reviews</div>
              </div>
            </header>
            <SegmentedTabs
              tabs={[
                ["topics", "Topics"],
                ["notes", "Notes"],
                ["reviews", "Reviews"],
              ]}
              active={studyTab}
              onChange={(tab) => setStudyTab(tab as typeof studyTab)}
            />
            {studyTab === "topics" ? (
              <>
                <div className="study-metrics">
                  <SummaryCard label="Total Topics" value={studyTopics.length} />
                  <SummaryCard label="Concept Notes" value={conceptNotes.length} />
                  <SummaryCard label="Due Reviews" value={dueReviewNotes.length} />
                  <SummaryCard label="Study Streak" value={`${currentHabitStreak} days`} />
                </div>
                <div className="topic-grid">
                  {studyTopics.map((topic) => {
                    const notes = conceptNotes.filter((note) => note.topic === topic.name);
                    const due = notes.filter((note) => note.nextReviewDate && note.nextReviewDate <= today).length;
                    return (
                      <article className="topic-card" key={topic.id}>
                        <span className="topic-dot" style={{ backgroundColor: topic.color }} />
                        <strong>{topic.name}</strong>
                        <small>{topic.category} · {topic.status}</small>
                        <span>{notes.length} notes</span>
                        {topic.description ? <p>{topic.description}</p> : null}
                        <p className="empty-state">{due} due reviews</p>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : null}
            {studyTab === "notes" ? (
              <div className="note-grid">
                {conceptNotes.map((note) => (
                  <article className="note-card" key={note.id}>
                    <div>
                      <strong>{note.title}</strong>
                      <p>{note.summary}</p>
                    </div>
                    <div className="task-meta">
                      <span>{note.topic}</span>
                      <span>{note.difficulty}</span>
                      <span>{note.nextReviewDate || "No review"}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
            {studyTab === "reviews" ? (
              <div className="note-grid">
                {dueReviewNotes.length === 0 ? <p className="empty-state">No reviews due.</p> : null}
                {dueReviewNotes.map((note) => (
                  <article className="note-card review-card" key={note.id}>
                    <div>
                      <strong>{note.title}</strong>
                      <p>{note.summary}</p>
                    </div>
                    <div className="review-actions">
                      <button onClick={() => markConceptReviewed(note.id, "hard")}>Hard</button>
                      <button onClick={() => markConceptReviewed(note.id, "medium")}>Medium</button>
                      <button onClick={() => markConceptReviewed(note.id, "easy")}>Easy</button>
                      <button onClick={() => markConceptReviewed(note.id, "unknown")}>Mastered</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
          {renderTaskDetail()}
        </section>
      );
    }

    if (activePage === "archive") {
      return (
        <section className={pageGridClass()}>
          <div className="content-stack">
            <header className="page-header">
              <div>
                <h1>Archive</h1>
                <p className="page-subtitle">Completed and parked work.</p>
              </div>
              <div className="stat-pill">{archivedTasks.length + archivedProjects.length} archived</div>
            </header>
            <section className="panel-section">
              <div className="section-title">
                <h2>Archived Projects</h2>
                <span>{archivedProjects.length}</span>
              </div>
              <div className="project-list-grid">
                {archivedProjects.length === 0 ? <p className="empty-state">No archived projects yet.</p> : null}
                {archivedProjects.map((project) => (
                  <article className="project-card project-tile" key={project.id}>
                    <span style={{ backgroundColor: project.color }} />
                    <strong>{project.name}</strong>
                    <small>{project.description || "Archived project"}</small>
                    <button className="text-button" onClick={() => planner.restoreProject(project.id)}>
                      Restore
                    </button>
                  </article>
                ))}
              </div>
            </section>
            <TaskSection
              title="Archived Tasks"
              tasks={archivedTasks}
              projects={planner.projects}
              subtasks={planner.subtasks}
              emptyMessage="No archived tasks yet."
              planner={planner}
            />
          </div>
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
      const currentProject = activeProjects.find((project) => project.id === selectedProjectId);
      const projectTasks = sortTasks(planner.tasks.filter((task) => task.projectId === selectedProjectId));
      const projectCompleted = projectTasks.filter((task) => task.status === "done").length;
      const projectOverdue = projectTasks.filter((task) => task.status !== "done" && isOverdue(task.dueDate)).length;
      const projectUpcoming = projectTasks.filter((task) => task.status !== "done" && isThisWeek(task.dueDate)).length;
      const projectSubtasks = planner.subtasks.filter((subtask) =>
        projectTasks.some((task) => task.id === subtask.taskId),
      );
      const projectCompletionRate = projectTasks.length > 0 ? Math.round((projectCompleted / projectTasks.length) * 100) : 0;
      const projectNote = selectedProjectId ? projectNotes[selectedProjectId] ?? currentProject?.description ?? "" : "";

      return (
        <section className={isProjectDetailOpen && currentProject ? "page-grid project-detail-page" : pageGridClass()}>
          <div className="content-stack">
            <header className="page-header">
              <div>
                {isProjectDetailOpen && currentProject ? (
                  <button className="text-button" onClick={() => setIsProjectDetailOpen(false)}>
                    Back to Projects
                  </button>
                ) : null}
                <h1>{isProjectDetailOpen && currentProject ? currentProject.name : "Projects"}</h1>
                {isProjectDetailOpen && currentProject ? (
                  <p className="page-subtitle">{currentProject.description || "Project detail workspace."}</p>
                ) : null}
              </div>
              <div className="stat-pill">{isProjectDetailOpen && currentProject ? `${projectCompletionRate}% done` : `${activeProjects.length} projects`}</div>
            </header>
            {!isProjectDetailOpen || !currentProject ? (
              <>
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
                <div className="project-list-grid">
                  {activeProjects.map((project) => {
                    const tasks = planner.tasks.filter((task) => task.projectId === project.id);
                    const done = tasks.filter((task) => task.status === "done").length;
                    const count = tasks.length;
                    const progress = count > 0 ? Math.round((done / count) * 100) : 0;
                    return (
                      <button
                        key={project.id}
                        className={selectedProjectId === project.id ? "project-card active project-tile" : "project-card project-tile"}
                        onClick={() => {
                          setSelectedProjectId(project.id);
                          setIsProjectDetailOpen(true);
                          setProjectTab("overview");
                          planner.selectTask("");
                        }}
                      >
                        <span style={{ backgroundColor: project.color }} />
                        <strong>{project.name}</strong>
                        <small>{count} tasks</small>
                        <div className="mini-progress" aria-label="Project progress">
                          <i style={{ width: `${progress}%` }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <QuickAdd
                  projects={activeProjects}
                  defaultProjectId={currentProject.id}
                  onAddTask={planner.addTask}
                />
                <SegmentedTabs
                  tabs={[
                    ["overview", "Overview"],
                    ["tasks", "Tasks"],
                    ["subtasks", "Subtasks"],
                    ["notes", "Notes"],
                  ]}
                  active={projectTab}
                  onChange={(tab) => setProjectTab(tab as typeof projectTab)}
                />
                {projectTab === "overview" ? (
                  <ProjectDetailSummary
                    project={currentProject}
                    total={projectTasks.length}
                    completed={projectCompleted}
                    overdue={projectOverdue}
                    upcoming={projectUpcoming}
                  />
                ) : null}
                {projectTab === "tasks" ? (
                  <TaskList
                    tasks={projectTasks}
                    projects={planner.projects}
                    subtasks={planner.subtasks}
                    emptyMessage="No tasks in this project yet."
                    onToggleDone={planner.toggleTaskDone}
                    onSelectTask={planner.selectTask}
                  />
                ) : null}
                {projectTab === "subtasks" ? (
                  <section className="panel-section">
                    <div className="section-title">
                      <h2>Subtasks</h2>
                      <span>{projectSubtasks.length}</span>
                    </div>
                    <div className="subtask-project-list">
                      {projectSubtasks.length === 0 ? <p className="empty-state">No subtasks yet.</p> : null}
                      {projectSubtasks.map((subtask) => {
                        const parent = projectTasks.find((task) => task.id === subtask.taskId);
                        return (
                          <label className="project-subtask-row" key={subtask.id}>
                            <input
                              type="checkbox"
                              checked={subtask.completed}
                              onChange={() => planner.toggleSubtask(subtask.id)}
                            />
                            <span>{subtask.title}</span>
                            <small>{parent?.title ?? "Task"}</small>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
                {projectTab === "notes" ? (
                  <section className="panel-section">
                    <div className="section-title">
                      <h2>Project Notes</h2>
                      <span>autosaved</span>
                    </div>
                    <textarea
                      className="project-note-editor"
                      value={projectNote}
                      placeholder="Write project notes, feedback, links, or decisions here."
                      onChange={(event) =>
                        setProjectNotes((current) => ({
                          ...current,
                          [currentProject.id]: event.target.value,
                        }))
                      }
                    />
                  </section>
                ) : null}
              </>
            )}
          </div>
          {isProjectDetailOpen && currentProject
            ? planner.selectedTask
              ? renderTaskDetail()
              : (
                <ProjectInfoPanel
                  project={currentProject}
                  total={projectTasks.length}
                  completed={projectCompleted}
                  overdue={projectOverdue}
                  upcoming={projectUpcoming}
                  onArchive={() => handleArchiveProject(currentProject.id)}
                  onDelete={() => setPendingDeleteProjectId(currentProject.id)}
                />
              )
            : renderTaskDetail()}
        </section>
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
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        tasks={planner.tasks}
        projects={activeProjects}
        selectedProjectId={selectedProjectId}
        userEmail={planner.auth.userEmail}
        onSelectProject={(projectId) => {
          setSelectedProjectId(projectId);
          setIsProjectDetailOpen(true);
          setActivePage("projects");
        }}
        onAddProject={(name) => planner.addProject(name, "#0066cc")}
        onOpenSettings={() => setActivePage("settings")}
        search={
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
      {studyModal ? (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-modal study-modal" role="dialog" aria-modal="true" aria-labelledby="study-modal-title">
            <h2 id="study-modal-title">{studyModal === "topic" ? "New Topic" : "New Note"}</h2>
            {studyModal === "topic" ? (
              <div className="modal-form">
                <label>
                  Topic name
                  <input
                    value={topicDraft.name}
                    onChange={(event) => setTopicDraft((current) => ({ ...current, name: event.target.value }))}
                    autoFocus
                  />
                </label>
                <label>
                  Category
                  <select
                    value={topicDraft.category}
                    onChange={(event) =>
                      setTopicDraft((current) => ({ ...current, category: event.target.value as StudyTopic["category"] }))
                    }
                  >
                    {["Python", "fNIRS", "Research", "English", "Presentation", "Other"].map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Description
                  <textarea
                    value={topicDraft.description}
                    onChange={(event) => setTopicDraft((current) => ({ ...current, description: event.target.value }))}
                  />
                </label>
              </div>
            ) : (
              <div className="modal-form">
                <label>
                  Title
                  <input
                    value={noteDraft.title}
                    onChange={(event) => setNoteDraft((current) => ({ ...current, title: event.target.value }))}
                    autoFocus
                  />
                </label>
                <label>
                  Topic
                  <select
                    value={noteDraft.topic}
                    onChange={(event) => setNoteDraft((current) => ({ ...current, topic: event.target.value }))}
                  >
                    {studyTopics.map((topic) => (
                      <option key={topic.id} value={topic.name}>{topic.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Summary
                  <textarea
                    value={noteDraft.summary}
                    onChange={(event) => setNoteDraft((current) => ({ ...current, summary: event.target.value }))}
                  />
                </label>
                <label>
                  Difficulty
                  <select
                    value={noteDraft.difficulty}
                    onChange={(event) =>
                      setNoteDraft((current) => ({ ...current, difficulty: event.target.value as ConceptNote["difficulty"] }))
                    }
                  >
                    <option value="unknown">Unknown</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </label>
                <label>
                  Next review
                  <input
                    type="date"
                    value={noteDraft.nextReviewDate}
                    onChange={(event) => setNoteDraft((current) => ({ ...current, nextReviewDate: event.target.value }))}
                  />
                </label>
              </div>
            )}
            <div className="confirm-actions">
              <button onClick={() => setStudyModal("")}>Cancel</button>
              <button className="primary-action" onClick={studyModal === "topic" ? createStudyTopic : createConceptNote}>
                {studyModal === "topic" ? "Create Topic" : "Save Note"}
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
