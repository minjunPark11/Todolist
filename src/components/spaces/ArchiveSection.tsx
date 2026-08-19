// A Space's archived Projects (Nav Shell audit D-20, P0-4b-4).
//
// This was half of a standalone `/archive` page whose other half was archived
// Tasks. The two never belonged together — that page's own header comment
// said so, because the task half went through the view engine and this half
// read `projects` directly, a Space not being an Item. D-20 retired Task
// archiving into Won't Do, and what was left is Space management.
//
// Scoped to one Space rather than flat across all of them, which the old page
// was. Restoring a Project is something you do while looking at the Space it
// belongs to, and a flat list had to name the Space on every row to be
// readable at all.
import type { Project, Task } from "../../types";
import { getProjectProgress } from "../../utils/planner";
import { EmptyState } from "../kit";
import { useT } from "../../i18n";

interface ArchiveSectionProps {
  /** Already narrowed to the Space on screen. */
  projects: Project[];
  tasks: Task[];
  onRestoreProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
}

export function ArchiveSection({
  projects,
  tasks,
  onRestoreProject,
  onDeleteProject,
}: ArchiveSectionProps) {
  const { t } = useT();
  const archived = projects.filter((project) => project.status === "archived");

  if (archived.length === 0) {
    return (
      <EmptyState
        icon="🗄"
        title={t("archive.noArchivedProjects")}
        text={t("archive.noArchivedProjectsHint")}
      />
    );
  }

  return (
    <div className="ff-project-grid">
      {archived.map((project) => {
        const progress = getProjectProgress(tasks, project.id);
        return (
          <article className="ff-project-card" key={project.id}>
            <div className="ff-project-card-top">
              <span className="ff-project-icon" style={{ background: project.color }}>
                📁
              </span>
              <div className="ff-project-card-titles">
                <strong>{project.name}</strong>
                <small>{t("archive.archivedTasksCount", { n: progress.total })}</small>
              </div>
            </div>
            {project.description ? <p className="ff-project-desc">{project.description}</p> : null}
            <div className="ff-archive-actions">
              <button
                type="button"
                className="ff-btn ff-btn-sm"
                onClick={() => onRestoreProject(project.id)}
              >
                {t("common.restore")}
              </button>
              <button
                type="button"
                className="ff-btn ff-btn-sm ff-btn-danger"
                onClick={() => onDeleteProject(project.id)}
              >
                {t("common.delete")}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
