// Space notes as synced records (SPACES_CLICKUP_REDESIGN.md D9 / M1).
//
// Notes were the last piece of writing the user could produce that never left
// the device: they sat in the space-hub blob outside the synced dataset, so a
// note written on the desktop did not exist on the laptop, and clearing site
// data lost it outright. This is the same mistake Learning Paths and custom
// Spaces made, fixed the same way — the record moves into PlannerData and
// rides the normal sync.
//
// Everything here is pure. The reducers return the SAME array when nothing
// changed, and spread only the note they touch, because diffChangedRecords
// answers "what changed" by object identity (buildSyncPlan.ts:67-70). Breaking
// that rule brings back the write amplification the sync work removed.
import type { SpaceNote } from "../spaceHubTypes";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

/**
 * One validator for both sources — the same sanitizer vets the legacy blob and
 * the synced rows, so a note cannot mean one thing locally and another after a
 * round trip (the rule learningPaths already follows, usePlannerData:319).
 *
 * `id` and `spaceId` are the two fields a note is useless without: an id-less
 * note can never be addressed for edit or delete, and a note with no space has
 * nowhere to appear. Everything else has a sane empty value.
 */
export function sanitizeSpaceNote(value: unknown): SpaceNote | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = asString(record.id).trim();
  const spaceId = asString(record.spaceId).trim();
  if (!id || !spaceId) return null;

  const createdAt = asString(record.createdAt);
  const updatedAt = asString(record.updatedAt);
  return {
    id,
    spaceId,
    title: asString(record.title),
    body: asString(record.body),
    type: asString(record.type) || "Quick Note",
    url: asString(record.url),
    relatedTaskId: asString(record.relatedTaskId),
    tags: asStringArray(record.tags),
    createdAt: createdAt || updatedAt,
    updatedAt: updatedAt || createdAt,
  };
}

/** Newest first — the order the notes panel has always shown. */
export function sortSpaceNotes(notes: SpaceNote[]): SpaceNote[] {
  return [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function addSpaceNote(current: SpaceNote[], note: SpaceNote): SpaceNote[] {
  return [note, ...current];
}

export function patchSpaceNote(
  current: SpaceNote[],
  noteId: string,
  patch: Partial<SpaceNote>,
  now: string,
): SpaceNote[] {
  let touched = false;
  const next = current.map((note) => {
    if (note.id !== noteId) return note;
    touched = true;
    // id and spaceId are identity, not content: a patch must not be able to
    // move a note to another space or rename it into a different record.
    return { ...note, ...patch, id: note.id, spaceId: note.spaceId, updatedAt: now };
  });
  return touched ? next : current;
}

export function dropSpaceNote(current: SpaceNote[], noteId: string): SpaceNote[] {
  const next = current.filter((note) => note.id !== noteId);
  return next.length === current.length ? current : next;
}
