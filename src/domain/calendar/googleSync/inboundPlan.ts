// What one `events.list` response means (GOOGLE_CALENDAR_SYNC_DESIGN.md §6.1,
// §6.3, §7.1).
//
// Pure. The counterpart of `outboundPlan.ts`, and it carries this design's
// single most dangerous decision, so it is written to be provable without a
// network: given a response and what we already hold, what changes?
//
// ═══ THE GUARD (§7.1) ═══
//
// Deletion is decided by `status: "cancelled"` and by NOTHING ELSE. Absence
// from the response is never read as deletion — not here, not by the caller,
// not ever.
//
// This is not caution for its own sake. `syncToken` expires (410 GONE), and
// the recovery is a full re-list. A full re-list is also what the FIRST pass
// looks like. If absence meant deletion, one expired cursor would move every
// event the user owns into the bin, with no confirmation step anywhere in the
// path to catch it — delete wins has no "are you sure".
//
// The shape of this module is the guard: it is handed the response and is NOT
// handed the set of events we hold, so "which of ours did not appear" is a
// question it has no way to ask. A future edit that wants to answer it has to
// change the signature first, which is the point at which someone reads this.
import type { ExternalCalendarEvent } from "../../../types";
import {
  googleEtag,
  googleEventId,
  isCancelled,
  toExternalEvent,
  type GoogleEventResource,
  type ToExternalEventOptions,
} from "./inboundShape";

/**
 * What we already hold for one calendar, keyed by Google's event id.
 *
 * Only two fields, and both are about recognising rather than rebuilding: the
 * etag says whether an item is our own write coming back (§6.3), and
 * `createdAt` keeps a record's age across a re-list.
 */
export interface KnownEvent {
  etag?: string;
  createdAt?: string;
}

export interface InboundPlan {
  /** Events to write, new and changed alike. */
  upsert: ExternalCalendarEvent[];
  /** Google event ids explicitly cancelled. The ONLY source of deletion. */
  cancelled: string[];
  /** Items skipped as our own write returning (§6.3). Counted for tests. */
  echoes: number;
}

export const EMPTY_INBOUND_PLAN: InboundPlan = { upsert: [], cancelled: [], echoes: 0 };

export interface InboundPlanInput {
  items: readonly GoogleEventResource[];
  known: ReadonlyMap<string, KnownEvent>;
  options: Omit<ToExternalEventOptions, "createdAt">;
}

/**
 * The response, as work.
 *
 * A cancelled item is reported whether or not we hold it. Reporting one we do
 * not hold costs a no-op; deciding here that it "cannot be ours" would mean
 * reading our own absence as authority, and that is the habit §7.1 is about.
 */
export function planInbound({ items, known, options }: InboundPlanInput): InboundPlan {
  const plan: InboundPlan = { upsert: [], cancelled: [], echoes: 0 };

  for (const item of items) {
    const id = googleEventId(item);
    if (!id) continue;

    if (isCancelled(item)) {
      plan.cancelled.push(id);
      continue;
    }

    // §6.3. Our own write comes back on the next poll carrying the etag that
    // write returned. Applying it would rewrite the record, which changes it,
    // which schedules another write — a loop that runs quietly forever.
    const mine = known.get(id);
    const etag = googleEtag(item);
    if (mine && etag && mine.etag === etag) {
      plan.echoes += 1;
      continue;
    }

    const event = toExternalEvent(item, {
      ...options,
      ...(mine?.createdAt ? { createdAt: mine.createdAt } : {}),
    });
    if (event) plan.upsert.push(event);
  }

  return plan;
}

export function isEmptyInboundPlan(plan: InboundPlan): boolean {
  return plan.upsert.length === 0 && plan.cancelled.length === 0;
}

/**
 * The events to keep, after a plan lands.
 *
 * Here rather than in the executor because it is the other half of the guard:
 * this is the ONLY function that removes an external event on Google's word,
 * and it removes exactly the ids `cancelled` names. `current` is filtered, never
 * intersected with the response — an event missing from `plan.upsert` survives,
 * which is what makes a full re-list harmless.
 */
export function applyInboundPlan(
  current: readonly ExternalCalendarEvent[],
  calendarId: string,
  plan: InboundPlan,
): ExternalCalendarEvent[] {
  const gone = new Set(plan.cancelled);
  const replaced = new Map(plan.upsert.map((event) => [event.externalUid, event]));

  const next: ExternalCalendarEvent[] = [];
  for (const event of current) {
    if (event.externalCalendarId !== calendarId) {
      next.push(event);
      continue;
    }
    if (gone.has(event.externalUid)) continue;
    const replacement = replaced.get(event.externalUid);
    if (replacement) {
      replaced.delete(event.externalUid);
      next.push(replacement);
      continue;
    }
    next.push(event);
  }

  // Whatever the response brought that we did not already have.
  for (const event of replaced.values()) {
    if (!gone.has(event.externalUid)) next.push(event);
  }
  return next;
}
