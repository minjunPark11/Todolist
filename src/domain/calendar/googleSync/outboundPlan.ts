// What one outbound pass has to do, before anything is sent
// (GOOGLE_CALENDAR_SYNC_DESIGN.md §5, §7, M1-5).
//
// Pure. `outboundAction` already decides about ONE task; this groups a whole
// collection into the four piles the executor works through, and adds the pile
// that has no task left to ask — the tombstones (§4.3).
//
// Keeping it here rather than inside the executor is what lets "which of 900
// tasks go out, and as what" be tested against fixtures instead of against a
// calendar.
import type { SyncableTask } from "./eventShape";
import { outboundAction, type MappedTask } from "./tombstones";

/**
 * The whole shape a pass reads.
 *
 * `MappedTask` already carries the id and the event; the other two of §4.2's
 * three fields come along because they travel together — `googleEtag` is the
 * `If-Match` on a write and `updatedAt` is our side of the LWW comparison when
 * that write is refused.
 */
export type IdentifiedTask = SyncableTask &
  MappedTask & {
    googleEtag?: string;
    updatedAt?: string;
    /** What `updatedAt` said at the last successful write (`types.ts`). */
    googleSyncedAt?: string;
  };

export interface PlannedDelete {
  taskId: string;
  eventId: string;
}

export interface OutboundPlan {
  /** Eligible, no event yet. Also every write that failed last time (§4.2). */
  create: IdentifiedTask[];
  /** Eligible and already linked. */
  update: IdentifiedTask[];
  /** Linked but no longer eligible — trashed, or its date was taken away. */
  delete: PlannedDelete[];
  /**
   * Events whose task is gone entirely (§4.3).
   *
   * Deduplicated against the deletes above: a tombstone is written when a
   * record is dropped, so the two piles cannot name the same task — but they
   * CAN name the same event id if a tombstone was left behind by an earlier
   * failure and the id was later reused in a restored task. Sending two
   * deletes for one event is harmless; sending one and reporting two successes
   * would clear a tombstone that never went out.
   */
  orphans: string[];
}

export const EMPTY_PLAN: OutboundPlan = { create: [], update: [], delete: [], orphans: [] };

/**
 * Has this Task changed since it was last written to Google?
 *
 * The one thing standing between a pass and hundreds of pointless PATCHes: an
 * account with three hundred dated tasks would rewrite all three hundred on
 * every window focus without it.
 *
 * Never pushed, or pushed before we started recording, both mean yes — the
 * cost of an unnecessary write is one request, and the cost of a missed one is
 * an edit that never leaves the device.
 */
export function needsUpdate(task: IdentifiedTask): boolean {
  if (!task.googleSyncedAt || !task.updatedAt) return true;
  return task.updatedAt > task.googleSyncedAt;
}

/**
 * The pass, as four lists.
 *
 * Order within a list is the order given, which is the order the executor
 * sends in. Nothing here talks to Google and nothing here infers anything from
 * absence — an event missing from the account is invisible to this function on
 * purpose (§5.1).
 */
export function planOutbound(tasks: readonly IdentifiedTask[], tombstones: readonly string[] = []): OutboundPlan {
  const plan: OutboundPlan = { create: [], update: [], delete: [], orphans: [] };
  const spokenFor = new Set<string>();

  for (const task of tasks) {
    switch (outboundAction(task)) {
      case "create":
        plan.create.push(task);
        break;
      case "update":
        // Claimed either way: an unchanged Task still owns its event, and a
        // tombstone naming it would be someone else's stale note (below).
        if (task.googleEventId) spokenFor.add(task.googleEventId);
        if (needsUpdate(task)) plan.update.push(task);
        break;
      case "delete":
        if (task.googleEventId) {
          plan.delete.push({ taskId: task.id, eventId: task.googleEventId });
          spokenFor.add(task.googleEventId);
        }
        break;
      case "none":
        break;
    }
  }

  const seen = new Set<string>();
  for (const eventId of tombstones) {
    if (!eventId || seen.has(eventId) || spokenFor.has(eventId)) continue;
    seen.add(eventId);
    plan.orphans.push(eventId);
  }

  return plan;
}

/** Whether a pass would send anything at all — the cheap check before a token. */
export function isEmptyPlan(plan: OutboundPlan): boolean {
  return plan.create.length === 0 && plan.update.length === 0 && plan.delete.length === 0 && plan.orphans.length === 0;
}
