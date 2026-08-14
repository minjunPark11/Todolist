// One presentation type for every horizon column (HORIZONS_DESIGN.md D7).
//
// Same shape of idea as calendarItems.ts, which folds five sources
// (task/project/note/external/focus) into a single CalendarItem so the
// calendar only ever renders one thing. Here three sources — a long-running
// goal, its milestones, and the tasks that execute them — become one card
// type, because the horizon model only works if a life goal and a task due
// today look and behave alike. Uniformity has to hold in the data; doing it
// in CSS alone leaves the drag behaviour inconsistent.
//
// Nothing here owns a record: every HorizonItem points back at the store that
// does (D1, "the view is owned, the storage never is").
import type { Task } from "../types";
import type { GoalSchedule, LearningPath } from "../lib/ai/learningPaths/types";
import { horizonForGoalSchedule, normalizeGoalSchedule } from "../domain/horizons/goalSchedule";
import { anchorForTaskDate } from "../domain/horizons/horizonAnchors";
import type { Horizon } from "./horizons";

export type HorizonSourceType = "path" | "milestone" | "task";

export interface HorizonItem {
  key: string;
  horizon: Horizon;
  sourceType: HorizonSourceType;
  sourceId: string;
  /** Path id a milestone belongs to; "" for paths and tasks. */
  parentId: string;
  title: string;
  /** Shown faintly on the card so the cascade stays visible (D11). */
  parentTitle?: string;
  /** The observable "how do I know this is done" line, when the source has one. */
  doneCriteria?: string;
  targetDate?: string;
  schedule?: GoalSchedule;
  /** Calendar-period anchor. Life has no anchor. */
  anchor?: string;
  done: boolean;
  /** Board colour — owned by the Board/Project, shared with the calendar (SPACES_BOARD_DESIGN D1). */
  color: string;
  /**
   * Which board this belongs to, filled by exactly the same rule as `color`
   * (SPACES_BOARD_DESIGN D3). Colour alone cannot filter: two boards may be
   * the same colour, and then a board view would silently show both.
   */
  boardId?: string;
  draggable: boolean;
}

export const DEFAULT_HORIZON_COLOR = "#0066cc";

export interface BuildHorizonItemsArgs {
  paths: LearningPath[];
  tasks: Task[];
  today: string;
  /** Project/Space id -> colour. Missing ids fall back to the default. */
  colorByProjectId?: Map<string, string>;
}

/**
 * A milestone inherits its path's schedule when it has none of its own, so
 * a freshly proposed path does not scatter its milestones onto "life" while
 * the goal itself sits on "year".
 */
function hasOwnTiming(value: { schedule?: GoalSchedule; targetDate?: string; deadlineDate?: string }): boolean {
  return "schedule" in value || "targetDate" in value || "deadlineDate" in value;
}

export function buildHorizonItems({
  paths,
  tasks,
  today,
  colorByProjectId,
}: BuildHorizonItemsArgs): HorizonItem[] {
  const items: HorizonItem[] = [];
  const colorFor = (projectId?: string) =>
    (projectId && colorByProjectId?.get(projectId)) || DEFAULT_HORIZON_COLOR;

  for (const path of paths) {
    const color = colorFor(path.projectId);
    const pathSchedule = normalizeGoalSchedule(path.schedule, path.targetDate, today);
    const pathHorizon = horizonForGoalSchedule(pathSchedule);

    if (pathHorizon) {
      items.push({
        key: `path:${path.id}`,
        horizon: pathHorizon,
        sourceType: "path",
        sourceId: path.id,
        parentId: "",
        title: path.goal,
        targetDate: path.deadlineDate ?? path.targetDate,
        schedule: pathSchedule,
        anchor: "startDate" in pathSchedule ? pathSchedule.startDate : undefined,
        done: Boolean(path.completedAt),
        color,
        boardId: path.projectId,
        draggable: true,
      });
    }

    for (const milestone of path.milestones) {
      const milestoneSchedule = hasOwnTiming(milestone)
        ? normalizeGoalSchedule(milestone.schedule, milestone.targetDate, today)
        : pathSchedule;
      const milestoneHorizon = horizonForGoalSchedule(milestoneSchedule);
      if (!milestoneHorizon) continue;
      items.push({
        key: `milestone:${milestone.id}`,
        horizon: milestoneHorizon,
        sourceType: "milestone",
        sourceId: milestone.id,
        parentId: path.id,
        title: milestone.title,
        parentTitle: path.goal,
        doneCriteria: milestone.doneCriteria || undefined,
        targetDate: milestone.deadlineDate ?? milestone.targetDate ?? path.deadlineDate ?? path.targetDate,
        schedule: milestoneSchedule,
        anchor: "startDate" in milestoneSchedule ? milestoneSchedule.startDate : undefined,
        done: Boolean(milestone.completedAt),
        color,
        boardId: path.projectId,
        draggable: true,
      });
    }
  }

  // Which milestone a task came from, so an executing task still shows the
  // goal it belongs to rather than floating free in the day column.
  const milestoneByTaskId = new Map<string, { title: string; goal: string; color: string; boardId?: string }>();
  for (const path of paths) {
    const color = colorFor(path.projectId);
    for (const milestone of path.milestones) {
      for (const taskId of milestone.taskIds ?? []) {
        milestoneByTaskId.set(taskId, { title: milestone.title, goal: path.goal, color, boardId: path.projectId });
      }
    }
  }

  for (const task of tasks) {
    // Archived work is not a horizon; done work stays so the day column can
    // show what was finished today rather than emptying as you work.
    if (task.status === "archived" || task.archivedAt) continue;
    // A task with neither date has no position on a time axis. It belongs to
    // the Inbox, and Today's triage is where it gets one.
    const target = task.scheduledDate || task.dueDate;
    if (!target) continue;
    const placement = anchorForTaskDate(target, today);

    const link = milestoneByTaskId.get(task.id);
    items.push({
      key: `task:${task.id}`,
      horizon: placement.horizon,
      sourceType: "task",
      sourceId: task.id,
      parentId: "",
      title: task.title,
      // A task materialised from a milestone starts with the milestone's
      // title, so the cascade line would just repeat the card. The breadcrumb
      // is there to add context; when it has none to add, it is noise.
      parentTitle: link && link.title !== task.title ? link.title : undefined,
      targetDate: target,
      anchor: placement.anchor,
      done: task.status === "done",
      // A linked task takes its goal's colour so a cascade reads as one
      // colour down the columns; an unlinked one falls back to its project.
      color: link?.color ?? colorFor(task.projectId),
      // Board follows colour exactly (D3): a task materialised from a goal
      // belongs to that goal's board even when its own projectId says
      // otherwise, or the card would show one board's colour under another
      // board's heading.
      boardId: link ? link.boardId : task.projectId,
      draggable: true,
    });
  }

  return items;
}

/**
 * The items belonging to one board (SPACES_BOARD_DESIGN D3).
 *
 * An empty board id matches nothing rather than everything: "no board" is the
 * state of every unassigned task, and returning those under some board's
 * heading would claim work the board does not own.
 */
export function itemsForBoard(items: HorizonItem[], boardId: string): HorizonItem[] {
  if (!boardId) return [];
  return items.filter((item) => item.boardId === boardId);
}

/** Items on one column, unfinished first so a full day does not bury the work. */
export function itemsForHorizon(items: HorizonItem[], horizon: Horizon): HorizonItem[] {
  return sortHorizonItems(items.filter((item) => item.horizon === horizon));
}

export function itemsForHorizonAnchor(
  items: HorizonItem[],
  horizon: Horizon,
  anchor?: string,
): HorizonItem[] {
  return sortHorizonItems(
    items.filter((item) => item.horizon === horizon && (horizon === "life" || item.anchor === anchor)),
  );
}

export function carryoverItemsForHorizonAnchor(
  items: HorizonItem[],
  horizon: Horizon,
  anchor: string | undefined,
  isCurrentPeriod: boolean,
): HorizonItem[] {
  if (!isCurrentPeriod || horizon === "life" || !anchor) return [];
  return sortHorizonItems(
    items.filter(
      (item) =>
        item.sourceType !== "task" &&
        item.horizon === horizon &&
        !item.done &&
        Boolean(item.anchor) &&
        item.anchor! < anchor,
    ),
  );
}

function sortHorizonItems(items: HorizonItem[]): HorizonItem[] {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    // Deadlines are secondary to period placement and only order peers.
    if (!a.targetDate) return b.targetDate ? 1 : 0;
    if (!b.targetDate) return -1;
    return a.targetDate.localeCompare(b.targetDate);
  });
}
