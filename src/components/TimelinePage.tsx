// The timeline page (GANTT_TIMELINE_DESIGN P1).
//
// What is left here after STEP 9 is the part that is ABOUT this page: which
// Project to scope to, and which axis to group by. The timeline itself —
// window, zoom, navigation, the undated tray, the span drag — moved into
// `TaskGanttView`, which the Space screen mounts too. One renderer, two
// places to open it (§50C.29).
import { useMemo, useState } from "react";
import type { LearningPath, List, Project, Task } from "../types";
import { projectItems, type Item } from "../domain/view/item";
import { groupRank, type GroupAxis, type GroupContext, type ViewSpec } from "../domain/view/viewSpec";
import { todayValue } from "../utils/date";
import { TaskGanttView } from "./TaskGanttView";
import { useT } from "../i18n";

const ALL_PROJECTS = "";
// Project and List are the axes a timeline reads as rows; status would put a
// bar's colour and its row in disagreement.
//
// The scope picker lists Projects, so "project" is the axis that matches it.
// Grouping by the real Space is a different question and belongs to the Space
// screen (STEP 10), not to a picker that offers no Spaces to pick.
const AXES: GroupAxis[] = ["project", "list", "none"];

interface TimelinePageProps {
  tasks: Task[];
  projects: Project[];
  lists: List[];
  learningPaths: LearningPath[];
  selectedTaskId: string;
  onOpenTask: (id: string) => void;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
}

export function TimelinePage({
  tasks,
  projects,
  lists,
  learningPaths,
  selectedTaskId,
  onOpenTask,
  onUpdateTask,
}: TimelinePageProps) {
  const { t } = useT();
  const today = todayValue();
  const [projectId, setProjectId] = useState<string>(ALL_PROJECTS);
  const [axis, setAxis] = useState<GroupAxis>("project");

  const activeProjects = useMemo(
    () => projects.filter((project) => project.status !== "archived" && !project.archivedAt),
    [projects],
  );
  const scope = activeProjects.some((project) => project.id === projectId) ? projectId : ALL_PROJECTS;

  const allItems = useMemo(
    () =>
      projectItems({ tasks, paths: learningPaths, projects, lists, today }).filter(
        (item) => item.statusId !== "archived",
      ),
    [tasks, learningPaths, projects, lists, today],
  );

  const scoped = useMemo(
    () => (scope ? allItems.filter((item) => item.projectId === scope) : allItems),
    [allItems, scope],
  );

  const context: GroupContext = useMemo(
    () => ({
      today,
      taskById: new Map(tasks.map((task) => [task.id, task])),
      // D10: the board and the timeline must order Projects identically.
      groupRank: groupRank(axis, { projects: activeProjects, lists }),
    }),
    [today, tasks, axis, activeProjects, lists],
  );

  const spec: ViewSpec = useMemo(
    () => ({
      id: `timeline-${axis}-${scope || "all"}`,
      name: t("timeline.title"),
      filter: {},
      groupBy: axis,
      sort: { key: "scheduledDate" },
      layout: "timeline",
    }),
    [axis, scope, t],
  );

  function groupLabel(groupId: string): string {
    if (!groupId) return t("timeline.ungrouped");
    if (axis === "project") return projects.find((p) => p.id === groupId)?.name ?? t("timeline.ungrouped");
    if (axis === "list") return lists.find((l) => l.id === groupId)?.name ?? t("timeline.ungrouped");
    return groupId;
  }

  return (
    <div className="ff-page">
      <header className="ff-page-head">
        <div>
          <h1 className="ff-page-title">{t("timeline.title")}</h1>
          <p className="ff-page-sub">{t("timeline.subtitle")}</p>
        </div>
        <div className="ff-board-controls">
          <label className="ff-board-control">
            <span>{t("board.scope")}</span>
            <select value={scope} onChange={(event) => setProjectId(event.target.value)}>
              <option value={ALL_PROJECTS}>{t("board.allSpaces")}</option>
              {activeProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ff-board-control">
            <span>{t("board.groupBy")}</span>
            <select value={axis} onChange={(event) => setAxis(event.target.value as GroupAxis)}>
              {AXES.map((option) => (
                <option key={option} value={option}>
                  {t(`timeline.axis.${option}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <TaskGanttView
        items={scoped}
        spec={spec}
        context={context}
        today={today}
        projects={projects}
        tasks={tasks}
        groupLabel={groupLabel}
        selectedTaskId={selectedTaskId}
        onOpenItem={(item: Item) => {
          if (item.source === "task") onOpenTask(item.sourceId);
        }}
        onUpdateTask={onUpdateTask}
      />
    </div>
  );
}
