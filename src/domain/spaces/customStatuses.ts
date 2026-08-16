// The statuses a user adds to a Space, and which one a goal sits in.
//
// These were called "board lists" while they were a Goals-tab affordance. They
// were never lists: a column a goal sits in is a status, which is what
// `membership.statusesWithCustom` has always turned them into, and what the
// board reads them as. The old word collided with the Space -> Folder -> List
// hierarchy, where a List is the container an Item is stored in — a different
// thing entirely — so it is gone from the code.
//
// It is NOT gone from storage. `Project.boardLists`, `LearningPath.boardListId`
// and `boardOrder` keep their keys, because renaming a field inside a record an
// older client already syncs is how that client comes to erase it (M0, §5).
// The wire remembers the old word; nothing else has to.
import type { CustomStatus, LearningPath, Project } from "../../types";

export const MAX_CUSTOM_STATUSES = 20;

export function sanitizeCustomStatuses(value: unknown): CustomStatus[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .flatMap((entry): CustomStatus[] => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      if (typeof item.id !== "string" || !item.id || seen.has(item.id)) return [];
      if (typeof item.name !== "string" || !item.name.trim()) return [];
      seen.add(item.id);
      return [{
        id: item.id,
        name: item.name.trim().slice(0, 80),
        order: typeof item.order === "number" && Number.isFinite(item.order) ? item.order : seen.size - 1,
        archivedAt: typeof item.archivedAt === "string" && item.archivedAt ? item.archivedAt : undefined,
      }];
    })
    .sort((a, b) => a.order - b.order)
    .slice(0, MAX_CUSTOM_STATUSES)
    .map((status, order) => ({ ...status, order }));
}

export function reconcileGoalStatuses(projects: Project[], paths: LearningPath[]): LearningPath[] {
  const bySpace = new Map(projects.map((project) => [
    project.id,
    new Set((project.boardLists ?? []).filter((status) => !status.archivedAt).map((status) => status.id)),
  ]));
  return paths.map((path) => {
    if (path.projectId && !bySpace.has(path.projectId)) {
      return { ...path, projectId: undefined, boardListId: undefined, boardOrder: undefined };
    }
    if (!path.boardListId) return path;
    const valid = path.projectId && bySpace.get(path.projectId)?.has(path.boardListId);
    return valid ? path : { ...path, boardListId: undefined, boardOrder: undefined };
  });
}

export function addCustomStatus(projects: Project[], projectId: string, status: CustomStatus, now: string): Project[] {
  return projects.map((project) => project.id === projectId
    ? { ...project, boardLists: sanitizeCustomStatuses([...(project.boardLists ?? []), status]), updatedAt: now }
    : project);
}

export function patchCustomStatus(projects: Project[], projectId: string, statusId: string, patch: Partial<Pick<CustomStatus, "name" | "order">>, now: string): Project[] {
  return projects.map((project) => {
    if (project.id !== projectId) return project;
    const statuses = [...(project.boardLists ?? [])].sort((a, b) => a.order - b.order);
    const index = statuses.findIndex((status) => status.id === statusId);
    if (index < 0) return project;
    statuses[index] = { ...statuses[index], ...(patch.name !== undefined ? { name: patch.name } : {}) };
    if (patch.order !== undefined) {
      const [moving] = statuses.splice(index, 1);
      statuses.splice(Math.max(0, Math.min(statuses.length, patch.order)), 0, moving);
    }
    return { ...project, boardLists: sanitizeCustomStatuses(statuses.map((status, order) => ({ ...status, order }))), updatedAt: now };
  });
}

export function archiveCustomStatus(projects: Project[], paths: LearningPath[], projectId: string, statusId: string, now: string) {
  const nextProjects = projects.map((project) => {
    if (project.id !== projectId) return project;
    const changed = (project.boardLists ?? []).map((status) => status.id === statusId ? { ...status, archivedAt: now } : status);
    const active = changed.filter((status) => !status.archivedAt).map((status, order) => ({ ...status, order }));
    const archived = changed.filter((status) => status.archivedAt).map((status, index) => ({ ...status, order: active.length + index }));
    return { ...project, boardLists: [...active, ...archived], updatedAt: now };
  });
  const nextPaths = paths.map((path) => path.projectId === projectId && path.boardListId === statusId
    ? { ...path, boardListId: undefined, boardOrder: undefined, updatedAt: now }
    : path);
  return { projects: nextProjects, paths: nextPaths };
}

export function moveGoalToStatus(paths: LearningPath[], projects: Project[], pathId: string, statusId: string | undefined, now: string): LearningPath[] {
  const goal = paths.find((path) => path.id === pathId);
  if (!goal?.projectId) return paths;
  const project = projects.find((item) => item.id === goal.projectId);
  const valid = !statusId || project?.boardLists?.some((status) => status.id === statusId && !status.archivedAt);
  if (!valid) return paths;
  const order = paths
    .filter((path) => path.projectId === goal.projectId && path.boardListId === statusId && path.id !== pathId)
    .reduce((max, path) => Math.max(max, path.boardOrder ?? -1), -1) + 1;
  return paths.map((path) => path.id === pathId ? { ...path, boardListId: statusId, boardOrder: order, updatedAt: now } : path);
}
