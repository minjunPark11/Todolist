// Where in the tree the user is standing, carried in the URL
// (SPACES_REDESIGN_II §31-§35, SPACES_CLICKUP_UI_DESIGN U3).
//
// It replaced two flat booleans — `selectedProjectId` + `isProjectDetailOpen` —
// which could say "something is open" but not which List inside it, and lived
// only in memory, so a reload lost the place. The path is the state; nothing
// mirrors it.
//
// STEP 6 changes what the first segment MEANS. It used to hold a Project id
// under the name `spaceId`, because a Project was the top of the tree. Now
// there is a real Space above it (§30), and the two are different records:
//
//     old   /s/:projectId              /s/:projectId/f/:folderId
//     new   /s/:spaceId/p/:projectId   /s/:spaceId/p/:projectId/f/:folderId
//
// Reading an old link as a new one would resolve a Project id against the
// Space collection and land nowhere, so old links are recognised and upgraded
// rather than reinterpreted (§33).
import type { Project, Space } from "../types";
import { spaceIdForProject } from "../domain/spaces/spaces";

/**
 * Every level of §18, with its ancestors carried.
 *
 * The ancestors ride along so the tree can open the right branch without
 * looking anything up, and so a Folder route narrows to the Lists inside it
 * rather than landing on the same screen as its parent.
 *
 * `spaceId` is "" only between parsing a legacy path and resolving it
 * (`resolveSelection`). Nothing else may produce that state.
 */
export type Selection =
  | { kind: "none" }
  | { kind: "space"; spaceId: string }
  | { kind: "project"; spaceId: string; projectId: string }
  | { kind: "folder"; spaceId: string; projectId: string; folderId: string }
  | { kind: "list"; spaceId: string; projectId: string; listId: string };

export const NO_SELECTION: Selection = { kind: "none" };

function decode(part: string | undefined): string {
  return part ? decodeURIComponent(part) : "";
}

/**
 * Syntactic only — no record is looked up here, so this stays pure and a
 * component can call it during render.
 *
 * Two of the three legacy shapes are recognisable from the path alone: the old
 * routes put `f`/`l` straight after the first id, where the new ones require
 * `p` first. Those parse with an empty `spaceId`, which is the marker that
 * `resolveSelection` has work to do.
 *
 * `/s/:id` is genuinely ambiguous — it is a Space in the new scheme and a
 * Project in the old one — so it parses as a Space and the resolver decides,
 * because only the collections can say which record that id names.
 *
 * A tail that names nothing falls back to the nearest real ancestor rather
 * than to nothing, so a truncated link still lands somewhere.
 */
export function parseSelection(path: string): Selection {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "s" || !parts[1]) return NO_SELECTION;
  const first = decode(parts[1]);

  // Legacy: /s/:projectId/f/:folderId and /s/:projectId/l/:listId.
  if (parts[2] === "f" && parts[3]) {
    return { kind: "folder", spaceId: "", projectId: first, folderId: decode(parts[3]) };
  }
  if (parts[2] === "l" && parts[3]) {
    return { kind: "list", spaceId: "", projectId: first, listId: decode(parts[3]) };
  }

  if (parts[2] === "p" && parts[3]) {
    const projectId = decode(parts[3]);
    if (parts[4] === "f" && parts[5]) {
      return { kind: "folder", spaceId: first, projectId, folderId: decode(parts[5]) };
    }
    if (parts[4] === "l" && parts[5]) {
      return { kind: "list", spaceId: first, projectId, listId: decode(parts[5]) };
    }
    return { kind: "project", spaceId: first, projectId };
  }

  return { kind: "space", spaceId: first };
}

/**
 * Fills in what only the collections can answer (§33).
 *
 * Two jobs, and both are UPGRADES — this never discards a selection. During
 * the first render the collections are empty, and a resolver that answered
 * "nothing" would drop the deep link the user just followed; instead the
 * selection stays as parsed and resolves when the data arrives.
 *
 *   1. `/s/:id` names a Space if the account has one, and otherwise a Project
 *      from an old link, which becomes `{ project, spaceId, projectId }`.
 *   2. A legacy Folder/List path has no Space in it; the Project supplies one.
 */
export function resolveSelection(
  selection: Selection,
  records: { spaces: Space[]; projects: Project[] },
): Selection {
  if (selection.kind === "none") return selection;

  if (selection.kind === "space") {
    if (records.spaces.some((space) => space.id === selection.spaceId)) return selection;
    const project = records.projects.find((item) => item.id === selection.spaceId);
    if (!project) return selection;
    return { kind: "project", spaceId: spaceIdForProject(project), projectId: project.id };
  }

  if (selection.spaceId) return selection;
  const project = records.projects.find((item) => item.id === selection.projectId);
  if (!project) return selection;
  return { ...selection, spaceId: spaceIdForProject(project) };
}

export function pathForSelection(selection: Selection): string {
  if (selection.kind === "none") return "/app";
  const space = `/s/${encodeURIComponent(selection.spaceId)}`;
  if (selection.kind === "space") return space;
  const project = `${space}/p/${encodeURIComponent(selection.projectId)}`;
  if (selection.kind === "folder") return `${project}/f/${encodeURIComponent(selection.folderId)}`;
  if (selection.kind === "list") return `${project}/l/${encodeURIComponent(selection.listId)}`;
  return project;
}

// === readers ===

export function selectedSpaceId(selection: Selection): string {
  return selection.kind === "none" ? "" : selection.spaceId;
}

/** "" at the Space level, which is above any Project. */
export function selectedProjectId(selection: Selection): string {
  return selection.kind === "none" || selection.kind === "space" ? "" : selection.projectId;
}

export function selectedFolderId(selection: Selection): string {
  return selection.kind === "folder" ? selection.folderId : "";
}

export function selectedListId(selection: Selection): string {
  return selection.kind === "list" ? selection.listId : "";
}

/**
 * The Scope Resolver (§17): where the user is standing, as the set of Items
 * that place contains.
 *
 * Each level names exactly ONE field, and the tightest one is the whole
 * answer — a Folder view is not silently also a Project view. That is what
 * lets every view share one query instead of writing its own (§44): the
 * screen picks a layout, this picks the records.
 *
 * A Space narrows to `spaceId`, which every Item resolves through its Project
 * (`Item.spaceId`). Nothing walks the tree here, and no Item stores its Space:
 * moving a Project between Spaces stays one row (H-INV-05, §43).
 */
export function filterForSelection(selection: Selection): {
  spaceId?: string;
  projectId?: string;
  folderId?: string;
  listId?: string;
} {
  switch (selection.kind) {
    case "list":
      return { listId: selection.listId };
    case "folder":
      return { folderId: selection.folderId };
    case "project":
      return { projectId: selection.projectId };
    case "space":
      return { spaceId: selection.spaceId };
    default:
      return {};
  }
}

/**
 * True when the tree should draw this row as the current one.
 *
 * A selected List does NOT light its Project or Space as well: two highlighted
 * rows read as two places, and the branch already shows where the list hangs
 * from. Compared field by field rather than through `pathForSelection`, so an
 * unresolved legacy selection cannot match a resolved row by accident.
 */
export function isSelected(selection: Selection, row: Selection): boolean {
  if (selection.kind !== row.kind) return false;
  switch (selection.kind) {
    case "none":
      return true;
    case "space":
      return selection.spaceId === (row as { spaceId: string }).spaceId;
    case "project":
      return selection.projectId === (row as { projectId: string }).projectId;
    case "folder":
      return selection.folderId === (row as { folderId: string }).folderId;
    case "list":
      return selection.listId === (row as { listId: string }).listId;
  }
}
