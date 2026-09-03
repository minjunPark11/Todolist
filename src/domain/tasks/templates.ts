// What a stored template is, for the loader that still has to read one.
//
// The FEATURE is gone (TASK_MENU_TRIM_DESIGN.md D2). What was here — the
// writer that turned a Task into a template (§25.8) and the builder that
// turned one back into Tasks — went with the two menu rows that were its only
// callers. This file is now one function: the guard normalization runs over
// whatever a stored account happens to hold, so that rows written before the
// removal load as themselves instead of as `undefined`.
//
// Kept rather than deleted for the reason the data is kept: nobody's records
// are rewritten because a menu lost a line.
import type { TaskTemplate, TaskTemplateItem } from "../../types";

/* `templateFromTask`, `buildFromTemplate` and their two shapes stood here.
   Templates are gone from the app (TASK_MENU_TRIM_DESIGN.md D2) — the ⋯ menu
   row that made one and the Quick Add menu that used one both left, so what
   remains is the READER below: stored rows still have to survive being loaded,
   because nothing has migrated anyone's data away. */

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
