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

/** The app's name for the Inbox, translated at display time like the above. */
export const INBOX_LIST_NAME = "Inbox";

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
  list: Pick<List, "name" | "isDefault" | "kind"> | undefined,
  defaultLabel: string,
  inboxLabel?: string,
): string {
  if (!list) return "";
  // The Inbox's name is the app's and is not the user's to change (§6.7), so
  // it translates unconditionally — there is no "they renamed it" case.
  if (list.kind === "inbox") return inboxLabel ?? list.name;
  return list.isDefault && list.name === DEFAULT_LIST_NAME ? defaultLabel : list.name;
}

const DEFAULT_STATUS_IDS = new Set(DEFAULT_STATUSES.map((status) => status.id));

/**
 * The label to SHOW for a status.
 *
 * Same rule as `listDisplayName`, one axis over: the six defaults carry an
 * English `label` because that is what the app named them, and a column the
 * user added is already in their own words. Translating the first and leaving
 * the second alone is the whole of it.
 *
 * It lives here rather than at each call site because it had already been
 * written twice — the Board and the Project screen's columns each spelled the
 * ternary out — while the List view rendered `status.label` raw. The result
 * was two tabs of one screen disagreeing: a Korean board beside an English
 * "Inbox / To Do / Doing" dropdown.
 *
 * `translate` is passed in so the domain does not reach for the i18n context;
 * the caller holds `t`.
 */
export function statusDisplayLabel(
  status: Pick<Status, "id" | "label">,
  translate: (key: string) => string,
): string {
  return DEFAULT_STATUS_IDS.has(status.id) ? translate(`status.${status.id}`) : status.label;
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
  // Either key names the owning Project. `spaceId` is what every record
  // written before this release carries; `projectId` is what they are read as
  // from here on. Both are emitted — see `List.projectId`.
  const projectId = asString(record.projectId).trim() || asString(record.spaceId).trim();
  // A folder with no owner cannot be shown anywhere; keeping it would leave an
  // invisible record that still syncs.
  if (!id || !projectId) return null;
  const createdAt = asString(record.createdAt);
  const updatedAt = asString(record.updatedAt);
  return {
    ...(record as Partial<Folder>), // M0 passthrough
    id,
    projectId,
    spaceId: projectId,
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
  // Either key names the owning Project; both are written back. A record from
  // before this release has only `spaceId`, and a client from before it drops
  // any List that lacks one, so the mirror is what makes the rename safe.
  const projectId = asString(record.projectId).trim() || asString(record.spaceId).trim();
  // Migration Phase 4 (§6.72). `kind` is what separates a List that MEANS to
  // belong to no Project — the Inbox (§6.5), or a standalone List (§6.3) — from
  // a record that merely lost its owner. The second cannot be reached from
  // anywhere and would sync forever unseen, so it is still dropped; the first
  // is now first-class, where before only the Inbox was let through.
  //
  // The plan asks Phase 4 to relax a `NOT NULL` constraint. There is none to
  // relax: `lists` stores one `data` jsonb per row, so this line IS the
  // constraint, and this is where the relaxing happens.
  const kind = record.kind === "inbox" ? "inbox" : record.kind === "regular" ? "regular" : undefined;
  if (!id || (!projectId && !kind)) return null;
  const statuses = sanitizeStatuses(record.statuses);
  const createdAt = asString(record.createdAt);
  const updatedAt = asString(record.updatedAt);
  return {
    ...(record as Partial<List>), // M0 passthrough
    id,
    projectId,
    spaceId: projectId,
    ...(kind ? { kind } : {}),
    folderId: asString(record.folderId).trim() || undefined,
    name: asString(record.name),
    order: asOrder(record.order),
    isDefault: record.isDefault === true,
    // An override that cannot express "done" is not an override worth keeping;
    // undefined means inherit from the Space, which always has a full set.
    statuses: statuses && hasDoneStatus(statuses) ? statuses : undefined,
    archivedAt: asString(record.archivedAt) || undefined,
    deletedAt: asString(record.deletedAt) || undefined,
    createdAt: createdAt || updatedAt,
    updatedAt: updatedAt || createdAt,
  };
}

// === reads ===

export function activeFolders(folders: Folder[], projectId: string): Folder[] {
  return folders
    .filter((folder) => folder.projectId === projectId && !folder.archivedAt && !folder.deletedAt)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function activeLists(lists: List[], projectId: string): List[] {
  // Lists that belong to no Project store `""`, so an empty argument would
  // gather exactly the ones that are nobody's — the Inbox and every standalone
  // List. §6.79 and §6.80 keep both out of Project and Space queries, and a
  // caller asking "which Lists does this Project have" with no Project has no
  // answer, not that answer.
  if (!projectId) return [];
  return lists
    // §13.19: a List that is archived OR deleted is out of every active query,
    // and so is everything in it — without anything being written on the Tasks.
    .filter((list) => list.projectId === projectId && !list.archivedAt && !list.deletedAt)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/**
 * The Lists that belong to no Project and are not the Inbox (§6.3).
 *
 * They exist in the Tasks Module only. Nothing creates one yet — the screen
 * that would is Implementation Phase 3 (§16.48) — but the domain can hold and
 * round-trip one from here, which is what Migration Phase 4 is for.
 */
export function standaloneLists(lists: List[]): List[] {
  return lists
    .filter((list) => !list.projectId && list.kind !== "inbox" && !list.archivedAt && !list.deletedAt)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** Lists hanging straight off the Space — ClickUp's Folderless Lists (D4). */
export function folderlessLists(lists: List[], spaceId: string): List[] {
  return activeLists(lists, spaceId).filter((list) => !list.folderId);
}

export function listsInFolder(lists: List[], folderId: string): List[] {
  return lists
    .filter((list) => list.folderId === folderId && !list.archivedAt && !list.deletedAt)
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

export function makeDefaultList(id: string, projectId: string, now: string, name = DEFAULT_LIST_NAME): List {
  // Both keys, always: `spaceId` is the mirror an older client reads.
  return { id, projectId, spaceId: projectId, name, order: 0, isDefault: true, createdAt: now, updatedAt: now };
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

/**
 * The one List that belongs to no Project (TickTick plan §6.5, §6.6).
 *
 * Fixed rather than generated, for the same reason `defaultListIdFor` is: a
 * second device running the migration on its own has to arrive at the same
 * row, not a duplicate. It is also what lets the record be rebuilt after an
 * older client drops it for having no `spaceId`.
 */
export const INBOX_LIST_ID = "list-inbox";

export function isInboxList(list: Pick<List, "kind">): boolean {
  return list.kind === "inbox";
}

/**
 * Give the account its Inbox (Migration Phase 2).
 *
 * Returns the SAME array when one already exists, so a load that changes
 * nothing marks nothing dirty. The name is the app's, not the user's (§6.7) —
 * `listDisplayName` is what turns it into the reader's language.
 */
export function ensureInboxList(lists: List[], now: string): List[] {
  if (lists.some((list) => isInboxList(list) || list.id === INBOX_LIST_ID)) return lists;
  return [
    ...lists,
    {
      id: INBOX_LIST_ID,
      // No Project owns the Inbox. Both keys stay empty rather than pointing
      // at a sentinel, which would file it under a Project on any screen that
      // groups by one.
      projectId: "",
      spaceId: "",
      kind: "inbox",
      name: INBOX_LIST_NAME,
      order: -1,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function addList(current: List[], list: List): List[] {
  return [...current, { ...list, order: list.order || nextOrder(activeLists(current, list.projectId)) }];
}

export function addFolder(current: Folder[], folder: Folder): Folder[] {
  return [...current, { ...folder, order: folder.order || nextOrder(activeFolders(current, folder.projectId)) }];
}

export function patchList(current: List[], listId: string, patch: Partial<List>, now: string): List[] {
  let touched = false;
  const next = current.map((list) => {
    if (list.id !== listId) return list;
    touched = true;
    // id/spaceId are identity: moving a List between Spaces would strand every
    // Item in it, so that is a separate operation, not a field edit.
    return { ...list, ...patch, id: list.id, projectId: list.projectId, spaceId: list.projectId, updatedAt: now };
  });
  return touched ? next : current;
}

export function patchFolder(current: Folder[], folderId: string, patch: Partial<Folder>, now: string): Folder[] {
  let touched = false;
  const next = current.map((folder) => {
    if (folder.id !== folderId) return folder;
    touched = true;
    return { ...folder, ...patch, id: folder.id, projectId: folder.projectId, spaceId: folder.projectId, updatedAt: now };
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
    if (!folder || folder.projectId !== list.projectId) return current;
  }
  if ((list.folderId ?? undefined) === folderId) return current;
  return patchList(current, listId, { folderId }, now);
}
