// Duplicate, as a plan rather than a series of writes (spec §15.9–§15.18).
//
// §15.18 asks for one transaction: a copy that fails halfway must leave no
// half-copy behind and must not touch the original. The cheapest way to get
// that from a store that replaces state wholesale is to compute every new
// record FIRST, in a pure function that either returns the whole plan or
// returns null — so there is one `setData` and nothing to roll back.
//
// What the hand-written version in `usePlannerData` got wrong, and why each
// one was invisible:
//
//   Child Tasks were not copied at all. It duplicated the legacy `Subtask`
//   rows and stopped, so duplicating a parent written since Phase 2 produced
//   a Task with no children — §15.13 asks for the subtree with the parent
//   links remapped (A→A', B'.parentTaskId = A').
//
//   Tag relations were not copied. `Task.tags` came across on the spread, but
//   §13.32 made the `TaskTag` relation canonical, so the copy showed no tags
//   anywhere that reads the relation — which is everywhere that matters.
//
//   Focus history came across. `actualSeconds`, `lastFocusedAt` and
//   `activeSessionId` rode the spread, so a fresh copy claimed hours of work
//   and pointed at a session belonging to the original Task.
import type { CheckItem, Subtask, Task, TaskTag } from "../../types";
import { subtreeIds } from "./hierarchy";
import { duplicateCheckItems } from "./checkItems";
import { taskTagIdFor } from "../tags/tags";
import { orderBetween } from "./sortKey";
import { LIFECYCLE } from "./taskState";

export interface DuplicateSources {
  tasks: Task[];
  subtasks: Subtask[];
  checkItems: CheckItem[];
  taskTags: TaskTag[];
}

export interface DuplicatePlan {
  /** The copy of the Task that was asked for, for the caller to open or undo. */
  rootId: string;
  /** New records, to append. Nothing existing is modified. */
  tasks: Task[];
  subtasks: Subtask[];
  checkItems: CheckItem[];
  taskTags: TaskTag[];
}

/**
 * What a copy does NOT inherit, beyond §15.10's own reset list.
 *
 * All three are records of what happened to the ORIGINAL, and a copy is work
 * that has not been started. `pinnedAt` joins them for the same reason: §15.6
 * pins the Task someone is keeping at hand, and a copy is not that Task —
 * inheriting it would put two identical rows at the top of the list, which is
 * the opposite of what pinning the first one was for.
 */
const FRESH_START: Partial<Task> = {
  status: LIFECYCLE.open,
  completedAt: "",
  archivedAt: "",
  wontDoAt: "",
  deletedAt: "",
  pinnedAt: "",
  actualSeconds: 0,
  activeSessionId: "",
  lastFocusedAt: "",
};

/**
 * Where the copy sits: directly after the original (§6.30's spaced keys).
 *
 * One row is written and never the column, which is what §6.31 asks for: the
 * keys are fractional, so "directly after" almost always has room. The `??`
 * is for the case where it does not — floats out of precision — and takes the
 * original's own key. That is a tie rather than a wrong position, and
 * `byManualOrder` breaks ties by `createdAt`, which the copy's is later than.
 *
 * The next key is looked for across every Task rather than within the
 * original's column. That can only make the gap SMALLER than it needed to be
 * — a key from another List still lands between these two — and it saves
 * re-deriving what "the same column" means for a Task whose List is implied
 * by its Project.
 */
function orderAfter(source: Task, siblings: Task[]): number {
  const next = siblings
    .filter((task) => task.order > source.order)
    .reduce<number | undefined>(
      (lowest, task) => (lowest === undefined || task.order < lowest ? task.order : lowest),
      undefined,
    );
  return orderBetween(source.order, next) ?? source.order;
}

/**
 * Every record a Duplicate would create, or null if there is nothing to copy.
 *
 * Null rather than a thrown error: §15.67's menu can be a picture of a Task
 * that a sync has since removed, and the caller's answer to that is to do
 * nothing, not to crash a panel.
 *
 * `createId` is injected so this stays pure and a test can pin the mapping —
 * §15.13's A→A', B→B' is a claim about identity, and a function that invented
 * its own ids could not be asked to prove it.
 */
export function duplicateTaskPlan(
  taskId: string,
  sources: DuplicateSources,
  createId: (prefix: string) => string,
  now: string,
): DuplicatePlan | null {
  const source = sources.tasks.find((task) => task.id === taskId);
  if (!source) return null;

  // Root first, then its descendants (§15.13's subtree). The same walk the
  // List move uses, so a Task that moves as one unit copies as one unit.
  const ids = subtreeIds(taskId, sources.tasks);
  const idMap = new Map(ids.map((id) => [id, createId("task")]));
  const rootId = idMap.get(taskId)!;

  const tasks: Task[] = [];
  const subtasks: Subtask[] = [];
  const checkItems: CheckItem[] = [];
  const taskTags: TaskTag[] = [];

  for (const id of ids) {
    const original = sources.tasks.find((task) => task.id === id);
    if (!original) continue;
    const copyId = idMap.get(id)!;

    tasks.push({
      ...original,
      ...FRESH_START,
      id: copyId,
      // The root copy is the original's SIBLING — its parent is whatever the
      // original's was, root included. Only descendants are remapped, and
      // §15.13's whole point is that they are remapped to the new ids rather
      // than left pointing at the originals.
      parentTaskId: id === taskId ? original.parentTaskId : (idMap.get(original.parentTaskId) ?? ""),
      order: id === taskId ? orderAfter(original, sources.tasks) : original.order,
      // A fresh array: two Tasks sharing one is one Task's edit showing up on
      // the other.
      tags: [...(original.tags ?? [])],
      createdAt: now,
      updatedAt: now,
    });

    for (const legacy of sources.subtasks.filter((row) => row.taskId === id)) {
      subtasks.push({
        ...legacy,
        id: createId("subtask"),
        taskId: copyId,
        completed: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    checkItems.push(
      ...duplicateCheckItems(id, copyId, sources.checkItems, () => createId("checkitem"), now),
    );

    for (const link of sources.taskTags.filter((row) => row.taskId === id)) {
      taskTags.push({
        // Derived from the pair, not generated: §6.46's uniqueness lives in
        // the id, so duplicating twice cannot produce two links for one pair.
        id: taskTagIdFor(copyId, link.tagId),
        taskId: copyId,
        tagId: link.tagId,
        createdAt: now,
      });
    }
  }

  return { rootId, tasks, subtasks, checkItems, taskTags };
}
