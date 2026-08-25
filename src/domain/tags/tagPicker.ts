// What the Tag picker offers, and what toggling one means (spec §13.35,
// §13.37–§13.41, §13.45, §13.67).
//
// The Tag records and the join already existed; what did not was a way for a
// Task Detail to change them. This is that, and it keeps two rules the
// component would otherwise each have to remember:
//
// A toggle removes the RELATION, never the Tag (§13.45). Unticking "urgent" on
// one Task must not take the tag off the other forty, and a picker that called
// `removeTag` would do exactly that.
//
// `#` is a presentation prefix (§13.35). It is stripped on the way in, so
// typing "#urgent" and typing "urgent" cannot produce two records.
import type { Tag, Task, TaskTag } from "../../types";
import { activeTags, isUserTag, tagIdFor, tagKeyFor, taskTagIdFor, tagsForTask } from "./tags";

/**
 * §13.35's "과도한 길이", as a number.
 *
 * Long enough for a phrase, short enough that a tag stays a label rather than
 * becoming a note. The limit is here rather than in the input's `maxlength`
 * because a paste, a sync from another client and a future import all reach
 * the same rule this way.
 */
export const MAX_TAG_NAME = 50;

export type TagNameRefusal = "empty" | "too-long" | "control-characters" | "reserved";

/**
 * Why this name cannot be a Tag, or null when it can (§13.35).
 *
 * Named refusals rather than a boolean, because the picker has to say which
 * one — "too long" and "that name is reserved" want different sentences, and
 * a control that just refuses is §16.28's complaint.
 */
export function tagNameRefusal(raw: string): TagNameRefusal | null {
  const name = normalizeTagName(raw);
  if (!name) return "empty";
  if (name.length > MAX_TAG_NAME) return "too-long";
  // Compared by code point rather than matched by a regex literal. Writing
  // the range as an escape sequence is how this line twice ended up holding
  // REAL control characters — invisible to whoever reads it next, and enough
  // to make the file read as binary to half the tools that touch it.
  if (name.split("").some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)) {
    return "control-characters";
  }
  // `space:` and `group:` are the legacy membership markers that were left in
  // `Task.tags` deliberately. A user tag by that name would be swallowed by
  // the same filter that hides them.
  if (!isUserTag(name)) return "reserved";
  return null;
}

/**
 * The name as it will be stored: trimmed, and without the display `#`.
 *
 * Only ONE leading `#` is removed. "##" is someone's actual tag, and eating
 * every hash would silently rename it.
 */
export function normalizeTagName(raw: string): string {
  const trimmed = raw.trim();
  return (trimmed.startsWith("#") ? trimmed.slice(1) : trimmed).trim();
}

export interface TagOption {
  tag: Tag;
  /** Whether this Task carries it (§13.37's tick). */
  selected: boolean;
}

/**
 * Every Tag the picker lists, ticked ones included (§13.37).
 *
 * The Task's own tags stay in the list rather than moving to a section of
 * their own: the picker is multi-select (§13.38), so the list is also how a
 * tag is removed, and a tag that jumped somewhere else the moment it was
 * ticked would move under the pointer about to tick the next one.
 */
export function tagPickerOptions(
  taskId: string,
  tags: Tag[],
  links: TaskTag[],
  query = "",
): TagOption[] {
  const needle = tagKeyFor(normalizeTagName(query));
  const selected = new Set(tagsForTask(taskId, tags, links).map((tag) => tag.id));
  return activeTags(tags)
    .filter((tag) => isUserTag(tag.name))
    .filter((tag) => !needle || tagKeyFor(tag.name).includes(needle))
    .map((tag) => ({ tag, selected: selected.has(tag.id) }));
}

/**
 * The name an inline "Create" would make, or null when there is nothing to
 * offer (§13.41).
 *
 * Null covers three different situations on purpose — nothing typed, a name
 * that would be refused, and a name that already exists. The third is the
 * subtle one: offering `Create "research"` while `research` sits ticked two
 * rows above invites someone to make a duplicate that §13.34 would then have
 * to merge away.
 */
export function tagCreateOffer(query: string, tags: Tag[]): string | null {
  const name = normalizeTagName(query);
  if (tagNameRefusal(name)) return null;
  const exists = tags.some((tag) => tagKeyFor(tag.name) === tagKeyFor(name));
  return exists ? null : name;
}

export interface TagToggleResult {
  tags: Tag[];
  taskTags: TaskTag[];
  /**
   * `Task.tags`, rewritten to match.
   *
   * The relation is canonical (§26.9) and this is the compat mirror an older
   * client still reads. Returned rather than written here so the caller makes
   * one store update out of both — a toggle that left the two disagreeing
   * would show a tag on one build and not on the other.
   */
  taskTagNames: string[];
}

/**
 * Add the Tag to this Task, or take it off (§13.39).
 *
 * Creating the Tag when it does not exist yet is part of the same step, which
 * is §13.42's atomicity: one user action, one state, so a failure cannot leave
 * a Tag record that nothing points at.
 *
 * Returns null for a name §13.35 refuses, so a caller that ignores the refusal
 * writes nothing rather than writing something malformed.
 */
export function toggleTaskTag(
  task: Pick<Task, "id" | "tags">,
  rawName: string,
  tags: Tag[],
  links: TaskTag[],
  now: string,
): TagToggleResult | null {
  if (tagNameRefusal(rawName)) return null;
  const name = normalizeTagName(rawName);
  const key = tagKeyFor(name);
  const existing = tags.find((tag) => tagKeyFor(tag.name) === key);
  const tagId = existing?.id ?? tagIdFor(name);
  const linkId = taskTagIdFor(task.id, tagId);
  const linked = links.some((link) => link.id === linkId);

  if (linked) {
    // §13.45: the relation goes, the Tag stays. It is still on every other
    // Task that carries it, and it is still in the sidebar.
    return {
      tags,
      taskTags: links.filter((link) => link.id !== linkId),
      taskTagNames: task.tags.filter((held) => tagKeyFor(held) !== key),
    };
  }

  // The display name of an existing Tag wins over what was typed: §13.34
  // keeps the case it was created with, so ticking "Research" from a search
  // for "research" must not quietly recase the record.
  const displayName = existing?.name ?? name;
  return {
    tags: existing ? tags : [...tags, { id: tagId, name: displayName, createdAt: now, updatedAt: now }],
    taskTags: [...links, { id: linkId, taskId: task.id, tagId, createdAt: now }],
    taskTagNames: [...task.tags.filter((held) => tagKeyFor(held) !== key), displayName],
  };
}
