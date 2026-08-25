// Save as Template, and making a Task from one (spec §25.8).
//
// §25.8 draws the line this file is built around: Duplicate produces a Task
// immediately, Save as Template produces a definition to produce Tasks from
// later, and the Task it was saved from is left exactly as it was.
//
// The definition is deliberately thin. It holds what someone would type again
// — the title, the body, the checklist, the priority, the tags, the shape of
// the subtasks — and none of what belongs to one particular Task: no ids, no
// List, no dates, no status, no reminders.
//
// Each of those omissions is the same argument. An id would dangle the moment
// the original was deleted. A List can be archived, and a template that
// insisted on one would fail in a place the user cannot see. A DATE is the
// clearest: a template saved on Tuesday and used in March would make a Task
// due last Tuesday. Where a new Task lands is `resolveCreateContext`'s answer
// already (§12.16), and a template has no business overruling the Scope the
// user is standing in.
import type { Task, TaskTemplate, TaskTemplateItem } from "../../types";
import { subtreeIds } from "./hierarchy";
import { checkItemsForTask } from "./checkItems";
import type { CheckItem } from "../../types";

export interface TemplateSources {
  tasks: Task[];
  checkItems: CheckItem[];
}

/**
 * The template a Task would make, or null when there is no such Task.
 *
 * The subtree comes along, in the order `subtreeIds` walks it, with parents
 * named by POSITION rather than by id — which is what lets the whole thing be
 * stored as one self-contained record and rebuilt with ids that do not exist
 * yet.
 */
export function templateFromTask(
  taskId: string,
  sources: TemplateSources,
  id: string,
  now: string,
): TaskTemplate | null {
  const root = sources.tasks.find((task) => task.id === taskId);
  if (!root) return null;

  const ids = subtreeIds(taskId, sources.tasks);
  const position = new Map(ids.map((value, index) => [value, index]));

  const items: TaskTemplateItem[] = [];
  for (const id of ids) {
    const task = sources.tasks.find((entry) => entry.id === id);
    if (!task) continue;
    items.push({
      title: task.title,
      description: task.description,
      ...(task.contentMode ? { contentMode: task.contentMode } : {}),
      priority: task.priority,
      tags: [...(task.tags ?? [])],
      // Text only, and unticked by definition: nothing in a template has
      // happened yet, so a tick would be a claim about work not yet started.
      checkItems: checkItemsForTask(id, sources.checkItems).map((item) => item.text),
      // The root's parent is outside the template, whatever it was.
      parentIndex: id === taskId ? -1 : (position.get(task.parentTaskId) ?? -1),
    });
  }

  // Named after the Task rather than asked for. A dialog to name a template is
  // a second decision at the moment someone is trying to make one, and the
  // Task's own title is what they would type into it.
  return { id, name: root.title, items, createdAt: now, updatedAt: now };
}

export interface TemplateTarget {
  listId: string;
  projectId: string;
  status: Task["status"];
}

export interface TemplateBuild {
  /** The Task the template names, and its subtree. Root first. */
  tasks: Task[];
  /** Checklist lines for those Tasks, unticked. */
  checkItems: CheckItem[];
  rootId: string;
}

/**
 * The records a template would create, or null when it makes nothing.
 *
 * `target` is the caller's — the create resolver has already decided where a
 * new Task goes in this Scope, and this fills the shape into that decision
 * rather than making a second one.
 */
export function buildFromTemplate(
  template: TaskTemplate,
  target: TemplateTarget,
  createId: (prefix: string) => string,
  now: string,
): TemplateBuild | null {
  if (template.items.length === 0) return null;

  const ids = template.items.map(() => createId("task"));
  const tasks: Task[] = [];
  const checkItems: CheckItem[] = [];

  template.items.forEach((item, index) => {
    tasks.push({
      id: ids[index],
      title: item.title,
      description: item.description,
      ...(item.contentMode ? { contentMode: item.contentMode } : {}),
      status: target.status,
      priority: item.priority,
      dueDate: "",
      startDate: "",
      startTime: "",
      endTime: "",
      projectId: target.projectId,
      categoryId: "",
      parentTaskId: item.parentIndex >= 0 ? ids[item.parentIndex] : "",
      listId: target.listId,
      tags: [...item.tags],
      notes: "",
      estimatedMinutes: 0,
      actualSeconds: 0,
      activeSessionId: "",
      lastFocusedAt: "",
      isSomeday: false,
      waitingReason: "",
      waitingFollowUpDate: "",
      order: 0,
      createdAt: now,
      updatedAt: now,
      completedAt: "",
      blockedByTaskId: "",
      repeatType: "none",
      repeatInterval: 1,
      repeatDays: [],
      repeatEndDate: "",
    } as Task);

    item.checkItems.forEach((text, line) => {
      checkItems.push({
        id: createId("checkitem"),
        taskId: ids[index],
        text,
        checked: false,
        sortKey: (line + 1) * 1000,
        completedAt: "",
        createdAt: now,
        updatedAt: now,
      });
    });
  });

  return { tasks, checkItems, rootId: ids[0] };
}

/** A stored template this build can use, or null. */
export function sanitizeTaskTemplate(value: unknown): TaskTemplate | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!id) return null;

  const items = Array.isArray(record.items)
    ? record.items.map(sanitizeItem).filter((item): item is TaskTemplateItem => item !== null)
    : [];
  // A template that would make nothing is a row the picker can only offer as a
  // dead end.
  if (items.length === 0) return null;

  const createdAt = typeof record.createdAt === "string" ? record.createdAt : "";
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : "";
  return {
    ...(record as Partial<TaskTemplate>), // M0 passthrough
    id,
    name: typeof record.name === "string" && record.name.trim() ? record.name : items[0].title,
    items,
    createdAt: createdAt || updatedAt,
    updatedAt: updatedAt || createdAt,
  };
}

function sanitizeItem(value: unknown): TaskTemplateItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title : "";
  // Unlike a checklist line, a Task with no title cannot be made at all
  // (§9.21), so a template item without one would fail at the moment of use.
  if (!title.trim()) return null;
  return {
    title,
    description: typeof record.description === "string" ? record.description : "",
    ...(record.contentMode === "checklist" || record.contentMode === "description"
      ? { contentMode: record.contentMode }
      : {}),
    priority:
      record.priority === "high" || record.priority === "medium" || record.priority === "low"
        ? record.priority
        : "none",
    tags: Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === "string") : [],
    checkItems: Array.isArray(record.checkItems)
      ? record.checkItems.filter((line): line is string => typeof line === "string")
      : [],
    parentIndex: typeof record.parentIndex === "number" && record.parentIndex >= 0 ? record.parentIndex : -1,
  };
}
