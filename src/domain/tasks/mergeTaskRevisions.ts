// 겹치지 않은 편집은 묻지 않는다 (TASK_CONFLICT_FIELD_MERGE_DESIGN.md M2).
//
// 순수 함수다. usePlannerData가 revision 세션의 두 충돌 경로에 연결한다.
//
// A task is one revision, so any divergence is a conflict today, even when the
// two devices touched nothing in common. This is the three-way merge that
// makes those stop being questions: with the row both sides left from, "these
// differ" becomes "you changed the due date and they changed the title".
import type { Task } from "../../types";
import { sameRevisionData } from "../sync/taskRevisionSession";

/**
 * The merge unit — a group, never a single field (§D3).
 *
 * `status` without `completedAt` is not a value anyone wrote. Picking them
 * from different sides produces a record neither device would accept, and it
 * would look exactly like a record someone had saved. Fields that must agree
 * travel together or not at all.
 *
 * Adding a Task field and forgetting this table is safe by construction: the
 * field falls through to §D4 and stops the merge rather than being silently
 * assigned a side. `mergeTaskRevisions.test.ts` reads `types.ts` and makes it
 * loud as well as safe.
 */
export const TASK_MERGE_GROUPS: Readonly<Record<string, readonly (keyof Task)[]>> = {
  content: ["title", "description", "contentMode", "notes", "kind"],
  schedule: ["dueDate", "startDate", "startTime", "endTime"],
  repeat: ["repeatType", "repeatInterval", "repeatDays", "repeatEndDate", "exdates", "recurrenceId", "occurrenceOf"],
  // The biggest group, and deliberately so. One device finishing a task while
  // the other bins it is a real question, and these six are how either of
  // those is written down.
  lifecycle: ["status", "completedAt", "archivedAt", "wontDoAt", "previousStatus", "deletedAt"],
  placement: ["projectId", "listId", "sectionId", "statusId", "categoryId", "parentTaskId", "order"],
  importance: ["priority", "pinnedAt"],
  // One value, not a set. Merging tags by union is a choice about meaning —
  // does a tag one side removed come back because the other left it alone? —
  // and the design puts that outside this function (§4).
  tags: ["tags"],
  waiting: ["isSomeday", "waitingReason", "waitingFollowUpDate"],
  focus: ["estimatedMinutes", "actualSeconds", "activeSessionId", "lastFocusedAt"],
  blocking: ["blockedByTaskId"],
  reminder: ["reminder"],
};

/**
 * The remote binding, never merged (§D5).
 *
 * These say where the row is attached in Google, not what a person meant. The
 * database row is the authority on its own attachment, so they come from the
 * remote side whatever either device is holding.
 */
export const TASK_MERGE_REMOTE_FIELDS: readonly (keyof Task)[] =
  ["googleEventId", "googleEtag", "googleSyncedAt", "googleMetadataKey"];

/** Identity and birth. Neither is an edit; both come from where the two agreed. */
export const TASK_MERGE_BASE_FIELDS: readonly (keyof Task)[] = ["id", "createdAt"];

/** Set at merge time, never compared and never a tiebreak (§D6). */
export const TASK_MERGE_STAMP_FIELD = "updatedAt";

const KNOWN: ReadonlySet<string> = new Set<string>([
  ...Object.values(TASK_MERGE_GROUPS).flat() as string[],
  ...TASK_MERGE_REMOTE_FIELDS as string[],
  ...TASK_MERGE_BASE_FIELDS as string[],
  TASK_MERGE_STAMP_FIELD,
]);

export type TaskMergeRefusal =
  /** No common ancestor recorded. A checkpoint from before M1 (§D2). */
  | "no-base"
  /** One side deleted. "Removed" and "edited" have no automatic answer (§D8). */
  | "deleted"
  /** A field this build does not know about differs across the two (§D4). */
  | "unknown-field"
  /** Both sides changed the same group, differently. The real question. */
  | "contested";

export type TaskMergeResult =
  | { ok: true; task: Task }
  | { ok: false; reason: TaskMergeRefusal; groups: string[]; fields: string[] };

const record = (task: Task) => task as unknown as Record<string, unknown>;

function pick(task: Task, fields: readonly (keyof Task)[]): Record<string, unknown> {
  const source = record(task), out: Record<string, unknown> = {};
  for (const field of fields) if (field in source) out[field as string] = source[field as string];
  return out;
}

/**
 * The merge, or the reason there is not one.
 *
 * Every key in the result is copied from a named side. Nothing is inherited by
 * spreading, so a value that no device ever wrote cannot appear — which is the
 * one invariant this function has to keep.
 */
export function mergeTaskRevisions(
  base: Task | null | undefined,
  local: Task | null,
  remote: Task | null,
  now: string,
): TaskMergeResult {
  if (!base) return { ok: false, reason: "no-base", groups: [], fields: [] };
  if (!local || !remote) return { ok: false, reason: "deleted", groups: [], fields: [] };

  const keys = new Set([...Object.keys(record(base)), ...Object.keys(record(local)), ...Object.keys(record(remote))]);
  const unknown = [...keys].filter((key) => !KNOWN.has(key));
  const divergent = unknown.filter((key) => !sameRevisionData(record(local)[key], record(remote)[key]));
  // Agreeing on an unknown field is fine — nobody has to be told what it means
  // to copy a value both sides already hold.
  if (divergent.length) return { ok: false, reason: "unknown-field", groups: [], fields: divergent.sort() };

  const chosen: Record<string, Record<string, unknown>> = {};
  const contested: string[] = [];
  for (const [name, fields] of Object.entries(TASK_MERGE_GROUPS)) {
    const atBase = pick(base, fields), mine = pick(local, fields), theirs = pick(remote, fields);
    const iChanged = !sameRevisionData(atBase, mine), theyChanged = !sameRevisionData(atBase, theirs);
    if (iChanged && theyChanged && !sameRevisionData(mine, theirs)) { contested.push(name); continue; }
    chosen[name] = iChanged ? mine : theyChanged ? theirs : atBase;
  }
  if (contested.length) return { ok: false, reason: "contested", groups: contested.sort(), fields: [] };

  const merged: Record<string, unknown> = {};
  // Unknown fields are equal on both sides by the check above, so either is
  // the same answer. Carried rather than dropped: `normalizeTask` promises a
  // field this build has never heard of survives a round trip.
  for (const key of unknown) if (key in record(local)) merged[key] = record(local)[key];
  for (const values of Object.values(chosen)) Object.assign(merged, values);
  Object.assign(merged, pick(remote, TASK_MERGE_REMOTE_FIELDS));
  Object.assign(merged, pick(base, TASK_MERGE_BASE_FIELDS));
  merged[TASK_MERGE_STAMP_FIELD] = now;
  return { ok: true, task: merged as unknown as Task };
}
