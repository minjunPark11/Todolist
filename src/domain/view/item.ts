// One projection for everything a view can show (CLICKUP_IMPORT_DESIGN §4.1).
//
// This repository has independently arrived at this shape four times:
// calendarItems.ts folds five sources into a CalendarItem, horizonItems.ts
// folds three into a HorizonItem — and says so, "same shape of idea as
// calendarItems.ts" — while todayView.ts and eisenhower.ts each derive their
// own grouping key from a Task. SpaceHorizons.tsx is 179 lines of the Horizons
// page narrowed to one board, which is a filter written as a component.
//
// So this is not a new idea. It is the pattern being named once.
//
// The rules are NOT reimplemented here. Quadrant, horizon, bucket and blocked
// each already live in a tested module, and this delegates to all four. That
// way the engine cannot drift from the screens while both exist, and P8 can
// delete the old *presentation* code without touching the rules it proved.
//
// Nothing here owns a record — every Item points back at the store that does,
// which is the rule HorizonItem already states: "the view is owned, the
// storage never is".
import type { LearningPath, List, Project, Status, Task, TaskPriority } from "../../types";
import { blockedTaskIds } from "../tasks/dependencies";
import { listIdFor, goalListIdFor, statusIdFor, statusesForSpace } from "../spaces/membership";
import { horizonForGoalSchedule, normalizeGoalSchedule } from "../horizons/goalSchedule";
import { deriveHorizon } from "../../utils/horizons";
import type { Horizon } from "../../utils/horizons";

export type ItemSource = "task" | "goal" | "milestone";

export interface Item {
  /** Unique across sources, so one list can hold a task and a goal at once. */
  key: string;
  source: ItemSource;
  sourceId: string;
  /** Milestone -> its goal; subtask -> its task. "" at the top level. */
  parentId: string;
  title: string;

  // --- area axis
  spaceId: string;
  listId: string;
  color: string;

  // --- time axis. Three fields answering three different questions; folding
  // them together would lose information the app already relies on.
  /** When it is meant to be worked on. */
  scheduledDate: string;
  /** When it is due. */
  dueDate: string;
  /** Which calendar period it belongs to (goals). */
  horizon?: Horizon;
  startTime: string;
  endTime: string;

  // --- judgement axis
  statusId: string;
  priority: TaskPriority;
  done: boolean;
  blocked: boolean;
  tags: string[];
  estimatedMinutes: number;
  actualSeconds: number;
}

export interface ProjectItemsInput {
  tasks: Task[];
  paths: LearningPath[];
  projects: Project[];
  lists: List[];
  today: string;
  /** Omit to include goals and milestones; the calendar wants tasks only. */
  sources?: ItemSource[];
}

const DEFAULT_COLOR = "#0066cc";

function colorMap(projects: Project[]): Map<string, string> {
  return new Map(projects.map((project) => [project.id, project.color]));
}

function statusMap(projects: Project[]): Map<string, Status[]> {
  return new Map(projects.map((project) => [project.id, statusesForSpace(project)]));
}

export function projectItems(input: ProjectItemsInput): Item[] {
  const { tasks, paths, projects, lists, today } = input;
  const wanted = new Set<ItemSource>(input.sources ?? ["task", "goal", "milestone"]);
  const colors = colorMap(projects);
  const statuses = statusMap(projects);
  const blocked = blockedTaskIds(tasks);
  const items: Item[] = [];

  if (wanted.has("task")) {
    for (const task of tasks) {
      if (task.deletedAt) continue;
      const spaceStatuses = statuses.get(task.projectId) ?? statusesForSpace(undefined);
      items.push({
        key: `task:${task.id}`,
        source: "task",
        sourceId: task.id,
        parentId: task.parentTaskId,
        title: task.title,
        spaceId: task.projectId,
        listId: listIdFor(task, lists),
        color: colors.get(task.projectId) ?? DEFAULT_COLOR,
        scheduledDate: task.scheduledDate,
        dueDate: task.dueDate,
        // A task's period comes from the date it is meant to be worked on, or
        // failing that its deadline — the compatibility path horizonItems has
        // always used for tasks that predate goal schedules.
        horizon: deriveHorizon(task.scheduledDate || task.dueDate || undefined, today),
        startTime: task.startTime,
        endTime: task.endTime,
        statusId: statusIdFor(task, spaceStatuses),
        priority: task.priority,
        done: task.status === "done",
        blocked: blocked.has(task.id),
        tags: task.tags,
        estimatedMinutes: task.estimatedMinutes,
        actualSeconds: task.actualSeconds,
      });
    }
  }

  for (const path of paths) {
    const spaceId = path.projectId ?? "";
    const color = colors.get(spaceId) ?? DEFAULT_COLOR;
    const listId = goalListIdFor(path, lists);
    const schedule = normalizeGoalSchedule(path.schedule, path.targetDate, today);
    const horizon = horizonForGoalSchedule(schedule);

    if (wanted.has("goal")) {
      items.push({
        key: `goal:${path.id}`,
        source: "goal",
        sourceId: path.id,
        parentId: "",
        title: path.goal,
        spaceId,
        listId,
        color,
        scheduledDate: "",
        dueDate: path.deadlineDate ?? "",
        horizon: horizon ?? undefined,
        startTime: "",
        endTime: "",
        // Goals carry no workflow status of their own; completion is the
        // user's explicit assertion (HORIZONS_DESIGN D10).
        statusId: path.completedAt ? "done" : "todo",
        priority: "none",
        done: Boolean(path.completedAt),
        blocked: false,
        tags: path.tags ?? [],
        estimatedMinutes: 0,
        actualSeconds: 0,
      });
    }

    if (!wanted.has("milestone")) continue;
    for (const milestone of path.milestones) {
      // A milestone with no timing of its own sits where its goal sits, so a
      // freshly written goal does not scatter its parts across the horizons.
      const own = normalizeGoalSchedule(milestone.schedule, milestone.targetDate, today);
      const milestoneHorizon =
        (milestone.schedule || milestone.targetDate || milestone.deadlineDate
          ? horizonForGoalSchedule(own)
          : horizon) ?? undefined;
      items.push({
        key: `milestone:${path.id}:${milestone.id}`,
        source: "milestone",
        sourceId: milestone.id,
        parentId: path.id,
        title: milestone.title,
        spaceId,
        listId,
        color,
        scheduledDate: "",
        dueDate: milestone.deadlineDate ?? "",
        horizon: milestoneHorizon,
        startTime: "",
        endTime: "",
        statusId: milestone.completedAt ? "done" : "todo",
        priority: "none",
        done: Boolean(milestone.completedAt),
        blocked: false,
        tags: [],
        estimatedMinutes: 0,
        actualSeconds: 0,
      });
    }
  }

  return items;
}
