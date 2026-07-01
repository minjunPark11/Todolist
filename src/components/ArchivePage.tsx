import { useState } from "react";
import type { Project, Task } from "../types";
import { formatDate } from "../utils/date";
import { getProjectProgress } from "../utils/planner";
import { EmptyState, SegmentedTabs } from "./kit";
import { useT } from "../i18n";

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
  const { t, lang } = useT();
  const [tab, setTab] = useState<"tasks" | "projects">("tasks");
  const archivedTasks = tasks.filter((task) => task.status === "archived" || task.archivedAt);
  const archivedProjects = projects.filter((p) => p.status === "archived");

  return (
    <div className="ff-page">
      <header className="ff-page-head">
        <div>
          <h1 className="ff-page-title">{t("archive.title")}</h1>
          <p className="ff-page-sub">{t("archive.subtitle")}</p>
        </div>
      </header>

      <SegmentedTabs
        tabs={[["tasks", t("archive.tabTasks", { n: archivedTasks.length })], ["projects", t("archive.tabProjects", { n: archivedProjects.length })]]}
        active={tab}
        onChange={setTab}
      />

      {tab === "tasks" ? (
        archivedTasks.length === 0 ? (
          <EmptyState icon="🗄" title={t("archive.noArchivedTasks")} text={t("archive.noArchivedTasksHint")} />
        ) : (
          <div className="ff-archive-table">
            <div className="ff-archive-head">
              <span>{t("archive.colTask")}</span>
              <span>{t("common.project")}</span>
              <span>{t("archive.colArchived")}</span>
              <span></span>
            </div>
            {archivedTasks.map((task) => (
              <div className="ff-archive-row" key={task.id}>
                <button type="button" className="ff-archive-title" onClick={() => onOpenTask(task.id)}>{task.title}</button>
                <span className="ff-archive-cell">{projects.find((p) => p.id === task.projectId)?.name ?? "—"}</span>
                <span className="ff-archive-cell">{task.archivedAt ? formatDate(task.archivedAt.slice(0, 10), lang) : "—"}</span>
                <span className="ff-archive-actions">
                  <button type="button" className="ff-btn ff-btn-sm" onClick={() => onRestoreTask(task.id)}>{t("common.restore")}</button>
                  <button type="button" className="ff-btn ff-btn-sm ff-btn-danger" onClick={() => onDeleteTask(task.id)}>{t("common.delete")}</button>
                </span>
              </div>
            ))}
          </div>
        )
      ) : null}

      {tab === "projects" ? (
        archivedProjects.length === 0 ? (
          <EmptyState icon="🗄" title={t("archive.noArchivedProjects")} text={t("archive.noArchivedProjectsHint")} />
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
                      <small>{t("archive.archivedTasksCount", { n: progress.total })}</small>
                    </div>
                  </div>
                  {project.description ? <p className="ff-project-desc">{project.description}</p> : null}
                  <div className="ff-archive-actions">
                    <button type="button" className="ff-btn ff-btn-sm" onClick={() => onRestoreProject(project.id)}>{t("common.restore")}</button>
                    <button type="button" className="ff-btn ff-btn-sm ff-btn-danger" onClick={() => onDeleteProject(project.id)}>{t("common.delete")}</button>
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
