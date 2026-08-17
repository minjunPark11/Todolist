// The Space's work board (SPACES_CLICKUP_REDESIGN D7, CLICKUP_IMPORT_DESIGN
// §4.2): `filter:{spaceId}, groupBy:"status", layout:"board"` — a saved view,
// not a screen with rules of its own.
//
// Statuses are owned by the Space and inherited downwards (D7), so the columns
// change with the scope selector rather than being a fixed set. "All spaces"
// falls back to the defaults, which is honest because a task with no Space
// status of its own resolves to exactly those (membership.statusIdFor).
//
// The axis selector is here to prove the engine, not as a feature for its own
// sake: switching to Quadrant renders the Planning matrix as four columns
// through this same component, which is the step that lets EisenhowerPage go.
import { useMemo, useState } from "react";
import type { LearningPath, List, Project, Task, TaskDraft } from "../types";
import { projectItems, type Item } from "../domain/view/item";
import { goalDropFor, patchForColumn } from "../domain/view/board";
import { type GroupAxis, type GroupContext, type ViewSpec } from "../domain/view/viewSpec";
import { statusesWithCustom } from "../domain/spaces/membership";
import { DEFAULT_STATUSES, statusDisplayLabel } from "../domain/spaces/hierarchy";
import { todayValue } from "../utils/date";
import { BoardView, type BoardColumn } from "./BoardView";
import { EmptyState, type ToastState } from "./kit";
import { ExpandableAdd } from "./motion/ExpandableAdd";
import { useT } from "../i18n";

const ALL_PROJECTS = "";


// The axes this board offers. Both are droppable, which is the point: an axis
// you can only look at is a report, not a board.
const AXES: GroupAxis[] = ["status", "quadrant"];

interface BoardPageProps {
  tasks: Task[];
  projects: Project[];
  lists: List[];
  learningPaths: LearningPath[];
  selectedTaskId: string;
  onOpenTask: (id: string) => void;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onCreateTask: (draft: TaskDraft) => string;
  onUpdatePath: (id: string, patch: Partial<Omit<LearningPath, "id">>) => void;
  onMoveGoalToStatus: (pathId: string, listId?: string) => void;
  showToast: (toast: ToastState) => void;
}

export function BoardPage({
  tasks,
  projects,
  lists,
  learningPaths,
  selectedTaskId,
  onOpenTask,
  onUpdateTask,
  onCreateTask,
  onUpdatePath,
  onMoveGoalToStatus,
  showToast,
}: BoardPageProps) {
  const { t } = useT();
  const today = todayValue();
  const [projectId, setProjectId] = useState<string>(ALL_PROJECTS);
  const [axis, setAxis] = useState<GroupAxis>("status");

  const activeProjects = useMemo(
    () => projects.filter((project) => project.status !== "archived" && !project.archivedAt),
    [projects],
  );

  // A Space that was archived while selected would otherwise leave the board
  // scoped to something the picker no longer offers.
  const scope = activeProjects.some((project) => project.id === projectId) ? projectId : ALL_PROJECTS;
  const space = activeProjects.find((candidate) => candidate.id === scope);
  const statuses = useMemo(
    () => (space ? statusesWithCustom(space) : DEFAULT_STATUSES),
    [space],
  );

  const items = useMemo(
    () => projectItems({ tasks, paths: learningPaths, projects, lists, today }),
    [tasks, learningPaths, projects, lists, today],
  );

  const context: GroupContext = useMemo(
    () => ({ today, taskById: new Map(tasks.map((task) => [task.id, task])) }),
    [today, tasks],
  );

  const spec: ViewSpec = useMemo(
    () => ({
      id: `board-${axis}-${scope || "all"}`,
      name: t("board.title"),
      // An archived task is closed work; it belongs in the Archive, not as a
      // column on the working board.
      filter: {
        // Children belong under their parent, not beside it — see spaceViews.
        parentId: "",
        ...(scope ? { projectId: scope } : {}),
        ...(axis === "quadrant" ? { sources: ["task" as const] } : {}),
      },
      groupBy: axis,
      sort: { key: "dueDate" },
      layout: "board",
    }),
    [axis, scope, t],
  );

  const visibleItems = useMemo(
    () => items.filter((item) => item.statusId !== "archived"),
    [items],
  );

  const columns: BoardColumn[] = useMemo(() => {
    if (axis === "quadrant") {
      return (["I", "II", "III", "IV"] as const).map((quadrant) => ({
        id: quadrant,
        // Shared with TaskDetail's quadrant picker — the `eis.` prefix now
        // names the Eisenhower vocabulary, not the page that used to own it.
        label: `${quadrant}. ${t(`eis.q${quadrant}`)}`,
      }));
    }
    return statuses
      .filter((status) => status.id !== "archived")
      .map((status) => ({
        id: status.id,
        label: statusDisplayLabel(status, t),
        color: status.color,
      }));
  }, [axis, statuses, t]);

  function handleQuickAdd(title: string) {
    // Captured into the Space currently in scope, otherwise a task typed while
    // looking at one board would be filtered straight back out of it.
    const id = onCreateTask({ title, status: "inbox", ...(scope ? { projectId: scope } : {}) });
    showToast({
      message: t("board.toastAdded"),
      actionLabel: t("board.toastConfigure"),
      onAction: () => onOpenTask(id),
    });
  }

  function handleDrop(item: Item, columnId: string) {
    // A goal carries no priority and no quadrant, so only the status axis can
    // mean anything for one — and there its column is `boardListId`, which is
    // a different record and a different write from a task's.
    if (item.source === "goal") {
      if (axis !== "status") return;
      const goal = learningPaths.find((path) => path.id === item.sourceId);
      if (!goal) return;
      const drop = goalDropFor(goal, columnId, statuses);
      if (drop.kind === "complete") {
        onUpdatePath(goal.id, { completedAt: new Date().toISOString() });
      } else if (drop.kind === "file") {
        // Filing computes `boardOrder`, which the Goals tab still sorts by, so
        // it goes through the same move the tab uses rather than a raw patch.
        onMoveGoalToStatus(goal.id, drop.listId);
        if (goal.completedAt) onUpdatePath(goal.id, { completedAt: undefined });
      }
      return;
    }
    // A milestone lives inside its goal; there is nothing to file it into.
    if (item.source !== "task") return;
    const task = context.taskById.get(item.sourceId);
    if (!task) return;
    const patch = patchForColumn(axis, task, columnId, { today, statuses });
    if (Object.keys(patch).length > 0) onUpdateTask(task.id, patch);
  }

  return (
    <div className="ff-page">
      <header className="ff-page-head">
        <div>
          <h1 className="ff-page-title">{t("board.title")}</h1>
          <p className="ff-page-sub">{t("board.subtitle")}</p>
        </div>
        <div className="ff-board-controls">
          <ExpandableAdd
            className="ff-board-quick-add"
            label={`⚡ ${t("board.quickAdd")}`}
            placeholder={t("board.quickAddPlaceholder")}
            submitLabel={t("common.add")}
            keepOpenAfterSubmit={false}
            onSubmit={handleQuickAdd}
          />
          <label className="ff-board-control">
            <span>{t("board.scope")}</span>
            <select value={scope} onChange={(event) => setProjectId(event.target.value)}>
              <option value={ALL_PROJECTS}>{t("board.allSpaces")}</option>
              {activeProjects.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ff-board-control">
            <span>{t("board.groupBy")}</span>
            <select value={axis} onChange={(event) => setAxis(event.target.value as GroupAxis)}>
              {AXES.map((option) => (
                <option key={option} value={option}>
                  {t(`board.axis.${option}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {visibleItems.length === 0 ? (
        <EmptyState icon="🗂" title={t("board.empty")} text={t("board.emptyHint")} />
      ) : (
        <BoardView
          items={visibleItems}
          spec={spec}
          context={context}
          columns={columns}
          projects={projects}
          today={today}
          selectedTaskId={selectedTaskId}
          otherLabel={t("board.other")}
          onOpenItem={(item) => {
            if (item.source === "task") onOpenTask(item.sourceId);
          }}
          onDropItem={handleDrop}
        />
      )}
    </div>
  );
}
