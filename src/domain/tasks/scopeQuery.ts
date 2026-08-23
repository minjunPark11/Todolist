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
import type { List, SavedFilter, Task, TaskDailyPlan, TaskTag } from "../../types";
import { isCompleted, isTaskAlive, isWontDo } from "./taskState";
import type { TaskScopeRef } from "./scopeRegistry";
import { listIdFor } from "../spaces/membership";
import { tagIdFor, isUserTag } from "../tags/tags";
import { folderIdFor } from "./sidebarFolders";
import { matchesFilterSpec } from "./filters";
// The same rules, answered by lookup instead of by scanning the collection.
// Semantics are untouched — see scopeIndex.ts for why identity is enough.
import { listsById, planDatesByTask, tagIdsByTask } from "./scopeIndex";
// The horizon is counted in the user's own days. A local date walked through
// `toISOString` lands a day early east of UTC, which is what the first run of
// the §12.6 fixture caught here.
import { scheduleSpan } from "../schedule/scheduleQueries";
import { scheduleFromTask } from "../schedule/taskSchedule";
import { addDays } from "../../utils/date";

/** Everything a Scope needs to answer, gathered once by the caller. */
export interface ScopeContext {
  tasks: Task[];
  lists: List[];
  dailyPlans: TaskDailyPlan[];
  taskTags: TaskTag[];
  /** The user's own today, YYYY-MM-DD — not UTC's (§12.5.1). */
  today: string;
  /**
   * The user's saved Filters (§6.49).
   *
   * Optional because every Scope but one answers without them, and a caller
   * that has none should not have to say so. The `filter` Scope reads this
   * and answers empty when the record it names is absent.
   */
  savedFilters?: SavedFilter[];
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

// D-24: the Task's own state now has one home. Re-exported so the callers
// that have always imported these from here keep working.
export { isCompleted, isTaskAlive, isTaskOpen, isTrashed, isWontDo } from "./taskState";

/**
 * §12.19's shared precondition, in one place so no Scope copies it.
 *
 * `archived` has no equivalent in the plan — it is one of the audit's grade-4
 * items, a feature the plan does not model. It is excluded here rather than
 * left to leak into every Scope, because an archived task showing up in Today
 * would be a bug in nine places instead of one decision in this one.
 */
export function isTaskActive(task: Task, lists: List[]): boolean {
  // Axis 1: the Task's own state (D-24).
  if (!isTaskAlive(task)) return false;
  // Axis 2: its container's.
  const listId = listIdFor(task, lists);
  if (!listId) return true; // nothing owns it yet; the backfill has not run
  const owner = listsById(lists).get(listId);
  // §13.19's shared precondition: the Task is active only if its owner List is.
  // A deleted List takes its Tasks out of every Scope WITHOUT writing anything
  // on them (§6.56) — which is why restoring the List brings them all back and
  // why they never appear in the Task Trash.
  return !owner || (!owner.archivedAt && !owner.deletedAt);
}

/**
 * §12.4's canonical `active`: alive, in a live List, and not finished.
 *
 * The List-aware sibling of `isTaskOpen` — same question, one more condition.
 */
function isActive(task: Task, lists: List[]): boolean {
  return isTaskActive(task, lists) && !isCompleted(task);
}

/**
 * §12.5.1: the user planned this task for that day, whatever its due date.
 *
 * Two forms of the same claim, read the way `listIdFor` and `hasTag` read
 * theirs. The record is canonical (§6.18); `scheduledDate` is the field the
 * app carried that decision in before the record existed, and it is still
 * what the calendar and the Today page write. Reading only the record would
 * drop every task planned by the older path — which is the difference the
 * Today screen and the sidebar count had drifted over.
 */
export function hasTodayPlan(task: Task, dailyPlans: TaskDailyPlan[], date: string): boolean {
  // The legacy `scheduledDate === date` read is gone: that field folded into
  // the schedule (audit §6, 1-d), and the `today` scope now asks the span
  // directly. What remains here is the explicit plan record, which is a
  // separate statement about a day and outlives the consolidation.
  return planDatesByTask(dailyPlans).get(task.id)?.has(date) ?? false;
}

/**
 * The List a Task belongs to.
 *
 * Exported since Ch. 26 §26.3.4: "which container" is List membership now,
 * not the `inbox` status, and a screen asking that question should ask it
 * the same way the Scopes do rather than reading a value off the Task.
 */
export function ownerList(task: Task, lists: List[]): List | undefined {
  const listId = listIdFor(task, lists);
  return listId ? listsById(lists).get(listId) : undefined;
}

/**
 * Does this task carry this tag?
 *
 * The relation answers; the strings are the fallback. Creation writes links
 * now (`linkTaskTags`), so the second leg no longer covers "tagged since the
 * last load" — it covers a Task written by a build that predates that change,
 * until the next load's backfill reaches it. §26.9 keeps it for exactly that,
 * and for nothing else.
 */
function hasTag(task: Task, tagId: string, links: TaskTag[]): boolean {
  if (tagIdsByTask(links).get(task.id)?.has(tagId)) return true;
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
  // A subtask is not a row in any Scope; it is shown inside its parent.
  //
  // This is the cost §13.3 predicted, and paying it here is the point: the
  // plan refuses `Task.parentTaskId` precisely because "every Task query has
  // to remember `parentTaskId IS NULL`", and a rule remembered in nine places
  // is remembered in eight. `addSubtask` writes a child Task today, so until
  // subtasks become their own records the exception is real — it just lives in
  // one line instead of one per Scope.
  if (task.parentTaskId) return false;

  switch (scope.kind) {
    // §12.12 and §12.13 are the two Scopes the `active` precondition does not
    // apply to — they exist to show exactly what it excludes.
    case "trash":
      return Boolean(task.deletedAt);
    case "completed":
      // Won't Do is gathered here now, not held apart.
      //
      // It used to be excluded so that the two Scopes stayed disjoint, which
      // was the right rule while `안 함` had a row of its own in the sidebar.
      // That row is gone (TasksSidebar): a task given up on is finished work,
      // and the IA this module follows files it with the rest of the finished
      // work rather than in a third terminal list. Disjoint Scopes with only
      // one of them reachable would simply have hidden those tasks.
      //
      // The distinction is not lost — `isWontDo` still tells the two apart,
      // which is what lets a row show it — and `/wont-do` still answers with
      // exactly the given-up half for anyone holding a link to it.
      return !task.deletedAt && (isCompleted(task) || isWontDo(task));
    case "wontDo":
      return !task.deletedAt && isWontDo(task);

    // §12.5.1. Today is NOT `dueDate == today`: it is overdue, plus due today,
    // plus anything explicitly planned for today — and a future task with a
    // plan comes in WITHOUT its due date being changed.
    //
    // "Has it started?" is the span's question after the consolidation (audit
    // §6, 1-e). A schedule whose first day has arrived is today's, whether
    // that day is its only one or the start of a range, and it stays today's
    // once the last day has passed — which is what makes overdue part of
    // Today rather than a bucket beside it.
    case "today": {
      if (!isActive(task, ctx.lists)) return false;
      const span = scheduleSpan(scheduleFromTask(task));
      if (span !== null && span.start <= ctx.today) return true;
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

    // §12.4 asks for `task.list.sidebarFolderId`, and §6.36 lets the sidebar's
    // grouping and the domain Folder be true at once. `folderIdFor` is the one
    // place that decides between them, so the group in the sidebar and the
    // Scope its header opens cannot come to disagree.
    case "folder": {
      const list = ownerList(task, ctx.lists);
      return isActive(task, ctx.lists) && !!list && folderIdFor(list) === scope.id;
    }

    case "tag":
      return isActive(task, ctx.lists) && hasTag(task, scope.id, ctx.taskTags);

    // §12.11. A Filter's baseline is the Scope's, not the spec's: active and
    // not finished, because Completed and Trash are the Scopes that show
    // those. A Filter naming no record — deleted, or written by a client this
    // one cannot read — matches nothing rather than everything.
    case "filter": {
      const saved = ctx.savedFilters?.find((filter) => filter.id === scope.id);
      if (!saved || !isActive(task, ctx.lists)) return false;
      return matchesFilterSpec(task, saved.spec, { lists: ctx.lists, taskTags: ctx.taskTags, today: ctx.today });
    }
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
