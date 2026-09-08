// One event, one writer at a time (GOOGLE_SYNC_HARDENING_DESIGN.md §6).
//
// Every grid gesture used to fire its own PATCH the moment it happened, which
// is fine until two of them are about the same event. Drag a block and then
// resize it, and the second write goes out holding the etag the first one is in
// the middle of replacing: Google refuses it with a 412, and what happens next
// is decided by comparing Google's clock to the local one — an accident, not a
// rule. The edit that loses is simply gone.
//
// A lane per event fixes it, and a lane per event is the point: a slow write to
// one meeting must not hold up an edit to another. What travels through the
// lane is the EDIT, not the record. The record is read when the job runs, so
// each write is computed against what the previous one actually left behind.
//
// The lane holds two versions of the event, and the distinction is the whole
// design:
//
//   base   — what Google is known to hold. The `If-Match` comes from here.
//   drawn  — what the grid is showing, including edits still queued behind.
//
// A success moves `base` forward. A failure throws `drawn` away and puts the
// grid back to `base`, cancelling whatever was still queued: those edits were
// built on a state that turned out never to have existed, and sending them
// afterwards would write a mixture of what the person asked for and what they
// did not.
import { withExternalEdit, type ExternalEventEdit } from "../domain/calendar/googleSync/externalEventShape";
import type { EventWriteResult } from "./googleCalendarEventWrite";
import type { ExternalCalendarEvent } from "../types";

export interface EventWriteQueueDeps {
  /** Send one edit, computed against the version Google is known to hold. */
  write: (base: ExternalCalendarEvent, edit: ExternalEventEdit) => Promise<EventWriteResult>;
  /** Delete the event Google is known to hold. */
  remove: (base: ExternalCalendarEvent) => Promise<EventWriteResult>;
  /** Draw a record, or drop it when null. Called on every step. */
  apply: (eventId: string, next: ExternalCalendarEvent | null) => void;
  /** Anything the caller has to answer for — a dead grant, a gone calendar. */
  report?: (eventId: string, result: EventWriteResult) => void;
}

interface Lane {
  base: ExternalCalendarEvent;
  drawn: ExternalCalendarEvent;
  tail: Promise<void>;
  /** Set when a write came back badly. Everything still queued is abandoned. */
  abandoned: boolean;
}

export interface EventWriteQueue {
  /** Draw the edit at once, and send it after everything already queued. */
  edit: (record: ExternalCalendarEvent, edit: ExternalEventEdit) => void;
  /** Drop the block at once, and delete it after everything already queued. */
  remove: (record: ExternalCalendarEvent) => void;
  /** Whether anything is still in flight — for tests, and for waiting. */
  idle: () => Promise<void>;
}

/** The version marker a successful write hands back, folded into a record. */
function versioned(
  event: ExternalCalendarEvent,
  result: Extract<EventWriteResult, { kind: "written" }>,
): ExternalCalendarEvent {
  return {
    ...event,
    ...(result.etag ? { etag: result.etag } : {}),
    ...(result.updated ? { updatedAt: result.updated } : {}),
  };
}

export function createEventWriteQueue(deps: EventWriteQueueDeps): EventWriteQueue {
  const lanes = new Map<string, Lane>();

  function laneFor(record: ExternalCalendarEvent): { lane: Lane; created: boolean } {
    const existing = lanes.get(record.id);
    // A lane that is still running knows more than the caller does: its `base`
    // is the version the last write landed on, and the record the caller is
    // holding is whatever the grid happened to be showing. Taking the caller's
    // copy here would put the stale etag back and re-open the race.
    if (existing) return { lane: existing, created: false };
    const lane: Lane = { base: record, drawn: record, tail: Promise.resolve(), abandoned: false };
    lanes.set(record.id, lane);
    return { lane, created: true };
  }

  function finish(lane: Lane, eventId: string) {
    // Only the last job in a lane may retire it. Anything else would let a new
    // gesture start a fresh lane from a stale record while a write is still out.
    if (lanes.get(eventId) === lane) lanes.delete(eventId);
  }

  function chain(lane: Lane, eventId: string, job: () => Promise<void>) {
    lane.tail = lane.tail.then(async () => {
      if (lane.abandoned) return;
      await job();
    });
    const settled = lane.tail;
    void settled.then(() => {
      // Idle means idle: retire the lane only when nothing is queued behind.
      if (lane.tail === settled) finish(lane, eventId);
    });
  }

  function edit(record: ExternalCalendarEvent, next: ExternalEventEdit) {
    const { lane, created } = laneFor(record);
    const drawn = withExternalEdit(lane.drawn, next);
    // Nothing to draw and nothing to send. A gesture that ended where it began
    // is not an edit, and queueing it would cost a request to say so.
    if (drawn === lane.drawn) {
      if (created) lanes.delete(record.id);
      return;
    }
    lane.drawn = drawn;
    deps.apply(record.id, drawn);

    chain(lane, record.id, async () => {
      const result = await deps.write(lane.base, next);
      if (result.kind === "written") {
        // The content is already on screen — possibly with later edits on top
        // of it — so only the version marker moves.
        lane.base = versioned(withExternalEdit(lane.base, next), result);
        lane.drawn = versioned(lane.drawn, result);
        deps.apply(record.id, lane.drawn);
        return;
      }
      if (result.kind === "unchanged") return;
      if (result.kind === "gone") {
        lane.abandoned = true;
        deps.apply(record.id, null);
        deps.report?.(record.id, result);
        return;
      }
      // Superseded, failed, expired, or a calendar that is not there: Google
      // does not hold what the grid is showing, and neither will it hold what
      // is queued behind this.
      lane.abandoned = true;
      lane.drawn = result.kind === "superseded" && result.etag ? { ...lane.base, etag: result.etag } : lane.base;
      lane.base = lane.drawn;
      deps.apply(record.id, lane.drawn);
      deps.report?.(record.id, result);
    });
  }

  function remove(record: ExternalCalendarEvent) {
    const { lane } = laneFor(record);
    deps.apply(record.id, null);

    chain(lane, record.id, async () => {
      const result = await deps.remove(lane.base);
      // `gone` is the success — that is what a delete is for. Anything else
      // means the event is still in the account, and a grid that has already
      // forgotten it would never show it again.
      if (result.kind === "gone") {
        lane.abandoned = true;
        return;
      }
      lane.abandoned = true;
      deps.apply(record.id, lane.base);
      deps.report?.(record.id, result);
    });
  }

  async function idle() {
    // Lanes can be added while we wait — a gesture during a slow write — so
    // drain until a pass finds nothing left.
    while (lanes.size > 0) {
      await Promise.all([...lanes.values()].map((lane) => lane.tail));
    }
  }

  return { edit, remove, idle };
}
