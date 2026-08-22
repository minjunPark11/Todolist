// Tags as records, and the many-to-many that connects them (TickTick plan §6.45).
//
// A Tag is not where a Task lives; it is what the Task is like (§1.9). It has
// always been stored as a bare string inside `Task.tags`, which works until
// the tag itself needs to be a thing: renamed, coloured, given a Scope of its
// own (§12.10). Renaming a string means rewriting every Task carrying it —
// the write amplification this store spent a release removing — while
// renaming a record touches one row. That is the whole argument for the join.
//
// `Task.tags` is NOT rewritten. It stays the answer for older clients and for
// every screen that still reads it; these records are the expand step beside
// it, exactly as `Task.listId` was beside `projectId`.
import type { Tag, Task, TaskTag } from "../../types";

/**
 * Legacy membership markers, not user tags.
 *
 * `space:<id>` and `group:<id>` strings were left in `Task.tags` on purpose
 * when that membership rule was removed — stripping them would have rewritten
 * every task to delete an inert string (see lib/spaceSelectors). They
 * reference nothing, and turning them into Tag records would put
 * `#space:8f2a…` in the user's sidebar.
 */
const LEGACY_MARKER = /^(space|group):/;

export function isUserTag(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && !LEGACY_MARKER.test(trimmed);
}

/**
 * Two tags are the same tag when they read the same. Case and surrounding
 * space are not a distinction anyone means to draw, and a deterministic key
 * is also what lets two devices tagging the same word independently arrive at
 * one record instead of two — the reason `defaultListIdFor` is derived.
 */
export function tagKeyFor(name: string): string {
  return name.trim().toLowerCase();
}

export function tagIdFor(name: string): string {
  return `tag-${tagKeyFor(name)}`;
}

/**
 * §6.46 asks for UNIQUE(taskId, tagId). There is no table to declare it on —
 * every collection here is one jsonb row per record — so the id IS the
 * constraint: the same pair can only ever produce the same row, whichever
 * device writes it.
 */
export function taskTagIdFor(taskId: string, tagId: string): string {
  return `tasktag-${taskId}--${tagId}`;
}

export function sanitizeTag(value: unknown): Tag | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  // A tag with no name cannot be shown, chosen, or searched for.
  if (!name) return null;
  const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : tagIdFor(name);
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : "";
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : "";
  return {
    ...(record as Partial<Tag>), // M0 passthrough
    id,
    name,
    color: typeof record.color === "string" && record.color.trim() ? record.color.trim() : undefined,
    archivedAt: typeof record.archivedAt === "string" && record.archivedAt ? record.archivedAt : undefined,
    createdAt: createdAt || updatedAt,
    updatedAt: updatedAt || createdAt,
  };
}

export function sanitizeTaskTag(value: unknown): TaskTag | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const taskId = typeof record.taskId === "string" ? record.taskId.trim() : "";
  const tagId = typeof record.tagId === "string" ? record.tagId.trim() : "";
  // A link missing either end connects nothing and would sync forever unseen.
  if (!taskId || !tagId) return null;
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : "";
  return {
    ...(record as Partial<TaskTag>), // M0 passthrough
    id: taskTagIdFor(taskId, tagId),
    taskId,
    tagId,
    createdAt,
  };
}

export function activeTags(tags: Tag[]): Tag[] {
  return tags
    .filter((tag) => !tag.archivedAt)
    .sort((a, b) => (a.sortKey ?? 0) - (b.sortKey ?? 0) || a.name.localeCompare(b.name));
}

export function tagsForTask(taskId: string, tags: Tag[], links: TaskTag[]): Tag[] {
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  const found: Tag[] = [];
  for (const link of links) {
    if (link.taskId !== taskId) continue;
    const tag = byId.get(link.tagId);
    if (tag && !tag.archivedAt) found.push(tag);
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The names a Task's tags read as — the relation first, the strings second.
 *
 * This is the one read that Chapter 26 makes canonical. `Task.tags` is still
 * written, so an older client keeps finding tags on a Task it did not create,
 * but it is no longer where anything LOOKS: the records answer, and the
 * strings only cover a Task created in this session on a build that predates
 * `linkTaskTags` — which the next load's backfill closes.
 *
 * Free-text readers (a focus haystack, an AI context payload) want names, not
 * records, and were reading the array directly. One function so they cannot
 * each answer differently.
 */
export function tagNamesForTask(
  task: Pick<Task, "id" | "tags">,
  tags: Tag[],
  links: TaskTag[],
): string[] {
  const linked = tagsForTask(task.id, tags, links);
  if (linked.length > 0) return linked.map((tag) => tag.name);
  return task.tags.filter(isUserTag).map((name) => name.trim());
}

export function taskIdsWithTag(tagId: string, links: TaskTag[]): Set<string> {
  const ids = new Set<string>();
  for (const link of links) {
    if (link.tagId === tagId) ids.add(link.taskId);
  }
  return ids;
}

export interface TagCollections {
  tags: Tag[];
  taskTags: TaskTag[];
}

/**
 * Write down, as records, the tags the tasks already carry as strings.
 *
 * No Task is touched. That is the point: the strings stay where every current
 * reader expects them, so this adds rows without putting the task table on the
 * wire — unlike a migration that moved the field.
 *
 * Returns the SAME arrays when there is nothing new, so a load that changes
 * nothing marks nothing dirty.
 */
export function backfillTaskTags(
  tasks: Task[],
  tags: Tag[],
  taskTags: TaskTag[],
  now: string,
): TagCollections {
  const knownTagIds = new Set(tags.map((tag) => tag.id));
  const knownLinkIds = new Set(taskTags.map((link) => link.id));
  const addedTags: Tag[] = [];
  const addedLinks: TaskTag[] = [];

  for (const task of tasks) {
    // A deleted task's tags are not the user's current vocabulary, and §6.54
    // keeps Trash a separate question. Links it already has are left alone.
    if (task.deletedAt) continue;
    for (const raw of task.tags) {
      if (!isUserTag(raw)) continue;
      const name = raw.trim();
      const tagId = tagIdFor(name);
      if (!knownTagIds.has(tagId)) {
        knownTagIds.add(tagId);
        // The first spelling seen becomes the display name; the key that
        // identified it was case-folded, so "Work" and "work" are one tag.
        addedTags.push({ id: tagId, name, createdAt: now, updatedAt: now });
      }
      const linkId = taskTagIdFor(task.id, tagId);
      if (knownLinkIds.has(linkId)) continue;
      knownLinkIds.add(linkId);
      addedLinks.push({ id: linkId, taskId: task.id, tagId, createdAt: now });
    }
  }

  return {
    tags: addedTags.length > 0 ? [...tags, ...addedTags] : tags,
    taskTags: addedLinks.length > 0 ? [...taskTags, ...addedLinks] : taskTags,
  };
}

/**
 * Deleting a Tag takes its links with it and leaves every Task alone (§6.46).
 * The strings in `Task.tags` are not stripped, for the same reason they were
 * not stripped when Space membership stopped reading them.
 */
export function removeTag(tagId: string, tags: Tag[], links: TaskTag[]): TagCollections {
  const nextTags = tags.filter((tag) => tag.id !== tagId);
  const nextLinks = links.filter((link) => link.tagId !== tagId);
  return {
    tags: nextTags.length === tags.length ? tags : nextTags,
    taskTags: nextLinks.length === links.length ? links : nextLinks,
  };
}

/**
 * The records a newly tagged Task needs, so creation writes the relation.
 *
 * Before this, creation wrote names into `Task.tags` and nothing else — the
 * links appeared on the NEXT load, when `backfillTaskTags` ran. Between the
 * two, the relation was missing rows the strings already implied, which is
 * exactly the disagreement §26.9 unifies the source to prevent.
 *
 * A name resolves to an EXISTING Tag by key before it makes one. That matters
 * for a renamed tag: its id was derived from the name it was born with, so
 * `tagIdFor` would answer with an id nothing holds and split one tag in two.
 *
 * Returns the same arrays when there is nothing to add, like the backfill.
 */
export function linkTaskTags(
  taskId: string,
  names: string[],
  tags: Tag[],
  taskTags: TaskTag[],
  now: string,
): TagCollections {
  if (!taskId || names.length === 0) return { tags, taskTags };

  const byKey = new Map(tags.map((tag) => [tagKeyFor(tag.name), tag]));
  const knownLinkIds = new Set(taskTags.map((link) => link.id));
  const addedTags: Tag[] = [];
  const addedLinks: TaskTag[] = [];

  for (const raw of names) {
    if (!isUserTag(raw)) continue;
    const name = raw.trim();
    const existing = byKey.get(tagKeyFor(name));
    const tagId = existing?.id ?? tagIdFor(name);
    if (!existing) {
      const created: Tag = { id: tagId, name, createdAt: now, updatedAt: now };
      byKey.set(tagKeyFor(name), created);
      addedTags.push(created);
    }
    const linkId = taskTagIdFor(taskId, tagId);
    if (knownLinkIds.has(linkId)) continue;
    knownLinkIds.add(linkId);
    addedLinks.push({ id: linkId, taskId, tagId, createdAt: now });
  }

  return {
    tags: addedTags.length > 0 ? [...tags, ...addedTags] : tags,
    taskTags: addedLinks.length > 0 ? [...taskTags, ...addedLinks] : taskTags,
  };
}
