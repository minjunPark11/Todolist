import type { GoalLink, LearningPath } from "../../lib/ai/learningPaths/types";
import type { Task } from "../../types";

export const MAX_GOAL_DESCRIPTION = 4000;
export const MAX_SUCCESS_CRITERIA = 2000;
export const MAX_GOAL_TAGS = 12;
export const MAX_GOAL_LINKS = 10;

function optionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().slice(0, maxLength);
  return text || undefined;
}

export function isAllowedGoalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "obsidian:";
  } catch {
    return false;
  }
}

export function sanitizeGoalTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const tag = entry.trim().slice(0, 40);
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === MAX_GOAL_TAGS) break;
  }
  return tags.length ? tags : undefined;
}

export function sanitizeGoalLinks(value: unknown): GoalLink[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const links: GoalLink[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const url = optionalText(record.url, 2000);
    if (!url || !isAllowedGoalUrl(url) || seen.has(url)) continue;
    seen.add(url);
    links.push({
      id: optionalText(record.id, 100) ?? `link-${links.length + 1}`,
      title: optionalText(record.title, 200) ?? url,
      url,
    });
    if (links.length === MAX_GOAL_LINKS) break;
  }
  return links.length ? links : undefined;
}

export function sanitizeGoalDetailFields(value: Record<string, unknown>) {
  return {
    description: optionalText(value.description, MAX_GOAL_DESCRIPTION),
    successCriteria: optionalText(value.successCriteria, MAX_SUCCESS_CRITERIA),
    tags: sanitizeGoalTags(value.tags),
    links: sanitizeGoalLinks(value.links),
  };
}

export function connectedGoalTasks(path: LearningPath, tasks: Task[]): Task[] {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const ids = new Set(path.milestones.flatMap((milestone) => milestone.taskIds ?? []));
  return [...ids].flatMap((id) => {
    const task = taskById.get(id);
    return task ? [task] : [];
  });
}

export function goalProgress(path: LearningPath, tasks: Task[]) {
  const connected = connectedGoalTasks(path, tasks);
  return {
    milestonesDone: path.milestones.filter((milestone) => Boolean(milestone.completedAt)).length,
    milestonesTotal: path.milestones.length,
    tasksDone: connected.filter((task) => task.status === "done").length,
    tasksTotal: connected.length,
  };
}
