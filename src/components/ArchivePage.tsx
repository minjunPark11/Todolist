// The first screen driven by the view engine rather than by a filter of its
// own (CLICKUP_IMPORT_DESIGN P6). Archive was the smallest of the four — one
// filter, no grouping — which makes it the honest place to prove the wiring
// before Planning and Horizons follow.
//
// Only the *tasks* tab goes through the engine. An Item is a task, goal or
// milestone; a Space is not one, so archived Spaces are still read from
// `projects` directly. That is a real limit of the projection, not an
// oversight to tidy up later.
import { useMemo, useState } from "react";
import type { LearningPath, List, Project, Task } from "../types";
import { projectItems } from "../domain/view/item";
import { applyView, PRESET_ARCHIVE, type GroupContext } from "../domain/view/viewSpec";
import { formatDate, todayValue } from "../utils/date";
import { getProjectProgress } from "../utils/planner";
import { EmptyState, SegmentedTabs } from "./kit";
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
  const [tab, setTab] = useState<"tasks" | "projects">("tasks");

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  // Narrowed to tasks because every row action here is a task action. A goal
  // cannot reach this view anyway — it carries no archived status — so the
  // narrowing states the screen's intent rather than hiding anything.
  const archivedItems = useMemo(() => {
    const today = todayValue();
    const items = projectItems({ tasks, paths: learningPaths, projects, lists, today, sources: ["task"] });
    const context: GroupContext = { today, taskById };
    // PRESET_ARCHIVE does not group, so there is at most one group to unwrap.
    return applyView(items, PRESET_ARCHIVE, context)[0]?.items ?? [];
  }, [tasks, learningPaths, projects, lists, taskById]);

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
        tabs={[["tasks", t("archive.tabTasks", { n: archivedItems.length })], ["projects", t("archive.tabProjects", { n: archivedProjects.length })]]}
        active={tab}
        onChange={setTab}
      />

      {tab === "tasks" ? (
        archivedItems.length === 0 ? (
          <EmptyState icon="🗄" title={t("archive.noArchivedTasks")} text={t("archive.noArchivedTasksHint")} />
        ) : (
          <div className="ff-archive-table">
            <div className="ff-archive-head">
              <span>{t("archive.colTask")}</span>
              <span>{t("common.project")}</span>
              <span>{t("archive.colArchived")}</span>
              <span></span>
            </div>
            {archivedItems.map((item) => {
              // The Item is the view; the Task is still the record. `archivedAt`
              // is storage, not a view axis, so it is read back from the store.
              const archivedAt = taskById.get(item.sourceId)?.archivedAt;
              return (
                <div className="ff-archive-row" key={item.key}>
                  <button type="button" className="ff-archive-title" onClick={() => onOpenTask(item.sourceId)}>{item.title}</button>
                  <span className="ff-archive-cell">{projects.find((p) => p.id === item.spaceId)?.name ?? "—"}</span>
                  <span className="ff-archive-cell">{archivedAt ? formatDate(archivedAt.slice(0, 10), lang) : "—"}</span>
                  <span className="ff-archive-actions">
                    <button type="button" className="ff-btn ff-btn-sm" onClick={() => onRestoreTask(item.sourceId)}>{t("common.restore")}</button>
                    <button type="button" className="ff-btn ff-btn-sm ff-btn-danger" onClick={() => onDeleteTask(item.sourceId)}>{t("common.delete")}</button>
                  </span>
                </div>
              );
            })}
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
