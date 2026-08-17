// Where an Item lives, and what state it is in (SPACES_CLICKUP_REDESIGN M2-M4).
//
// The design document said to rewrite every task with a `listId` and every
// board list into a status. That is not what happens here, and the reason is
// the work this repository just finished: a migration that touches every
// record uploads every record. `diffChangedRecords` decides what to sync by
// object identity, so rewriting N tasks means N rows on the wire — the exact
// write amplification dd7c8a6 removed, reintroduced as a one-off.
//
// It is also unnecessary. While a Space has a single (default) List, a task's
// List is fully determined by its `projectId`; while a Space uses the default
// statuses, a task's status id IS its `status`, because DEFAULT_STATUSES uses
// the TaskStatus values as ids on purpose. So the stored field is written only
// when the answer stops being derivable — when the user actually moves a task
// into a second List, or onto a status they invented.
//
// This is the expand step of expand/migrate/contract: the new field is
// authoritative when present, the old one answers when it is absent, and both
// are true at once for as long as needed. Nothing is rewritten in bulk, and no
// device is required to agree about when the switch happened.
import type { LearningPath, List, Project, Status, Task, TaskStatus } from "../../types";
import { DEFAULT_STATUSES, defaultListFor } from "./hierarchy";

/** A Space stores a status set only once the user edits one (D7). */
export function statusesForSpace(space: Pick<Project, "statuses"> | undefined): Status[] {
  return space?.statuses && space.statuses.length > 0 ? space.statuses : DEFAULT_STATUSES;
}

/**
 * Deterministic, so running the backfill twice cannot produce two default
 * Lists for one Space — including on a device whose first run failed to
 * persist, or on a second device that migrates independently.
 */
export function defaultListIdFor(spaceId: string): string {
  return `list-default-${spaceId}`;
}

/**
 * The stored value wins; otherwise the Project's default List answers. An Item
 * whose Project has no List at all resolves to "" rather than guessing.
 *
 * The fallback is the leg being removed. The TickTick plan makes `Task.listId`
 * the single owner (§6.5) and reads the Project THROUGH the List (§6.77),
 * where this derives the List from the Project — the opposite direction.
 * `backfillTaskListId` writes the answer down once so the fallback stops being
 * load-bearing; this stays until nothing reaches it.
 */
export function listIdFor(item: Pick<Task, "listId" | "projectId">, lists: List[]): string {
  if (item.listId) return item.listId;
  if (!item.projectId) return inboxListId(lists);
  return defaultListFor(lists, item.projectId)?.id ?? "";
}

/** The account's Inbox, or "" before the migration has created it. */
export function inboxListId(lists: List[]): string {
  return lists.find((list) => list.kind === "inbox" && !list.archivedAt)?.id ?? "";
}

/**
 * The Project a Task belongs to, read through its List (§6.77).
 *
 * "Task에 별도 projectId를 읽지 않는다" — membership flows one way, so moving a
 * List between Projects never has to rewrite the Tasks under it. Falls back to
 * the stored `projectId` for a Task the backfill has not reached yet, and
 * answers "" for one in the Inbox, which belongs to no Project (§6.80).
 */
export function projectIdFor(task: Pick<Task, "listId" | "projectId">, lists: List[]): string {
  const list = task.listId ? lists.find((candidate) => candidate.id === task.listId) : undefined;
  if (list) return list.kind === "inbox" ? "" : list.projectId;
  return task.projectId;
}

/**
 * Write every Task's owning List down (Migration Phase 3, §6.70).
 *
 * The plan's three cases, in its order:
 *
 *   A  already has a `listId`            → left alone
 *   B  has a Project but no List         → that Project's default List
 *   C  has neither                       → the Inbox
 *
 * B does NOT go to the Inbox, and the plan is emphatic about why (§6.71):
 * moving a Project's Tasks there would make them vanish from the Space and
 * Project screens that show them today. The default List already exists —
 * `ensureDefaultLists` has been creating one per Project since P4 — so this
 * only records what `listIdFor` was already computing.
 *
 * Returns the SAME array when nothing needs writing, and spreads only the
 * Tasks it touches, because the sync plan decides what to upload by object
 * identity.
 */
export function backfillTaskListId(tasks: Task[], lists: List[], now: string): Task[] {
  const inbox = inboxListId(lists);
  let touched = false;
  const next = tasks.map((task) => {
    if (task.listId) return task;
    const listId = task.projectId ? defaultListFor(lists, task.projectId)?.id ?? "" : inbox;
    // No answer yet — a Project whose default List has not been created, or an
    // account whose Inbox is missing. Leaving it unwritten is right: the
    // fallback still resolves it, and the next load will have the List.
    if (!listId) return task;
    touched = true;
    return { ...task, listId, updatedAt: now };
  });
  return touched ? next : tasks;
}

export function goalListIdFor(path: Pick<LearningPath, "listId" | "projectId">, lists: List[]): string {
  if (path.listId) return path.listId;
  if (!path.projectId) return "";
  return defaultListFor(lists, path.projectId)?.id ?? "";
}

// === moving an Item into a List ===

/**
 * Where a drop on a List lands, as the two facts a record has to hold.
 *
 * The List decides the Space, not the other way round — that is what makes the
 * tree somewhere you can put things. Dragging into another Space's List moves
 * the Item to that Space, because a List has nowhere else to put it.
 */
export interface ListMove {
  spaceId: string;
  /** "" when the target is that Space's default List — see below. */
  listId: string;
}

/**
 * Landing on the default List CLEARS the stored id rather than writing the one
 * it would have computed. This is `listIdFor` read backwards, and it has to
 * keep that function's discipline: the field exists only for answers that
 * stopped being derivable. A stored value that merely agrees with the
 * derivation is one more thing that can later disagree with it — and it is
 * exactly the write amplification the whole expand step exists to avoid.
 */
export function resolveListMove(targetListId: string, lists: List[]): ListMove | null {
  const target = lists.find((list) => list.id === targetListId && !list.archivedAt);
  if (!target) return null;
  const isDefault = defaultListFor(lists, target.projectId)?.id === target.id;
  // `ListMove.spaceId` is the Task's `projectId` — a different field that kept
  // the same old name. Renaming it is its own step; this one is about `List`.
  return { spaceId: target.projectId, listId: isDefault ? "" : target.id };
}

/** Empty when the move changes nothing, so a no-op drop writes no row. */
export function patchForListMove(
  task: Pick<Task, "projectId" | "listId" | "statusId">,
  targetListId: string,
  lists: List[],
): Partial<Task> {
  const move = resolveListMove(targetListId, lists);
  if (!move) return {};
  const spaceChanged = task.projectId !== move.spaceId;
  if (!spaceChanged && (task.listId ?? "") === move.listId) return {};

  const patch: Partial<Task> = { listId: move.listId };
  if (spaceChanged) {
    patch.projectId = move.spaceId;
    // A status the user invented belongs to the Space that defined it.
    // `statusIdFor` would fall back anyway, so carrying the id across would
    // leave dead weight that still looks meaningful.
    if (task.statusId) patch.statusId = "";
  }
  return patch;
}

/**
 * The same move for a goal. Its Space-scoped column is dropped by `patchPath`
 * whenever `projectId` changes, so this does not restate that rule.
 */
export function patchForGoalListMove(
  path: Pick<LearningPath, "projectId" | "listId">,
  targetListId: string,
  lists: List[],
): Partial<LearningPath> {
  const move = resolveListMove(targetListId, lists);
  if (!move) return {};
  const spaceChanged = (path.projectId ?? "") !== move.spaceId;
  if (!spaceChanged && (path.listId ?? "") === move.listId) return {};
  return spaceChanged
    ? { projectId: move.spaceId, listId: move.listId }
    : { listId: move.listId };
}

/**
 * The stored id wins; otherwise the task's own status is the id, which holds
 * exactly because DEFAULT_STATUSES is keyed by TaskStatus. A stored id that no
 * longer exists in the set — the status was deleted on another device — falls
 * back the same way rather than leaving the task in a state nothing can render.
 */
export function statusIdFor(task: Pick<Task, "statusId" | "status">, statuses: Status[]): string {
  if (task.statusId && statuses.some((status) => status.id === task.statusId)) return task.statusId;
  return task.status;
}

export function statusFor(task: Pick<Task, "statusId" | "status">, statuses: Status[]): Status | undefined {
  const id = statusIdFor(task, statuses);
  return statuses.find((status) => status.id === id);
}

/** True when the resolved status counts as finished, whatever it is called. */
export function isDoneStatus(task: Pick<Task, "statusId" | "status">, statuses: Status[]): boolean {
  return statusFor(task, statuses)?.group === "done";
}

export function itemsInList(tasks: Task[], lists: List[], listId: string): Task[] {
  if (!listId) return [];
  return tasks.filter((task) => !task.deletedAt && listIdFor(task, lists) === listId);
}

/**
 * The Space's full status set: the base set plus every column the user added.
 *
 * The two are stored apart on purpose. `statuses` REPLACES the base set, so it
 * is written only when the user edits the defaults themselves; the columns they
 * add ride in `boardLists`, where adding one costs one small record instead of
 * rewriting all seven. They are read together rather than merged in storage —
 * converting in place would mean rewriting every Project for a value that can
 * simply be computed (M4).
 *
 * The stored field is still called `boardLists` because renaming a key inside a
 * synced record is how an older client comes to erase it (M0). It holds
 * statuses; only the wire remembers the old word.
 */
export function statusesWithCustom(space: Project): Status[] {
  const base = statusesForSpace(space);
  const custom = (space.boardLists ?? []).filter((status) => !status.archivedAt);
  if (custom.length === 0) return base;

  const known = new Set(base.map((status) => status.id));
  const extra: Status[] = [];
  // Inserted after the last `active` default so an added column reads as work
  // in progress, which is what they have always been used for.
  let order = base.reduce((max, status) => Math.max(max, status.order), 0);
  for (const added of custom) {
    if (known.has(added.id)) continue;
    order += 1;
    extra.push({
      id: added.id,
      label: added.name,
      color: space.color || "#8e8e93",
      order,
      group: "active",
    });
  }
  return extra.length > 0 ? [...base, ...extra] : base;
}

/** Kept honest by a test: every TaskStatus must exist in the default set. */
export const MIGRATED_TASK_STATUSES: TaskStatus[] = [
  "inbox",
  "todo",
  "doing",
  "waiting",
  "done",
  "archived",
];
