import { beforeEach, describe, expect, it } from "vitest";
import type { ExternalCalendar } from "../../../types";
import { clearIcsCache, loadExternalEvents, MAX_SUBSCRIPTIONS } from "./icsSource";

const CALENDAR_TEXT = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:one@example.com
SUMMARY:Standup
DTSTART;TZID=Asia/Seoul:20260828T090000
DTEND;TZID=Asia/Seoul:20260828T091500
END:VEVENT
END:VCALENDAR`;

function calendar(overrides: Partial<ExternalCalendar> = {}): ExternalCalendar {
  return {
    id: "cal-1",
    name: "Work",
    icsUrl: "https://example.com/work.ics",
    color: "#4f73ff",
    visible: true,
    enabled: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function serve(bodies: Record<string, string | Error>): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = (async (input: string) => {
    calls.push(String(input));
    const body = bodies[String(input)];
    if (body instanceof Error) throw body;
    if (body === undefined) return new Response("missing", { status: 404 });
    return new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

beforeEach(() => clearIcsCache());

describe("loadExternalEvents", () => {
  it("parses an enabled subscription and reports the count", async () => {
    const { fetchImpl } = serve({ "https://example.com/work.ics": CALENDAR_TEXT });
    const result = await loadExternalEvents([calendar()], { fetchImpl });

    expect(result.events).toHaveLength(1);
    expect(result.events[0].title).toBe("Standup");
    expect(result.statuses[0]).toMatchObject({ name: "Work", ok: true, eventCount: 1 });
    expect(result.partial).toBe(false);
  });

  it("skips a subscription the user turned off", async () => {
    const { fetchImpl, calls } = serve({});
    const result = await loadExternalEvents([calendar({ enabled: false })], { fetchImpl });

    expect(calls).toEqual([]);
    expect(result.statuses).toEqual([]);
  });

  it("keeps the good calendar when the other one fails", async () => {
    // §22-18. The failure is per calendar because the question ("what does my
    // day look like?") still has a mostly-true answer without one of them —
    // as long as the answer says which part is missing.
    const { fetchImpl } = serve({
      "https://example.com/work.ics": CALENDAR_TEXT,
      "https://example.com/broken.ics": new Error("boom"),
    });
    const result = await loadExternalEvents(
      [calendar(), calendar({ id: "cal-2", name: "Broken", icsUrl: "https://example.com/broken.ics" })],
      { fetchImpl },
    );

    expect(result.events).toHaveLength(1);
    expect(result.partial).toBe(true);
    expect(result.statuses[1]).toMatchObject({ name: "Broken", ok: false });
    expect(result.statuses[1].error).toBeTruthy();
  });

  it("refuses a private-network subscription without fetching it", async () => {
    const { fetchImpl, calls } = serve({});
    const result = await loadExternalEvents([calendar({ icsUrl: "http://169.254.169.254/latest/" })], { fetchImpl });

    expect(calls).toEqual([]);
    expect(result.statuses[0]).toMatchObject({ ok: false });
  });

  it("serves a second request for the same feed from memory", async () => {
    const { fetchImpl, calls } = serve({ "https://example.com/work.ics": CALENDAR_TEXT });
    await loadExternalEvents([calendar()], { fetchImpl });
    const second = await loadExternalEvents([calendar()], { fetchImpl });

    expect(calls).toHaveLength(1);
    expect(second.events).toHaveLength(1);
    expect(second.statuses[0].ok).toBe(true);
  });

  it("fetches again once the cache is older than its window", async () => {
    const { fetchImpl, calls } = serve({ "https://example.com/work.ics": CALENDAR_TEXT });
    await loadExternalEvents([calendar()], { fetchImpl });
    await loadExternalEvents([calendar()], { fetchImpl, cacheTtlMs: 0 });

    expect(calls).toHaveLength(2);
  });

  it("reads at most the first few subscriptions", async () => {
    const bodies: Record<string, string> = {};
    const calendars = Array.from({ length: MAX_SUBSCRIPTIONS + 2 }, (_, index) => {
      const icsUrl = `https://example.com/${index}.ics`;
      bodies[icsUrl] = CALENDAR_TEXT;
      return calendar({ id: `cal-${index}`, name: `Cal ${index}`, icsUrl });
    });
    const { fetchImpl, calls } = serve(bodies);
    const result = await loadExternalEvents(calendars, { fetchImpl });

    expect(calls).toHaveLength(MAX_SUBSCRIPTIONS);
    expect(result.statuses).toHaveLength(MAX_SUBSCRIPTIONS);
  });
});
