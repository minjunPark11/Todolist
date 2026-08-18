// Where a new Task goes, decided once (TickTick plan §12.16).
//
// §12.16 opens with the prohibition it exists for: every `+ 작업` entry point
// must not work out the owner for itself. There are many of them — a header
// button, an inline row, a Board column, a global shortcut — and each one that
// decides independently is a copy of the rule that can drift from the Scope it
// was pressed in.
//
// So this answers for all of them, and it answers with a plan rather than an
// action: what List, what else must be supplied before it can be committed,
// what to patch onto the Task, and whether the day gets a plan record. The
// caller commits; §12.16's last line is that `createTask()` must never be
// handed `targetListId = null`.
import type { Task } from "../../types";
import type { TaskScopeRef } from "./scopeRegistry";
import { scopeRegistry } from "./scopeRegistry";

/** What still has to be chosen before this can be written (§12.16). */
export type CreateRequirement = "list" | "date";

export interface CreateResolution {
  /** Null while a requirement is outstanding — never passed to createTask. */
  targetListId: string | null;
  requiredBeforeCommit: CreateRequirement[];
  /** Task fields the Scope decides. Only fields a Task actually stores. */
  patch: Partial<Task>;
  /**
   * Tags to apply, by Tag id (§12.4's Auto Apply column).
   *
   * Kept out of `patch` on purpose: `Task.tags` holds NAMES, and the Scope
   * knows an id. Resolving one to the other needs the Tag records, which is
   * the caller's job — pretending an id were a name here is how a task ends up
   * tagged `tag-work`.
   */
  applyTagIds?: string[];
  /** The day this task is planned for, if the Scope means one (§12.5.3). */
  dailyPlan?: { planDate: string };
  /** False for the two read-only Scopes (§12.4). */
  enabled: boolean;
}

export interface CreateContext {
  /** The account's Inbox List — the fallback owner for most Scopes. */
  inboxListId: string;
  /** The user's own today, for the Scope that plans one. */
  today: string;
  /** Lists inside the current Folder, when the Scope is a Folder. */
  folderListIds?: string[];
  /** A List the user picked to satisfy a requirement. */
  chosenListId?: string;
  /** A date the user supplied to satisfy a requirement. */
  chosenDate?: string;
}

const DISABLED: CreateResolution = {
  targetListId: null,
  requiredBeforeCommit: [],
  patch: {},
  enabled: false,
};

/**
 * §12.16's table, and Gate 4 checks this function against §12.4's matrix.
 *
 * The interesting rows are the ones that answer "you cannot yet":
 *
 *   - Upcoming asks for a date, because the Scope IS a set of dates. §12.6
 *     refuses to commit a task with none — it would be created into a horizon
 *     it does not appear on.
 *   - Folder asks for a List, and only one of its own. §12.4 is explicit that
 *     a Folder holds several and the app must not pick silently; a Task filed
 *     somewhere the user did not choose is worse than a second question.
 */
export function resolveCreateContext(scope: TaskScopeRef, ctx: CreateContext): CreateResolution {
  if (!scopeRegistry[scope.kind].canCreate) return DISABLED;

  switch (scope.kind) {
    // §12.5.3. The task lands in the Inbox and the DAY is what Today
    // contributes — no due date is invented, because being planned for today
    // and being due today are different claims (§12.5.1).
    case "today":
      return {
        targetListId: ctx.chosenListId || ctx.inboxListId,
        requiredBeforeCommit: [],
        patch: {},
        dailyPlan: { planDate: ctx.today },
        enabled: true,
      };

    // §12.6. The date is the Scope, so it is required rather than defaulted:
    // guessing today would file it under a day the user did not pick.
    case "upcoming":
      return {
        targetListId: ctx.chosenDate ? ctx.chosenListId || ctx.inboxListId : null,
        requiredBeforeCommit: ctx.chosenDate ? [] : ["date"],
        patch: ctx.chosenDate ? { dueDate: ctx.chosenDate } : {},
        enabled: true,
      };

    case "inbox":
      return { targetListId: ctx.inboxListId, requiredBeforeCommit: [], patch: {}, enabled: true };

    case "list":
      return { targetListId: scope.id, requiredBeforeCommit: [], patch: {}, enabled: true };

    // §12.4: "하위 List 선택 필수". A choice from outside this Folder is not a
    // choice for this Folder, so it is refused rather than honoured.
    case "folder": {
      const inside = ctx.folderListIds ?? [];
      const chosen = ctx.chosenListId && inside.includes(ctx.chosenListId) ? ctx.chosenListId : "";
      return {
        targetListId: chosen || null,
        requiredBeforeCommit: chosen ? [] : ["list"],
        patch: {},
        enabled: true,
      };
    }

    // §12.4's Auto Apply column: what the Scope filters by is applied to what
    // it creates, so a task made under a Tag carries that Tag and does not
    // vanish from the screen that made it.
    case "tag":
      return {
        targetListId: ctx.chosenListId || ctx.inboxListId,
        requiredBeforeCommit: [],
        patch: {},
        applyTagIds: [scope.id],
        enabled: true,
      };

    // §12.4 wants the Filter's single owner List when it resolves to one, and
    // its create-applicable conditions as a patch. Neither is knowable without
    // a SavedFilter record, so the Inbox answers and the patch is empty until
    // there is a spec to compile.
    case "filter":
      return {
        targetListId: ctx.chosenListId || ctx.inboxListId,
        requiredBeforeCommit: [],
        patch: {},
        enabled: true,
      };

    default:
      return DISABLED;
  }
}

/** Whether the resolution can be committed as it stands (§12.16). */
export function canCommit(resolution: CreateResolution): boolean {
  return resolution.enabled && resolution.requiredBeforeCommit.length === 0 && Boolean(resolution.targetListId);
}
