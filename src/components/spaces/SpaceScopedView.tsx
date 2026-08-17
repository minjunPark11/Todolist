// The non-Overview tabs of the Space screen (§51).
//
// The same components the Project screen mounts, given the Space's Task set
// instead of a Project's. That is the whole difference — which is the claim
// §16 makes about scope, checked here rather than asserted.
//
// Board is absent by construction: `navItemsForScope("space")` never offers
// it, because statuses belong to a Project and a Space holding two of them
// has no defined column set (§0.3.3).
import { useMemo } from "react";
import type { Folder, LearningPath, List, Project, Task } from "../../types";
import type { SpaceTab } from "../../lib/spaceHubTypes";
import { projectItems, type Item } from "../../domain/view/item";
import { specForSpaceView } from "../../domain/view/spaceViews";
import { groupRank, type GroupContext } from "../../domain/view/viewSpec";
import { statusPatch } from "../../domain/view/board";
import { DEFAULT_STATUSES, listDisplayName } from "../../domain/spaces/hierarchy";
import { todayValue } from "../../utils/date";
import { TaskListView } from "../TaskListView";
import { TaskGanttView } from "../TaskGanttView";
import { TaskCalendarView } from "../TaskCalendarView";
import { GoalsSection } from "./GoalsSection";
import { useT } from "../../i18n";

interface SpaceScopedViewProps {
  tab: SpaceTab;
  scoped: { tasks: Task[]; goals: LearningPath[] };
  projects: Project[];
  lists: List[];
  folders: Folder[];
  onOpenTask: (taskId: string) => void;
  onOpenGoal: (goalId: string, milestoneId?: string) => void;
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
  // The goal-writing callbacks — create, delete, milestones, schedule — went
  // with the Horizons branch. This view reads goals now; the Goals section's
  // own cards and the detail drawer are where one is changed.
}

export function SpaceScopedView({
  tab,
  scoped,
  projects,
  lists,
  folders,
  onOpenTask,
  onOpenGoal,
  onUpdateTask,
}: SpaceScopedViewProps) {
  const { t } = useT();
  const today = todayValue();

  const items = useMemo(
    () =>
      projectItems({ tasks: scoped.tasks, paths: scoped.goals, projects, lists, today }).filter(
        (item) => item.statusId !== "archived",
      ),
    [scoped.tasks, scoped.goals, projects, lists, today],
  );

  const spec = useMemo(
    () => specForSpaceView(tab === "list" ? "list" : "gantt", {}, t(`spaceHub.tab.${tab}`)),
    [tab, t],
  );

  const context: GroupContext = useMemo(
    () => ({
      today,
      taskById: new Map(scoped.tasks.map((task) => [task.id, task])),
      groupRank: groupRank(spec.groupBy, { projects, lists, folders }),
    }),
    [today, scoped.tasks, spec.groupBy, projects, lists, folders],
  );

  function openItem(item: Item) {
    if (item.source === "task") onOpenTask(item.sourceId);
    else if (item.source === "goal") onOpenGoal(item.sourceId);
    else if (item.source === "milestone") onOpenGoal(item.parentId, item.sourceId);
  }

  if (tab === "list") {
    return (
      <TaskListView
        items={items}
        spec={spec}
        context={context}
        // A Space spans Projects that may define different statuses, so the
        // shared default set is the only one true of all of them (§0.3.3).
        statuses={DEFAULT_STATUSES}
        lists={lists}
        // Several Projects in scope, so a List names its owner (§50E.17) —
        // otherwise every Project's default List reads the same.
        projects={projects}
        showProjectContext
        today={today}
        onOpenItem={openItem}
        onPatchTask={onUpdateTask}
        onSetStatus={(item, statusId) => {
          const task = context.taskById.get(item.sourceId);
          if (!task) return;
          const patch = statusPatch(task, statusId, DEFAULT_STATUSES);
          if (Object.keys(patch).length > 0) onUpdateTask(task.id, patch);
        }}
        // Creation needs a Project, which a Space scope does not name
        // (G-CTX-01). Until that picker exists the row is not offered rather
        // than guessing which Project the task belongs to.
        onCreateTask={() => undefined}
      />
    );
  }

  if (tab === "gantt") {
    return (
      <TaskGanttView
        items={items}
        spec={spec}
        context={context}
        today={today}
        projects={projects}
        tasks={scoped.tasks}
        groupLabel={(groupId) => {
          const list = lists.find((candidate) => candidate.id === groupId);
          return list ? listDisplayName(list, t("list.defaultName")) : t("timeline.ungrouped");
        }}
        onOpenItem={openItem}
        onUpdateTask={onUpdateTask}
      />
    );
  }

  if (tab === "calendar") {
    return (
      <TaskCalendarView
        tasks={scoped.tasks}
        projects={projects}
        today={today}
        onOpenTask={onOpenTask}
        onUpdateTask={onUpdateTask}
      />
    );
  }

  // Goals is the last section the bar offers. A Horizons branch stood after
  // this one and was the fallback; both it and the tab that reached it are
  // gone (domain/view/spaceNav.ts).
  return (
    <GoalsSection
      goals={scoped.goals}
      tasks={scoped.tasks}
      projects={projects}
      // Several Projects in scope, so each card names its own (§50E.17).
      showProjectContext
      onOpenGoal={onOpenGoal}
    />
  );
}
