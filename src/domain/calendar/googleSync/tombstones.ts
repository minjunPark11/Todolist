// Google events whose Task is gone (GOOGLE_CALENDAR_SYNC_DESIGN.md §4.3).
//
// Pure. A Task in the Trash still holds its `googleEventId`, so deleting its
// event is easy right up until the moment the record is dropped for good —
// after that there is nothing anywhere that knows the event should go, and it
// sits in the account forever.
//
// This is the "nothing left", written down before the record is dropped. It is
// deliberately a plain list of ids and not a queue of operations: the only
// thing left to do with an orphan is delete it.
import { isSyncEligible, type SyncableTask } from "./eventShape";

/** The half of a Task these functions read. */
export interface MappedTask {
  id: string;
  googleEventId?: string;
}

/**
 * Ids to carry forward after records were removed outright.
 *
 * `before` and `after` are the Task collection either side of a permanent
 * delete — `permanentlyDeleteTask`, `emptyTrash`, or the unguarded
 * `deleteTask`. Anything present in the first and missing from the second was
 * dropped, and if it had an event, that event is now an orphan.
 *
 * Returns `current` ITSELF when nothing was orphaned, rather than an equal
 * copy. The account sync diffs on object identity (`domain/sync/diffRecords`),
 * so a fresh array here would push `appSettings` to the server on every
 * delete in every account, connected to Google or not.
 */
export function tombstonesAfterRemoval(
  current: string[] | undefined,
  before: readonly MappedTask[],
  after: readonly MappedTask[],
): string[] | undefined {
  const survivors = new Set(after.map((task) => task.id));
  const orphaned = before
    .filter((task) => !survivors.has(task.id))
    .map((task) => task.googleEventId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (orphaned.length === 0) return current;

  // A Set rather than a concat: emptying the Trash twice, or a delete that
  // retries, must not make the same event two pieces of work.
  const merged = [...new Set([...(current ?? []), ...orphaned])];
  return merged.length === (current?.length ?? 0) ? current : merged;
}

/**
 * One id gone, its delete having landed.
 *
 * Returns `undefined` when the list empties, so an account that finishes its
 * work goes back to holding no field at all rather than an empty array —
 * "absent stays absent", the rule `normalizeAppSettings` applies to this field.
 */
export function withoutTombstone(current: string[] | undefined, eventId: string): string[] | undefined {
  if (!current || current.length === 0) return current;
  const next = current.filter((id) => id !== eventId);
  if (next.length === current.length) return current;
  return next.length > 0 ? next : undefined;
}

/**
 * What the outbound pass should do with one Task (§5.1, §4.2).
 *
 * The whole outbound decision, as one value, so the executor above is a switch
 * and not a nest of conditions:
 *
 * - `create` — belongs on the calendar, has no event yet. Also the retry path:
 *   a write that failed left no id behind, so the next pass simply tries again.
 * - `update` — belongs on the calendar and already has one.
 * - `delete` — has an event but no longer qualifies. Trashed (§7), or its date
 *   was removed.
 * - `none` — never had an event and does not want one.
 *
 * Note what is NOT here: "the event is missing from Google". This function
 * cannot see the account, and that is the point (§5.1) — an absent event is
 * never inferred from our side, only from an explicit `cancelled` (§7.1).
 */
export type OutboundAction = "create" | "update" | "delete" | "none";

export function outboundAction(task: SyncableTask & MappedTask): OutboundAction {
  const linked = Boolean(task.googleEventId);
  if (isSyncEligible(task)) return linked ? "update" : "create";
  return linked ? "delete" : "none";
}
