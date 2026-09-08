import { describe, expect, it, vi } from "vitest";
import { runInbound, type InboundRequest } from "./googleCalendarInbound";

interface Page { status?: number; body?: unknown }

function fakeFetch(pages: Page[]) {
  const urls: string[] = [];
  let index = 0;
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    urls.push(String(input));
    const page = pages[Math.min(index++, pages.length - 1)];
    return {
      status: page.status ?? 200,
      json: async () => page.body ?? null,
    } as unknown as Response;
  });
  return { deps: { fetch: impl as unknown as typeof fetch }, urls };
}

function request(overrides: Partial<InboundRequest> = {}): InboundRequest {
  return {
    externalCalendarId: "cal-1",
    googleCalendarId: "me@example.com",
    writable: true,
    known: new Map(),
    accessToken: "ya29.token",
    ...overrides,
  };
}

const event = {
  id: "e1",
  status: "confirmed",
  etag: '"v1"',
  summary: "Standup",
  start: { dateTime: "2026-09-08T14:00:00+09:00", timeZone: "Asia/Seoul" },
};

describe("one incremental pass", () => {
  it("asks with the stored cursor and returns the next one", async () => {
    const { deps, urls } = fakeFetch([{ body: { items: [event], nextSyncToken: "tok-2" } }]);
    const outcome = await runInbound(request({ syncToken: "tok-1" }), deps);

    expect(urls[0]).toContain("syncToken=tok-1");
    expect(outcome.syncToken).toBe("tok-2");
    expect(outcome.plan.upsert).toHaveLength(1);
    expect(outcome.resynced).toBe(false);
  });

  it("always asks for deleted rows — they are the only evidence of deletion", async () => {
    // Without showDeleted a cancelled event simply stops appearing, which §7.1
    // forbids reading as a deletion. The pass would then never delete anything.
    const { deps, urls } = fakeFetch([{ body: { items: [] } }]);
    await runInbound(request(), deps);
    expect(urls[0]).toContain("showDeleted=true");
  });

  it("does not ask Google to expand a series", async () => {
    // The app expands recurrence itself, and an expanded occurrence cannot be
    // written back to as a series.
    const { deps, urls } = fakeFetch([{ body: { items: [] } }]);
    await runInbound(request(), deps);
    expect(urls[0]).toContain("singleEvents=false");
  });

  it("follows pages and only takes the token from the last one", async () => {
    const { deps } = fakeFetch([
      { body: { items: [event], nextPageToken: "p2" } },
      { body: { items: [{ ...event, id: "e2" }], nextSyncToken: "tok-9" } },
    ]);
    const outcome = await runInbound(request(), deps);
    expect(outcome.plan.upsert.map((e) => e.externalUid)).toEqual(["e1", "e2"]);
    expect(outcome.syncToken).toBe("tok-9");
  });
});

describe("an expired cursor", () => {
  // The moment §7.1 was written for. A 410 is not a failure to report — it is
  // Google saying the cursor is too old — and the recovery re-lists everything.
  it("re-lists in full, without the cursor, and says so", async () => {
    const { deps, urls } = fakeFetch([
      { status: 410, body: { error: { message: "Sync token is no longer valid" } } },
      { body: { items: [event], nextSyncToken: "tok-fresh" } },
    ]);
    const outcome = await runInbound(request({ syncToken: "stale" }), deps);

    expect(urls[0]).toContain("syncToken=stale");
    expect(urls[1]).not.toContain("syncToken=");
    expect(outcome.resynced).toBe(true);
    expect(outcome.syncToken).toBe("tok-fresh");
    // And the whole point: a full re-list concludes no deletions.
    expect(outcome.plan.cancelled).toEqual([]);
  });

  it("concludes nothing when the re-list itself fails", async () => {
    const { deps } = fakeFetch([{ status: 410, body: null }, { status: 500, body: null }]);
    const outcome = await runInbound(request({ syncToken: "stale" }), deps);
    expect(outcome.failed).toBe(true);
    expect(outcome.plan.cancelled).toEqual([]);
    expect(outcome.syncToken).toBeUndefined();
  });
});

describe("when the pass cannot run", () => {
  it("reports a dead grant rather than spending more requests on it", async () => {
    const { deps, urls } = fakeFetch([{ status: 401, body: null }]);
    const outcome = await runInbound(request({ syncToken: "tok" }), deps);
    expect(outcome.expired).toBe(true);
    expect(urls).toHaveLength(1);
  });

  it("reports a network failure without a cursor, so nothing is skipped", async () => {
    const impl = vi.fn(async () => { throw new TypeError("offline"); });
    const outcome = await runInbound(request(), { fetch: impl as unknown as typeof fetch });
    expect(outcome.failed).toBe(true);
    expect(outcome.syncToken).toBeUndefined();
  });
});

describe("cancellations", () => {
  it("carries them through as the only deletion signal", async () => {
    const { deps } = fakeFetch([
      { body: { items: [{ id: "e3", status: "cancelled" }], nextSyncToken: "t" } },
    ]);
    const outcome = await runInbound(request({ syncToken: "prev" }), deps);
    expect(outcome.plan.cancelled).toEqual(["e3"]);
  });
});

// The listing that is allowed to notice a deletion
// (GOOGLE_SYNC_HARDENING_DESIGN.md §4.2).
//
// Four conditions, and the outcome says so as one boolean because every one of
// them is a way for a listing to be short of the whole calendar. A pass that
// gets this wrong deletes events that were merely on the next page.
describe("whether a listing is complete", () => {
  it("is complete when a full listing runs to a sync token", async () => {
    const { deps } = fakeFetch([{ body: { items: [event], nextSyncToken: "tok-1" } }]);
    const outcome = await runInbound(request(), deps);
    expect(outcome.complete).toBe(true);
  });

  it("is never complete on an incremental pass", async () => {
    // The ordinary case. An incremental response lists what MOVED, so absence
    // in it is the opposite of deletion.
    const { deps } = fakeFetch([{ body: { items: [], nextSyncToken: "tok-2" } }]);
    const outcome = await runInbound(request({ syncToken: "tok-1" }), deps);
    expect(outcome.complete).toBe(false);
  });

  it("is not complete when Google gave no sync token", async () => {
    // No token means Google did not say it had reached the end.
    const { deps } = fakeFetch([{ body: { items: [event] } }]);
    const outcome = await runInbound(request(), deps);
    expect(outcome.complete).toBe(false);
  });

  it("is not complete when the paginator ran out of pages", async () => {
    // Every page hands back a nextPageToken, so the cap is hit and the listing
    // is a prefix of the calendar. Reading absence from it would delete
    // everything past page forty.
    const { deps } = fakeFetch([{ body: { items: [event], nextPageToken: "more" } }]);
    const outcome = await runInbound(request(), deps);
    expect(outcome.complete).toBe(false);
    expect(outcome.failed).toBe(true);
  });

  it("is complete after an expired cursor forces a re-list", async () => {
    // The whole point: a cursor expires exactly when things may have been
    // deleted without us hearing about it.
    const { deps } = fakeFetch([
      { status: 410, body: null },
      { body: { items: [event], nextSyncToken: "tok-3" } },
    ]);
    const outcome = await runInbound(request({ syncToken: "stale" }), deps);
    expect(outcome.resynced).toBe(true);
    expect(outcome.complete).toBe(true);
  });

  it("counts an echo as seen", async () => {
    // The trap this design was written around. An echo produces no work, so a
    // "what did we see" rebuilt from `upsert` would leave out the event we
    // ourselves just wrote — and pruning would then delete it.
    const { deps } = fakeFetch([{ body: { items: [event], nextSyncToken: "tok-1" } }]);
    const outcome = await runInbound(request({ known: new Map([["e1", { etag: '"v1"' }]]) }), deps);
    expect(outcome.plan.echoes).toBe(1);
    expect(outcome.plan.upsert).toEqual([]);
    expect(outcome.plan.seen).toEqual(["e1"]);
  });
});
