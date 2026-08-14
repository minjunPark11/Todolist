// The legacy local-spaces blob, drained into Projects.
//
// Custom spaces used to live in their own device-local key-value blob, outside
// the synced dataset — the same shape of mistake Learning Paths made, and
// fixed the same way (HORIZONS_DESIGN.md D3, SPACES_BOARD_DESIGN.md Phase S4).
// A space you cannot see on your other device is not a space, and a custom
// space could never be a Board at all: with no Project behind it there was
// nowhere to hang a colour or a goal (D1).
//
// This module is a one-way drain. Nothing writes the blob any more; Spaces
// reads Projects like everything else.
import { platform } from "../../platform";
import type { Project } from "../../types";

const STORAGE_KEY = "todo-planner-local-spaces-v1";
// Kept as its own marker rather than relying on an emptied blob, so deleting
// every migrated space afterwards cannot resurrect the old copy.
const MIGRATED_KEY = "focusflow.localSpaces.migrated.v1";

/** The sections a custom space was created with by default; not worth keeping. */
const DEFAULT_SECTIONS = ["Notes", "Tasks", "Activity"];

interface LegacyLocalSpace {
  id: string;
  name: string;
  description?: string;
  color?: string;
  objective?: string;
  topics?: string[];
  pinned?: boolean;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim());
}

export function hasMigratedLegacyLocalSpaces(): boolean {
  try {
    return platform.storage.getSync(MIGRATED_KEY) === "1";
  } catch {
    // No storage means no blob to migrate either; treat it as already done so
    // the caller never blocks on it.
    return true;
  }
}

/**
 * A custom space becomes an "area" Project, not a "project" one: it was never
 * a deliverable with a deadline, it was a standing area of work. That is what
 * `area` is for, and it keeps the Spaces card wearing the same label it had.
 *
 * Sections the user typed are folded into the project notes rather than
 * dropped — they are the only free text a custom space carried, and the
 * migration must not be the thing that loses them. The three defaults every
 * space was seeded with are not user writing, so those go.
 */
function toProject(value: unknown, pinnedIds: Set<string>, now: string): Project | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = asString(record.id);
  const name = asString(record.name);
  if (!id || !name) return null;

  const sections = asStringArray(record.topics).filter((section) => !DEFAULT_SECTIONS.includes(section));
  const objective = asString(record.objective);
  const description = asString(record.description);

  return {
    id,
    name,
    description,
    // Objective and sections are the writing a custom space could hold that
    // Project has no field for. Notes is where free text lives, so they land
    // there instead of vanishing.
    notes: [objective, sections.join("\n")].filter(Boolean).join("\n\n") || undefined,
    color: asString(record.color) || "#f97316",
    type: "area",
    status: "active",
    pinned: pinnedIds.has(id) || record.pinned === true ? true : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/** Pure read — safe to call any number of times, no side effects. */
export function readLegacyLocalSpaces(): Project[] {
  if (hasMigratedLegacyLocalSpaces()) return [];
  try {
    const raw = platform.storage.getSync(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    const store = parsed as { spaces?: unknown; pinnedIds?: unknown };
    const spaces = Array.isArray(store.spaces) ? store.spaces : [];
    const pinnedIds = new Set(asStringArray(store.pinnedIds));
    const now = new Date().toISOString();
    return spaces
      .map((space) => toProject(space, pinnedIds, now))
      .filter((project): project is Project => project !== null);
  } catch {
    // A corrupt blob is not worth failing a load over.
    return [];
  }
}

export function markLegacyLocalSpacesMigrated() {
  try {
    platform.storage.setSync(MIGRATED_KEY, "1");
  } catch {
    // Marker unavailable: the read repeats next start. Adoption merges by id,
    // so a repeat is a no-op rather than a duplicate.
  }
}

/** Exported for the migration test only. */
export const LEGACY_LOCAL_SPACES_KEY = STORAGE_KEY;
export const LEGACY_LOCAL_SPACES_MIGRATED_KEY = MIGRATED_KEY;
