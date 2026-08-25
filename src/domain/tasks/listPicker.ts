// What the List picker offers, and what choosing one means (spec §13.9–§13.15,
// §13.26, §13.66).
//
// Two things live here rather than in the component. The option tree, because
// §13.10's rule that a Folder heading is not a selection target is the same
// rule as §13.27's "headings are not focusable" — one list of selectable Lists
// answers both, and a component that built its own would answer them twice and
// eventually differently. And the move plan, because §13.14 makes a move a
// statement about a SUBTREE, which is not something a picker should have to
// know.
import type { List, SidebarFolder, Task } from "../../types";
import { folderIdFor } from "./sidebarFolders";
import { subtreeIds } from "./hierarchy";
import { patchForListMove } from "../spaces/membership";

/**
 * One group in the picker: a Folder heading and the Lists under it.
 *
 * `folder` is null for the Lists that belong to no group — Inbox and anything
 * the user has not filed — and those come first, because §13.5 makes the
 * default List the one a Task is most likely to be moving to or from.
 */
export interface ListPickerGroup {
  folder: SidebarFolder | null;
  lists: List[];
}

/** Case- and whitespace-insensitive, which is how a picker search is typed. */
function matches(text: string, query: string): boolean {
  return text.trim().toLowerCase().includes(query);
}

/**
 * The picker's contents, filtered by what has been typed (§13.9, §13.26).
 *
 * Archived and deleted Lists are absent: a picker is a place to move a Task
 * TO, and §13.20 has already decided those are not somewhere it can go.
 *
 * §13.26 puts the Folder name in the search context too, so typing a group's
 * name offers everything under it. That is why a group whose own name matches
 * keeps all of its Lists rather than being filtered down to none — the reader
 * asked for the group.
 *
 * Empty groups are dropped. A heading with nothing under it is a row that
 * cannot be chosen and explains nothing (§19.82 has the same instinct about
 * empty surfaces).
 */
export function listPickerGroups(
  lists: List[],
  folders: SidebarFolder[],
  query = "",
): ListPickerGroup[] {
  const needle = query.trim().toLowerCase();
  const available = lists.filter((list) => !list.archivedAt && !list.deletedAt);

  const ungrouped = available.filter((list) => !folderIdFor(list));
  const groups: ListPickerGroup[] = [
    { folder: null, lists: needle ? ungrouped.filter((list) => matches(list.name, needle)) : ungrouped },
  ];

  for (const folder of [...folders].sort((a, b) => (a.sortKey ?? 0) - (b.sortKey ?? 0) || a.name.localeCompare(b.name))) {
    const inFolder = available.filter((list) => folderIdFor(list) === folder.id);
    const keep =
      !needle || matches(folder.name, needle) ? inFolder : inFolder.filter((list) => matches(list.name, needle));
    groups.push({ folder, lists: keep });
  }

  return groups.filter((group) => group.lists.length > 0);
}

/**
 * Every List a keyboard can land on, in the order they are drawn (§13.27).
 *
 * The arrow-key ring, and it deliberately skips the headings — moving through
 * a list where every third stop cannot be chosen makes the keys feel broken.
 */
export function selectableLists(groups: ListPickerGroup[]): List[] {
  return groups.flatMap((group) => group.lists);
}

/**
 * Whether this Task may be moved on its own (§13.15, §13.16).
 *
 * A child may not. Its List is its parent's by §2.24's invariant, so moving it
 * alone would either break that or silently detach it from its parent — and
 * §13.16 is explicit that V1 does not offer the second as a side effect of a
 * List move. The way to move a child is to promote it first, which is a
 * structural change the user makes deliberately.
 */
export function canMoveToList(task: Pick<Task, "parentTaskId">): boolean {
  return !task.parentTaskId;
}

export interface ListMovePlan {
  /** The Task and its descendants, root first (§13.14). */
  taskIds: string[];
  /** Applied to every one of them. */
  patch: Partial<Task>;
}

/**
 * What moving this Task to a List actually changes, or null when nothing does.
 *
 * Null covers all three of §13.66's refusals at once — a target that is not a
 * List, a Task that may not move on its own, and §13.11's re-select of the
 * List the Task is already in. The caller applies a plan or does nothing; it
 * never has to work out which of the three it was looking at.
 *
 * The patch is `patchForListMove`'s, so the rule that a List decides the
 * Project stays in the one place that has always owned it. Every Task in the
 * subtree takes the SAME patch, which is what §2.24 means by the invariant:
 * they end up in one List because they were given one answer, not because
 * each was computed separately and happened to agree.
 */
export function listMovePlan(
  task: Task,
  targetListId: string,
  tasks: Task[],
  lists: List[],
): ListMovePlan | null {
  if (!canMoveToList(task)) return null;
  const patch = patchForListMove(task, targetListId, lists);
  if (Object.keys(patch).length === 0) return null;
  return { taskIds: subtreeIds(task.id, tasks), patch };
}
