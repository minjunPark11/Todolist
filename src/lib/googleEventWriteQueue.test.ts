// Two edits to one event (GOOGLE_SYNC_HARDENING_DESIGN.md §6).
//
// The bug these are about leaves no error anywhere: drag a block, resize it a
// moment later, and the second PATCH carries the etag the first one is busy
// replacing. Google refuses it, and which edit survives is then decided by
// comparing two clocks. What is pinned here is that the second write is
// computed against what the first one actually left behind.
import { describe, expect, it, vi } from "vitest";
import { createEventWriteQueue } from "./googleEventWriteQueue";
import type { EventWriteResult } from "./googleCalendarEventWrite";
import type { ExternalCalendarEvent } from "../types";

function event(extra: Partial<ExternalCalendarEvent> = {}): ExternalCalendarEvent {
  return {
    id: "cal:e1",
    externalCalendarId: "cal",
    externalUid: "e1",
    title: "Standup",
    // 14:00–14:30 Seoul, the way inbound stores it.
    start: "2026-09-08T05:00:00.000Z",
    end: "2026-09-08T05:30:00.000Z",
    allDay: false,
    timezone: "Asia/Seoul",
    etag: '"v1"',
    readOnly: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
    ...extra,
  };
}

/** A queue whose writes resolve when the test says so. */
function harness(results: EventWriteResult[]) {
  const sent: { etag?: string; edit: unknown }[] = [];
  const drawn: (ExternalCalendarEvent | null)[] = [];
  const reported: EventWriteResult[] = [];
  let index = 0;

  const queue = createEventWriteQueue({
    write: async (base, edit) => {
      sent.push({ etag: base.etag, edit });
      return results[Math.min(index++, results.length - 1)];
    },
    remove: async (base) => {
      sent.push({ etag: base.etag, edit: "delete" });
      return results[Math.min(index++, results.length - 1)];
    },
    apply: (_id, next) => drawn.push(next),
    report: (_id, result) => reported.push(result),
  });

  return { queue, sent, drawn, reported };
}

const written = (etag: string): EventWriteResult => ({ kind: "written", etag, updated: "2026-09-08T10:00:00.000Z" });

describe("two edits to one event", () => {
  it("sends them in order, the second against what the first left", async () => {
    const { queue, sent } = harness([written('"v2"'), written('"v3"')]);

    queue.edit(event(), { date: "2026-09-10", startTime: "15:00", endTime: "16:00", allDay: false });
    queue.edit(event(), { date: "2026-09-10", startTime: "15:00", endTime: "17:00", allDay: false });
    await queue.idle();

    expect(sent).toHaveLength(2);
    expect(sent[0].etag).toBe('"v1"');
    // The version the first write earned, and not the one the caller was
    // holding — which is the whole of the fix.
    expect(sent[1].etag).toBe('"v2"');
  });

  it("draws both at once and does not undo the second when the first lands", async () => {
    const { queue, drawn } = harness([written('"v2"'), written('"v3"')]);

    queue.edit(event(), { date: "2026-09-10", startTime: "15:00", endTime: "16:00", allDay: false });
    queue.edit(event(), { title: "Daily sync" });
    await queue.idle();

    // Optimistic, optimistic, then a version stamp per write. The last thing
    // drawn has both edits: a write completing must not put back the snapshot
    // it was computed from.
    const last = drawn[drawn.length - 1] as ExternalCalendarEvent;
    expect(last.title).toBe("Daily sync");
    expect(last.etag).toBe('"v3"');
  });

  it("abandons what is queued behind a write that did not land", async () => {
    // The queued edits were built on a state that turned out never to have
    // existed. Sending them would write a mixture of what the person asked for
    // and what they did not.
    const { queue, sent, drawn } = harness([{ kind: "failed" }]);
    const original = event();

    queue.edit(original, { title: "One" });
    queue.edit(original, { title: "Two" });
    await queue.idle();

    expect(sent).toHaveLength(1);
    expect(drawn[drawn.length - 1]).toEqual(original);
  });

  it("keeps the newer version marker when Google's copy wins", async () => {
    const { queue, drawn, reported } = harness([{ kind: "superseded", etag: '"v9"' }]);

    queue.edit(event(), { title: "One" });
    await queue.idle();

    expect((drawn[drawn.length - 1] as ExternalCalendarEvent).title).toBe("Standup");
    expect((drawn[drawn.length - 1] as ExternalCalendarEvent).etag).toBe('"v9"');
    expect(reported).toEqual([{ kind: "superseded", etag: '"v9"' }]);
  });

  it("drops the block when the event is gone", async () => {
    const { queue, drawn } = harness([{ kind: "gone" }]);

    queue.edit(event(), { title: "One" });
    await queue.idle();

    expect(drawn[drawn.length - 1]).toBeNull();
  });

  it("says nothing to Google about a gesture that changed nothing", async () => {
    const { queue, sent, drawn } = harness([written('"v2"')]);

    queue.edit(event(), { date: "2026-09-08", startTime: "14:00", endTime: "14:30", allDay: false });
    await queue.idle();

    expect(sent).toEqual([]);
    expect(drawn).toEqual([]);
  });
});

describe("lanes", () => {
  it("does not make one event's write wait behind another's", async () => {
    const order: string[] = [];
    const gate: { release: () => void } = { release: () => {} };
    const queue = createEventWriteQueue({
      write: async (base) => {
        order.push(`start:${base.id}`);
        if (base.id === "cal:e1") await new Promise<void>((resolve) => { gate.release = resolve; });
        order.push(`end:${base.id}`);
        return written('"v2"');
      },
      remove: async () => ({ kind: "gone" }),
      apply: () => {},
    });

    queue.edit(event(), { title: "One" });
    queue.edit(event({ id: "cal:e2", externalUid: "e2" }), { title: "Two" });
    await vi.waitFor(() => expect(order).toContain("end:cal:e2"));

    // The slow one is still out, and the other event did not wait for it.
    expect(order).toEqual(["start:cal:e1", "start:cal:e2", "end:cal:e2"]);
    gate.release();
    await queue.idle();
  });

  it("deletes after the edits already queued for that event", async () => {
    const { queue, sent } = harness([written('"v2"'), { kind: "gone" }]);
    const original = event();

    queue.edit(original, { title: "One" });
    queue.remove(original);
    await queue.idle();

    expect(sent.map((call) => call.edit)).toEqual([{ title: "One" }, "delete"]);
    // The delete names the version the edit left behind, not the stale one.
    expect(sent[1].etag).toBe('"v2"');
  });

  it("puts the block back when the delete does not land", async () => {
    const { queue, drawn } = harness([{ kind: "failed" }]);
    const original = event();

    queue.remove(original);
    await queue.idle();

    expect(drawn[0]).toBeNull();
    expect(drawn[1]).toEqual(original);
  });
});
