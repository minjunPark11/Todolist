import { FormEvent, useEffect, useState } from "react";
import type { Project, TaskDraft } from "../types";
import { todayValue } from "../utils/date";
import { useT } from "../i18n";

interface QuickAddProps {
  projects: Project[];
  defaultDueDate?: string;
  defaultProjectId?: string;
  defaultStatus?: TaskDraft["status"];
  defaultPriority?: TaskDraft["priority"];
  compact?: boolean;
  onAddTask: (draft: TaskDraft) => void;
}

export function QuickAdd({
  projects,
  defaultDueDate = "",
  defaultProjectId = "",
  defaultStatus = "todo",
  defaultPriority = "none",
  compact = false,
  onAddTask,
}: QuickAddProps) {
  const { t } = useT();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [priority, setPriority] = useState<TaskDraft["priority"]>(defaultPriority);

  useEffect(() => {
    setDueDate(defaultDueDate);
    setProjectId(defaultProjectId);
    setPriority(defaultPriority);
  }, [defaultDueDate, defaultPriority, defaultProjectId]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    onAddTask({ title, dueDate, projectId, priority, status: defaultStatus });
    setTitle("");
    setDueDate(defaultDueDate);
    setProjectId(defaultProjectId);
    setPriority(defaultPriority);
  }

  return (
    <form className={compact ? "quick-add compact" : "quick-add"} onSubmit={handleSubmit}>
      <input
        aria-label={t("taskDetail.taskTitleAria")}
        placeholder={t("quickAdd.addTaskPlaceholder")}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <input
        aria-label={t("common.dueDate")}
        type="date"
        value={dueDate}
        onChange={(event) => setDueDate(event.target.value)}
      />
      <select
        aria-label={t("common.project")}
        value={projectId}
        onChange={(event) => setProjectId(event.target.value)}
      >
        <option value="">{t("status.inbox")}</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      <select
        aria-label={t("common.priority")}
        value={priority}
        onChange={(event) => setPriority(event.target.value as TaskDraft["priority"])}
      >
        <option value="none">{t("priority.none")}</option>
        <option value="low">{t("priority.low")}</option>
        <option value="medium">{t("priority.medium")}</option>
        <option value="high">{t("priority.high")}</option>
      </select>
      <button type="button" onClick={() => setDueDate(todayValue())}>
        {t("common.today")}
      </button>
      <button type="submit">{t("common.add")}</button>
    </form>
  );
}
