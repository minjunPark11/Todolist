// Space -> Folder? -> List (SPACES_CLICKUP_REDESIGN.md §4, D4/D5/D7).
//
// Pure: no React, no storage. Reducers return the SAME array when nothing
// changed and spread only the record they touch, because diffChangedRecords
// decides what to upload by object identity (buildSyncPlan.ts:67-70).
//
// Nothing here reads Task or Project. Attaching Items to Lists is P4, and it
// waits on M0 reaching users — a new field on an existing synced record is
// erased by any client that predates it, while these brand-new collections
// are invisible to one.
import type { Folder, List, Status, StatusGroup } from "../../types";

export const STATUS_GROUPS: StatusGroup[] = ["notStarted", "active", "done", "closed"];

/**
 * The set a Space starts with (§5 M2).
 *
 * Every id is exactly a `TaskStatus` value, and that is load-bearing rather
 * than tidy: while a Space still uses these defaults, a task's status id IS
 * its status, so nothing has to be written to every task to migrate it. Only
 * a task moved onto a status the user invented needs a stored `statusId`.
 * `statusIdFor` in ./membership depends on this holding, and a test asserts
 * the two lists stay in step.
 */
export const DEFAULT_STATUSES: Status[] = [
  { id: "inbox", label: "Inbox", color: "#8e8e93", order: 0, group: "notStarted" },
  { id: "todo", label: "To Do", color: "#0066cc", order: 1, group: "active" },
  { id: "doing", label: "Doing", color: "#5856d6", order: 2, group: "active" },
  { id: "waiting", label: "Waiting", color: "#ff9500", order: 3, group: "active" },
  { id: "done", label: "Done", color: "#34c759", order: 4, group: "done" },
  { id: "archived", label: "Archived", color: "#8e8e93", order: 5, group: "closed" },
];

export const DEFAULT_LIST_NAME = "Tasks";

/**
 * The name to SHOW for a List.
 *
 * `DEFAULT_LIST_NAME` is the app's word, not the user's: `makeDefaultList`
 * stamps it on every Project at creation, in English, whatever language the
 * app is running in. A Korean sidebar read "작업 / Tasks / 디자인 검토" — two
 * of the user's names and one of ours.
 *
 * Translating it here is the rule the Board already applies to statuses: a
 * default has a translation, and a name the user chose is already in their own
 * words and must not be overwritten by one (see BoardPage's column labels).
 * The label arrives as an argument because the domain does not read the i18n
 * context — the caller holds `t`.
 *
 * Keyed on the stored name as well as `isDefault`, so a user who renamed their
 * default List keeps the name they gave it.
 */
export function listDisplayName(
  list: Pick<List, "name" | "isDefault"> | undefined,
  defaultLabel: string,
): string {
  if (!list) return "";
  return list.isDefault && list.name === DEFAULT_LIST_NAME ? defaultLabel : list.name;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asOrder(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function sanitizeStatus(value: unknown): Status | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = asString(record.id).trim();
  if (!id) return null;
  const group = STATUS_GROUPS.includes(record.group as StatusGroup)
    ? (record.group as StatusGroup)
    : "active";
  return {
    ...(record as Partial<Status>), // M0 passthrough
    id,
    label: asString(record.label) || id,
    color: asString(record.color) || "#8e8e93",
    order: asOrder(record.order),
    group,
  };
}

function sanitizeStatuses(value: unknown): Status[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const statuses = value
    .map(sanitizeStatus)
    .filter((status): status is Status => status !== null)
    .sort((a, b) => a.order - b.order);
  return statuses.length > 0 ? statuses : undefined;
}

/**
 * A status set is only usable if the app can still tell what "finished" means.
 * Dropping the last `done` status would make completion unrepresentable, so a
 * set without one is refused and the caller falls back to inheritance.
 */
export function hasDoneStatus(statuses: Status[]): boolean {
  return statuses.some((status) => status.group === "done");
}

export function sanitizeFolder(value: unknown): Folder | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = asString(record.id).trim();
  const spaceId = asString(record.spaceId).trim();
  // A folder with no space cannot be shown anywhere; keeping it would leave an
  // invisible record that still syncs.
  if (!id || !spaceId) return null;
  const createdAt = asString(record.createdAt);
  const updatedAt = asString(record.updatedAt);
  return {
    ...(record as Partial<Folder>), // M0 passthrough
    id,
    spaceId,
    name: asString(record.name),
    order: asOrder(record.order),
    archivedAt: asString(record.archivedAt) || undefined,
    createdAt: createdAt || updatedAt,
    updatedAt: updatedAt || createdAt,
  };
}

export function sanitizeList(value: unknown): List | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = asString(record.id).trim();
  const spaceId = asString(record.spaceId).trim();
  if (!id || !spaceId) return null;
  const statuses = sanitizeStatuses(record.statuses);
  const createdAt = asString(record.createdAt);
  const updatedAt = asString(record.updatedAt);
  return {
    ...(record as Partial<List>), // M0 passthrough
    id,
    spaceId,
    folderId: asString(record.folderId).trim() || undefined,
    name: asString(record.name),
    order: asOrder(record.order),
    isDefault: record.isDefault === true,
    // An override that cannot express "done" is not an override worth keeping;
    // undefined means inherit from the Space, which always has a full set.
    statuses: statuses && hasDoneStatus(statuses) ? statuses : undefined,
    archivedAt: asString(record.archivedAt) || undefined,
    createdAt: createdAt || updatedAt,
    updatedAt: updatedAt || createdAt,
  };
}

// === reads ===

export function activeFolders(folders: Folder[], spaceId: string): Folder[] {
  return folders
    .filter((folder) => folder.spaceId === spaceId && !folder.archivedAt)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function activeLists(lists: List[], spaceId: string): List[] {
  return lists
    .filter((list) => list.spaceId === spaceId && !list.archivedAt)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** Lists hanging straight off the Space — ClickUp's Folderless Lists (D4). */
export function folderlessLists(lists: List[], spaceId: string): List[] {
  return activeLists(lists, spaceId).filter((list) => !list.folderId);
}

export function listsInFolder(lists: List[], folderId: string): List[] {
  return lists
    .filter((list) => list.folderId === folderId && !list.archivedAt)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function defaultListFor(lists: List[], spaceId: string): List | undefined {
  const active = activeLists(lists, spaceId);
  return active.find((list) => list.isDefault) ?? active[0];
}

/**
 * Whether the tree should show the List level for this Space.
 *
 * The caller passes the Space's stored `listsRevealed` flag, which is one-way:
 * once a second List has existed the level keeps showing even if the count
 * drops back to one (U2). Re-deciding from the count alone would make a whole
 * tree level vanish when someone merely deleted a list.
 */
export function shouldRevealLists(lists: List[], spaceId: string, revealed?: boolean): boolean {
  return revealed === true || activeLists(lists, spaceId).length > 1;
}

/** Resolved per D7: the List's own set when it has one, else the Space's. */
export function statusesFor(list: List | undefined, spaceStatuses: Status[]): Status[] {
  if (list?.statuses && list.statuses.length > 0) return list.statuses;
  return spaceStatuses;
}

// === writes ===

function nextOrder(items: Array<{ order: number }>): number {
  return items.reduce((max, item) => Math.max(max, item.order), -1) + 1;
}

export function makeDefaultList(id: string, spaceId: string, now: string, name = DEFAULT_LIST_NAME): List {
  return { id, spaceId, name, order: 0, isDefault: true, createdAt: now, updatedAt: now };
}

/**
 * Give every Space a default List (D5). Returns the SAME array when there is
 * nothing to add, so a load that changes nothing marks nothing dirty.
 *
 * Ids are derived from the Space id rather than generated, so a second run —
 * a device whose first save failed, or another device migrating on its own —
 * produces the same record instead of a duplicate.
 */
export function ensureDefaultLists(
  spaceIds: string[],
  lists: List[],
  now: string,
  idFor: (spaceId: string) => string,
): List[] {
  const added: List[] = [];
  for (const spaceId of spaceIds) {
    if (!spaceId) continue;
    if (defaultListFor(lists, spaceId)) continue;
    const id = idFor(spaceId);
    if (lists.some((list) => list.id === id) || added.some((list) => list.id === id)) continue;
    added.push(makeDefaultList(id, spaceId, now));
  }
  return added.length > 0 ? [...lists, ...added] : lists;
}

export function addList(current: List[], list: List): List[] {
  return [...current, { ...list, order: list.order || nextOrder(activeLists(current, list.spaceId)) }];
}

export function addFolder(current: Folder[], folder: Folder): Folder[] {
  return [...current, { ...folder, order: folder.order || nextOrder(activeFolders(current, folder.spaceId)) }];
}

export function patchList(current: List[], listId: string, patch: Partial<List>, now: string): List[] {
  let touched = false;
  const next = current.map((list) => {
    if (list.id !== listId) return list;
    touched = true;
    // id/spaceId are identity: moving a List between Spaces would strand every
    // Item in it, so that is a separate operation, not a field edit.
    return { ...list, ...patch, id: list.id, spaceId: list.spaceId, updatedAt: now };
  });
  return touched ? next : current;
}

export function patchFolder(current: Folder[], folderId: string, patch: Partial<Folder>, now: string): Folder[] {
  let touched = false;
  const next = current.map((folder) => {
    if (folder.id !== folderId) return folder;
    touched = true;
    return { ...folder, ...patch, id: folder.id, spaceId: folder.spaceId, updatedAt: now };
  });
  return touched ? next : current;
}

/**
 * Archiving, not deleting: the default List is the floor an Item falls back to
 * (D5), so removing it would leave Items pointing at nothing. Refused rather
 * than silently ignored so a caller cannot believe it worked.
 */
export function archiveList(current: List[], listId: string, now: string): List[] {
  const list = current.find((item) => item.id === listId);
  if (!list || list.isDefault || list.archivedAt) return current;
  return patchList(current, listId, { archivedAt: now }, now);
}

/**
 * Archiving a Folder does not archive what is inside it — the Lists move up to
 * sit directly under the Space. Losing a grouping should not look like losing
 * the work it grouped.
 */
export function archiveFolder(folders: Folder[], lists: List[], folderId: string, now: string) {
  const folder = folders.find((item) => item.id === folderId);
  if (!folder || folder.archivedAt) return { folders, lists };
  let nextLists = lists;
  for (const list of listsInFolder(lists, folderId)) {
    nextLists = patchList(nextLists, list.id, { folderId: undefined }, now);
  }
  return { folders: patchFolder(folders, folderId, { archivedAt: now }, now), lists: nextLists };
}

/** Moving a List between Folders is only legal inside its own Space. */
export function moveListToFolder(
  current: List[],
  listId: string,
  folderId: string | undefined,
  folders: Folder[],
  now: string,
): List[] {
  const list = current.find((item) => item.id === listId);
  if (!list) return current;
  if (folderId) {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder || folder.spaceId !== list.spaceId) return current;
  }
  if ((list.folderId ?? undefined) === folderId) return current;
  return patchList(current, listId, { folderId }, now);
}
