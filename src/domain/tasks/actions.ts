// What a Task can be told to do, in one list (spec §15.64, §15.65).
//
// Three surfaces ask that question — the Detail's More menu, a right-click on
// a row, a Board card's ⋯ — and §15.63 says they must not each answer it. They
// did: the row menu was built by hand in `TasksModule.taskMenuAt` and the
// Detail had no menu at all, so Won't Do and Trash sat as two loose buttons at
// the bottom of the panel and Pin, Duplicate, Copy Link and Start Focus were
// reachable from nowhere.
//
// This module returns DATA and not closures: a list of ids with the label and
// the group each belongs to. The command behind an id is the surface's to
// supply, because a mutation needs the store and this file needs to stay a
// pure function of one Task. That split is also what makes §15.66 possible —
// `canRunTaskAction` re-asks the availability question at execute time, and a
// registry made of closures has nothing left to re-ask.
import type { TaskStateFields } from "./taskState";
import { isCompleted, isNote, isPinned, isTaskOpen, isTrashed, isWontDo } from "./taskState";

/**
 * One id per COMMAND, not per menu row.
 *
 * Pin and Unpin are two ids rather than one with a swapping label, and so are
 * Won't Do and Restart. They write different patches, they undo to different
 * states, and a surface maps an id straight to a handler — one id whose
 * meaning depends on the Task would make every one of those handlers re-derive
 * the state this file already knows.
 */
export type TaskActionId =
  /**
   * The four that OPEN something in the Detail rather than change the Task.
   *
   * They are here because the reference app puts them here: its ⋯ opens with
   * `하위 할일 추가` and carries `태그 ▸` two rows down
   * (TICKTICK_DETAIL_ANATOMY_DESIGN.md §2). A property row that is always drawn
   * costs every Task the space of a field most Tasks do not use; a menu row
   * costs a click only the Tasks that use it pay.
   *
   * `activities` has worked this way since §25.7 — it opens a panel and
   * changes nothing — so this is that shape with four more members rather than
   * a new idea.
   */
  | "addSubtask"
  | "addTag"
  | "setBlocker"
  | "addNote"
  | "pin"
  | "unpin"
  | "duplicate"
  | "saveAsTemplate"
  | "copyLink"
  | "startFocus"
  | "activities"
  | "complete"
  | "reopen"
  | "wontDo"
  | "restart"
  | "trash"
  | "restore"
  | "deleteForever";

/**
 * §15.42's groups, in §15.42's order.
 *
 * The order is fixed here rather than at each surface because that section's
 * point is that it does not move: a menu whose rows change places between two
 * openings costs the reader the muscle memory that made the menu fast.
 */
export type TaskActionGroupId = "add" | "quick" | "work" | "status" | "danger";

// `add` leads, which is where the reference app's `하위 할일 추가` sits.
const GROUP_ORDER: readonly TaskActionGroupId[] = ["add", "quick", "work", "status", "danger"];

export interface TaskAction {
  id: TaskActionId;
  /** i18n key. §15.44: the label is the action; an icon may only accompany it. */
  labelKey: string;
  group: TaskActionGroupId;
  /** §15.30's destructive treatment, for the surface to draw. */
  danger?: boolean;
  /**
   * Set when the action is offered but refused (§15.5).
   *
   * An i18n key and not a boolean, because that section asks for a reason: a
   * row that is grey and silent tells the reader they have done something
   * wrong without saying what.
   */
  disabledReasonKey?: string;
}

export interface TaskActionGroup {
  id: TaskActionGroupId;
  items: TaskAction[];
}

export interface TaskActionContext {
  task: TaskStateFields;
  /**
   * Ids this surface already draws as controls of its own (§15.3).
   *
   * The Detail's header has a Complete checkbox, so repeating Complete inside
   * its More menu is one of §15.70's duplicated, meaningless rows. The row
   * menu promotes nothing and gets the full set. This filters the MENU only —
   * `canRunTaskAction` ignores it, because a promoted action is still an
   * action and the control that draws it still has to run.
   */
  promoted?: readonly TaskActionId[];
  /**
   * True while some other Task owns the focus timer.
   *
   * §15.5's second case: not "no reason to exist" but "not right now", which
   * is disabled-with-a-reason rather than hidden. `startFocusSession` returns
   * without doing anything when a session is already running, so without this
   * the menu item would be a button that silently did nothing.
   */
  focusBusy?: boolean;
  /**
   * Which surface is asking (§15.3).
   *
   * Only the Detail gets the `add` group: those four reveal a section of the
   * Detail, and a row's right-click menu has no Detail to reveal one in. It is
   * not `promoted` — that word means "I draw this myself", and the row does
   * not draw them at all.
   *
   * Absent means `row`, so a surface that has not thought about it gets the
   * conservative set.
   */
  surface?: "detail" | "row";
}

type Availability = "hidden" | "enabled" | { disabledReasonKey: string };

const DEFINITIONS: ReadonlyArray<Omit<TaskAction, "disabledReasonKey">> = [
  /* The four label themselves with the words already on the section each one
     opens — no `tasks.menu.*` spelling of its own. Four new keys would have
     been four second names for four fields the reader can already see named,
     which is the duplicate §4.2 refused. */
  { id: "addSubtask", labelKey: "tasks.addSubtask", group: "add" },
  { id: "addTag", labelKey: "tasks.tags", group: "add" },
  { id: "setBlocker", labelKey: "taskDetail.blockedBy", group: "add" },
  { id: "addNote", labelKey: "taskDetail.notes", group: "add" },
  { id: "pin", labelKey: "tasks.menu.pin", group: "quick" },
  { id: "unpin", labelKey: "tasks.menu.unpin", group: "quick" },
  { id: "duplicate", labelKey: "tasks.menu.duplicate", group: "quick" },
  { id: "saveAsTemplate", labelKey: "tasks.menu.saveAsTemplate", group: "quick" },
  { id: "copyLink", labelKey: "tasks.menu.copyLink", group: "quick" },
  { id: "startFocus", labelKey: "tasks.menu.startFocus", group: "work" },
  { id: "activities", labelKey: "tasks.menu.activities", group: "work" },
  { id: "complete", labelKey: "tasks.menu.complete", group: "status" },
  { id: "reopen", labelKey: "tasks.menu.reopen", group: "status" },
  { id: "wontDo", labelKey: "tasks.markWontDo", group: "status" },
  { id: "restart", labelKey: "tasks.unmarkWontDo", group: "status" },
  { id: "restore", labelKey: "tasks.menu.restore", group: "status" },
  { id: "trash", labelKey: "tasks.menu.trash", group: "danger", danger: true },
  // Below Trash and only ever beside it: the two are the same verb at two
  // depths, and the order says which one is further (TRASH_PERMANENT_DELETE_
  // DESIGN.md §3.1). Never both at once — `availabilityOf` shows Trash to a
  // live Task and this one only to a Task already in the Trash.
  { id: "deleteForever", labelKey: "tasks.menu.deleteForever", group: "danger", danger: true },
];

/**
 * The actions a trashed Task still has (§15.66's "not deleted" precondition).
 *
 * Everything else is hidden rather than disabled: a Task in the Trash is not
 * temporarily unable to be pinned or given up on, it is somewhere those verbs
 * do not apply, and §15.5 sends that case to `hide`. Until now the Detail
 * offered a trashed Task a "Move to trash" button — a control whose only
 * possible effect was to rewrite the timestamp that had put it there.
 *
 * Two things are left to do with it — get it back, or stop keeping it — so
 * those are what is offered, together with the two that change nothing. Copy
 * Link survives
 * because §15.58 says it is not a mutation, and a link to a trashed Task is
 * how one person shows another what they are about to restore; Activities
 * survives because it is the surface that says when the Task was thrown away.
 */
const TRASHED_ACTIONS: readonly TaskActionId[] = [
  "copyLink",
  "activities",
  "restore",
  "deleteForever",
];

/** The four that open a section of the Detail (§2). */
export const DETAIL_REVEAL_ACTIONS: readonly TaskActionId[] = [
  "addSubtask",
  "addTag",
  "setBlocker",
  "addNote",
];

function availabilityOf(id: TaskActionId, ctx: TaskActionContext): Availability {
  const { task } = ctx;

  if (isTrashed(task)) return TRASHED_ACTIONS.includes(id) ? "enabled" : "hidden";

  // A row's menu has nowhere to put what these open (§15.3).
  if (DETAIL_REVEAL_ACTIONS.includes(id) && ctx.surface !== "detail") return "hidden";

  switch (id) {
    // Both belong to a Task in the Trash, and the branch above has already
    // answered for those. Reaching here means the Task is not in the Trash, so
    // there is nothing to restore and nothing to stop keeping.
    case "restore":
    case "deleteForever":
      return "hidden";
    case "pin":
      return isPinned(task) ? "hidden" : "enabled";
    case "unpin":
      return isPinned(task) ? "enabled" : "hidden";
    // A note has nothing to finish (QUICK_ADD_INPUT_BOX_DESIGN.md §7.1), so
    // both halves of the toggle are absent rather than offered and refused.
    case "complete":
      return isNote(task) || isCompleted(task) ? "hidden" : "enabled";
    case "reopen":
      return !isNote(task) && isCompleted(task) ? "enabled" : "hidden";
    case "wontDo":
      return isWontDo(task) ? "hidden" : "enabled";
    case "restart":
      return isWontDo(task) ? "enabled" : "hidden";
    case "startFocus":
      // Work that is finished or given up on is not work to sit down to
      // (§15.5, and `isTaskOpen` is the app's existing word for it).
      if (!isTaskOpen(task)) return "hidden";
      return ctx.focusBusy ? { disabledReasonKey: "tasks.menu.focusBusy" } : "enabled";
    default:
      return "enabled";
  }
}

/**
 * The menu for this Task, grouped and ordered (§15.3, §15.4, §15.42).
 *
 * Context-sensitive by construction: an action with nothing to do in the
 * current state is absent, so no surface has to know that Reopen is for
 * finished Tasks. Empty groups are dropped rather than drawn as a separator
 * with nothing under it.
 */
export function taskActions(ctx: TaskActionContext): TaskActionGroup[] {
  const promoted = ctx.promoted ?? [];
  const groups = new Map<TaskActionGroupId, TaskAction[]>();

  for (const definition of DEFINITIONS) {
    if (promoted.includes(definition.id)) continue;
    const availability = availabilityOf(definition.id, ctx);
    if (availability === "hidden") continue;
    const item: TaskAction =
      availability === "enabled"
        ? { ...definition }
        : { ...definition, disabledReasonKey: availability.disabledReasonKey };
    const bucket = groups.get(definition.group);
    if (bucket) bucket.push(item);
    else groups.set(definition.group, [item]);
  }

  return GROUP_ORDER.filter((id) => groups.has(id)).map((id) => ({
    id,
    items: groups.get(id) ?? [],
  }));
}

/**
 * §15.66, §15.67: ask again, at the moment of running.
 *
 * A menu is a picture of the state it was opened in. Between then and the
 * click a sync can land, another window can trash the Task, or a focus session
 * can start — and §15.67 is explicit that the menu's own state is not the
 * truth to act on. Surfaces call this with the Task read fresh from the store;
 * `false` means drop the action rather than run it against a Task that no
 * longer looks like the one the reader chose it for.
 *
 * `promoted` is deliberately ignored: it says where an action is DRAWN, and a
 * checkbox in a header runs the same command the menu row would have.
 */
export function canRunTaskAction(
  id: TaskActionId,
  task: TaskStateFields | undefined,
  ctx: Omit<TaskActionContext, "task" | "promoted"> = {},
): boolean {
  if (!task) return false;
  return availabilityOf(id, { ...ctx, task }) === "enabled";
}
