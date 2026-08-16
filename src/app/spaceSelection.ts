// Where in the Space tree the user is standing, carried in the URL
// (SPACES_CLICKUP_UI_DESIGN U3).
//
// It replaces the two flat booleans the design document diagnosed —
// `selectedProjectId` + `isProjectDetailOpen` — which could say "a Space is
// open" but not which List inside it, and which lived only in memory, so a
// reload lost the place. The path is the state; nothing mirrors it.
//
// All three levels of U3 now resolve to a real scope: `ViewFilter` gained
// `folderId`, so a Folder route narrows to the Lists inside it rather than
// landing on the same screen as its parent.

export type Selection =
  | { kind: "none" }
  | { kind: "space"; spaceId: string }
  | { kind: "folder"; spaceId: string; folderId: string }
  | { kind: "list"; spaceId: string; listId: string };

export const NO_SELECTION: Selection = { kind: "none" };

/**
 * `/s/:spaceId`, `/s/:spaceId/f/:folderId`, `/s/:spaceId/l/:listId`; anything
 * else selects nothing. A tail that names neither falls back to the Space
 * rather than to nothing, so a truncated link still lands somewhere real.
 */
export function parseSelection(path: string): Selection {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "s" || !parts[1]) return NO_SELECTION;
  const spaceId = decodeURIComponent(parts[1]);
  if (parts[2] === "l" && parts[3]) {
    return { kind: "list", spaceId, listId: decodeURIComponent(parts[3]) };
  }
  if (parts[2] === "f" && parts[3]) {
    return { kind: "folder", spaceId, folderId: decodeURIComponent(parts[3]) };
  }
  return { kind: "space", spaceId };
}

export function pathForSelection(selection: Selection): string {
  if (selection.kind === "none") return "/app";
  const base = `/s/${encodeURIComponent(selection.spaceId)}`;
  if (selection.kind === "list") return `${base}/l/${encodeURIComponent(selection.listId)}`;
  if (selection.kind === "folder") return `${base}/f/${encodeURIComponent(selection.folderId)}`;
  return base;
}

export function selectedFolderId(selection: Selection): string {
  return selection.kind === "folder" ? selection.folderId : "";
}

/**
 * What a selection means as a view scope (§16). The same three levels the
 * filter language already had words for — this only says which one is active.
 */
export function filterForSelection(selection: Selection): {
  spaceId?: string;
  folderId?: string;
  listId?: string;
} {
  switch (selection.kind) {
    case "list":
      return { listId: selection.listId };
    case "folder":
      return { folderId: selection.folderId };
    case "space":
      return { spaceId: selection.spaceId };
    default:
      return {};
  }
}

export function selectedSpaceId(selection: Selection): string {
  return selection.kind === "none" ? "" : selection.spaceId;
}

export function selectedListId(selection: Selection): string {
  return selection.kind === "list" ? selection.listId : "";
}

/**
 * True when the tree should draw this row as the current one. A selected List
 * does NOT light its Space up as well: two highlighted rows read as two
 * places, and the branch already shows where the list hangs from.
 */
export function isSelected(selection: Selection, row: Selection): boolean {
  if (selection.kind !== row.kind) return false;
  return pathForSelection(selection) === pathForSelection(row);
}
