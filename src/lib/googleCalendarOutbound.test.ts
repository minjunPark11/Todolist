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
