// Which dependency arrows a timeline should draw (GANTT_TIMELINE_DESIGN D7).
//
// `blockedByTaskId` holds one blocker per task, so the arrow count is bounded
// by the row count — there is no N² fan-out to guard against, which is why
// this can be a straightforward pass rather than an index.
//
// Pure and pixel-free: it answers WHICH bars connect and whether the pair is
// contradictory. Where the line goes on screen is the view's problem.
import type { Task } from "../../types";
import { isBlockerResolved, taskMap } from "../tasks/dependencies";
import { spanForItem } from "./span";
import type { Item } from "./item";

export interface TimelineLink {
  /** Item key of the blocker — the arrow's tail. */
  fromKey: string;
  /** Item key of the task waiting on it — the arrow's head. */
  toKey: string;
  /**
   * The dependent is scheduled to start before its blocker finishes. The plan
   * contradicts itself, and a timeline that drew this like any other link
   * would hide the one thing it is uniquely able to show.
   */
  conflict: boolean;
}

export interface TimelineBadge {
  itemKey: string;
  /** `blocker` — what this waits on is off-window. `dependent` — what waits on it is. */
  kind: "blocker" | "dependent";
}

export interface TimelineLinksResult {
  links: TimelineLink[];
  badges: TimelineBadge[];
}

const keyOf = (taskId: string) => `task:${taskId}`;

/**
 * `visible` is what the window actually drew; `tasks` is everything, so a
 * relation that leaves the window can be reported rather than silently
 * dropped. A line running off the edge cannot say where it goes, so it
 * becomes a badge on the bar that stayed (D7).
 *
 * A dangling blocker — the id points at a task that no longer exists — yields
 * neither a link nor a badge, matching `isTaskBlocked`, which reads a dangling
 * reference as unblocked rather than as permanently stuck.
 */
export function timelineLinks(visible: Item[], tasks: Task[]): TimelineLinksResult {
  const byId = taskMap(tasks);
  const visibleTaskIds = new Set(
    visible.filter((item) => item.source === "task").map((item) => item.sourceId),
  );
  const itemById = new Map(
    visible.filter((item) => item.source === "task").map((item) => [item.sourceId, item]),
  );

  const links: TimelineLink[] = [];
  const badges: TimelineBadge[] = [];
  // A task can have many dependents but only one blocker, so this is the only
  // side that needs collecting.
  const dependentsOffWindow = new Set<string>();

  for (const task of tasks) {
    const blockerId = task.blockedByTaskId;
    if (!blockerId) continue;
    const blocker = byId.get(blockerId);
    if (!blocker || blocker.deletedAt) continue;

    const dependentVisible = visibleTaskIds.has(task.id);
    const blockerVisible = visibleTaskIds.has(blockerId);

    if (dependentVisible && blockerVisible) {
      const from = itemById.get(blockerId)!;
      const to = itemById.get(task.id)!;
      const fromSpan = spanForItem(from);
      const toSpan = spanForItem(to);
      links.push({
        fromKey: from.key,
        toKey: to.key,
        // Only an unresolved blocker can be contradicted: work that is already
        // finished cannot be "not done yet" when the next thing starts.
        conflict:
          !isBlockerResolved(blocker) &&
          Boolean(fromSpan && toSpan) &&
          toSpan!.start <= fromSpan!.end,
      });
      continue;
    }

    if (dependentVisible && !blockerVisible) {
      badges.push({ itemKey: keyOf(task.id), kind: "blocker" });
    } else if (blockerVisible && !dependentVisible) {
      dependentsOffWindow.add(blockerId);
    }
  }

  for (const blockerId of dependentsOffWindow) {
    badges.push({ itemKey: keyOf(blockerId), kind: "dependent" });
  }

  return { links, badges };
}
