// Saved Filters: the record, what it selects, and what it creates
// (TickTick plan §6.49-§6.51, §12.11).
//
// A Filter is a Query, not a container. Nothing is stored inside one and
// deleting one deletes no Task — which is also why the same spec has to
// answer two different questions. Reading it forwards says which Tasks the
// Scope shows; reading it backwards says where a Task created inside that
// Scope should go, and with what already filled in, so a Task made under
// "due today, tagged work" does not vanish the moment it is created.
//
// §12.11 draws a hard line through the second reading. Only an allowlist of
// positive conditions may be applied on create: list, tag, a concrete due
// date, and priority. A `contains`, a negation, or anything about completion
// is matchable and NOT applicable — the UI never reads the JSON and patches
// what it likes, it asks `resolveFilterCreatePatch`.
import type { FilterCondition, FilterSpec, List, SavedFilter, Task, TaskTag } from "../../types";
import { listIdFor } from "../spaces/membership";
import { tagIdFor, isUserTag } from "../tags/tags";

const FIELDS: ReadonlyArray<FilterCondition["field"]> = ["list", "tag", "due", "priority", "title"];
const OPS: ReadonlyArray<FilterCondition["op"]> = ["eq", "includes", "on", "before", "after", "contains"];

/** The `due` value a user writes as a word rather than a date (§12.11). */
export const TODAY_TOKEN = "today";

function sanitizeCondition(value: unknown): FilterCondition | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const field = record.field as FilterCondition["field"];
  const op = record.op as FilterCondition["op"];
  const conditionValue = typeof record.value === "string" ? record.value.trim() : "";
  if (!FIELDS.includes(field) || !OPS.includes(op) || !conditionValue) return null;
  return { field, op, value: conditionValue, ...(record.not === true ? { not: true } : {}) };
}

/**
 * A spec this build can evaluate, or null.
 *
 * A newer `version` is refused whole rather than read field by field. §6.51
 * asks for the number so an unevaluable spec can be RECOGNISED — a spec
 * half-read by an old client would select the wrong Tasks while looking like
 * it worked, which is worse than a Filter that says it cannot be shown.
 */
export function sanitizeFilterSpec(value: unknown): FilterSpec | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return null;
  const all = Array.isArray(record.all)
    ? record.all.map(sanitizeCondition).filter((condition): condition is FilterCondition => condition !== null)
    : [];
  const sort = record.sort;
  return {
    version: 1,
    all,
    ...(sort === "due" || sort === "priority" || sort === "created" ? { sort } : {}),
  };
}

export function sanitizeSavedFilter(value: unknown): SavedFilter | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const spec = sanitizeFilterSpec(record.spec);
  // No spec means no Query, and a Filter that selects nothing definable would
  // sit in the sidebar opening an empty screen with no way to tell why.
  if (!id || !name || !spec) return null;
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : "";
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : "";
  return {
    ...(record as Partial<SavedFilter>), // M0 passthrough
    id,
    name,
    spec,
    sortKey: typeof record.sortKey === "number" && Number.isFinite(record.sortKey) ? record.sortKey : undefined,
    createdAt: createdAt || updatedAt,
    updatedAt: updatedAt || createdAt,
  };
}

export function activeSavedFilters(filters: SavedFilter[]): SavedFilter[] {
  return [...filters].sort((a, b) => (a.sortKey ?? 0) - (b.sortKey ?? 0) || a.name.localeCompare(b.name));
}

export interface FilterMatchContext {
  lists: List[];
  taskTags: TaskTag[];
  /** The user's own today, for the `today` token. */
  today: string;
}

function resolveDate(value: string, today: string): string {
  return value === TODAY_TOKEN ? today : value;
}

function taskHasTag(task: Task, tagId: string, links: TaskTag[]): boolean {
  if (links.some((link) => link.taskId === task.id && link.tagId === tagId)) return true;
  return task.tags.some((name) => isUserTag(name) && tagIdFor(name) === tagId);
}

function conditionHolds(task: Task, condition: FilterCondition, ctx: FilterMatchContext): boolean {
  switch (condition.field) {
    case "list":
      return listIdFor(task, ctx.lists) === condition.value;
    case "tag":
      return taskHasTag(task, condition.value, ctx.taskTags);
    case "priority":
      return task.priority === condition.value;
    case "title":
      return task.title.toLowerCase().includes(condition.value.toLowerCase());
    case "due": {
      const due = task.dueDate || "";
      // A task with no deadline is not before, on, or after a date. Reading ""
      // as the beginning of time would sweep every undated task into every
      // "due before" Filter.
      if (!due) return false;
      const target = resolveDate(condition.value, ctx.today);
      if (condition.op === "before") return due < target;
      if (condition.op === "after") return due > target;
      return due === target;
    }
  }
}

/**
 * §12.11's `matches(filterSpec)`, without its baseline.
 *
 * Deleted and completed Tasks are excluded by the Scope, not here — those two
 * have Scopes of their own, and a Filter that had to remember them would be
 * one more copy of a rule `scopeQuery` already states once.
 *
 * An empty condition list matches nothing rather than everything. A Filter the
 * user has not finished defining should not read as "all Tasks".
 */
export function matchesFilterSpec(task: Task, spec: FilterSpec, ctx: FilterMatchContext): boolean {
  if (spec.all.length === 0) return false;
  return spec.all.every((condition) => {
    const holds = conditionHolds(task, condition, ctx);
    return condition.not ? !holds : holds;
  });
}

export interface FilterCreatePlan {
  /** The Filter's single owner List, or "" when it does not resolve to one. */
  targetListId: string;
  patch: Partial<Task>;
  applyTagIds: string[];
}

/**
 * §12.11's Auto Apply, as the explicit allowlist it asks for.
 *
 * The rule is one line — apply only positive conditions naming a value a new
 * Task can simply carry — and the rest follows from it:
 *
 *   - a negation says what the Task is NOT, which is not a value to write;
 *   - `contains` describes a title the user has not typed yet;
 *   - two different `list` conditions cannot both be the owner, so neither is,
 *     and §12.11 sends the Task to the Inbox instead of guessing.
 */
export function resolveFilterCreatePatch(spec: FilterSpec, today: string): FilterCreatePlan {
  const plan: FilterCreatePlan = { targetListId: "", patch: {}, applyTagIds: [] };
  const listIds = new Set<string>();

  for (const condition of spec.all) {
    if (condition.not) continue;
    switch (condition.field) {
      case "list":
        if (condition.op === "eq") listIds.add(condition.value);
        break;
      case "tag":
        if (condition.op === "includes") plan.applyTagIds.push(condition.value);
        break;
      case "priority":
        if (condition.op === "eq") plan.patch.priority = condition.value as Task["priority"];
        break;
      case "due":
        // Only a date the Task can actually be given. `before` and `after`
        // name a range, and picking a member of it would be the app choosing
        // a deadline the user never did.
        if (condition.op === "on") plan.patch.dueDate = resolveDate(condition.value, today);
        break;
      case "title":
        break;
    }
  }

  if (listIds.size === 1) plan.targetListId = [...listIds][0];
  return plan;
}
