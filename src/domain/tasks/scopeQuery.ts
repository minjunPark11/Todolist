// What each Scope contains, as one predicate (TickTick plan §12.5-§12.13, §12.19).
//
// §12.19 forbids the UI from assembling where-conditions, and §12.14 forbids a
// screen from inventing a count formula: "Count = 해당 Scope query의 row count".
// Gate 2 (§16.25) states the property those two rules exist for — the main
// result, the sidebar count and the header count must be the same rows.
//
// So they are not three implementations that agree. `matchesScope` is the only
// membership rule; `queryScopeTasks` filters by it and `queryScopeCount`
// counts what that returns. Agreement is structural, and the test that pins it
// is checking that nobody has since added a shortcut.
import type { List, Task, TaskDailyPlan, TaskTag } from "../../types";
import type { TaskScopeRef } from "./scopeRegistry";
import { listIdFor } from "../spaces/membership";
import { tagIdFor, isUserTag } from "../tags/tags";
// The horizon is counted in the user's own days. A local date walked through
// `toISOString` lands a day early east of UTC, which is what the first run of
// the §12.6 fixture caught here.
import { addDays } from "../../utils/date";

/** Everything a Scope needs to answer, gathered once by the caller. */
export interface ScopeContext {
  tasks: Task[];
  lists: List[];
  dailyPlans: TaskDailyPlan[];
  taskTags: TaskTag[];
  /** The user's own today, YYYY-MM-DD — not UTC's (§12.5.1). */
  today: string;
}

/**
 * The deadline a Scope reasons about (§12.5.1).
 *
 * The plan splits this into `dueOn` and `dueAt` and converts the second into
 * the user's date. That split is the audit's C-2 structure change and has not
 * happened, so `dueDate` still plays both parts — it is already date-only and
 * already in the user's terms, which is why the Scopes below can be written
 * against it now and keep working after the split.
 */
export function effectiveDueDate(task: Task): string {
  return task.dueDate || "";
}

/**
 * Completion, from the one field the app actually reads.
 *
 * The audit's section A found this stored twice — `status === "done"` beside
 * `completedAt` — with `status` winning. §12.12 words its membership as
 * `completedAt != null`; that is the same set here, and unifying the two is
 * C-2's open item, not this module's to decide.
 */
export function isCompleted(task: Task): boolean {
  return task.status === "done";
}

/**
 * §12.19's shared precondition, in one place so no Scope copies it.
 *
 * `archived` has no equivalent in the plan — it is one of the audit's grade-4
 * items, a feature the plan does not model. It is excluded here rather than
 * left to leak into every Scope, because an archived task showing up in Today
 * would be a bug in nine places instead of one decision in this one.
 */
export function isTaskActive(task: Task, lists: List[]): boolean {
  if (task.deletedAt) return false;
  if (task.status === "archived") return false;
  const listId = listIdFor(task, lists);
  if (!listId) return true; // nothing owns it yet; the backfill has not run
  const owner = lists.find((list) => list.id === listId);
  return !owner || !owner.archivedAt;
}

/** §12.4's canonical `active`: alive, and not finished. */
function isActive(task: Task, lists: List[]): boolean {
  return isTaskActive(task, lists) && !isCompleted(task);
}

/** §12.5.1: the user planned this task for that day, whatever its due date. */
export function hasTodayPlan(task: Task, dailyPlans: TaskDailyPlan[], date: string): boolean {
  return dailyPlans.some((plan) => plan.taskId === task.id && plan.planDate === date);
}

function ownerList(task: Task, lists: List[]): List | undefined {
  const listId = listIdFor(task, lists);
  return listId ? lists.find((list) => list.id === listId) : undefined;
}

/**
 * Does this task carry this tag?
 *
 * Reads the record first and the string second, the way `listIdFor` reads the
 * stored owner before the derived one. The strings are still what creation
 * writes, so a task tagged since the last load has no link yet; §6.74 retires
 * this second leg once creation writes links itself (Phase 4).
 */
function hasTag(task: Task, tagId: string, links: TaskTag[]): boolean {
  if (links.some((link) => link.taskId === task.id && link.tagId === tagId)) return true;
  return task.tags.some((name) => isUserTag(name) && tagIdFor(name) === tagId);
}

/**
 * The one membership rule (§12.19).
 *
 * Also what an optimistic mutation re-evaluates against, which is why it takes
 * a task rather than running over the collection: after an edit the caller
 * asks this whether the row still belongs where it is showing (§12.21).
 */
export function matchesScope(task: Task, scope: TaskScopeRef, ctx: ScopeContext): boolean {
  switch (scope.kind) {
    // §12.12 and §12.13 are the two Scopes the `active` precondition does not
    // apply to — they exist to show exactly what it excludes.
    case "trash":
      return Boolean(task.deletedAt);
    case "completed":
      return !task.deletedAt && isCompleted(task);

    // §12.5.1. Today is NOT `dueDate == today`: it is overdue, plus due today,
    // plus anything explicitly planned for today — and a future task with a
    // plan comes in WITHOUT its due date being changed.
    case "today": {
      if (!isActive(task, ctx.lists)) return false;
      const due = effectiveDueDate(task);
      if (due && due <= ctx.today) return true;
      return hasTodayPlan(task, ctx.dailyPlans, ctx.today);
    }

    // §12.6. Overdue belongs to Today, not here, and a plan alone does not put
    // a task on a horizon that is made of dates.
    case "upcoming": {
      if (!isActive(task, ctx.lists)) return false;
      const due = effectiveDueDate(task);
      if (!due) return false;
      return due >= ctx.today && due <= addDays(ctx.today, 6);
    }

    // §12.7. Membership is the owning List's kind, not `status === "inbox"`:
    // that status is the leg Migration Phase 2 replaced.
    case "inbox":
      return isActive(task, ctx.lists) && ownerList(task, ctx.lists)?.kind === "inbox";

    case "list":
      return isActive(task, ctx.lists) && listIdFor(task, ctx.lists) === scope.id;

    // §12.4 asks for `task.list.sidebarFolderId`. The presentation Folder is
    // Migration Phase 5 and does not exist; §6.36 lets both live at once, so
    // this reads the domain Folder the Lists already hang under and will read
    // the other one beside it when there is one.
    case "folder":
      return isActive(task, ctx.lists) && ownerList(task, ctx.lists)?.folderId === scope.id;

    case "tag":
      return isActive(task, ctx.lists) && hasTag(task, scope.id, ctx.taskTags);

    // A Filter is a stored spec (§6.49) and there are no SavedFilter records
    // yet. Answering "no rows" is the honest empty state; answering "every
    // row" would look like a working screen showing the wrong thing.
    case "filter":
      return false;
  }
}

export function queryScopeTasks(scope: TaskScopeRef, ctx: ScopeContext): Task[] {
  return ctx.tasks.filter((task) => matchesScope(task, scope, ctx));
}

/**
 * §12.14: the count IS the query's row count. Not a cheaper approximation of
 * it — that is how a sidebar comes to disagree with the header it points at.
 */
export function queryScopeCount(scope: TaskScopeRef, ctx: ScopeContext): number {
  return queryScopeTasks(scope, ctx).length;
}
