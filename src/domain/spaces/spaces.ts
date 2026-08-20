// The top of the tree: Space -> Project -> Folder? -> List -> Task
// (SPACES_REDESIGN_II §4, H-INV-01/05/06).
//
// A Space is the work area several Projects belong to. It is a NEW record
// rather than a reinterpretation of an existing one: the rejected alternative
// demoted `Project` to a Folder, which would have left `task.projectId` naming
// a folder and `list.spaceId` naming one too, for a migration saving that did
// not exist — both shapes need the same one field (§8).
//
// Pure: no React, no storage. Reducers return the SAME array when nothing
// changed and spread only the record they touch, because diffChangedRecords
// decides what to upload by object identity (buildSyncPlan.ts).
//
// This module owns the Space record and the Project -> Space relation, and
// nothing below it. Folder and List live in ./hierarchy, which is why the
// backfill here is the only place that writes to a Project.
import type { Project, Space } from "../../types";

/**
 * The Space every existing Project is filed under on first run (§39).
 *
 * Fixed rather than generated, for the same reason `defaultListIdFor` is
 * derived: a device whose first save failed, or a second device migrating on
 * its own, must produce the same record instead of a duplicate work area.
 */
export const DEFAULT_SPACE_ID = "space-default";
export const DEFAULT_SPACE_NAME = "My Space";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asOrder(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function sanitizeSpace(value: unknown): Space | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = asString(record.id).trim();
  // A Space with no id cannot be selected, routed to, or pointed at by a
  // Project; keeping it would leave an invisible record that still syncs.
  if (!id) return null;
  const createdAt = asString(record.createdAt);
  const updatedAt = asString(record.updatedAt);
  return {
    ...(record as Partial<Space>), // M0 passthrough
    id,
    name: asString(record.name),
    description: asString(record.description),
    color: asString(record.color) || "#8e8e93",
    icon: asString(record.icon) || undefined,
    order: asOrder(record.order),
    archivedAt: asString(record.archivedAt) || undefined,
    deletedAt: asString(record.deletedAt) || undefined,
    createdAt: createdAt || updatedAt,
    updatedAt: updatedAt || createdAt,
  };
}

// === reads ===

export function activeSpaces(spaces: Space[]): Space[] {
  return spaces
    // §13.31: a deleted Space leaves the navigation the same way an archived
    // one does, and changes nothing below it either way.
    .filter((space) => !space.archivedAt && !space.deletedAt)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function findSpace(spaces: Space[], spaceId: string): Space | undefined {
  return spaces.find((space) => space.id === spaceId);
}

/**
 * Which Space a Project belongs to (H-INV-01).
 *
 * The stored value wins; a Project written before this field existed — or by a
 * client that predates it — answers with the default Space rather than
 * vanishing from the tree. The backfill below makes that stored, but a read
 * must never depend on the backfill having run on THIS device.
 */
export function spaceIdForProject(project: Pick<Project, "spaceId">): string {
  return project.spaceId || DEFAULT_SPACE_ID;
}

export function projectsInSpace(projects: Project[], spaceId: string): Project[] {
  return projects
    // §13.28: a deleted Project leaves the Spaces navigation, exactly as an
    // archived one does. Neither changes anything about the Lists beneath it.
    .filter((project) => !project.archivedAt && !project.deletedAt && spaceIdForProject(project) === spaceId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
}

/**
 * H-INV-06: deleting a Space must not silently delete the work inside it.
 * Archived Projects still count — they are recoverable, and a delete that
 * stranded them would not be.
 */
export function canDeleteSpace(projects: Project[], spaceId: string): boolean {
  return !projects.some((project) => spaceIdForProject(project) === spaceId);
}

// === writes ===

export function makeSpace(id: string, name: string, now: string, order = 0): Space {
  return { id, name, description: "", color: "#8e8e93", order, createdAt: now, updatedAt: now };
}

/**
 * Create the default Space, but only for Projects that need one (§39 M2).
 *
 * "Need" means having no `spaceId` of their own. An account whose Projects are
 * already filed gets nothing — creating it anyway left an empty "My Space"
 * sitting at the top of the tree, a work area the user never made and cannot
 * put anything in without moving something out of a real one.
 *
 * Returns the SAME array when there is nothing to add, so a load that changes
 * nothing marks nothing dirty.
 */
export function ensureDefaultSpace(spaces: Space[], projects: Project[], now: string, name = DEFAULT_SPACE_NAME): Space[] {
  if (!projects.some((project) => !project.spaceId)) return spaces;
  if (spaces.some((space) => space.id === DEFAULT_SPACE_ID)) return spaces;
  return [...spaces, makeSpace(DEFAULT_SPACE_ID, name, now)];
}

/**
 * File every Project that has no Space under the default one (§39 M4).
 *
 * This is the one bulk write the Space migration performs, and its size is the
 * reason this design was chosen: Projects number in the tens, while the Tasks,
 * Lists and Folders beneath them are not touched at all. `updatedAt` is left
 * alone on purpose — the user did not edit these Projects, and moving them
 * to the top of every "recently updated" list would be this migration
 * announcing itself in the UI.
 */
export function backfillProjectSpace(projects: Project[], spaceId = DEFAULT_SPACE_ID): Project[] {
  let touched = false;
  const next = projects.map((project) => {
    if (project.spaceId) return project;
    touched = true;
    return { ...project, spaceId };
  });
  return touched ? next : projects;
}

export function addSpace(current: Space[], space: Space): Space[] {
  const order = space.order || current.reduce((max, item) => Math.max(max, item.order), -1) + 1;
  return [...current, { ...space, order }];
}

export function patchSpace(current: Space[], spaceId: string, patch: Partial<Space>, now: string): Space[] {
  let touched = false;
  const next = current.map((space) => {
    if (space.id !== spaceId) return space;
    touched = true;
    // `id` is identity: moving a Space would strand every Project pointing at
    // it, and that is not a field edit.
    return { ...space, ...patch, id: space.id, updatedAt: now };
  });
  return touched ? next : current;
}

export function archiveSpace(current: Space[], spaceId: string, now: string): Space[] {
  const space = current.find((item) => item.id === spaceId);
  if (!space || space.archivedAt) return current;
  return patchSpace(current, spaceId, { archivedAt: now }, now);
}

/**
 * H-INV-05: moving a Project between Spaces is one row.
 *
 * Nothing below the Project is rewritten — Folder, List, Task and Subtask ids
 * all stay as they are, and the Scope resolver reads the new membership
 * through this single relation. A move that touched the work underneath would
 * be the write amplification this whole model exists to avoid.
 *
 * A move to a Space that does not exist is refused rather than left dangling.
 */
export function moveProjectToSpace(
  projects: Project[],
  projectId: string,
  spaceId: string,
  spaces: Space[],
  now: string,
): Project[] {
  if (!findSpace(spaces, spaceId)) return projects;
  let touched = false;
  const next = projects.map((project) => {
    if (project.id !== projectId) return project;
    if (spaceIdForProject(project) === spaceId) return project;
    touched = true;
    return { ...project, spaceId, updatedAt: now };
  });
  return touched ? next : projects;
}
