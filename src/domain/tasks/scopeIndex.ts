// Lookup tables for the Scope queries, cached on the identity of the arrays
// they are built from.
//
// The membership rules in `scopeQuery` are written one task at a time, which is
// what §12.21 needs — after an edit the caller asks whether THAT row still
// belongs where it is showing. Written that way, each rule reached for the
// whole collection to answer about one record: "does this task carry this tag"
// scanned every tag link in the account, "is it planned for today" scanned
// every plan, and "which List owns it" scanned every List. A Scope query runs
// the rule once per task, so each of those is a full second pass, and the
// sidebar runs a query per row it shows.
//
// Profiled before this existed: one sidebar paint took 8ms at 500 tasks, 1.5
// SECONDS at 5,000, and 39 seconds at 20,000. The rules were right and the
// lookups were linear.
//
// The cache is a WeakMap on the source array, which works because of the
// invariant the sync already depends on: reducers rebuild only the collection
// they touch, so an array that is identical is a collection that has not
// changed (see diffRecords). Nothing here may be given an array that was
// mutated in place — that is already true everywhere, and it is the same
// assumption `buildSyncPlan` makes about what to upload.
import type { List, TaskDailyPlan, TaskTag } from "../../types";

const listCache = new WeakMap<List[], Map<string, List>>();
const tagCache = new WeakMap<TaskTag[], Map<string, Set<string>>>();
const planCache = new WeakMap<TaskDailyPlan[], Map<string, Set<string>>>();

/** Lists by id, for the owner lookup every Scope makes. */
export function listsById(lists: List[]): Map<string, List> {
  const cached = listCache.get(lists);
  if (cached) return cached;
  const index = new Map(lists.map((list) => [list.id, list]));
  listCache.set(lists, index);
  return index;
}

/** Tag ids per task, from the link records (§6.74's canonical side). */
export function tagIdsByTask(links: TaskTag[]): Map<string, Set<string>> {
  const cached = tagCache.get(links);
  if (cached) return cached;
  const index = new Map<string, Set<string>>();
  for (const link of links) {
    const existing = index.get(link.taskId);
    if (existing) existing.add(link.tagId);
    else index.set(link.taskId, new Set([link.tagId]));
  }
  tagCache.set(links, index);
  return index;
}

/** The dates each task is planned for (§6.18's record form). */
export function planDatesByTask(plans: TaskDailyPlan[]): Map<string, Set<string>> {
  const cached = planCache.get(plans);
  if (cached) return cached;
  const index = new Map<string, Set<string>>();
  for (const plan of plans) {
    const existing = index.get(plan.taskId);
    if (existing) existing.add(plan.planDate);
    else index.set(plan.taskId, new Set([plan.planDate]));
  }
  planCache.set(plans, index);
  return index;
}
