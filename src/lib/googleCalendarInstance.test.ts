import { describe, expect, it, vi } from "vitest";
import { findGoogleInstance, isExpandedOccurrence } from "./googleCalendarInstance";

const INPUT = {
  masterId: "master-1",
  originalStart: "2026-09-23T14:00:00+09:00",
  googleCalendarId: "cal-1",
  accessToken: "token",
};

function reply(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({ status, json: async () => body } as unknown as Response);
}

const instance = (over: Record<string, unknown> = {}) => ({
  id: "master-1_20260923T050000Z",
  etag: '"etag-1"',
  status: "confirmed",
  originalStartTime: { dateTime: "2026-09-23T14:00:00+09:00" },
  start: { dateTime: "2026-09-23T14:00:00+09:00" },
  ...over,
});

describe("findGoogleInstance", () => {
  it("returns the occurrence's own id, which is not the master's", async () => {
    const fetch = reply(200, { items: [instance()] });
    const found = await findGoogleInstance(INPUT, { fetch });
    expect(found).toEqual({ kind: "found", instanceId: "master-1_20260923T050000Z", etag: '"etag-1"' });
    expect(found.kind === "found" && found.instanceId).not.toBe("master-1");
  });

  it("asks the instances endpoint for a window around the instant", async () => {
    const fetch = reply(200, { items: [instance()] });
    await findGoogleInstance(INPUT, { fetch });
    const url = String(fetch.mock.calls[0][0]);
    expect(url).toContain("/calendars/cal-1/events/master-1/instances?");
    expect(url).toContain("timeMin=");
    expect(url).toContain("timeMax=");
  });

  it("matches the same instant written in another offset", async () => {
    // Google answers in whatever offset the calendar keeps. The same moment
    // written two ways is one occurrence; a string compare would call it two.
    const fetch = reply(200, { items: [instance({ originalStartTime: { dateTime: "2026-09-23T05:00:00Z" } })] });
    expect((await findGoogleInstance(INPUT, { fetch })).kind).toBe("found");
  });

  it("matches on where the occurrence WAS, not where it was moved to", async () => {
    // An already-moved occurrence is exactly the one most likely to be edited
    // again. Matching on `start` would miss it.
    const moved = instance({ start: { dateTime: "2026-09-25T14:00:00+09:00" } });
    expect((await findGoogleInstance(INPUT, { fetch: reply(200, { items: [moved] }) })).kind).toBe("found");
  });

  it("ignores a neighbouring occurrence that is not the one asked for", async () => {
    const other = instance({ id: "other", originalStartTime: { dateTime: "2026-09-30T14:00:00+09:00" } });
    expect((await findGoogleInstance(INPUT, { fetch: reply(200, { items: [other] }) })).kind).toBe("gone");
  });

  it("reports a cancelled instance as gone rather than as something to patch", async () => {
    // A cancelled instance is the series' own EXDATE. There is nothing behind
    // it, and calling it found would send a write into a hole.
    const cancelled = instance({ status: "cancelled" });
    expect((await findGoogleInstance(INPUT, { fetch: reply(200, { items: [cancelled] }) })).kind).toBe("gone");
  });

  it("separates a dead grant from a missing series", async () => {
    expect((await findGoogleInstance(INPUT, { fetch: reply(401, {}) })).kind).toBe("expired");
    expect((await findGoogleInstance(INPUT, { fetch: reply(404, {}) })).kind).toBe("gone");
    expect((await findGoogleInstance(INPUT, { fetch: reply(500, {}) })).kind).toBe("failed");
  });

  it("fails rather than guessing when the request or the input is unusable", async () => {
    const thrown = vi.fn().mockRejectedValue(new Error("offline"));
    expect((await findGoogleInstance(INPUT, { fetch: thrown })).kind).toBe("failed");
    const bad = { ...INPUT, originalStart: "not-a-date" };
    expect((await findGoogleInstance(bad, { fetch: reply(200, { items: [] }) })).kind).toBe("failed");
    const noMaster = { ...INPUT, masterId: "" };
    expect((await findGoogleInstance(noMaster, { fetch: reply(200, { items: [] }) })).kind).toBe("failed");
  });

  it("says gone when the series holds no occurrence at that instant", async () => {
    expect((await findGoogleInstance(INPUT, { fetch: reply(200, { items: [] }) })).kind).toBe("gone");
  });
});

describe("isExpandedOccurrence", () => {
  it("is what decides whether a write needs the lookup first", () => {
    // An expanded occurrence carries the MASTER's externalUid, so a write keyed
    // by it would patch the whole series — the opposite of "this one only".
    expect(isExpandedOccurrence({ occurrenceOf: "master-1" })).toBe(true);
    expect(isExpandedOccurrence({ occurrenceOf: undefined })).toBe(false);
    expect(isExpandedOccurrence({})).toBe(false);
  });
});
