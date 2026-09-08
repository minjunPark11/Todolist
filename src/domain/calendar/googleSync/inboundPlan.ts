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
  cancelledOccurrenceOf,
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

/**
 * A cancelled row that named one occurrence of a series
 * (GOOGLE_SYNC_HARDENING_DESIGN.md §5).
 *
 * Carries the id too: an occurrence the organiser had already MOVED is held
 * here as its own record under that id, and cancelling it has to remove that
 * record as well as mark the date on the series.
 */
export interface CancelledOccurrence {
  masterUid: string;
  /** The occurrence's original start, in the form `exdates` already holds. */
  originalStart: string;
}

export interface InboundPlan {
  /** Events to write, new and changed alike. */
  upsert: ExternalCalendarEvent[];
  /** Google event ids explicitly cancelled. The ONLY source of deletion. */
  cancelled: string[];
  /** Cancellations that name a date in a series rather than an event (§5). */
  cancelledOccurrences: CancelledOccurrence[];
  /** Items skipped as our own write returning (§6.3). Counted for tests. */
  echoes: number;
  /**
   * Every id this response carried, whatever we decided about it
   * (GOOGLE_SYNC_HARDENING_DESIGN.md §4.3).
   *
   * NOT `upsert` with the others added back. An echo is an item that was in the
   * response and deliberately produced no work, and an item too broken to draw
   * is another; reconstructing "what we saw" from the work we planned would
   * leave both out. `pruneAfterFullListing` reads absence from this and
   * nothing else, so anything missing here is something it would delete —
   * starting with the events we ourselves just wrote.
   */
  seen: string[];
}

export const EMPTY_INBOUND_PLAN: InboundPlan = {
  upsert: [],
  cancelled: [],
  cancelledOccurrences: [],
  echoes: 0,
  seen: [],
};

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
  const plan: InboundPlan = {
    upsert: [],
    cancelled: [],
    cancelledOccurrences: [],
    echoes: 0,
    seen: [],
  };

  for (const item of items) {
    const id = googleEventId(item);
    if (!id) continue;
    // Recorded before any decision about the item, because every branch below
    // is a decision about an id that WAS here (§4.3).
    plan.seen.push(id);

    if (isCancelled(item)) {
      // Both, and not either/or (§5.4). The id removes an occurrence we hold
      // as its own record — the meeting that had been moved to Thursday — and
      // the exdate is what actually takes the date off a series we hold as one
      // repeating record. Neither does the other's job.
      plan.cancelled.push(id);
      const occurrence = cancelledOccurrenceOf(item, options.defaultTimezone);
      if (occurrence) plan.cancelledOccurrences.push(occurrence);
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

/**
 * The events to keep after a listing that is known to be COMPLETE
 * (GOOGLE_SYNC_HARDENING_DESIGN.md §4).
 *
 * This is the one function in the feature allowed to read absence as deletion,
 * and its name is the precondition: `runInbound` proves the listing was full,
 * ran to the last page, came back 200 throughout, and ended with a
 * `nextSyncToken` — Google's own statement that there is nothing more. Called
 * on anything less, it deletes events that merely did not fit in a page.
 *
 * `planInbound` still cannot ask this question — it is not handed what we hold,
 * and that stays true (§7.1). Answering it needed a second function rather than
 * a second parameter, so that the dangerous read is spelled out at the call
 * site instead of hidden behind a flag.
 *
 * What it removes is the local mirror only. No Task is reachable from here, so
 * the worst outcome of a wrong call is an event that disappears until the next
 * poll brings it back — not a record in someone's bin.
 */
export function pruneAfterFullListing(
  events: readonly ExternalCalendarEvent[],
  calendarId: string,
  seen: ReadonlySet<string>,
): ExternalCalendarEvent[] {
  return events.filter((event) => event.externalCalendarId !== calendarId || seen.has(event.externalUid));
}

export function isEmptyInboundPlan(plan: InboundPlan): boolean {
  return (
    plan.upsert.length === 0 && plan.cancelled.length === 0 && plan.cancelledOccurrences.length === 0
  );
}

/**
 * The dates a series must now skip, folded into the records that carry the rule.
 *
 * Applied AFTER the upserts, and that order is the whole of it: a full listing
 * carries the series and the cancellation of one of its occurrences in the same
 * response, and marking the date before the series is in hand would drop it.
 *
 * A cancellation whose series we do not hold is left alone. It is not evidence
 * about anything we have — the series may be on another calendar, or simply not
 * fetched yet — and the next full listing brings the two together.
 */
function withCancelledOccurrences(
  events: readonly ExternalCalendarEvent[],
  calendarId: string,
  occurrences: readonly CancelledOccurrence[],
): ExternalCalendarEvent[] {
  if (occurrences.length === 0) return [...events];

  const byMaster = new Map<string, string[]>();
  for (const occurrence of occurrences) {
    const dates = byMaster.get(occurrence.masterUid);
    if (dates) dates.push(occurrence.originalStart);
    else byMaster.set(occurrence.masterUid, [occurrence.originalStart]);
  }

  return events.map((event) => {
    if (event.externalCalendarId !== calendarId) return event;
    const adding = byMaster.get(event.externalUid);
    if (!adding) return event;
    const existing = event.exdates ?? [];
    const merged = [...new Set([...existing, ...adding])];
    // The same cancellation arrives again on every full re-list. Returning the
    // record itself when nothing was added keeps that from looking like news.
    if (merged.length === existing.length) return event;
    return { ...event, exdates: merged };
  });
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

  return withCancelledOccurrences(next, calendarId, plan.cancelledOccurrences);
}
