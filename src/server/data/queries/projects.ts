// Projects, and what is left in one.
//
// "Project" is what the code calls the record and what the user sees; Space is
// the level above it. Nothing here exposes that hierarchy — a reader asking
// "how is the thesis going?" needs the project and its open work, not the
// filing cabinet it sits in.
import type { Project } from "../../../types";
import { isTaskAlive } from "../../../domain/tasks/taskState";
import { notFound } from "../../errors";
import { projectTask, publicStatus, type TaskSummary } from "../projections";
import { buildMetaAt, projectionFor, TABLES, todayFor, type QueryContext, type ResponseMeta } from "./shared";

export interface ProjectSummary {
  id: string;
  name: string;
  type: "project" | "area";
  status: Project["status"];
  color?: string;
  dueDate?: string;
  openTaskCount: number;
  overdueTaskCount: number;
}

export interface ProjectListResult {
  items: ProjectSummary[];
  meta: ResponseMeta;
}

export async function getProjects(
  ctx: QueryContext,
  options: { includeArchived?: boolean } = {},
): Promise<ProjectListResult> {
  const slice = await ctx.repo.loadSlice(TABLES.projects);
  const today = todayFor(ctx);
  const projection = projectionFor(slice, today);

  const items = slice.data.projects
    .filter((project) => options.includeArchived || project.status !== "archived")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((project) => summarize(project, slice.data.tasks, projection));

  return { items, meta: buildMetaAt(slice, ctx.request.now) };
}

export interface ProjectDetail extends ProjectSummary {
  description?: string;
  notes?: string;
  lists: Array<{ id: string; name: string; openTaskCount: number }>;
  openTasks: TaskSummary[];
  meta: ResponseMeta;
}

/** Top open tasks returned inline; the rest are a `get_tasks` call away. */
export const PROJECT_TASK_SAMPLE = 20;

export async function getProjectContext(ctx: QueryContext, projectId: string): Promise<ProjectDetail> {
  const slice = await ctx.repo.loadSlice(TABLES.projects);
  const project = slice.data.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw notFound();

  const today = todayFor(ctx);
  const projection = projectionFor(slice, today);
  const tasks = slice.data.tasks.filter((task) => task.projectId === project.id && isTaskAlive(task));
  const open = tasks.filter((task) => publicStatus(task) === "open");

  const detail: ProjectDetail = {
    ...summarize(project, slice.data.tasks, projection),
    lists: slice.data.lists
      .filter((list) => list.projectId === project.id)
      .map((list) => ({
        id: list.id,
        name: list.name,
        openTaskCount: open.filter((task) => task.listId === list.id).length,
      })),
    openTasks: open
      .sort((a, b) => (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31"))
      .slice(0, PROJECT_TASK_SAMPLE)
      .map((task) => projectTask(task, projection)),
    meta: buildMetaAt(slice, ctx.request.now),
  };

  if (project.description) detail.description = project.description;
  if (project.notes) detail.notes = project.notes;
  return detail;
}

function summarize(
  project: Project,
  allTasks: Parameters<typeof projectTask>[0][],
  projection: ReturnType<typeof projectionFor>,
): ProjectSummary {
  const tasks = allTasks.filter((task) => task.projectId === project.id && isTaskAlive(task));
  const open = tasks.filter((task) => publicStatus(task) === "open");

  const summary: ProjectSummary = {
    id: project.id,
    name: project.name,
    // Both fields are optional on the record and filled by the normalizer;
    // the fallbacks are what an older record without them has always meant.
    type: project.type ?? "project",
    status: project.status ?? "active",
    openTaskCount: open.length,
    overdueTaskCount: open.filter((task) => projectTask(task, projection).isOverdue).length,
  };
  if (project.color) summary.color = project.color;
  if (project.dueDate) summary.dueDate = project.dueDate;
  return summary;
}
