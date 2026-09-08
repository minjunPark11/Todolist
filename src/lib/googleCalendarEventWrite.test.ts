import { describe, expect, it, vi } from "vitest";
import { deleteExternalEvent, writeExternalEvent } from "./googleCalendarEventWrite";
import type { ExternalCalendarEvent } from "../types";

interface Step { status?: number; body?: unknown }

function fakeFetch(steps: Step[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  let index = 0;
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const step = steps[Math.min(index++, steps.length - 1)];
    return { status: step.status ?? 200, json: async () => step.body ?? null } as unknown as Response;
  });
  return { deps: { fetch: impl as unknown as typeof fetch }, calls };
}

function event(extra: Partial<ExternalCalendarEvent> = {}): ExternalCalendarEvent {
  return {
    id: "cal:e1",
    externalCalendarId: "cal",
    externalUid: "e1",
    title: "Standup",
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

const base = { googleCalendarId: "work@example.com", accessToken: "ya29.token" };

describe("an ordinary edit", () => {
  it("patches with the etag we last saw and reports the new one", async () => {
    const { deps, calls } = fakeFetch([{ body: { etag: '"v2"', updated: "2026-09-08T01:00:00.000Z" } }]);
    const result = await writeExternalEvent({ ...base, event: event(), edit: { title: "Daily" } }, deps);

    expect(result).toEqual({ kind: "written", etag: '"v2"', updated: "2026-09-08T01:00:00.000Z" });
    expect((calls[0].init?.headers as Record<string, string>)["If-Match"]).toBe('"v1"');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ summary: "Daily" });
    expect(calls[0].url).toContain("/calendars/work%40example.com/events/e1");
  });

  it("sends nothing at all when the edit changes nothing", async () => {
    const { deps, calls } = fakeFetch([{}]);
    await expect(writeExternalEvent({ ...base, event: event(), edit: { title: "Standup" } }, deps)).resolves.toEqual({
      kind: "unchanged",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("when both sides changed (§5.3)", () => {
  it("drops our edit when Google's is newer", async () => {
    const { deps } = fakeFetch([
      { status: 412 },
      { status: 200, body: { etag: '"v9"', updated: "2026-09-09T00:00:00.000Z" } },
    ]);
    const result = await writeExternalEvent({ ...base, event: event(), edit: { title: "Daily" } }, deps);
    // Taking their etag is not agreement — it stops the next write re-fighting
    // the same conflict forever.
    expect(result).toEqual({ kind: "superseded", etag: '"v9"' });
  });

  it("writes ours when theirs is older, without the stale If-Match", async () => {
    const { deps, calls } = fakeFetch([
      { status: 412 },
      { status: 200, body: { etag: '"v2"', updated: "2026-01-01T00:00:00.000Z" } },
      { status: 200, body: { etag: '"v3"' } },
    ]);
    const result = await writeExternalEvent({ ...base, event: event(), edit: { title: "Daily" } }, deps);
    expect(result).toEqual({ kind: "written", etag: '"v3"' });
    expect((calls[2].init?.headers as Record<string, string>)["If-Match"]).toBeUndefined();
  });
});

describe("when the event is not there", () => {
  // Every case here now asks a second question — was it the EVENT that was not
  // found, or the calendar? (GOOGLE_SYNC_HARDENING_DESIGN.md §7). The second
  // step of each fixture is the calendar's answer.
  it("reports it gone rather than failed, so the next pass can tidy up", async () => {
    const { deps, calls } = fakeFetch([{ status: 404 }, { status: 200, body: { id: "work@example.com" } }]);
    await expect(writeExternalEvent({ ...base, event: event(), edit: { title: "X" } }, deps)).resolves.toEqual({
      kind: "gone",
    });
    expect(calls[1].url).toContain("/calendars/work%40example.com");
  });

  it("treats deleting something already deleted as done", async () => {
    const { deps } = fakeFetch([{ status: 410 }, { status: 200, body: { id: "work@example.com" } }]);
    await expect(deleteExternalEvent({ ...base, event: event() }, deps)).resolves.toEqual({ kind: "gone" });
  });

  it("does not ask about the calendar when the write succeeded", async () => {
    // The probe is one request on an ambiguous answer, not a tax on every edit.
    const { deps, calls } = fakeFetch([{ body: { etag: '"v2"' } }]);
    await writeExternalEvent({ ...base, event: event(), edit: { title: "X" } }, deps);
    expect(calls).toHaveLength(1);
  });
});

describe("when the CALENDAR is not there", () => {
  // The 404 answered a question we did not ask. Reading it as "this event was
  // deleted" is how a removed calendar becomes an app that forgets every event
  // in it, one edit at a time.
  it("says so instead of reporting the event gone", async () => {
    const { deps } = fakeFetch([{ status: 404 }, { status: 404 }]);
    await expect(writeExternalEvent({ ...base, event: event(), edit: { title: "X" } }, deps)).resolves.toEqual({
      kind: "calendarGone",
      access: "gone",
    });
  });

  it("tells a withdrawn share apart from a deleted calendar", async () => {
    // Same conclusion for the events, different sentence for the person: one
    // of these is something somebody else can undo.
    const { deps } = fakeFetch([{ status: 404 }, { status: 403 }]);
    await expect(deleteExternalEvent({ ...base, event: event() }, deps)).resolves.toEqual({
      kind: "calendarGone",
      access: "forbidden",
    });
  });

  it("keeps the old conclusion when the probe itself cannot answer", async () => {
    // A 500 on the probe says nothing about the calendar, and a flaky network
    // must not become a way to hold an event on the grid forever.
    const { deps } = fakeFetch([{ status: 404 }, { status: 500 }]);
    await expect(deleteExternalEvent({ ...base, event: event() }, deps)).resolves.toEqual({ kind: "gone" });
  });
});

describe("deleting", () => {
  it("does not send If-Match — a delete is not a merge", async () => {
    const { deps, calls } = fakeFetch([{ status: 204 }]);
    await expect(deleteExternalEvent({ ...base, event: event() }, deps)).resolves.toEqual({ kind: "gone" });
    expect((calls[0].init?.headers as Record<string, string>)["If-Match"]).toBeUndefined();
    expect(calls[0].init?.method).toBe("DELETE");
  });
});

describe("a dead grant", () => {
  it("is reported rather than retried", async () => {
    const { deps, calls } = fakeFetch([{ status: 401 }]);
    await expect(writeExternalEvent({ ...base, event: event(), edit: { title: "X" } }, deps)).resolves.toEqual({
      kind: "expired",
    });
    expect(calls).toHaveLength(1);
  });
});
