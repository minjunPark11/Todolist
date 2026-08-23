// `doing` and `waiting`, moved from the lifecycle field to where they belong
// (Chapter 26 §26.3.4).
//
// Both were workflow, not lifecycle: they say where a Task is in a flow the
// user defines, which is a List's Section. §26.3.2 took them out of the
// lifecycle union, and this is the other half — without it the information
// would simply vanish, since a legacy value that nothing reads is a value the
// user can no longer see.
//
// Two restraints, both from §26.3.4:
//
//   1. A Section is created only in a List that ACTUALLY HAS such a Task.
//      Stamping "Doing" and "Waiting" onto every List would be the app
//      inventing structure nobody asked for.
//   2. Only the Tasks carrying the value are written. This runs on the load
//      path because there is no migration table, so touching anything else
//      would put the whole task collection on the wire on every boot — the
//      write amplification this store has removed twice.
//
// Idempotent by construction: after one pass no Task holds the value, so the
// second pass finds nothing and returns the same arrays.
import type { List, ListSection, Task } from "../../types";
import { listIdFor } from "../spaces/membership";
import { LIFECYCLE } from "../tasks/taskState";

/**
 * The two values that move, and the column each becomes.
 *
 * English, like `DEFAULT_LIST_NAME` before it: the app is naming a column it
 * created on the user's behalf. Unlike that one it is NOT translated at
 * display time — a Section name is the user's own word, and the moment this
 * migration writes one it becomes theirs to rename.
 */
const SECTION_FOR: Record<string, string> = {
  doing: "Doing",
  waiting: "Waiting",
};

/**
 * Deterministic, so two devices migrating independently arrive at one Section
 * rather than two — the same reason `defaultListIdFor` is derived.
 */
export function legacySectionIdFor(listId: string, status: string): string {
  return `section-legacy-${status}-${listId}`;
}

export interface LegacyWorkflowMigration {
  tasks: Task[];
  listSections: ListSection[];
}

export function migrateLegacyWorkflowStatus(
  tasks: Task[],
  lists: List[],
  listSections: ListSection[],
  now: string,
): LegacyWorkflowMigration {
  // Cheap check first: the overwhelming majority of loads have nothing to do,
  // and this one runs on every boot.
  const pending = tasks.filter((task) => SECTION_FOR[task.status] !== undefined);
  if (pending.length === 0) return { tasks, listSections };

  const knownSectionIds = new Set(listSections.map((section) => section.id));
  const addedSections: ListSection[] = [];
  // Task id -> the Section it lands in, so the rewrite below stays one pass.
  const sectionByTask = new Map<string, string>();

  for (const task of pending) {
    const listId = listIdFor(task, lists);
    // Nothing to hang a Section on. The Task still loses the dead value below
    // — leaving it would mean a record no predicate can read.
    if (!listId) continue;

    const sectionId = legacySectionIdFor(listId, task.status);
    sectionByTask.set(task.id, sectionId);
    if (knownSectionIds.has(sectionId)) continue;
    knownSectionIds.add(sectionId);
    addedSections.push({
      id: sectionId,
      listId,
      name: SECTION_FOR[task.status],
      // After the columns the user made, not before them: this one is the
      // app's guess at where the Task was, and their own arrangement outranks
      // it. `sectionsForList` sorts on this and falls back to the name.
      sortKey: 1000,
      createdAt: now,
      updatedAt: now,
    });
  }

  const pendingIds = new Set(pending.map((task) => task.id));
  const nextTasks = tasks.map((task) => {
    if (!pendingIds.has(task.id)) return task;
    const sectionId = sectionByTask.get(task.id);
    return {
      ...task,
      status: LIFECYCLE.open,
      // A Task that already sat in a Section keeps it. The legacy value and a
      // real column are different answers, and the one the user placed wins.
      ...(sectionId && !task.sectionId ? { sectionId } : {}),
      updatedAt: now,
    };
  });

  return {
    tasks: nextTasks,
    listSections: addedSections.length > 0 ? [...listSections, ...addedSections] : listSections,
  };
}
