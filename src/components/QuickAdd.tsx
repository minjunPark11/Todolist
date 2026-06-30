import { FormEvent, useState } from "react";
import type { Project, TaskDraft } from "../types";
import { todayValue } from "../utils/date";

interface QuickAddProps {
  projects: Project[];
  defaultDueDate?: string;
  defaultProjectId?: string;
  compact?: boolean;
  onAddTask: (draft: TaskDraft) => void;
}

export function QuickAdd({
  projects,
  defaultDueDate = "",
  defaultProjectId = "",
  compact = false,
  onAddTask,
}: QuickAddProps) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [priority, setPriority] = useState<TaskDraft["priority"]>("none");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onAddTask({ title, dueDate, projectId, priority });
    setTitle("");
    setDueDate(defaultDueDate);
    setProjectId(defaultProjectId);
    setPriority("none");
  }

  return (
    <form className={compact ? "quick-add compact" : "quick-add"} onSubmit={handleSubmit}>
      <input
        aria-label="Task title"
        placeholder="Add a task..."
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <input
        aria-label="Due date"
        type="date"
        value={dueDate}
        onChange={(event) => setDueDate(event.target.value)}
      />
      <select
        aria-label="Project"
        value={projectId}
        onChange={(event) => setProjectId(event.target.value)}
      >
        <option value="">Inbox</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Priority"
        value={priority}
        onChange={(event) => setPriority(event.target.value as TaskDraft["priority"])}
      >
        <option value="none">No priority</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>
      <button type="button" onClick={() => setDueDate(todayValue())}>
        Today
      </button>
      <button type="submit">Add</button>
    </form>
  );
}
