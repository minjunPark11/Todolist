import { ReactNode, useEffect, useMemo, useState } from "react";
import type { Project, ProjectType, Subtask, Task, TaskDraft, TaskPriority } from "../types";
import { formatDate } from "../utils/date";
import {
  getProjectPrioritySummary,
  getProjectProgress,
  getProjectStatusSummary,
  getProjectTasks,
} from "../utils/planner";
import {
  EmptyState,
  Modal,
  MoreMenu,
  SegmentedTabs,
  TaskRow,
  ToastState,
  useAutoFocus,
} from "./kit";
import { useT } from "../i18n";

type ProjectTab = "overview" | "tasks" | "subtasks" | "notes";

const PROJECT_COLORS = ["#007aff", "#af52de", "#34c759", "#ff9500", "#ff2d55", "#8e8e93"];

interface ProjectsPageProps {
  projects: Project[];
  tasks: Task[];
  subtasks: Subtask[];
  selectedTaskId: string;
  taskDetail: ReactNode;
  selectedProjectId: string;
  detailOpen: boolean;
  onOpenProject: (id: string) => void;
  onCloseProject: () => void;
  onOpenTask: (id: string) => void;
  onToggleDone: (id: string) => void;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onCreateTask: (draft: TaskDraft) => string;
  onCreateProject: (input: { name: string; color?: string; type?: ProjectType; description?: string; dueDate?: string }) => string;
  onUpdateProject: (id: string, patch: Partial<Project>) => void;
  onToggleStar: (id: string) => void;
  onArchiveProject: (id: string) => void;
  onRequestDeleteProject: (id: string) => void;
  onSaveNotes: (id: string, value: string) => void;
  showToast: (toast: ToastState) => void;
}

export function ProjectsPage(props: ProjectsPageProps) {
  const { projects, tasks, subtasks, selectedProjectId, detailOpen } = props;
  const { t } = useT();
  const [tab, setTab] = useState<ProjectTab>("overview");
  const [tasksFilter, setTasksFilter] = useState<TaskPriority | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archivedView, setArchivedView] = useState(false);

  const activeProjects = projects.filter((p) => p.status !== "archived");
  const archivedProjects = projects.filter((p) => p.status === "archived");
  const current = projects.find((p) => p.id === selectedProjectId);

  if (detailOpen && current) {
    return (
      <ProjectDetail
        {...props}
        project={current}
        tab={tab}
        setTab={setTab}
        tasksFilter={tasksFilter}
        setTasksFilter={setTasksFilter}
        editOpen={editOpen}
        setEditOpen={setEditOpen}
      />
    );
  }

  const shown = archivedView ? archivedProjects : activeProjects;

  return (
    <div className="ff-page">
      <header className="ff-page-head">
        <div>
          <h1 className="ff-page-title">{t("projects.title")}</h1>
          <p className="ff-page-sub">{t("projects.subtitle")}</p>
        </div>
        <div className="ff-page-actions">
          <button type="button" className="ff-btn ff-btn-primary" onClick={() => setCreateOpen(true)}>
            {t("projects.newProject")}
          </button>
        </div>
      </header>

      <SegmentedTabs
        tabs={[
          ["active", t("projects.activeTab", { n: activeProjects.length })],
          ["archived", t("projects.archivedTab", { n: archivedProjects.length })],
        ]}
        active={archivedView ? "archived" : "active"}
        onChange={(tab) => setArchivedView(tab === "archived")}
      />

      {shown.length === 0 ? (
        <EmptyState
          icon="Folder"
          title={archivedView ? t("projects.noArchived") : t("projects.noProjects")}
          text={archivedView ? t("projects.noArchivedHint") : t("projects.noProjectsHint")}
          actionLabel={archivedView ? undefined : t("projects.newProject")}
          onAction={archivedView ? undefined : () => setCreateOpen(true)}
        />
      ) : (
        <div className="ff-project-grid">
          {shown.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              tasks={tasks}
              archived={archivedView}
              onOpen={() => props.onOpenProject(project.id)}
              onToggleStar={() => props.onToggleStar(project.id)}
              onArchive={() => props.onArchiveProject(project.id)}
              onRestore={() => props.onUpdateProject(project.id, { status: "active", archivedAt: "" })}
              onDelete={() => props.onRequestDeleteProject(project.id)}
            />
          ))}
        </div>
      )}

      {createOpen ? (
        <ProjectFormModal
          title={t("projects.newProjectTitle")}
          onClose={() => setCreateOpen(false)}
          onSubmit={(values) => {
            const id = props.onCreateProject(values);
            setCreateOpen(false);
            if (id) {
              props.showToast({ message: t("projects.projectCreated"), actionLabel: t("common.open"), onAction: () => props.onOpenProject(id) });
            }
          }}
        />
      ) : null}
    </div>
  );
}

function ProjectCard({
  project,
  tasks,
  archived,
  onOpen,
  onToggleStar,
  onArchive,
  onRestore,
  onDelete,
}: {
  project: Project;
  tasks: Task[];
  archived: boolean;
  onOpen: () => void;
  onToggleStar: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const { t, lang } = useT();
  const progress = getProjectProgress(tasks, project.id);
  return (
    <article
      className="ff-project-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
    >
      <div className="ff-project-card-top">
        <span className="ff-project-icon" style={{ background: project.color }}>
          {project.type === "area" ? "A" : "P"}
        </span>
        <div className="ff-project-card-titles">
          <strong>{project.name}</strong>
          <small>{project.type === "area" ? t("projects.area") : t("projects.project")} - {t("projects.tasksCount", { n: progress.total })}</small>
        </div>
        <button
          type="button"
          className={`ff-star${project.pinned ? " active" : ""}`}
          aria-label={t("projects.pinAria")}
          onClick={(e) => { e.stopPropagation(); onToggleStar(); }}
        >
          {project.pinned ? "*" : "+"}
        </button>
        <MoreMenu
          items={
            archived
              ? [{ label: t("common.restore"), onClick: onRestore }, { label: t("common.delete"), danger: true, onClick: onDelete }]
              : [{ label: t("common.archive"), onClick: onArchive }, { label: t("common.delete"), danger: true, onClick: onDelete }]
          }
        />
      </div>
      {project.description ? <p className="ff-project-desc">{project.description}</p> : null}
      <div className="ff-project-progress">
        <div className="ff-progress-track"><span style={{ width: `${progress.percent}%`, background: project.color }} /></div>
        <span className="ff-progress-pct">{progress.percent}%</span>
      </div>
      <div className="ff-project-card-foot">
        <span>{project.dueDate ? t("projects.dueDatePrefix", { date: formatDate(project.dueDate, lang) }) : t("projects.noDueDate")}</span>
        <span>{t("projects.doneCount", { done: progress.completed, total: progress.total })}</span>
      </div>
    </article>
  );
}

function ProjectDetail({
  project,
  tasks,
  subtasks,
  selectedTaskId,
  taskDetail,
  tab,
  setTab,
  tasksFilter,
  setTasksFilter,
  editOpen,
  setEditOpen,
  onCloseProject,
  onOpenTask,
  onToggleDone,
  onUpdateTask,
  onCreateTask,
  onUpdateProject,
  onToggleStar,
  onArchiveProject,
  onRequestDeleteProject,
  onSaveNotes,
}: ProjectsPageProps & {
  project: Project;
  tab: ProjectTab;
  setTab: (t: ProjectTab) => void;
  tasksFilter: TaskPriority | "all";
  setTasksFilter: (p: TaskPriority | "all") => void;
  editOpen: boolean;
  setEditOpen: (v: boolean) => void;
}) {
  const { t, lang } = useT();
  const projectTasks = useMemo(() => getProjectTasks(tasks, project.id), [tasks, project.id]);
  const progress = getProjectProgress(tasks, project.id);
  const prioritySummary = getProjectPrioritySummary(tasks, project.id);
  const statusSummary = getProjectStatusSummary(tasks, project.id);
  const notes = project.notes ?? "";
  const [draftNotes, setDraftNotes] = useState(notes);
  const [editingNotes, setEditingNotes] = useState(false);

  useEffect(() => {
    setDraftNotes(notes);
    setEditingNotes(false);
  }, [notes, project.id]);

  const filteredTasks =
    tasksFilter === "all" ? projectTasks : projectTasks.filter((t) => t.priority === tasksFilter);
  const projectSubtasks = subtasks.filter((s) => projectTasks.some((t) => t.id === s.taskId));

  function subProgress(taskId: string) {
    const subs = subtasks.filter((s) => s.taskId === taskId);
    return { done: subs.filter((s) => s.completed).length, total: subs.length };
  }

  return (
    <div className="ff-detail-layout">
      <div className="ff-page ff-detail-main">
        <button type="button" className="ff-link ff-back" onClick={onCloseProject}>
          {t("projects.backToProjects")}
        </button>
        <header className="ff-page-head">
          <div>
            <h1 className="ff-page-title">
              {project.name}
              <button
                type="button"
                className={`ff-star${project.pinned ? " active" : ""}`}
                onClick={() => onToggleStar(project.id)}
                aria-label="Pin"
              >
                {project.pinned ? "*" : "+"}
              </button>
            </h1>
            <p className="ff-page-sub">
              <span className="ff-dot" style={{ background: project.color }} />{" "}
              {project.type === "area" ? t("projects.area") : t("projects.project")}
              {project.dueDate ? ` - ${t("projects.dueDatePrefix", { date: formatDate(project.dueDate, lang) })}` : ""}
            </p>
          </div>
          <div className="ff-page-actions">
            <button type="button" className="ff-btn" onClick={() => setEditOpen(true)}>{t("projects.editProject")}</button>
            <MoreMenu
              items={[
                { label: t("projects.archiveProject"), onClick: () => onArchiveProject(project.id) },
                { label: t("projects.deleteProject"), danger: true, onClick: () => onRequestDeleteProject(project.id) },
              ]}
            />
          </div>
        </header>

        <SegmentedTabs
          tabs={[
            ["overview", t("projects.tabOverview")],
            ["tasks", t("projects.tabTasks")],
            ["subtasks", t("projects.tabSubtasks")],
            ["notes", t("projects.tabNotes")],
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === "overview" ? (
          <div className="ff-overview-grid">
            <div className="ff-stat-card">
              <span className="ff-stat-label">{t("projects.progress")}</span>
              <strong className="ff-stat-big">{progress.percent}%</strong>
              <div className="ff-progress-track"><span style={{ width: `${progress.percent}%`, background: project.color }} /></div>
              <small>{t("projects.tasksOfTotal", { completed: progress.completed, total: progress.total })}</small>
            </div>
            <div className="ff-stat-card">
              <span className="ff-stat-label">{t("projects.prioritySummary")}</span>
              <ul className="ff-stat-list">
                <li onClick={() => { setTab("tasks"); setTasksFilter("high"); }}><span className="ff-dot ff-dot-danger" /> {t("priority.high")} <b>{prioritySummary.high}</b></li>
                <li onClick={() => { setTab("tasks"); setTasksFilter("medium"); }}><span className="ff-dot ff-dot-warning" /> {t("priority.medium")} <b>{prioritySummary.medium}</b></li>
                <li onClick={() => { setTab("tasks"); setTasksFilter("low"); }}><span className="ff-dot ff-dot-success" /> {t("priority.low")} <b>{prioritySummary.low}</b></li>
              </ul>
            </div>
            <div className="ff-stat-card">
              <span className="ff-stat-label">{t("projects.statusSummary")}</span>
              <ul className="ff-stat-list">
                <li><span className="ff-dot ff-dot-muted" /> {t("status.todo")} <b>{statusSummary.todo}</b></li>
                <li><span className="ff-dot ff-dot-accent" /> {t("status.doing")} <b>{statusSummary.doing}</b></li>
                <li><span className="ff-dot ff-dot-muted" /> {t("status.waiting")} <b>{statusSummary.waiting}</b></li>
                <li><span className="ff-dot ff-dot-success" /> {t("status.done")} <b>{statusSummary.done}</b></li>
              </ul>
            </div>
            <div className="ff-stat-card ff-stat-recent">
              <div className="ff-section-head">
                <span className="ff-stat-label">{t("projects.recentTasks")}</span>
                <button type="button" className="ff-link" onClick={() => setTab("tasks")}>{t("common.viewAll")}</button>
              </div>
              {projectTasks.slice(0, 5).map((task) => (
                <button key={task.id} type="button" className="ff-recent-row" onClick={() => onOpenTask(task.id)}>
                  <span>{task.title}</span>
                  <span className="ff-pill ff-pill-muted">{task.status}</span>
                </button>
              ))}
              {projectTasks.length === 0 ? <p className="ff-today-empty">{t("projects.noTasksYet")}</p> : null}
            </div>
          </div>
        ) : null}

        {tab === "tasks" ? (
          <>
            <div className="ff-tasks-filterbar">
              {(["all", "high", "medium", "low"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={tasksFilter === p ? "ff-chip active" : "ff-chip"}
                  onClick={() => setTasksFilter(p)}
                >
                  {p === "all" ? t("common.all") : t(`priority.${p}`)}
                </button>
              ))}
            </div>
            <InlineProjectAdd onAdd={(title) => onCreateTask({ title, status: "todo", projectId: project.id })} />
            {filteredTasks.length === 0 ? (
              <EmptyState icon="Tasks" title={t("projects.noTasks")} text={t("projects.noTasksHint")} />
            ) : (
              <div className="ff-task-list">
                {filteredTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    projects={[project]}
                    subtaskProgress={subProgress(task.id)}
                    selected={task.id === selectedTaskId}
                    dateField="both"
                    onOpen={onOpenTask}
                    onToggleDone={onToggleDone}
                    onUpdate={onUpdateTask}
                  />
                ))}
              </div>
            )}
          </>
        ) : null}

        {tab === "subtasks" ? (
          <div className="ff-task-list">
            {projectSubtasks.length === 0 ? (
              <EmptyState icon="Subtasks" title={t("projects.noSubtasks")} text={t("projects.noSubtasksHint")} />
            ) : (
              projectSubtasks.map((sub) => {
                const parent = projectTasks.find((t) => t.id === sub.taskId);
                return (
                  <div key={sub.id} className="ff-task-row" style={{ cursor: "default" }}>
                    <span className={`ff-check${sub.completed ? " checked" : ""}`}>{sub.completed ? "Done" : ""}</span>
                    <div className="ff-task-main">
                      <span className={`ff-task-title${sub.completed ? "" : ""}`}>{sub.title}</span>
                      <span className="ff-subcount">{parent?.title}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : null}

        {tab === "notes" ? (
          <div className="ff-notes-pane">
            <div className="ff-section-head">
              <h2 className="ff-section-title">{t("projects.projectNotes")}</h2>
              {editingNotes ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="ff-btn ff-btn-sm" onClick={() => { setDraftNotes(notes); setEditingNotes(false); }}>{t("common.cancel")}</button>
                  <button type="button" className="ff-btn ff-btn-sm ff-btn-primary" onClick={() => { onSaveNotes(project.id, draftNotes); setEditingNotes(false); }}>{t("common.save")}</button>
                </div>
              ) : (
                <button type="button" className="ff-link" onClick={() => { setDraftNotes(notes); setEditingNotes(true); }}>{t("common.edit")}</button>
              )}
            </div>
            {editingNotes ? (
              <textarea className="ff-notes-editor" value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} placeholder={t("projects.notesPlaceholder")} />
            ) : (
              <div className="ff-notes-read">{notes || <span className="ff-today-empty">{t("projects.noNotes")}</span>}</div>
            )}
          </div>
        ) : null}

        {editOpen ? (
          <ProjectFormModal
            title={t("projects.editProjectTitle")}
            initial={project}
            onClose={() => setEditOpen(false)}
            onSubmit={(values) => { onUpdateProject(project.id, values); setEditOpen(false); }}
          />
        ) : null}
      </div>

      <aside className="ff-detail-panel">
        {selectedTaskId ? taskDetail : <ProjectInfoPanel project={project} progress={progress} taskCount={projectTasks.length} onArchive={() => onArchiveProject(project.id)} onDelete={() => onRequestDeleteProject(project.id)} />}
      </aside>
    </div>
  );
}

function ProjectInfoPanel({
  project,
  progress,
  taskCount,
  onArchive,
  onDelete,
}: {
  project: Project;
  progress: { percent: number; completed: number; total: number };
  taskCount: number;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const { t, lang } = useT();
  return (
    <div className="ff-info-panel">
      <h3>{t("projects.info")}</h3>
      <dl className="ff-info-list">
        <div><dt>{t("projects.type")}</dt><dd>{project.type === "area" ? t("projects.area") : t("projects.project")}</dd></div>
        <div><dt>{t("projects.dueDate")}</dt><dd>{project.dueDate ? formatDate(project.dueDate, lang) : "-"}</dd></div>
        <div><dt>{t("projects.tasks")}</dt><dd>{taskCount}</dd></div>
        <div><dt>{t("projects.completed")}</dt><dd>{progress.completed}</dd></div>
        <div><dt>{t("projects.progress")}</dt><dd>{progress.percent}%</dd></div>
        <div><dt>{t("projects.status")}</dt><dd>{project.status ?? "active"}</dd></div>
      </dl>
      <div className="ff-info-actions">
        <button type="button" className="ff-btn ff-btn-sm" onClick={onArchive}>{t("projects.archiveProject")}</button>
        <button type="button" className="ff-btn ff-btn-sm ff-btn-danger" onClick={onDelete}>{t("projects.deleteProject")}</button>
      </div>
    </div>
  );
}

function InlineProjectAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const { t } = useT();
  const [value, setValue] = useState("");
  return (
    <div className="ff-inline-add ff-inline-add-bordered">
      <input
        placeholder={t("projects.addTaskToProject")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) { onAdd(value.trim()); setValue(""); }
        }}
      />
    </div>
  );
}

function ProjectFormModal({
  title,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  initial?: Project;
  onClose: () => void;
  onSubmit: (values: { name: string; color: string; type: ProjectType; description: string; dueDate: string }) => void;
}) {
  const { t } = useT();
  const nameRef = useAutoFocus<HTMLInputElement>();
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? PROJECT_COLORS[0]);
  const [type, setType] = useState<ProjectType>(initial?.type ?? "project");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [error, setError] = useState(false);

  function submit() {
    if (!name.trim()) { setError(true); return; }
    onSubmit({ name: name.trim(), color, type, description, dueDate });
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="ff-btn" onClick={onClose}>{t("common.cancel")}</button>
          <button className="ff-btn ff-btn-primary" onClick={submit}>{initial ? t("common.save") : t("common.create")}</button>
        </>
      }
    >
      <div className="ff-form">
        <label>
          {t("common.name")}
          <input ref={nameRef} value={name} onChange={(e) => { setName(e.target.value); setError(false); }} />
          {error ? <span className="ff-quickadd-error" style={{ position: "static" }}>{t("projects.nameRequired")}</span> : null}
        </label>
        <label>
          {t("common.description")}
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="ff-form-grid">
          <label>
            {t("common.type")}
            <select value={type} onChange={(e) => setType(e.target.value as ProjectType)}>
              <option value="project">{t("projects.project")}</option>
              <option value="area">{t("projects.area")}</option>
            </select>
          </label>
          <label>
            {t("common.dueDate")}
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        </div>
        <label>
          {t("common.color")}
          <div className="ff-color-row">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`ff-color-swatch${color === c ? " active" : ""}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={t("projects.colorAria", { color: c })}
              />
            ))}
          </div>
        </label>
      </div>
    </Modal>
  );
}
