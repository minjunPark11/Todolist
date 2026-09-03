// The Tasks sidebar's own grouping of Lists (TickTick plan §6.33-§6.35, D18).
//
// The domain already has a Folder — a level inside a Project, part of the
// `Space > Project > Folder > List` ladder. The plan does not reuse it, and
// §6.36's reasoning is worth keeping in view: the ladder answers where a List
// BELONGS, while the sidebar answers where the user wants to SEE it, and one
// user's "Personal" group happily spans two Projects.
//
// So a SidebarFolder groups Lists (§6.35 — never Tasks) and owns nothing.
// Moving a List into one writes `sidebarFolderId` on that List and touches
// neither the Project nor anything below it (D19), which is why this is a
// presentation record and not a hierarchy change.
import type { List, SidebarFolder } from "../../types";

export function sanitizeSidebarFolder(value: unknown): SidebarFolder | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  // A group with no name is one the user cannot tell from any other.
  if (!id || !name) return null;
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : "";
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : "";
  return {
    ...(record as Partial<SidebarFolder>), // M0 passthrough
    id,
    name,
    sortKey: typeof record.sortKey === "number" && Number.isFinite(record.sortKey) ? record.sortKey : undefined,
    createdAt: createdAt || updatedAt,
    updatedAt: updatedAt || createdAt,
  };
}

/**
 * Which group a List appears under, as one answer (§12.4).
 *
 * The sidebar and the `folder` Scope must agree about this or a group would
 * show a different set from the Scope its own header opens — so both read
 * here. A List the user has placed answers with that placement; every other
 * List still answers with the domain Folder it has always hung under, which
 * is what keeps this change invisible until someone moves something.
 */
export function folderIdFor(list: Pick<List, "sidebarFolderId" | "folderId">): string {
  return list.sidebarFolderId?.trim() || list.folderId?.trim() || "";
}

export function activeSidebarFolders(folders: SidebarFolder[]): SidebarFolder[] {
  return [...folders].sort((a, b) => (a.sortKey ?? 0) - (b.sortKey ?? 0) || a.name.localeCompare(b.name));
}

/**
 * The Lists shown under one group, in sidebar order.
 *
 * The ONE answer to "in what order are the Lists of this Folder"
 * (FOLDER_TREE_AND_VIEW_DESIGN.md §5.2). There were three: the sidebar did not
 * sort at all, the Board sorted by `groupRank("list")` — `order` then name —
 * and this function, which nothing called. Three answers were invisible only
 * because the list view had no groups to disagree with the Board's columns;
 * the moment it has them, the same Folder would read in two orders on two
 * views of itself.
 *
 * This rule wins because it is the widest: it honours `sidebarSortKey` — what
 * the user arranged — and falls back to `order` and then name, which is
 * exactly what `groupRank` did on its own.
 *
 * Deleted as well as archived. A List in the Trash is not somewhere work can
 * be filed, and the two callers that used to filter for themselves both said
 * so separately.
 */
export function listsInFolder(folderId: string, lists: List[]): List[] {
  return lists
    .filter((list) => !list.archivedAt && !list.deletedAt && folderIdFor(list) === folderId)
    .sort(
      (a, b) =>
        (a.sidebarSortKey ?? a.order) - (b.sidebarSortKey ?? b.order) || a.name.localeCompare(b.name),
    );
}

/**
 * Whether a group's children are folded away
 * (FOLDER_TREE_AND_VIEW_DESIGN.md §13.1).
 *
 * Takes the array rather than the settings record, so this stays a fact about
 * a list of ids and nothing here has to know where they are stored.
 */
export function isFolderCollapsed(collapsed: readonly string[] | undefined, folderId: string): boolean {
  return Boolean(folderId) && (collapsed?.includes(folderId) ?? false);
}

/** The array with this group's fold flipped. */
export function toggleFolderCollapsed(
  collapsed: readonly string[] | undefined,
  folderId: string,
): string[] {
  const current = collapsed ?? [];
  if (!folderId) return [...current];
  return current.includes(folderId)
    ? current.filter((id) => id !== folderId)
    : [...current, folderId];
}

export function addSidebarFolder(
  folders: SidebarFolder[],
  name: string,
  id: string,
  now: string,
): SidebarFolder[] {
  const trimmed = name.trim();
  if (!trimmed) return folders;
  const sortKey = folders.reduce((max, folder) => Math.max(max, folder.sortKey ?? 0), -1) + 1;
  return [...folders, { id, name: trimmed, sortKey, createdAt: now, updatedAt: now }];
}

export function renameSidebarFolder(
  folders: SidebarFolder[],
  folderId: string,
  name: string,
  now: string,
): SidebarFolder[] {
  const trimmed = name.trim();
  if (!trimmed) return folders;
  let changed = false;
  const next = folders.map((folder) => {
    if (folder.id !== folderId || folder.name === trimmed) return folder;
    changed = true;
    return { ...folder, name: trimmed, updatedAt: now };
  });
  return changed ? next : folders;
}

/**
 * §6.57: deleting a group does not delete the Lists in it.
 *
 * The Lists are cleared rather than left pointing at a record that is gone,
 * because a stale `sidebarFolderId` would otherwise mean "grouped nowhere"
 * and hide them from the domain Folder they would otherwise fall back to.
 * That is the one case where removing a group writes to Lists, and it writes
 * only to the ones that were in it.
 */
export function removeSidebarFolder(
  folders: SidebarFolder[],
  lists: List[],
  folderId: string,
  now: string,
): { folders: SidebarFolder[]; lists: List[] } {
  const nextFolders = folders.filter((folder) => folder.id !== folderId);
  let changed = false;
  const nextLists = lists.map((list) => {
    if (list.sidebarFolderId !== folderId) return list;
    changed = true;
    const { sidebarFolderId: _removed, ...rest } = list;
    return { ...rest, updatedAt: now };
  });
  return {
    folders: nextFolders.length === folders.length ? folders : nextFolders,
    lists: changed ? nextLists : lists,
  };
}

/**
 * Put a List in a sidebar group, or take it out of one (`""`).
 *
 * Taking it out removes the field rather than storing an empty string, so the
 * List goes back to answering with its domain Folder instead of reading as
 * "deliberately grouped nowhere".
 */
export function moveListToSidebarFolder(
  lists: List[],
  listId: string,
  folderId: string,
  now: string,
): List[] {
  let changed = false;
  const next = lists.map((list) => {
    if (list.id !== listId) return list;
    const target = folderId.trim();
    if ((list.sidebarFolderId ?? "") === target) return list;
    changed = true;
    if (!target) {
      const { sidebarFolderId: _removed, ...rest } = list;
      return { ...rest, updatedAt: now };
    }
    return { ...list, sidebarFolderId: target, updatedAt: now };
  });
  return changed ? next : lists;
}
