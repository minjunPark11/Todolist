// Global search over everything the Tasks Module can name
// (TickTick plan §10.9-§10.30, Implementation Phase 8 §16.31).
//
// §10.1 splits the palette in two: search asks WHAT you are looking for,
// commands ask WHAT you want to run. This module is only the first half, and
// it deliberately answers with records rather than with URLs — where a result
// lives is the address bar's question (app/taskScopeUrl), and a domain module
// that built paths would have to know about routes it cannot see.
//
// Results are grouped by type and never flattened into one list (§10.10).
// A user scanning results has to be able to tell a List from a Task without
// reading the row twice, and one mixed list makes that impossible.
import type { Folder, List, Project, SavedFilter, SidebarFolder, Space, Tag, Task } from "../../types";
import { listIdFor } from "../spaces/membership";
import { isInboxList } from "../spaces/hierarchy";

/** §10.11's group order. Fixed rather than adaptive — MVP predictability. */
export const SEARCH_KINDS = ["task", "list", "tag", "filter", "folder", "project", "space"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

/**
 * §10.49's per-group caps.
 *
 * Not one number for everything: the palette exists to get somewhere fast, and
 * five tasks with three of each container is what fits before the list stops
 * being scannable. The Search Page is where "all of them" lives, which is why
 * the cap here is not a loss.
 */
export const PALETTE_LIMITS: Record<SearchKind, number> = {
  task: 5,
  list: 3,
  tag: 3,
  filter: 3,
  folder: 3,
  project: 3,
  space: 3,
};

/** No cap worth the name — the Search Page shows what it found (§10.20). */
export const PAGE_LIMITS: Record<SearchKind, number> = {
  task: 50,
  list: 50,
  tag: 50,
  filter: 50,
  folder: 50,
  project: 50,
  space: 50,
};

export interface SearchResult {
  kind: SearchKind;
  id: string;
  title: string;
  /** The List a Task is in, the Project a List belongs to, and so on (§10.12). */
  subtitle?: string;
  /**
   * For a Task: the List that owns it, already resolved.
   *
   * §10.17 opens a Task at its own canonical Scope, which means the URL has to
   * know the owner. Membership was resolved here to write the subtitle, so
   * carrying the id costs nothing and saves the address bar from resolving it
   * a second time — and from doing it differently.
   */
  ownerListId?: string;
  /** §10.29: shown as finished rather than hidden, and ranked below. */
  completed?: boolean;
}

export interface SearchGroup {
  kind: SearchKind;
  results: SearchResult[];
}

export interface SearchCollections {
  tasks: Task[];
  lists: List[];
  folders: Folder[];
  sidebarFolders: SidebarFolder[];
  tags: Tag[];
  savedFilters: SavedFilter[];
  /** §10.16. Above the Tasks Module, and shown as their own kinds so they are
      not mistaken for its Lists. */
  projects: Project[];
  spaces: Space[];
}

/**
 * §10.25's ranking, as far as the MVP goes.
 *
 * Exact, then prefix, then substring — and nothing at all when the text does
 * not contain the query. Fuzzy matching and Korean 초성 are §10.26/§10.27 and
 * explicitly P1: a wrong result ranked cleverly is still a wrong result, and
 * the failure mode of substring matching is one a user can predict.
 */
export function matchRank(text: string, query: string): number | null {
  const haystack = text.trim().toLowerCase();
  const needle = query.trim().toLowerCase();
  if (!needle || !haystack) return null;
  if (haystack === needle) return 0;
  if (haystack.startsWith(needle)) return 1;
  return haystack.includes(needle) ? 2 : null;
}

/** The name a List answers to in results — the Inbox by its own word (§6.7). */
function listName(list: List, inboxName: string): string {
  return isInboxList(list) ? inboxName : list.name;
}

/**
 * Everything matching `query`, grouped by type (§10.10).
 *
 * Two exclusions, both from the plan rather than from taste:
 *
 *   - Trash is out (§10.30). A deleted Task answering a global search would
 *     put the user back in front of something they threw away, and Gate 8
 *     names this specifically.
 *   - A subtask is not a row of its own here, for the same reason it is not a
 *     row in any Scope: it is shown inside its parent.
 *
 * Completed Tasks stay in, marked and ranked below the unfinished ones
 * (§10.29) — searching for something you finished last week is a normal thing
 * to do, and hiding it looks like data loss.
 */
export function searchAll(
  query: string,
  collections: SearchCollections,
  labels: { inbox: string; defaultList: string },
  limits: Record<SearchKind, number> = PALETTE_LIMITS,
): SearchGroup[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const byId = new Map(collections.lists.map((list) => [list.id, list]));
  const groups: SearchGroup[] = [];

  const tasks: Array<SearchResult & { rank: number }> = [];
  for (const task of collections.tasks) {
    if (task.deletedAt || task.parentTaskId) continue;
    const rank = matchRank(task.title, trimmed);
    if (rank === null) continue;
    const owner = byId.get(listIdFor(task, collections.lists));
    const completed = task.status === "done";
    tasks.push({
      kind: "task",
      id: task.id,
      title: task.title,
      subtitle: owner ? listName(owner, labels.inbox) : labels.defaultList,
      ownerListId: owner?.id ?? "",
      completed,
      // §10.29: finished work sorts below unfinished work of the same rank.
      rank: rank + (completed ? 10 : 0),
    });
  }
  push(groups, "task", tasks, limits);

  const lists: Array<SearchResult & { rank: number }> = [];
  for (const list of collections.lists) {
    if (list.archivedAt) continue;
    const name = listName(list, labels.inbox);
    const rank = matchRank(name, trimmed);
    if (rank === null) continue;
    lists.push({ kind: "list", id: list.id, title: name, rank });
  }
  push(groups, "list", lists, limits);

  const tags: Array<SearchResult & { rank: number }> = [];
  for (const tag of collections.tags) {
    if (tag.archivedAt) continue;
    const rank = matchRank(tag.name, trimmed);
    if (rank !== null) tags.push({ kind: "tag", id: tag.id, title: tag.name, rank });
  }
  push(groups, "tag", tags, limits);

  const filters: Array<SearchResult & { rank: number }> = [];
  for (const filter of collections.savedFilters) {
    const rank = matchRank(filter.name, trimmed);
    if (rank !== null) filters.push({ kind: "filter", id: filter.id, title: filter.name, rank });
  }
  push(groups, "filter", filters, limits);

  // Both kinds of group, because the sidebar shows both under one heading and
  // `folderIdFor` gives them one Scope (§6.36).
  const folders: Array<SearchResult & { rank: number }> = [];
  for (const folder of collections.sidebarFolders) {
    const rank = matchRank(folder.name, trimmed);
    if (rank !== null) folders.push({ kind: "folder", id: folder.id, title: folder.name, rank });
  }
  for (const folder of collections.folders) {
    if (folder.archivedAt) continue;
    const rank = matchRank(folder.name, trimmed);
    if (rank !== null) folders.push({ kind: "folder", id: folder.id, title: folder.name, rank });
  }
  push(groups, "folder", folders, limits);

  // §10.16: a Project and a Space are not Lists, and the groups they appear
  // under are what keeps them from reading as one. Their destinations are in
  // the Spaces routes, which is the caller's business — this only says which
  // record matched.
  const projects: Array<SearchResult & { rank: number }> = [];
  for (const project of collections.projects) {
    if (project.archivedAt) continue;
    const rank = matchRank(project.name, trimmed);
    if (rank !== null) projects.push({ kind: "project", id: project.id, title: project.name, rank });
  }
  push(groups, "project", projects, limits);

  const spaces: Array<SearchResult & { rank: number }> = [];
  for (const space of collections.spaces) {
    if (space.archivedAt) continue;
    const rank = matchRank(space.name, trimmed);
    if (rank !== null) spaces.push({ kind: "space", id: space.id, title: space.name, rank });
  }
  push(groups, "space", spaces, limits);

  return groups;
}

function push(
  groups: SearchGroup[],
  kind: SearchKind,
  results: Array<SearchResult & { rank: number }>,
  limits: Record<SearchKind, number>,
): void {
  if (results.length === 0) return;
  const ordered = results
    .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title))
    // §10.49: a long list is cut rather than scrolled forever. The Search Page
    // is where "all of them" lives.
    .slice(0, limits[kind])
    .map(({ rank: _rank, ...result }) => result);
  groups.push({ kind, results: ordered });
}

/** Every result in group order, which is also the keyboard order (§10.37). */
export function flattenGroups(groups: SearchGroup[]): SearchResult[] {
  return groups.flatMap((group) => group.results);
}
