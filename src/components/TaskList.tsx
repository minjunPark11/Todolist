import { useState } from "react";
import type { Project, Subtask, Task } from "../types";
import { addDays, formatDate, isOverdue, isThisWeek, isToday, todayValue } from "../utils/date";

export type GroupBy = "none" | "date" | "priority" | "project";

interface TaskListProps {
  tasks: Task[];
  projects: Project[];
  subtasks?: Subtask[];
  emptyMessage: string;
  groupBy?: GroupBy;
  onToggleDone: (taskId: string) => void;
  onSelectTask: (taskId: string) => void;
}

interface TaskGroup {
  key: string;
  label: string;
  tasks: Task[];
}

const priorityOrder: Array<{ key: Task["priority"]; label: string }> = [
  { key: "high", label: "High priority" },
  { key: "medium", label: "Medium priority" },
  { key: "low", label: "Low priority" },
  { key: "none", label: "No priority" },
];

function buildGroups(tasks: Task[], groupBy: GroupBy, projects: Project[]): TaskGroup[] {
  if (groupBy === "date") {
    const today = todayValue();
    const tomorrow = addDays(today, 1);
    const buckets: Record<string, Task[]> = {
      overdue: [],
      today: [],
      tomorrow: [],
      week: [],
      later: [],
      none: [],
    };

    for (const task of tasks) {
      if (!task.dueDate) buckets.none.push(task);
      else if (isOverdue(task.dueDate)) buckets.overdue.push(task);
      else if (isToday(task.dueDate)) buckets.today.push(task);
      else if (task.dueDate === tomorrow) buckets.tomorrow.push(task);
      else if (isThisWeek(task.dueDate)) buckets.week.push(task);
      else buckets.later.push(task);
    }

    return [
      { key: "overdue", label: "Overdue", tasks: buckets.overdue },
      { key: "today", label: "Today", tasks: buckets.today },
      { key: "tomorrow", label: "Tomorrow", tasks: buckets.tomorrow },
      { key: "week", label: "This week", tasks: buckets.week },
      { key: "later", label: "Later", tasks: buckets.later },
      { key: "none", label: "No date", tasks: buckets.none },
    ].filter((group) => group.tasks.length > 0);
  }

  if (groupBy === "priority") {
    return priorityOrder
      .map((entry) => ({
        key: entry.key,
        label: entry.label,
        tasks: tasks.filter((task) => task.priority === entry.key),
      }))
      .filter((group) => group.tasks.length > 0);
  }

  if (groupBy === "project") {
    const groups: TaskGroup[] = projects.map((project) => ({
      key: project.id,
      label: project.name,
      tasks: tasks.filter((task) => task.projectId === project.id),
    }));
    groups.push({
      key: "inbox",
      label: "Inbox",
      tasks: tasks.filter((task) => !task.projectId),
    });
    return groups.filter((group) => group.tasks.length > 0);
  }

  return [{ key: "all", label: "", tasks }];
}

function RepeatIcon() {
  return (
    <svg
      className="task-repeat-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Repeats"
    >
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 014-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 01-4 4H3" />
    </svg>
  );
}

export function TaskList({
  tasks,
  projects,
  subtasks = [],
  emptyMessage,
  groupBy = "none",
  onToggleDone,
  onSelectTask,
}: TaskListProps) {
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (tasks.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>;
  }

  function renderRow(task: Task) {
    const project = projectMap.get(task.projectId);
    const taskSubtasks = subtasks.filter((subtask) => subtask.taskId === task.id);
    const completedSubtasks = taskSubtasks.filter((subtask) => subtask.completed).length;
    const dateTone = isOverdue(task.dueDate)
      ? "danger"
      : isToday(task.dueDate)
        ? "accent"
        : isThisWeek(task.dueDate)
          ? "soft"
          : "";

    return (
      <article
        key={task.id}
        className={task.status === "done" ? "task-row is-done" : "task-row"}
        onClick={() => onSelectTask(task.id)}
      >
        <button
          className={`check-button check-${task.priority}`}
          aria-label={task.status === "done" ? "Mark task incomplete" : "Mark task done"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleDone(task.id);
          }}
        >
          {task.status === "done" ? "✓" : ""}
        </button>
        <div className="task-main">
          <div className="task-title-line">
            <h3>{task.title}</h3>
            {task.repeatType !== "none" ? <RepeatIcon /> : null}
          </div>
          {task.description ? <p>{task.description}</p> : null}
          <div className="task-meta">
            {task.dueDate ? <span className={dateTone}>{formatDate(task.dueDate)}</span> : null}
            <span>{project?.name ?? "Inbox"}</span>
            <span>{task.status.replace("_", " ")}</span>
            {taskSubtasks.length > 0 ? (
              <span>
                {completedSubtasks}/{taskSubtasks.length} subtasks
              </span>
            ) : null}
          </div>
          {taskSubtasks.length > 0 ? (
            <div className="mini-progress" aria-label="Subtask progress">
              <span style={{ width: `${(completedSubtasks / taskSubtasks.length) * 100}%` }} />
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  if (groupBy === "none") {
    return <div className="task-list">{tasks.map(renderRow)}</div>;
  }

  const groups = buildGroups(tasks, groupBy, projects);

  return (
    <div className="task-groups">
      {groups.map((group) => {
        const isCollapsed = collapsed[group.key];
        return (
          <section className="task-group" key={group.key}>
            <button
              className="task-group-header"
              onClick={() =>
                setCollapsed((current) => ({ ...current, [group.key]: !current[group.key] }))
              }
            >
              <span
                className="side-chevron"
                style={{ transform: isCollapsed ? "none" : "rotate(90deg)" }}
              >
                ›
              </span>
              <span className="task-group-label">{group.label}</span>
              <span className="task-group-count">{group.tasks.length}</span>
            </button>
            {!isCollapsed ? <div className="task-list">{group.tasks.map(renderRow)}</div> : null}
          </section>
        );
      })}
    </div>
  );
}
