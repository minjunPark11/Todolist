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
import { listIdFor, goalListIdFor, statusIdFor, statusesForSpace, statusesWithCustom } from "../spaces/membership";
import { spaceIdForProject } from "../spaces/spaces";
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
  /**
   * The Space its Project hangs in (H-INV-01).
   *
   * This field held a PROJECT id until STEP 7, because a Project was the top
   * of the tree. Both are here now, and they are different records: a Space
   * scope has to gather several Projects, which one id could not express.
   *
   * Derived, never stored. Space membership is computed through the Project
   * relation rather than copied onto every Task (§43) — a denormalised copy is
   * one more thing that can disagree, and moving a Project between Spaces
   * would have to rewrite every item under it (H-INV-05).
   */
  spaceId: string;
  projectId: string;
  listId: string;
  /**
   * The Folder the Item's List hangs in; "" for a Folderless List (D4).
   *
   * Derived here rather than looked up at filter time because `matchesFilter`
   * sees one Item and nothing else — giving it the collections so it could
   * walk List -> Folder would hand the filter language a dependency the rest
   * of it does not have.
   */
  folderId: string;
  color: string;

  // --- time axis. Four fields answering four different questions; folding
  // them together would lose information the app already relies on.
  /** When the work begins. "" for anything with no span of its own. */
  startDate: string;
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

/** Project id -> the Space it hangs in. The only place membership is joined. */
function spaceMap(projects: Project[]): Map<string, string> {
  return new Map(projects.map((project) => [project.id, spaceIdForProject(project)]));
}

/** List id -> the Folder it hangs in. Absent for a Folderless List (D4). */
function folderMap(lists: List[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const list of lists) {
    if (list.folderId) map.set(list.id, list.folderId);
  }
  return map;
}

/**
 * The set an Item resolves its status against.
 *
 * It must be the SAME set a board draws its columns from, and that is
 * `statusesWithCustom` — defaults plus every column the user named. While
 * this used `statusesForSpace`, a named column existed on screen but not in
 * the set `statusIdFor` validates against, so every item on it fell back to
 * `task.status`: the column could never hold anything, and a card dropped on
 * it snapped back.
 */
function statusMap(projects: Project[]): Map<string, Status[]> {
  return new Map(projects.map((project) => [project.id, statusesWithCustom(project)]));
}

/**
 * A goal's column.
 *
 * Completion is the user's explicit assertion and outranks the column (D10),
 * so a finished goal reads `done` wherever it was filed. Otherwise the board
 * column it sits in IS its status: `boardListId` is the only field a goal has
 * ever had for this, and it is exactly what `statusesWithCustom` puts in
 * the set. Dropping it here is what let the Goals tab and the board give two
 * different answers about one goal.
 *
 * A dangling id falls back rather than rendering into a column that no longer
 * exists — the same rule `statusIdFor` follows for a task.
 */
function goalStatusId(path: LearningPath, statuses: Status[]): string {
  if (path.completedAt) return "done";
  if (path.boardListId && statuses.some((status) => status.id === path.boardListId)) {
    return path.boardListId;
  }
  return "todo";
}

export function projectItems(input: ProjectItemsInput): Item[] {
  const { tasks, paths, projects, lists, today } = input;
  const wanted = new Set<ItemSource>(input.sources ?? ["task", "goal", "milestone"]);
  const colors = colorMap(projects);
  const statuses = statusMap(projects);
  const spaces = spaceMap(projects);
  const folders = folderMap(lists);
  const blocked = blockedTaskIds(tasks);
  const items: Item[] = [];

  if (wanted.has("task")) {
    for (const task of tasks) {
      if (task.deletedAt) continue;
      const spaceStatuses = statuses.get(task.projectId) ?? statusesForSpace(undefined);
      const taskListId = listIdFor(task, lists);
      items.push({
        key: `task:${task.id}`,
        source: "task",
        sourceId: task.id,
        parentId: task.parentTaskId,
        title: task.title,
        spaceId: spaces.get(task.projectId) ?? "",
        projectId: task.projectId,
        listId: taskListId,
        folderId: folders.get(taskListId) ?? "",
        color: colors.get(task.projectId) ?? DEFAULT_COLOR,
        startDate: task.startDate,
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
    const projectId = path.projectId ?? "";
    const spaceId = spaces.get(projectId) ?? "";
    const color = colors.get(projectId) ?? DEFAULT_COLOR;
    const spaceStatuses = statuses.get(projectId) ?? statusesForSpace(undefined);
    const listId = goalListIdFor(path, lists);
    const folderId = folders.get(listId) ?? "";
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
        projectId,
        listId,
        folderId,
        color,
        // "unscheduled" and "life" carry no start; both are periods without
        // a first day, so the span resolver falls back to the deadline.
        startDate: schedule && "startDate" in schedule ? schedule.startDate : "",
        scheduledDate: "",
        dueDate: path.deadlineDate ?? "",
        horizon: horizon ?? undefined,
        startTime: "",
        endTime: "",
        statusId: goalStatusId(path, spaceStatuses),
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
        projectId,
        listId,
        folderId,
        color,
        startDate: "",
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
