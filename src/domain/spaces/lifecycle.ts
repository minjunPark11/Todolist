// Archive, delete, restore and permanent delete, for the three containers
// (TickTick plan §6.56-§6.59, §13.19-§13.32, Implementation Phase 9 §16.32).
//
// One sentence holds the whole policy: a container's lifecycle never rewrites
// what is inside it. Archiving a List does not move its Tasks, deleting a
// Project does not touch its Lists, and deleting a Space does not touch
// anything at all. §13.19 says why — a Project is a List's context, not a
// Task's owner — and Gate 9 is four ways of checking that nothing here
// forgot it.
//
// The exception is stated once and guarded twice: permanent delete. §6.56
// allows a hard cascade there and NOWHERE else, and only from a surface that
// asked for confirmation. Everything above it is soft, which is what makes
// restore a matter of clearing one field.
import type { List, Project, Space, Task } from "../../types";
import { patchList } from "./hierarchy";
import { patchSpace } from "./spaces";
import { spaceIdForProject } from "./spaces";

/**
 * §13.20: a container is archived or deleted, never both.
 *
 * Two timestamps that can both be set would make "restore" ambiguous — put it
 * back to which state? — so each command clears the other rather than leaving
 * the answer to whoever reads them next.
 */
export interface Lifecycle {
  archivedAt?: string;
  deletedAt?: string;
}

export function isArchived(record: Lifecycle): boolean {
  return Boolean(record.archivedAt);
}

export function isDeleted(record: Lifecycle): boolean {
  return Boolean(record.deletedAt);
}

/** Neither archived nor deleted — what every active query means by "active". */
export function isLive(record: Lifecycle): boolean {
  return !record.archivedAt && !record.deletedAt;
}

// === Lists (§13.21-§13.24) ===

/**
 * §13.21. The Tasks are not moved to the Inbox, not trashed, and not touched.
 *
 * They keep their `listId`, which is the whole reason restore can be one
 * field: the relation is still there, and only the List's own state was
 * hiding it (§6.56).
 */
export function archiveList(lists: List[], listId: string, now: string): List[] {
  const list = lists.find((item) => item.id === listId);
  // The Inbox is the floor every Task falls back to (§6.5); archiving it would
  // leave the account with nowhere to put a task.
  if (!list || list.kind === "inbox" || list.archivedAt) return lists;
  return patchList(lists, listId, { archivedAt: now, deletedAt: undefined }, now);
}

/**
 * §13.22, and Gate 9's second line: a deleted List does not delete its Tasks.
 *
 * "List 삭제 때문에 자식 Task를 개별 Trash Task로 바꾸지 않는다" — the Tasks
 * disappear from active Scopes because their owner is gone from them, not
 * because anything was written on the Tasks. Restoring the List brings them
 * all back, and the Task Trash Scope stays a list of things the user threw
 * away themselves (§13.25).
 */
export function trashList(lists: List[], listId: string, now: string): List[] {
  const list = lists.find((item) => item.id === listId);
  if (!list || list.kind === "inbox" || list.deletedAt) return lists;
  return patchList(lists, listId, { deletedAt: now, archivedAt: undefined }, now);
}

export function restoreList(lists: List[], listId: string, now: string): List[] {
  const list = lists.find((item) => item.id === listId);
  if (!list || isLive(list)) return lists;
  return patchList(lists, listId, { archivedAt: undefined, deletedAt: undefined }, now);
}

/**
 * §6.56's one permitted hard cascade, and the reason it is permitted: the
 * user asked for this from a surface that spelled out what it would take.
 *
 * Only a List already in the deleted state can be permanently deleted — the
 * two-step is the guard, so nothing reaches this from a single click. The
 * Tasks go with it because leaving them would be Gate 9's first line failing
 * in the other direction: rows owned by a List that no longer exists.
 */
export function permanentlyDeleteList(
  lists: List[],
  tasks: Task[],
  listId: string,
): { lists: List[]; tasks: Task[]; done: boolean } {
  const list = lists.find((item) => item.id === listId);
  if (!list || !list.deletedAt) return { lists, tasks, done: false };
  return {
    lists: lists.filter((item) => item.id !== listId),
    tasks: tasks.filter((task) => task.listId !== listId),
    done: true,
  };
}

// === Projects (§13.26-§13.29) ===

function patchProject(projects: Project[], projectId: string, patch: Partial<Project>, now: string): Project[] {
  let touched = false;
  const next = projects.map((project) => {
    if (project.id !== projectId) return project;
    touched = true;
    return { ...project, ...patch, updatedAt: now };
  });
  return touched ? next : projects;
}

/** §13.27. The Lists keep their `projectId` and keep working in the Tasks Module. */
export function archiveProject(projects: Project[], projectId: string, now: string): Project[] {
  const project = projects.find((item) => item.id === projectId);
  if (!project || project.archivedAt) return projects;
  return patchProject(projects, projectId, { archivedAt: now, deletedAt: undefined }, now);
}

/**
 * §13.28. The relation is kept precisely so restore needs no backfill —
 * "List relation을 다시 backfill할 필요가 없다".
 */
export function trashProject(projects: Project[], projectId: string, now: string): Project[] {
  const project = projects.find((item) => item.id === projectId);
  if (!project || project.deletedAt) return projects;
  return patchProject(projects, projectId, { deletedAt: now, archivedAt: undefined }, now);
}

export function restoreProject(projects: Project[], projectId: string, now: string): Project[] {
  const project = projects.find((item) => item.id === projectId);
  if (!project || isLive(project)) return projects;
  return patchProject(projects, projectId, { archivedAt: undefined, deletedAt: undefined }, now);
}

/**
 * §13.29, and Gate 9's fourth line. One atomic step, and it is NOT a cascade:
 *
 *   1. every linked List becomes standalone
 *   2. the Project row goes
 *
 * The Lists survive as Lists belonging to no Project (§6.3), and every Task
 * under them is untouched. Deleting the work needs a separate, explicit List
 * delete — which is the point: a Project is a grouping, and losing a grouping
 * must not look like losing what it grouped.
 */
export function permanentlyDeleteProject(
  projects: Project[],
  lists: List[],
  projectId: string,
  now: string,
): { projects: Project[]; lists: List[]; done: boolean } {
  const project = projects.find((item) => item.id === projectId);
  if (!project || !project.deletedAt) return { projects, lists, done: false };
  let touched = false;
  const nextLists = lists.map((list) => {
    if (list.projectId !== projectId) return list;
    touched = true;
    // Written here rather than through `patchList`, which pins `projectId` on
    // purpose — moving a List between Projects would strand what is in it, so
    // it refuses. This is the one operation that legitimately clears the owner,
    // and it clears the legacy `spaceId` mirror with it: `sanitizeList` reads
    // whichever is set, so leaving the mirror would put the Project back.
    //
    // `""` is this store's `null` for an owner (see types.List.projectId), and
    // `kind` is what keeps a Project-less List through `sanitizeList` at all.
    return { ...list, projectId: "", spaceId: "", kind: list.kind ?? ("regular" as const), updatedAt: now };
  });
  return {
    projects: projects.filter((item) => item.id !== projectId),
    lists: touched ? nextLists : lists,
    done: true,
  };
}

// === Spaces (§13.30-§13.32) ===

export function archiveSpace(spaces: Space[], spaceId: string, now: string): Space[] {
  const space = spaces.find((item) => item.id === spaceId);
  if (!space || space.archivedAt) return spaces;
  return patchSpace(spaces, spaceId, { archivedAt: now, deletedAt: undefined }, now);
}

export function trashSpace(spaces: Space[], spaceId: string, now: string): Space[] {
  const space = spaces.find((item) => item.id === spaceId);
  if (!space || space.deletedAt) return spaces;
  return patchSpace(spaces, spaceId, { deletedAt: now, archivedAt: undefined }, now);
}

export function restoreSpace(spaces: Space[], spaceId: string, now: string): Space[] {
  const space = spaces.find((item) => item.id === spaceId);
  if (!space || isLive(space)) return spaces;
  return patchSpace(spaces, spaceId, { archivedAt: undefined, deletedAt: undefined }, now);
}

/**
 * §13.32: blocked while any Project still names this Space.
 *
 * Not "moved somewhere sensible" — §6.59 refuses that explicitly. A Project
 * relocated by the app is a Project the user has to go and find, and the
 * alternative to blocking is either that or a silent cascade. Archived and
 * deleted Projects count too: they are recoverable, and a hard delete that
 * stranded them would not be.
 */
export function canPermanentlyDeleteSpace(projects: Project[], spaceId: string): boolean {
  return !projects.some((project) => spaceIdForProject(project) === spaceId);
}

export function permanentlyDeleteSpace(
  spaces: Space[],
  projects: Project[],
  spaceId: string,
): { spaces: Space[]; done: boolean } {
  const space = spaces.find((item) => item.id === spaceId);
  if (!space || !space.deletedAt || !canPermanentlyDeleteSpace(projects, spaceId)) {
    return { spaces, done: false };
  }
  return { spaces: spaces.filter((item) => item.id !== spaceId), done: true };
}

// === surfaces (§13.25) ===

/**
 * The two management lists, which are NOT Scopes.
 *
 * §13.25 is explicit that these do not join §12's registry of nine: a deleted
 * List is not a row in the Task Trash, because the Trash is a list of Tasks
 * the user threw away and mixing containers into it would make "restore"
 * mean two different things on one screen.
 */
export function archivedLists(lists: List[]): List[] {
  return lists.filter((list) => isArchived(list)).sort((a, b) => a.name.localeCompare(b.name));
}

export function deletedLists(lists: List[]): List[] {
  return lists.filter((list) => isDeleted(list)).sort((a, b) => a.name.localeCompare(b.name));
}

/** How much goes with a permanent delete, for the confirmation to say out loud. */
export function taskCountInList(tasks: Task[], listId: string): number {
  return tasks.filter((task) => task.listId === listId && !task.parentTaskId).length;
}
