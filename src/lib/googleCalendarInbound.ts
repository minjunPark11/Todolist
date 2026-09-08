// Reading one calendar's changes (GOOGLE_CALENDAR_SYNC_DESIGN.md §6.1).
//
// `inboundPlan.ts` decided what a response means; this fetches the responses
// and reports what the caller must write down. Same division as the outbound
// pair next door, and for the same reason: the dangerous judgement (§7.1) is
// in a pure function that can be proved without a network.
//
// Incremental by `syncToken`, which is Google's cursor over changes rather than
// over events. Two consequences shape everything here. A sync response contains
// only what moved, so it is usually empty and costs one request. And it can
// expire — 410 GONE — at which point the ONLY correct recovery is to re-list
// the calendar in full and change nothing but what that full list carries.
// See `planInbound`: absence is not deletion, and a full re-list is the moment
// that rule earns its keep.
import {
  applyInboundPlan,
  planInbound,
  type InboundPlan,
  type KnownEvent,
} from "../domain/calendar/googleSync/inboundPlan";
import type { GoogleEventResource } from "../domain/calendar/googleSync/inboundShape";
import type { ExternalCalendarEvent } from "../types";

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

/** Google refuses a `maxResults` above 2500; this is the page we ask for. */
const PAGE_SIZE = 250;

/** A runaway paginator is worse than a truncated read; this bounds the pass. */
const MAX_PAGES = 40;

export interface InboundDeps {
  fetch: typeof fetch;
}

export interface InboundRequest {
  /** Our own id for the calendar. */
  externalCalendarId: string;
  /** Google's id for it. */
  googleCalendarId: string;
  /** `accessRole` said owner or writer (§6.2). */
  writable: boolean;
  /** The calendar's own zone, for timed events that name none. */
  defaultTimezone?: string;
  /** Where we stopped last time. Absent means "list this calendar in full". */
  syncToken?: string;
  /** What we already hold, keyed by Google's event id. */
  known: ReadonlyMap<string, KnownEvent>;
  accessToken: string;
}

export interface InboundOutcome {
  plan: InboundPlan;
  /** The cursor for next time. Absent when Google did not give one. */
  syncToken?: string;
  /**
   * The cursor expired and this pass re-listed from scratch.
   *
   * Surfaced rather than hidden because it changes what the caller may
   * conclude: nothing, still. It is reported so a stored cursor is replaced
   * rather than kept, and so the situation is visible in a test.
   */
  resynced: boolean;
  /** The grant is dead. Every further request would fail the same way. */
  expired: boolean;
  /** The pass could not be completed; nothing was concluded from a part of it. */
  failed: boolean;
}

const EMPTY_OUTCOME: InboundOutcome = {
  plan: { upsert: [], cancelled: [], cancelledOccurrences: [], echoes: 0 },
  resynced: false,
  expired: false,
  failed: false,
};

interface Reply {
  status: number;
  body: Record<string, unknown> | null;
}

async function call(url: string, accessToken: string, deps: InboundDeps): Promise<Reply> {
  let response: Response;
  try {
    response = await deps.fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
  } catch {
    return { status: 0, body: null };
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: response.status, body };
}

function itemsOf(body: Record<string, unknown> | null): GoogleEventResource[] {
  return Array.isArray(body?.items) ? (body.items as GoogleEventResource[]) : [];
}

function stringOf(body: Record<string, unknown> | null, key: string): string | undefined {
  const value = body?.[key];
  return typeof value === "string" && value ? value : undefined;
}

/**
 * Every page of one listing.
 *
 * `showDeleted` is on, and is not optional: it is what makes Google send the
 * `status: "cancelled"` rows that are the ONLY evidence of deletion this design
 * accepts (§7.1). Without it a deleted event would simply stop appearing, and
 * the app would be unable to tell that from an event that never changed.
 */
async function listAll(
  request: InboundRequest,
  syncToken: string | undefined,
  deps: InboundDeps,
): Promise<{ items: GoogleEventResource[]; syncToken?: string; status: number }> {
  const base = `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(request.googleCalendarId)}/events`;
  const items: GoogleEventResource[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ maxResults: String(PAGE_SIZE), showDeleted: "true" });
    if (syncToken) params.set("syncToken", syncToken);
    // A full listing expands nothing: the app owns recurrence expansion
    // (`lib/ics/recurrence`), and asking Google to do it would return hundreds
    // of occurrences that cannot be written back to as a series.
    else params.set("singleEvents", "false");
    if (pageToken) params.set("pageToken", pageToken);

    const reply = await call(`${base}?${params.toString()}`, request.accessToken, deps);
    if (reply.status !== 200) return { items, status: reply.status };

    items.push(...itemsOf(reply.body));
    pageToken = stringOf(reply.body, "nextPageToken");
    const next = stringOf(reply.body, "nextSyncToken");
    if (!pageToken) return { items, syncToken: next, status: 200 };
  }

  // Ran out of pages. Reported as a failure rather than as a short listing,
  // because a partial full-list must not be allowed to produce a sync token —
  // that would make the gap permanent.
  return { items, status: 0 };
}

/**
 * One calendar, one pass.
 *
 * A 410 is not an error to report: it is Google saying the cursor is too old,
 * and the answer is to ask again with none. That second listing is a full one,
 * which is exactly the case `planInbound` is built to survive.
 */
export async function runInbound(request: InboundRequest, deps: InboundDeps): Promise<InboundOutcome> {
  const first = await listAll(request, request.syncToken, deps);

  let items = first.items;
  let syncToken = first.syncToken;
  let resynced = false;

  if (first.status === 401) return { ...EMPTY_OUTCOME, expired: true };

  if (first.status === 410 && request.syncToken) {
    const full = await listAll(request, undefined, deps);
    if (full.status === 401) return { ...EMPTY_OUTCOME, expired: true };
    if (full.status !== 200) return { ...EMPTY_OUTCOME, failed: true };
    items = full.items;
    syncToken = full.syncToken;
    resynced = true;
  } else if (first.status !== 200) {
    return { ...EMPTY_OUTCOME, failed: true };
  }

  const plan = planInbound({
    items,
    known: request.known,
    options: {
      externalCalendarId: request.externalCalendarId,
      writable: request.writable,
      ...(request.defaultTimezone ? { defaultTimezone: request.defaultTimezone } : {}),
    },
  });

  return { plan, ...(syncToken ? { syncToken } : {}), resynced, expired: false, failed: false };
}

/** What the caller stores. Re-exported so callers need one import, not two. */
export { applyInboundPlan };
export type { InboundPlan, KnownEvent, ExternalCalendarEvent };
