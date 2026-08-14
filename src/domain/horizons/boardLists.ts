import type { BoardList, LearningPath, Project } from "../../types";

export const MAX_BOARD_LISTS = 20;

export function sanitizeBoardLists(value: unknown): BoardList[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .flatMap((entry): BoardList[] => {
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
    .slice(0, MAX_BOARD_LISTS)
    .map((list, order) => ({ ...list, order }));
}

export function reconcileBoardAssignments(projects: Project[], paths: LearningPath[]): LearningPath[] {
  const listsByProject = new Map(projects.map((project) => [
    project.id,
    new Set((project.boardLists ?? []).filter((list) => !list.archivedAt).map((list) => list.id)),
  ]));
  return paths.map((path) => {
    if (path.projectId && !listsByProject.has(path.projectId)) {
      return { ...path, projectId: undefined, boardListId: undefined, boardOrder: undefined };
    }
    if (!path.boardListId) return path;
    const valid = path.projectId && listsByProject.get(path.projectId)?.has(path.boardListId);
    return valid ? path : { ...path, boardListId: undefined, boardOrder: undefined };
  });
}

export function addBoardList(projects: Project[], projectId: string, list: BoardList, now: string): Project[] {
  return projects.map((project) => project.id === projectId
    ? { ...project, boardLists: sanitizeBoardLists([...(project.boardLists ?? []), list]), updatedAt: now }
    : project);
}

export function patchBoardList(projects: Project[], projectId: string, listId: string, patch: Partial<Pick<BoardList, "name" | "order">>, now: string): Project[] {
  return projects.map((project) => {
    if (project.id !== projectId) return project;
    const lists = [...(project.boardLists ?? [])].sort((a, b) => a.order - b.order);
    const index = lists.findIndex((list) => list.id === listId);
    if (index < 0) return project;
    lists[index] = { ...lists[index], ...(patch.name !== undefined ? { name: patch.name } : {}) };
    if (patch.order !== undefined) {
      const [moving] = lists.splice(index, 1);
      lists.splice(Math.max(0, Math.min(lists.length, patch.order)), 0, moving);
    }
    return { ...project, boardLists: sanitizeBoardLists(lists.map((list, order) => ({ ...list, order }))), updatedAt: now };
  });
}

export function archiveBoardList(projects: Project[], paths: LearningPath[], projectId: string, listId: string, now: string) {
  const nextProjects = projects.map((project) => {
    if (project.id !== projectId) return project;
    const changed = (project.boardLists ?? []).map((list) => list.id === listId ? { ...list, archivedAt: now } : list);
    const active = changed.filter((list) => !list.archivedAt).map((list, order) => ({ ...list, order }));
    const archived = changed.filter((list) => list.archivedAt).map((list, index) => ({ ...list, order: active.length + index }));
    return { ...project, boardLists: [...active, ...archived], updatedAt: now };
  });
  const nextPaths = paths.map((path) => path.projectId === projectId && path.boardListId === listId
    ? { ...path, boardListId: undefined, boardOrder: undefined, updatedAt: now }
    : path);
  return { projects: nextProjects, paths: nextPaths };
}

export function moveGoalToBoardList(paths: LearningPath[], projects: Project[], pathId: string, listId: string | undefined, now: string): LearningPath[] {
  const goal = paths.find((path) => path.id === pathId);
  if (!goal?.projectId) return paths;
  const project = projects.find((item) => item.id === goal.projectId);
  const validList = !listId || project?.boardLists?.some((list) => list.id === listId && !list.archivedAt);
  if (!validList) return paths;
  const order = paths
    .filter((path) => path.projectId === goal.projectId && path.boardListId === listId && path.id !== pathId)
    .reduce((max, path) => Math.max(max, path.boardOrder ?? -1), -1) + 1;
  return paths.map((path) => path.id === pathId ? { ...path, boardListId: listId, boardOrder: order, updatedAt: now } : path);
}
