// What a Board's columns ARE, per Scope (TASK_VIEWS_EVERYWHERE_DESIGN.md §2).
//
// `board.ts` holds the two Boards this module had — the Inbox's virtual
// columns and a List's Sections — and the line between them: the same visual
// drag calls a DIFFERENT canonical command depending on which Board it
// happened on (§16.30's Gate 7). That line is the reason this file exists
// rather than a third branch inside `TasksModule`.
//
// A third Board arrives with the seven Scopes that now offer one. Five of them
// — Today, Upcoming, Folder, Tag, Filter — gather work from SEVERAL Lists, so
// neither existing answer fits: they have no Sections of their own (a Section
// belongs to one List, §6.28) and no virtual date columns (that is the Inbox's
// own arrangement, and the reader did not ask for it here). Their columns are
// the Lists themselves, and a drag is `moveTaskToList`.
//
// Why Lists and not dates or priorities (§2.1):
//   - the drop means something a user would say out loud — "put this in 일";
//   - it is an existing command WITH an undo, so nothing new can be written;
//   - the timeline over these same Scopes already groups by List
//     (`spaceViews.ts` gantt `groupBy: "list"`), so the two views end up
//     saying the same sentence instead of two different ones.
//
// Nothing here reads i18n or React. The labels a column needs that are not a
// record's own name arrive as arguments, which is the rule `listDisplayName`
// states for the same reason.
import type { List, ListSection, Task } from "../../types";
import type { BoardColumn } from "./board";
import type { CreateResolution } from "./createResolver";
import { listDisplayName } from "../spaces/hierarchy";
import { folderIdFor } from "./sidebarFolders";
import { listIdFor } from "../spaces/membership";
import { moveTaskToList, type TaskMutation } from "./mutations";
import { groupRank } from "../view/viewSpec";
import type { TaskScopeRef } from "./scopeRegistry";

/**
 * The three answers to "what is a column here".
 *
 * A Scope picks one and cannot mix: a board whose columns were Sections for
 * some cards and Lists for others could not say what a drop meant.
 */
export type BoardAxis = "inboxRules" | "sections" | "lists";

export function boardAxisFor(scope: TaskScopeRef): BoardAxis {
  if (scope.kind === "inbox") return "inboxRules";
  if (scope.kind === "list") return "sections";
  return "lists";
}

/** The column a row with no live List of its own lands in. */
export const NO_LIST_COLUMN = "";

export interface ListAxisLabels {
  /** `t("list.defaultName")` — for a default List still carrying its shipped name. */
  defaultList: string;
  /** `t("tasks.inbox")` — the Inbox's name is the app's, not the user's (§6.7). */
  inbox: string;
}

function isLive(list: List): boolean {
  return !list.archivedAt && !list.deletedAt;
}

/**
 * The Lists a `lists`-axis Board draws, in the order the sidebar draws them.
 *
 * Two rules, and the difference between them is what the Scope IS (§2.2):
 *
 *   - a FOLDER is a set of Lists, so every live List in it gets a column even
 *     when it holds nothing. An empty column there is not noise, it is the
 *     answer to "where else could this go";
 *   - every other Scope is a question about tasks — "what is due today", "what
 *     carries this tag" — and the Lists are whatever answered it. Drawing all
 *     twenty of an account's Lists as empty columns on Today would bury the
 *     three that have work in them.
 *
 * The order comes from `groupRank`, which is the map the TIMELINE already
 * orders its List groups with. Sharing it is the point: the same Scope drawn
 * two ways must not put 일 before 집 on one and after it on the other.
 */
export function listAxisColumns(
  scope: TaskScopeRef,
  rows: Task[],
  ctx: { lists: List[] },
  labels: ListAxisLabels,
): BoardColumn[] {
  const live = ctx.lists.filter(isLive);
  const present = new Set(rows.map((task) => listIdFor(task, ctx.lists)));

  const chosen =
    scope.kind === "folder"
      ? live.filter((list) => folderIdFor(list) === scope.id)
      : live.filter((list) => present.has(list.id));

  const rank = groupRank("list", { lists: live });
  const ordered = [...chosen].sort(
    (a, b) => (rank?.get(a.id) ?? Number.POSITIVE_INFINITY) - (rank?.get(b.id) ?? Number.POSITIVE_INFINITY),
  );

  const columns = ordered.map((list) => ({
    id: list.id,
    name: listDisplayName(list, labels.defaultList, labels.inbox),
  }));

  // A row this board's columns do not cover still has to be SOMEWHERE. A card
  // in the account and on no screen is the worst bug a to-do app has (§23.3),
  // and a board that silently drops one is exactly that.
  //
  // What reaches this in practice is a `listId` naming no List at all:
  // `isTaskActive` keeps a task out of the live Scopes when its owner is
  // archived or trashed, but lets one through when there IS no owner
  // (`return !owner || …`). This function does not depend on that — it is
  // asked what the rows in hand need, whatever query produced them.
  //
  // Added only when such a row exists: an empty "no list" heading on every
  // board would be a permanent report of nothing.
  const orphaned = rows.some((task) => !chosen.some((list) => list.id === listIdFor(task, ctx.lists)));
  return orphaned ? [{ id: NO_LIST_COLUMN, labelKey: "tasks.listAxisNone" }, ...columns] : columns;
}

/**
 * Which of those columns a row is in.
 *
 * Asked against the columns rather than against the Lists, so the answer can
 * never name a column the board is not drawing — which is how a card goes
 * missing on a screen whose query and whose columns were computed apart.
 */
export function listAxisColumnOf(task: Task, columns: BoardColumn[], lists: List[]): string {
  const id = listIdFor(task, lists);
  return columns.some((column) => column.id === id) ? id : NO_LIST_COLUMN;
}

/**
 * A card dropped on a List column (§2.1).
 *
 * `moveTaskToList` already clears the Section on the way — a Section belongs
 * to one List, so carrying the old id across would leave the Task pointing at
 * a column that cannot draw it — and it already carries an undo. This function
 * adds the two refusals that belong to the BOARD rather than to the move:
 *
 *   - the "no list" column is a REPORT, not a destination. There is no field
 *     to write that would put a task there on purpose;
 *   - a List that is not live cannot be dropped into, even if a stale column
 *     is still on screen when the drop lands.
 *
 * Null is that refusal, and the caller's contract for it is the one
 * `moveTaskToSection` already set: write nothing and leave the card where it
 * was, rather than fall back to some other move.
 */
export function moveToListColumn(
  task: Task,
  listId: string,
  ctx: { lists: List[]; sections: ListSection[] },
): TaskMutation | null {
  if (!listId) return null;
  const target = ctx.lists.find((list) => list.id === listId);
  if (!target || !isLive(target)) return null;
  return moveTaskToList(task, listId, ctx.sections);
}

/**
 * A task typed into a List column.
 *
 * The column NAMES the List, which is why this can do something the Scope
 * alone could not: on a Folder the Scope's own answer is "ask which List"
 * (`createOwner: "requiresList"`), and typing into a column has already
 * answered it. The requirement is dropped rather than ignored — `canCommit`
 * reads that array, so leaving it would silently refuse the create.
 *
 * `sectionId` is cleared for the same reason `moveTaskToList` clears it: the
 * Scope's patch may carry one belonging to some other List.
 */
export function createInListColumn(base: CreateResolution, listId: string): CreateResolution {
  if (!listId) return { ...base, enabled: false };
  return {
    ...base,
    targetListId: listId,
    requiredBeforeCommit: base.requiredBeforeCommit.filter((requirement) => requirement !== "list"),
    patch: { ...base.patch, sectionId: "" },
  };
}
