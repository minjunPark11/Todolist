// Board columns that belong to one List (TickTick plan §6.26-§6.31).
//
// The plan's two Boards look identical and are not the same thing. An Inbox
// Board column is a date bucket — derived from the Task's own dates, stored
// nowhere — while a List Board column is something the user made and named,
// and only that second kind is a record (§6.24, D24). Dragging in one changes
// a date; dragging in the other changes `sectionId`. Phase 7 depends on the
// distinction, so the record has to exist before the Board does.
//
// A Section is never shared between Lists (§6.28). There is no table to
// declare that on — every collection here is one jsonb row per record — so it
// is enforced where every other cross-record rule in this repo is: on read.
// `sectionIdFor` answers "" for a Task pointing at a Section of some other
// List, which makes the forbidden state unrepresentable to callers even while
// the field still holds it.
import type { List, ListSection, Task } from "../../types";
import { listIdFor } from "../spaces/membership";

export function sanitizeListSection(value: unknown): ListSection | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const listId = typeof record.listId === "string" ? record.listId.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const id = typeof record.id === "string" ? record.id.trim() : "";
  // A column with no List is a column nothing can render, and one with no
  // name cannot be told apart from the unsectioned default. Either would sync
  // forever without ever appearing on a screen.
  if (!id || !listId || !name) return null;
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : "";
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : "";
  return {
    ...(record as Partial<ListSection>), // M0 passthrough
    id,
    listId,
    name,
    sortKey: typeof record.sortKey === "number" && Number.isFinite(record.sortKey) ? record.sortKey : undefined,
    createdAt: createdAt || updatedAt,
    updatedAt: updatedAt || createdAt,
  };
}

/**
 * The columns of one List, in the order they are shown.
 *
 * Name breaks ties rather than createdAt: two devices adding a column while
 * offline both land on the same next `sortKey`, and a Board whose column
 * order depends on which clock was ahead is a Board that reorders itself on
 * sync.
 */
export function sectionsForList(listId: string, sections: ListSection[]): ListSection[] {
  if (!listId) return [];
  return sections
    .filter((section) => section.listId === listId)
    .sort((a, b) => (a.sortKey ?? 0) - (b.sortKey ?? 0) || a.name.localeCompare(b.name));
}

/**
 * Which column a Task is in, or "" for the unsectioned default (§6.27).
 *
 * This is the §6.28 invariant, stated once. A Task whose stored `sectionId`
 * names a Section of a different List reads as unsectioned — as does one
 * whose Section has since been deleted — so no caller has to remember to
 * check, and no screen can show a Task under a column its List does not have.
 */
export function sectionIdFor(
  task: Pick<Task, "sectionId" | "listId" | "projectId">,
  lists: List[],
  sections: ListSection[],
): string {
  const sectionId = task.sectionId?.trim();
  if (!sectionId) return "";
  const section = sections.find((candidate) => candidate.id === sectionId);
  if (!section) return "";
  return section.listId === listIdFor(task, lists) ? section.id : "";
}

/** The Tasks of one column, including the unsectioned default when `sectionId` is "". */
export function tasksInSection(
  sectionId: string,
  tasks: Task[],
  lists: List[],
  sections: ListSection[],
): Task[] {
  return tasks.filter((task) => sectionIdFor(task, lists, sections) === sectionId);
}

function nextSortKey(listId: string, sections: ListSection[]): number {
  return sectionsForList(listId, sections).reduce((max, section) => Math.max(max, section.sortKey ?? 0), -1) + 1;
}

/** A new column at the end of one List's Board. Returns the same array when the name is empty. */
export function addListSection(
  sections: ListSection[],
  listId: string,
  name: string,
  id: string,
  now: string,
): ListSection[] {
  const trimmed = name.trim();
  if (!listId || !trimmed) return sections;
  return [
    ...sections,
    { id, listId, name: trimmed, sortKey: nextSortKey(listId, sections), createdAt: now, updatedAt: now },
  ];
}

/**
 * Deleting a column does not delete what is in it.
 *
 * Nothing has to be rewritten for that to be true: a Task pointing at a
 * Section that no longer exists already reads as unsectioned through
 * `sectionIdFor`, so the Tasks reappear in the default column instead of
 * vanishing with it — and the alternative, rewriting every Task in the
 * column, is the write amplification this store keeps removing.
 */
export function removeListSection(sections: ListSection[], sectionId: string): ListSection[] {
  const next = sections.filter((section) => section.id !== sectionId);
  return next.length === sections.length ? sections : next;
}

export function renameListSection(
  sections: ListSection[],
  sectionId: string,
  name: string,
  now: string,
): ListSection[] {
  const trimmed = name.trim();
  if (!trimmed) return sections;
  let changed = false;
  const next = sections.map((section) => {
    if (section.id !== sectionId || section.name === trimmed) return section;
    changed = true;
    return { ...section, name: trimmed, updatedAt: now };
  });
  return changed ? next : sections;
}
