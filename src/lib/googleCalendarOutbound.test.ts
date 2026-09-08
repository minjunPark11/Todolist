import { describe, expect, it, vi } from "vitest";
import { EMPTY_PLAN, planOutbound, type IdentifiedTask } from "../domain/calendar/googleSync/outboundPlan";
import { runOutbound } from "./googleCalendarOutbound";

const CALENDAR = "focusflow@group.calendar.google.com";
const TZ = "Asia/Seoul";

interface Reply {
  status?: number;
  body?: unknown;
  throws?: boolean;
}

/**
 * A Google that answers per method, in order.
 *
 * Queued rather than fixed, because the conflict path sends PATCH, then GET,
 * then PATCH again to the same address, and each has to be able to answer
 * differently.
 */
function fakeGoogle(script: Partial<Record<string, Reply[]>>) {
  const calls: { method: string; url: string; headers: Record<string, string>; body?: string }[] = [];
  const queues = new Map<string, Reply[]>(Object.entries(script).map(([key, value]) => [key, [...(value ?? [])]]));

  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({
      method,
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? String(init.body) : undefined,
    });
    const reply = queues.get(method)?.shift() ?? { status: 500, body: null };
    if (reply.throws) throw new TypeError("offline");
    return {
      status: reply.status ?? 200,
      json: async () => reply.body ?? null,
    } as unknown as Response;
  });

  return { deps: { fetch: impl as unknown as typeof fetch }, calls };
}

function task(overrides: Partial<IdentifiedTask> & { id: string }): IdentifiedTask {
  return { title: "Write it down", dueDate: "2026-09-04", ...overrides };
}

function run(plan: Parameters<typeof runOutbound>[0]["plan"], deps: { fetch: typeof fetch }) {
  return runOutbound({ plan, calendarId: CALENDAR, timezone: TZ, accessToken: "ya29.abc", deps });
}

describe("creating", () => {
  it("posts the event and brings back the id and etag to store", async () => {
    const { deps, calls } = fakeGoogle({ POST: [{ body: { id: "ev1", etag: '"e1"' } }] });

    const outcome = await run(planOutbound([task({ id: "t1" })]), deps);

    expect(outcome.mapped).toEqual([
      { taskId: "t1", googleEventId: "ev1", googleEtag: '"e1"', googleSyncedAt: "" },
    ]);
    expect(calls[0].url).toContain(encodeURIComponent(CALENDAR));
    expect(JSON.parse(String(calls[0].body)).summary).toBe("Write it down");
  });

  it("counts a failure and stores nothing, so the next pass simply tries again", async () => {
    const { deps } = fakeGoogle({ POST: [{ status: 500, body: null }] });

    const outcome = await run(planOutbound([task({ id: "t1" })]), deps);

    expect(outcome.mapped).toEqual([]);
    expect(outcome.failed).toBe(1);
    expect(outcome.unlinked).toEqual([]);
  });

  it("treats being offline as a failure and not as an answer", async () => {
    const { deps } = fakeGoogle({ POST: [{ throws: true }] });
    const outcome = await run(planOutbound([task({ id: "t1" })]), deps);
    expect(outcome.failed).toBe(1);
    expect(outcome.expired).toBe(false);
  });
});

describe("updating", () => {
  const linked = task({ id: "t1", googleEventId: "ev1", googleEtag: '"e1"', updatedAt: "2026-09-04T10:00:00Z" });

  it("sends the stored etag so a version we have not seen cannot be clobbered", async () => {
    const { deps, calls } = fakeGoogle({ PATCH: [{ body: { id: "ev1", etag: '"e2"' } }] });

    const outcome = await run(planOutbound([linked]), deps);

    expect(calls[0].headers["If-Match"]).toBe('"e1"');
    expect(outcome.mapped).toEqual([
      { taskId: "t1", googleEventId: "ev1", googleEtag: '"e2"', googleSyncedAt: "2026-09-04T10:00:00Z" },
    ]);
  });

  it("gives way when the account holds a later edit", async () => {
    const { deps, calls } = fakeGoogle({
      PATCH: [{ status: 412 }],
      GET: [{ body: { id: "ev1", etag: '"remote"', updated: "2026-09-04T12:00:00Z" } }],
    });

    const outcome = await run(planOutbound([linked]), deps);

    // One PATCH, refused, and no second one: their edit stands.
    expect(calls.filter((call) => call.method === "PATCH")).toHaveLength(1);
    expect(outcome.mapped).toEqual([
      { taskId: "t1", googleEventId: "ev1", googleEtag: '"remote"', googleSyncedAt: "2026-09-04T10:00:00Z" },
    ]);
    expect(outcome.failed).toBe(0);
  });

  it("writes over a conflict that is older than ours", async () => {
    const { deps, calls } = fakeGoogle({
      PATCH: [{ status: 412 }, { body: { id: "ev1", etag: '"e3"' } }],
      GET: [{ body: { id: "ev1", etag: '"remote"', updated: "2026-09-04T08:00:00Z" } }],
    });

    const outcome = await run(planOutbound([linked]), deps);

    const retried = calls.filter((call) => call.method === "PATCH")[1];
    expect(retried.headers["If-Match"]).toBeUndefined();
    expect(outcome.mapped).toEqual([
      { taskId: "t1", googleEventId: "ev1", googleEtag: '"e3"', googleSyncedAt: "2026-09-04T10:00:00Z" },
    ]);
  });

  it("unlinks an event Google says is not there, so the next pass remakes it", async () => {
    const { deps } = fakeGoogle({ PATCH: [{ status: 404, body: null }] });

    const outcome = await run(planOutbound([linked]), deps);

    expect(outcome.unlinked).toEqual(["t1"]);
    expect(outcome.mapped).toEqual([]);
  });
});

describe("deleting", () => {
  it("clears the mapping of a task that left the calendar", async () => {
    const { deps } = fakeGoogle({ DELETE: [{ status: 204 }] });
    const plan = planOutbound([task({ id: "t1", dueDate: "", googleEventId: "ev1" })]);

    await expect(run(plan, deps)).resolves.toMatchObject({ unlinked: ["t1"], failed: 0 });
  });

  it("counts an event that was already gone as done", async () => {
    const { deps } = fakeGoogle({ DELETE: [{ status: 410 }] });
    const plan = planOutbound([task({ id: "t1", dueDate: "", googleEventId: "ev1" })]);

    await expect(run(plan, deps)).resolves.toMatchObject({ unlinked: ["t1"], failed: 0 });
  });

  it("clears a tombstone only when the delete really answered", async () => {
    const { deps } = fakeGoogle({ DELETE: [{ status: 204 }, { throws: true }] });

    const outcome = await run(planOutbound([], ["ev-a", "ev-b"]), deps);

    expect(outcome.clearedOrphans).toEqual(["ev-a"]);
    expect(outcome.failed).toBe(1);
  });
});

describe("a dead grant", () => {
  it("stops the pass rather than spending a request per task proving it", async () => {
    const { deps, calls } = fakeGoogle({ POST: [{ status: 401, body: null }] });

    const outcome = await run(planOutbound([task({ id: "t1" }), task({ id: "t2" }), task({ id: "t3" })]), deps);

    expect(outcome.expired).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("keeps what it had already earned", async () => {
    const { deps } = fakeGoogle({ POST: [{ body: { id: "ev1", etag: '"e1"' } }, { status: 401, body: null }] });

    const outcome = await run(planOutbound([task({ id: "t1" }), task({ id: "t2" })]), deps);

    expect(outcome.expired).toBe(true);
    expect(outcome.mapped).toEqual([
      { taskId: "t1", googleEventId: "ev1", googleEtag: '"e1"', googleSyncedAt: "" },
    ]);
  });
});

describe("an empty pass", () => {
  it("sends nothing at all", async () => {
    const { deps, calls } = fakeGoogle({});
    await expect(run(EMPTY_PLAN, deps)).resolves.toMatchObject({ failed: 0, expired: false });
    expect(calls).toHaveLength(0);
  });
});

// The 404 that is not about the event (GOOGLE_SYNC_HARDENING_DESIGN.md §7.3).
//
// Every event in a calendar that is gone answers "not found". Reading each of
// those as "this event was deleted" unlinks every Task in one pass, and then
// the creates that follow fail against the same missing calendar — forever.
describe("when the dedicated calendar itself is gone", () => {
  const linked: IdentifiedTask = {
    id: "t1",
    title: "Write it down",
    dueDate: "2026-09-04",
    googleEventId: "ev1",
    googleEtag: '"v1"',
    updatedAt: "2026-09-04T00:00:00.000Z",
  };

  it("stops the pass instead of unlinking every task", async () => {
    const { deps } = fakeGoogle({ PATCH: [{ status: 404, body: null }], GET: [{ status: 404, body: null }] });

    const outcome = await run(planOutbound([linked]), deps);

    expect(outcome.calendarMissing).toBe(true);
    expect(outcome.unlinked).toEqual([]);
    expect(outcome.mapped).toEqual([]);
  });

  it("stops a create that would fail the same way forever", async () => {
    const { deps } = fakeGoogle({ POST: [{ status: 404, body: null }], GET: [{ status: 404, body: null }] });

    const outcome = await run(planOutbound([task({ id: "t1" })]), deps);

    expect(outcome.calendarMissing).toBe(true);
    expect(outcome.failed).toBe(0);
  });

  it("does not clear a tombstone it could not really delete", async () => {
    // A 404 from a calendar we cannot reach is not evidence the orphan is gone,
    // and the tombstone list is the only thing that remembers that work.
    const { deps } = fakeGoogle({ DELETE: [{ status: 404 }], GET: [{ status: 403, body: null }] });

    const outcome = await run(planOutbound([], ["orphan-1"]), deps);

    expect(outcome.calendarMissing).toBe(true);
    expect(outcome.clearedOrphans).toEqual([]);
  });

  it("asks about the calendar once, however many events answer 404", async () => {
    const { deps, calls } = fakeGoogle({
      PATCH: [{ status: 404, body: null }, { status: 404, body: null }],
      GET: [{ status: 200, body: { id: CALENDAR } }],
    });

    await run(planOutbound([linked, { ...linked, id: "t2", googleEventId: "ev2" }]), deps);

    // Alive, so both unlink as before — and the probe is spent once, not twice.
    expect(calls.filter((call) => call.method === "GET" && !call.url.includes("/events/"))).toHaveLength(1);
  });
});

// A create that can be repeated (GOOGLE_SYNC_HARDENING_DESIGN.md §3).
//
// The failure this closes has no error in it anywhere: Google makes the event,
// the response is lost on the way back, and the next pass — seeing a dated Task
// with no event id — makes a second one. Naming the event turns that retry into
// a question Google can answer with "you already did that".
describe("creating with a reserved id", () => {
  const reserved = "ff0123456789abcdef0123456789abcd";

  it("sends the id the Task reserved", async () => {
    const { deps, calls } = fakeGoogle({ POST: [{ body: { id: reserved, etag: '"v1"' } }] });

    const outcome = await run(planOutbound([task({ id: "t1", googleReservedEventId: reserved })]), deps);

    expect(JSON.parse(calls[0].body ?? "{}").id).toBe(reserved);
    expect(outcome.mapped).toEqual([
      { taskId: "t1", googleEventId: reserved, googleEtag: '"v1"', googleSyncedAt: "" },
    ]);
  });

  it("reads 409 as a receipt for a create whose answer was lost", async () => {
    // Not a failure. The event exists because WE made it, so the PATCH both
    // adopts it and brings it up to date with what the Task says now.
    const { deps, calls } = fakeGoogle({
      POST: [{ status: 409, body: null }],
      PATCH: [{ status: 200, body: { id: reserved, etag: '"v2"' } }],
    });

    const outcome = await run(planOutbound([task({ id: "t1", googleReservedEventId: reserved })]), deps);

    expect(outcome.failed).toBe(0);
    expect(outcome.mapped[0].googleEventId).toBe(reserved);
    expect(JSON.parse(calls[1].body ?? "{}").status).toBe("confirmed");
  });

  it("lets go of an id Google is keeping for a deleted event", async () => {
    // A gravestone: the id is taken and the event behind it is gone, so no
    // number of retries with this id will ever work.
    const { deps } = fakeGoogle({
      POST: [{ status: 409, body: null }],
      PATCH: [{ status: 404, body: null }],
    });

    const outcome = await run(planOutbound([task({ id: "t1", googleReservedEventId: reserved })]), deps);

    expect(outcome.unusableReservations).toEqual(["t1"]);
    expect(outcome.mapped).toEqual([]);
    expect(outcome.failed).toBe(0);
  });

  it("keeps the reservation when the adoption merely failed", async () => {
    // A 500 says nothing about the id. Clearing it here would mint a new one
    // and make the duplicate by hand.
    const { deps } = fakeGoogle({
      POST: [{ status: 409, body: null }],
      PATCH: [{ status: 500, body: null }],
    });

    const outcome = await run(planOutbound([task({ id: "t1", googleReservedEventId: reserved })]), deps);

    expect(outcome.unusableReservations).toEqual([]);
    expect(outcome.failed).toBe(1);
  });
});
