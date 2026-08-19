// Archived PROJECTS. Nav Shell audit D-20 retired the task half.
//
// The two halves were never one screen. The tasks tab went through the view
// engine; the projects tab read `projects` directly, because an Item is a
// task, goal or milestone and a Space is not one — a real limit of the
// projection, as the previous version of this comment said. Task archiving
// is gone now (`안 함` replaced it, D-23), so what is left is the half that
// never fitted, and P0-4b-4 moves it into SpaceHub where it belongs.
import type { LearningPath, List, Project, Task } from "../types";
import { getProjectProgress } from "../utils/planner";
import { EmptyState } from "./kit";
import { useT } from "../i18n";

interface ArchivePageProps {
  tasks: Task[];
  projects: Project[];
  lists: List[];
  learningPaths: LearningPath[];
  onOpenTask: (id: string) => void;
  onRestoreTask: (id: string) => void;
  onRestoreProject: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onDeleteProject: (id: string) => void;
}

export function ArchivePage({
  tasks,
  projects,
  lists,
  learningPaths,
  onOpenTask,
  onRestoreTask,
  onRestoreProject,
  onDeleteTask,
  onDeleteProject,
}: ArchivePageProps) {
  const { t, lang } = useT();
  const archivedProjects = projects.filter((p) => p.status === "archived");

  return (
    <div className="ff-page">
      <header className="ff-page-head">
        <div>
          <h1 className="ff-page-title">{t("archive.title")}</h1>
          <p className="ff-page-sub">{t("archive.subtitle")}</p>
        </div>
      </header>

      {archivedProjects.length === 0 ? (
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
      )}
    </div>
  );
}
