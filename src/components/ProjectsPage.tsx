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
          <h1 className="ff-page-title">Projects</h1>
          <p className="ff-page-sub">Organize tasks by goals, research, study, and personal areas.</p>
        </div>
        <div className="ff-page-actions">
          <button type="button" className="ff-btn ff-btn-primary" onClick={() => setCreateOpen(true)}>
            + New Project
          </button>
        </div>
      </header>

      <SegmentedTabs
        tabs={[["active", `Active (${activeProjects.length})`], ["archived", `Archived (${archivedProjects.length})`]]}
        active={archivedView ? "archived" : "active"}
        onChange={(t) => setArchivedView(t === "archived")}
      />

      {shown.length === 0 ? (
        <EmptyState
          icon="Folder"
          title={archivedView ? "No archived projects" : "No projects yet"}
          text={archivedView ? "Archived projects will appear here." : "Create a project to group related tasks."}
          actionLabel={archivedView ? undefined : "New Project"}
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
          title="New Project"
          onClose={() => setCreateOpen(false)}
          onSubmit={(values) => {
            const id = props.onCreateProject(values);
            setCreateOpen(false);
            if (id) {
              props.showToast({ message: "Project created", actionLabel: "Open", onAction: () => props.onOpenProject(id) });
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
          <small>{project.type === "area" ? "Area" : "Project"} - {progress.total} tasks</small>
        </div>
        <button
          type="button"
          className={`ff-star${project.pinned ? " active" : ""}`}
          aria-label="Pin project"
          onClick={(e) => { e.stopPropagation(); onToggleStar(); }}
        >
          {project.pinned ? "*" : "+"}
        </button>
        <MoreMenu
          items={
            archived
              ? [{ label: "Restore", onClick: onRestore }, { label: "Delete", danger: true, onClick: onDelete }]
              : [{ label: "Archive", onClick: onArchive }, { label: "Delete", danger: true, onClick: onDelete }]
          }
        />
      </div>
      {project.description ? <p className="ff-project-desc">{project.description}</p> : null}
      <div className="ff-project-progress">
        <div className="ff-progress-track"><span style={{ width: `${progress.percent}%`, background: project.color }} /></div>
        <span className="ff-progress-pct">{progress.percent}%</span>
      </div>
      <div className="ff-project-card-foot">
        <span>{project.dueDate ? `Due ${formatDate(project.dueDate)}` : "No due date"}</span>
        <span>{progress.completed}/{progress.total} done</span>
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
          &lt; Projects
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
              {project.type === "area" ? "Area" : "Project"}
              {project.dueDate ? ` - Due ${formatDate(project.dueDate)}` : ""}
            </p>
          </div>
          <div className="ff-page-actions">
            <button type="button" className="ff-btn" onClick={() => setEditOpen(true)}>Edit</button>
            <MoreMenu
              items={[
                { label: "Archive Project", onClick: () => onArchiveProject(project.id) },
                { label: "Delete Project", danger: true, onClick: () => onRequestDeleteProject(project.id) },
              ]}
            />
          </div>
        </header>

        <SegmentedTabs
          tabs={[["overview", "Overview"], ["tasks", "Tasks"], ["subtasks", "Subtasks"], ["notes", "Notes"]]}
          active={tab}
          onChange={setTab}
        />

        {tab === "overview" ? (
          <div className="ff-overview-grid">
            <div className="ff-stat-card">
              <span className="ff-stat-label">Progress</span>
              <strong className="ff-stat-big">{progress.percent}%</strong>
              <div className="ff-progress-track"><span style={{ width: `${progress.percent}%`, background: project.color }} /></div>
              <small>{progress.completed} / {progress.total} tasks</small>
            </div>
            <div className="ff-stat-card">
              <span className="ff-stat-label">Priority Summary</span>
              <ul className="ff-stat-list">
                <li onClick={() => { setTab("tasks"); setTasksFilter("high"); }}><span className="ff-dot ff-dot-danger" /> High <b>{prioritySummary.high}</b></li>
                <li onClick={() => { setTab("tasks"); setTasksFilter("medium"); }}><span className="ff-dot ff-dot-warning" /> Medium <b>{prioritySummary.medium}</b></li>
                <li onClick={() => { setTab("tasks"); setTasksFilter("low"); }}><span className="ff-dot ff-dot-success" /> Low <b>{prioritySummary.low}</b></li>
              </ul>
            </div>
            <div className="ff-stat-card">
              <span className="ff-stat-label">Status Summary</span>
              <ul className="ff-stat-list">
                <li><span className="ff-dot ff-dot-muted" /> To Do <b>{statusSummary.todo}</b></li>
                <li><span className="ff-dot ff-dot-accent" /> In Progress <b>{statusSummary.doing}</b></li>
                <li><span className="ff-dot ff-dot-muted" /> Waiting <b>{statusSummary.waiting}</b></li>
                <li><span className="ff-dot ff-dot-success" /> Done <b>{statusSummary.done}</b></li>
              </ul>
            </div>
            <div className="ff-stat-card ff-stat-recent">
              <div className="ff-section-head">
                <span className="ff-stat-label">Recent Tasks</span>
                <button type="button" className="ff-link" onClick={() => setTab("tasks")}>View all</button>
              </div>
              {projectTasks.slice(0, 5).map((task) => (
                <button key={task.id} type="button" className="ff-recent-row" onClick={() => onOpenTask(task.id)}>
                  <span>{task.title}</span>
                  <span className="ff-pill ff-pill-muted">{task.status}</span>
                </button>
              ))}
              {projectTasks.length === 0 ? <p className="ff-today-empty">No tasks yet.</p> : null}
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
                  {p === "all" ? "All" : p}
                </button>
              ))}
            </div>
            <InlineProjectAdd onAdd={(title) => onCreateTask({ title, status: "todo", projectId: project.id })} />
            {filteredTasks.length === 0 ? (
              <EmptyState icon="Tasks" title="No tasks" text="Add a task to this project." />
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
              <EmptyState icon="Subtasks" title="No subtasks" text="Subtasks from this project's tasks appear here." />
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
              <h2 className="ff-section-title">Project Notes</h2>
              {editingNotes ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="ff-btn ff-btn-sm" onClick={() => { setDraftNotes(notes); setEditingNotes(false); }}>Cancel</button>
                  <button type="button" className="ff-btn ff-btn-sm ff-btn-primary" onClick={() => { onSaveNotes(project.id, draftNotes); setEditingNotes(false); }}>Save</button>
                </div>
              ) : (
                <button type="button" className="ff-link" onClick={() => { setDraftNotes(notes); setEditingNotes(true); }}>Edit</button>
              )}
            </div>
            {editingNotes ? (
              <textarea className="ff-notes-editor" value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} placeholder="Write project notes, decisions, links..." />
            ) : (
              <div className="ff-notes-read">{notes || <span className="ff-today-empty">No notes yet.</span>}</div>
            )}
          </div>
        ) : null}

        {editOpen ? (
          <ProjectFormModal
            title="Edit Project"
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
  return (
    <div className="ff-info-panel">
      <h3>Project Info</h3>
      <dl className="ff-info-list">
        <div><dt>Type</dt><dd>{project.type === "area" ? "Area" : "Project"}</dd></div>
        <div><dt>Due Date</dt><dd>{project.dueDate ? formatDate(project.dueDate) : "-"}</dd></div>
        <div><dt>Tasks</dt><dd>{taskCount}</dd></div>
        <div><dt>Completed</dt><dd>{progress.completed}</dd></div>
        <div><dt>Progress</dt><dd>{progress.percent}%</dd></div>
        <div><dt>Status</dt><dd>{project.status ?? "active"}</dd></div>
      </dl>
      <div className="ff-info-actions">
        <button type="button" className="ff-btn ff-btn-sm" onClick={onArchive}>Archive Project</button>
        <button type="button" className="ff-btn ff-btn-sm ff-btn-danger" onClick={onDelete}>Delete Project</button>
      </div>
    </div>
  );
}

function InlineProjectAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="ff-inline-add ff-inline-add-bordered">
      <input
        placeholder="+ Add task to this project"
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
          <button className="ff-btn" onClick={onClose}>Cancel</button>
          <button className="ff-btn ff-btn-primary" onClick={submit}>{initial ? "Save" : "Create"}</button>
        </>
      }
    >
      <div className="ff-form">
        <label>
          Name
          <input ref={nameRef} value={name} onChange={(e) => { setName(e.target.value); setError(false); }} />
          {error ? <span className="ff-quickadd-error" style={{ position: "static" }}>Project name is required.</span> : null}
        </label>
        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="ff-form-grid">
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value as ProjectType)}>
              <option value="project">Project</option>
              <option value="area">Area</option>
            </select>
          </label>
          <label>
            Due date
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        </div>
        <label>
          Color
          <div className="ff-color-row">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`ff-color-swatch${color === c ? " active" : ""}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </label>
      </div>
    </Modal>
  );
}
