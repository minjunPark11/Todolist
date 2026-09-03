// What a Scope shows, as the reader has set it
// (SCOPE_VIEW_OPTIONS_DESIGN.md §3.3, phase 1).
//
// Five values behind one `⋯`, and they are per SCOPE rather than per app: a
// meetings list wants to know how many days are left, a shopping list does
// not. The reference app splits them the same way, and this app already stores
// two settings on the same shape — `matrixQuadrantViews` keyed by quadrant,
// `inboxColumns` by column.
//
// Nothing here draws anything. The point of doing it first is that where the
// five values live is the premise of every screen that reads them, and getting
// that wrong is a migration rather than an edit.
import type { TaskScopeRef } from "../tasks/scopeRegistry";
import { scopeRegistry } from "../tasks/scopeRegistry";

export type ScopeDateBy = "taskTime" | "countdown";
export type ScopeKanbanSize = "small" | "medium" | "large";

export interface ScopeViewOptions {
  /** §3.5: the same date, read as a date or as what is left of it. */
  dateBy: ScopeDateBy;
  /** §3.6: the width of a Board column, so "how many fit" is the question. */
  kanbanSize: ScopeKanbanSize;
  /** §3.4: an `Add Task` row at the top of each column, or no way in at all. */
  showInputBox: boolean;
  hideCompleted: boolean;
  /** §3.8: a line of the body under the title, rather than a mark saying one exists. */
  showDetails: boolean;
  /**
   * The Lists whose group is folded away on a Folder's screen
   * (FOLDER_TREE_AND_VIEW_DESIGN.md §13.4).
   *
   * Per Scope, which for a Folder means per Folder — so folding six of eight
   * Lists is remembered for THAT Folder and says nothing about any other.
   *
   * Remembered, where the Board's "완료" group is not, and the difference is
   * what the group holds: 완료 is a pile at the edge of a column, and a
   * Folder's Lists are its contents. Re-folding six every visit is a chore.
   *
   * Meaningless on every Scope but `folder`, and harmless there: nothing else
   * groups by List, so nothing else reads it.
   */
  collapsedListIds: string[];
}

export const SCOPE_DATE_BY: readonly ScopeDateBy[] = ["taskTime", "countdown"];
export const SCOPE_KANBAN_SIZES: readonly ScopeKanbanSize[] = ["small", "medium", "large"];

/**
 * What a Scope nobody has touched reads as.
 *
 * Every one of these is what the app does today, so an account that never
 * opens the menu behaves exactly as it does now — the same promise
 * `matrixQuadrantRules` makes for a box nobody has edited.
 */
export const DEFAULT_SCOPE_VIEW_OPTIONS: ScopeViewOptions = {
  dateBy: "taskTime",
  kanbanSize: "medium",
  showInputBox: true,
  hideCompleted: false,
  showDetails: false,
  collapsedListIds: [],
};

/**
 * The Scopes that get a `⋯` at all (§3.1).
 *
 * `completed`, `wontDo` and `trash` are lists of work that is over. Half the
 * menu loses its meaning on them — "완료 숨기기" on the Completed Scope is a
 * button that empties the screen — so they have no options and no key.
 */
export function scopeHasViewOptions(kind: TaskScopeRef["kind"]): boolean {
  return kind !== "completed" && kind !== "wontDo" && kind !== "trash";
}

/**
 * The key one Scope's options are stored under.
 *
 * `today`, `list:l1`, `tag:t3` — the Scope's own address, flattened. Built
 * from the registry's `hasId` rather than from a list of kinds here, so a
 * Scope added later cannot quietly get a key that collides with a fixed one.
 *
 * Returns "" for a Scope that has no options, which is what keeps a stray key
 * from being written at all: the caller has nowhere to put it.
 */
export function scopeOptionKey(ref: TaskScopeRef): string {
  if (!scopeHasViewOptions(ref.kind)) return "";
  return scopeRegistry[ref.kind].hasId && "id" in ref && ref.id
    ? `${ref.kind}:${ref.id}`
    : ref.kind;
}

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * One stored record, read back safely.
 *
 * Field by field rather than by spreading: a value written by a newer client
 * that this one cannot draw has to land on something drawable, and a spread
 * would carry it straight through to a `<select>` with no such option.
 */
export function sanitizeScopeViewOptions(raw: unknown): ScopeViewOptions {
  const row = (raw ?? {}) as Partial<ScopeViewOptions>;
  return {
    dateBy: pick(row.dateBy, SCOPE_DATE_BY, DEFAULT_SCOPE_VIEW_OPTIONS.dateBy),
    kanbanSize: pick(row.kanbanSize, SCOPE_KANBAN_SIZES, DEFAULT_SCOPE_VIEW_OPTIONS.kanbanSize),
    showInputBox: typeof row.showInputBox === "boolean" ? row.showInputBox : DEFAULT_SCOPE_VIEW_OPTIONS.showInputBox,
    hideCompleted: typeof row.hideCompleted === "boolean" ? row.hideCompleted : DEFAULT_SCOPE_VIEW_OPTIONS.hideCompleted,
    showDetails: typeof row.showDetails === "boolean" ? row.showDetails : DEFAULT_SCOPE_VIEW_OPTIONS.showDetails,
    // Filtered rather than taken: a stored array from a newer client could hold
    // anything, and what this becomes is a set of ids compared against Lists.
    collapsedListIds: Array.isArray(row.collapsedListIds)
      ? row.collapsedListIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [],
  };
}

/** One Scope's options, or the defaults when nobody has set any. */
export function viewOptionsFor(
  stored: Record<string, ScopeViewOptions> | undefined,
  ref: TaskScopeRef,
): ScopeViewOptions {
  const key = scopeOptionKey(ref);
  if (!key || !stored) return DEFAULT_SCOPE_VIEW_OPTIONS;
  return stored[key] ?? DEFAULT_SCOPE_VIEW_OPTIONS;
}

/** The records a key can name, for the sweep below. */
export interface LiveScopes {
  listIds: readonly string[];
  folderIds: readonly string[];
  tagIds: readonly string[];
  filterIds: readonly string[];
}

/**
 * Drops the keys whose Scope is gone (§3.3, and Q5's answer).
 *
 * Q5 asked whether a trashed List should keep its options. It does — the sweep
 * takes the ids it is GIVEN, and a trashed List is still a record: it can be
 * restored, and coming back with its view settings emptied would be a loss
 * nobody asked for and nobody could see coming. What removes the key is the
 * List being removed, which `permanentlyDeleteList` does and the next load
 * notices.
 *
 * Returns the same object when nothing was orphaned, so an account with no
 * strays does not get marked dirty on every load.
 */
export function pruneScopeViewOptions(
  stored: Record<string, ScopeViewOptions> | undefined,
  live: LiveScopes,
): Record<string, ScopeViewOptions> | undefined {
  if (!stored) return stored;

  const ids: Record<string, readonly string[]> = {
    list: live.listIds,
    folder: live.folderIds,
    tag: live.tagIds,
    filter: live.filterIds,
  };

  const kept: Record<string, ScopeViewOptions> = {};
  let dropped = 0;
  for (const [key, value] of Object.entries(stored)) {
    const [kind, id] = key.split(":");
    const alive = id === undefined
      // A fixed Scope — `today`, `upcoming`, `inbox`. It cannot stop existing,
      // but a kind this client does not know can still be in the store.
      ? Object.prototype.hasOwnProperty.call(scopeRegistry, kind) && scopeHasViewOptions(kind as TaskScopeRef["kind"])
      : (ids[kind]?.includes(id) ?? false);
    if (alive) kept[key] = value;
    else dropped += 1;
  }

  return dropped === 0 ? stored : kept;
}
