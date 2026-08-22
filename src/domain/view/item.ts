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
import type { List, Task, TaskPriority } from "../../types";
import { blockedTaskIds } from "../tasks/dependencies";
import { listIdFor, statusIdFor, statusesForSpace } from "../spaces/membership";

/**
 * One source, where there were three.
 *
 * Goals and milestones were the other two, and both went with the Goals
 * feature. The union stays a union rather than collapsing into nothing: it is
 * what `key` is namespaced by, and what a future source would join.
 */
export type ItemSource = "task";

export interface Item {
  /** Namespaced by source, so one list could hold more than one kind. */
  key: string;
  source: ItemSource;
  sourceId: string;
  /** Subtask -> its task. "" at the top level. */
  parentId: string;
  title: string;

  // --- area axis. `spaceId` and `projectId` sat here, the two levels above a
  // List in the old tree. Both records left with the Projects feature, and a
  // List is the top of the area axis now.
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

  // --- time axis. `scheduledDate` — "the day actually blocked out" — used to
  // sit between these two, and folded into them when the Task record dropped
  // to two dates (SCHEDULE_EDITOR_PHASE0_AUDIT.md §7 Phase 11). A single-day
  // item is a `dueDate` alone; an item with both is a span.
  /** When the work begins. "" for anything with no span of its own. */
  startDate: string;
  /** The day, for a single-day item; the last day, for a span. */
  dueDate: string;
  // A `horizon` field sat here — which of the five periods, life to day, an
  // Item belonged to. Only the `groupBy: "horizon"` axis read it, and both it
  // and the Horizons screen are gone.
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
  lists: List[];
  today: string;
}

/** List id -> the Folder it hangs in. Absent for a Folderless List (D4). */
function folderMap(lists: List[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const list of lists) {
    if (list.folderId) map.set(list.id, list.folderId);
  }
  return map;
}

export function projectItems(input: ProjectItemsInput): Item[] {
  const { tasks, lists } = input;
  const folders = folderMap(lists);
  const blocked = blockedTaskIds(tasks);
  // Custom per-Project status sets went with the Projects feature, so every
  // Task now resolves against the one default set.
  const statuses = statusesForSpace(undefined);
  const items: Item[] = [];

  for (const task of tasks) {
    if (task.deletedAt) continue;
    const taskListId = listIdFor(task, lists);
    items.push({
      key: `task:${task.id}`,
      source: "task",
      sourceId: task.id,
      parentId: task.parentTaskId,
      title: task.title,
      listId: taskListId,
      folderId: folders.get(taskListId) ?? "",
      startDate: task.startDate,
      dueDate: task.dueDate,
      startTime: task.startTime,
      endTime: task.endTime,
      statusId: statusIdFor(task, statuses),
      priority: task.priority,
      done: task.status === "done",
      blocked: blocked.has(task.id),
      tags: task.tags,
      estimatedMinutes: task.estimatedMinutes,
      actualSeconds: task.actualSeconds,
    });
  }

  return items;
}
