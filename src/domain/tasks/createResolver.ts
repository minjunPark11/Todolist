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
import type { SavedFilter, Task } from "../../types";
import type { ReminderSpec } from "../schedule";
import type { TaskScopeRef } from "./scopeRegistry";
import { scopeRegistry } from "./scopeRegistry";
import { resolveFilterCreatePatch } from "./filters";

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
  /**
   * Tags the PERSON chose in the quick add, by name
   * (QUICK_ADD_INPUT_BOX_DESIGN.md §5.3).
   *
   * Beside `applyTagIds` rather than merged into it, and the two are different
   * facts: that one is what a Scope requires of everything created inside it,
   * this one is what someone asked for. They are also different currencies —
   * a tag typed into the quick add may not exist yet, so it has a name and no
   * id, which is the same reason §13.42's inline create hands over a name.
   *
   * Nothing in this file ever sets it. The resolver answers for the Scope; a
   * caller lays its own choices over the answer (§5.1).
   */
  applyTagNames?: string[];
  /**
   * Reminders the quick add's schedule editor asked for
   * (QUICK_ADD_INPUT_BOX_DESIGN.md §6.4).
   *
   * Not in `patch`, because a reminder is not a field — it is a row with an
   * id, and rows can only be written once the task they hang off exists
   * (§6.3). So they ride here and the caller writes them after the create,
   * the same way `dailyPlan` is a second write rather than a patched field.
   */
  reminders?: ReminderSpec[];
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
  /** The user's saved Filters, for the Scope that is one (§12.11). */
  savedFilters?: SavedFilter[];
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

    /**
     * §12.6 asked for the date instead of defaulting it, on the grounds that
     * guessing today would file a task under a day nobody picked. That was
     * right about the risk and wrong about which risk is worse.
     *
     * The cost it did not count is that the question BLOCKS: the field had to
     * be answered before the form would commit at all, so Enter did nothing on
     * this Scope and every capture cost a trip to a date picker. A quick-add
     * that cannot be used quickly is not one.
     *
     * Today is not a guess in the way §12.6 feared, either. It is the FIRST
     * DAY this Scope covers (`due >= today` in scopeQuery), so the task lands
     * at the top of the very list it was typed into — visible, dated, and one
     * click from being moved. The failure §12.6 was protecting against is a
     * task filed somewhere the user cannot see; this is the opposite of that.
     *
     * A caller that has a date still wins. Nothing about supplying one
     * changed — only what happens when nobody does.
     */
    case "upcoming":
      return {
        targetListId: ctx.chosenListId || ctx.inboxListId,
        requiredBeforeCommit: [],
        patch: { dueDate: ctx.chosenDate || ctx.today },
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

    // §12.11. The Filter decides the owner only when its spec names exactly
    // one List positively; anything else — none, or two — goes to the Inbox
    // rather than being guessed at. What it filters by is applied to what it
    // creates, through the allowlist in domain/tasks/filters and never by
    // reading the spec here.
    case "filter": {
      const saved = ctx.savedFilters?.find((filter) => filter.id === scope.id);
      const compiled = saved ? resolveFilterCreatePatch(saved.spec, ctx.today) : null;
      return {
        targetListId: ctx.chosenListId || compiled?.targetListId || ctx.inboxListId,
        requiredBeforeCommit: [],
        patch: compiled?.patch ?? {},
        ...(compiled?.applyTagIds.length ? { applyTagIds: compiled.applyTagIds } : {}),
        enabled: true,
      };
    }

    default:
      return DISABLED;
  }
}

/** Whether the resolution can be committed as it stands (§12.16). */
export function canCommit(resolution: CreateResolution): boolean {
  return resolution.enabled && resolution.requiredBeforeCommit.length === 0 && Boolean(resolution.targetListId);
}
