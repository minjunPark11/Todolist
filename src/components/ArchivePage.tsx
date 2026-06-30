import { useState } from "react";
import type { Project, Task } from "../types";
import { formatDate } from "../utils/date";
import { getProjectProgress } from "../utils/planner";
import { EmptyState, SegmentedTabs } from "./kit";

interface ArchivePageProps {
  tasks: Task[];
  projects: Project[];
  onOpenTask: (id: string) => void;
  onRestoreTask: (id: string) => void;
  onRestoreProject: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onDeleteProject: (id: string) => void;
}

export function ArchivePage({
  tasks,
  projects,
  onOpenTask,
  onRestoreTask,
  onRestoreProject,
  onDeleteTask,
  onDeleteProject,
}: ArchivePageProps) {
  const [tab, setTab] = useState<"tasks" | "projects">("tasks");
  const archivedTasks = tasks.filter((t) => t.status === "archived" || t.archivedAt);
  const archivedProjects = projects.filter((p) => p.status === "archived");

  return (
    <div className="ff-page">
      <header className="ff-page-head">
        <div>
          <h1 className="ff-page-title">Archive</h1>
          <p className="ff-page-sub">Items here are hidden from your main views. Restore or permanently delete them.</p>
        </div>
      </header>

      <SegmentedTabs
        tabs={[["tasks", `Tasks (${archivedTasks.length})`], ["projects", `Projects (${archivedProjects.length})`]]}
        active={tab}
        onChange={setTab}
      />

      {tab === "tasks" ? (
        archivedTasks.length === 0 ? (
          <EmptyState icon="🗄" title="No archived tasks" text="Archived tasks will appear here." />
        ) : (
          <div className="ff-archive-table">
            <div className="ff-archive-head">
              <span>Task</span>
              <span>Project</span>
              <span>Archived</span>
              <span></span>
            </div>
            {archivedTasks.map((task) => (
              <div className="ff-archive-row" key={task.id}>
                <button type="button" className="ff-archive-title" onClick={() => onOpenTask(task.id)}>{task.title}</button>
                <span className="ff-archive-cell">{projects.find((p) => p.id === task.projectId)?.name ?? "—"}</span>
                <span className="ff-archive-cell">{task.archivedAt ? formatDate(task.archivedAt.slice(0, 10)) : "—"}</span>
                <span className="ff-archive-actions">
                  <button type="button" className="ff-btn ff-btn-sm" onClick={() => onRestoreTask(task.id)}>Restore</button>
                  <button type="button" className="ff-btn ff-btn-sm ff-btn-danger" onClick={() => onDeleteTask(task.id)}>Delete</button>
                </span>
              </div>
            ))}
          </div>
        )
      ) : null}

      {tab === "projects" ? (
        archivedProjects.length === 0 ? (
          <EmptyState icon="🗄" title="No archived projects" text="Archived projects will appear here." />
        ) : (
          <div className="ff-project-grid">
            {archivedProjects.map((project) => {
              const progress = getProjectProgress(tasks, project.id);
              return (
                <article className="ff-project-card" key={project.id}>
                  <div className="ff-project-card-top">
                    <span className="ff-project-icon" style={{ background: project.color }}>📁</span>
                    <div className="ff-project-card-titles">
                      <strong>{project.name}</strong>
                      <small>Archived · {progress.total} tasks</small>
                    </div>
                  </div>
                  {project.description ? <p className="ff-project-desc">{project.description}</p> : null}
                  <div className="ff-archive-actions">
                    <button type="button" className="ff-btn ff-btn-sm" onClick={() => onRestoreProject(project.id)}>Restore</button>
                    <button type="button" className="ff-btn ff-btn-sm ff-btn-danger" onClick={() => onDeleteProject(project.id)}>Delete</button>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : null}
    </div>
  );
}
