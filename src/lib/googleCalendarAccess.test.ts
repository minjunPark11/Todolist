// What a probe may and may not conclude (GOOGLE_SYNC_HARDENING_DESIGN.md §7).
//
// Small enough to read in one go, and worth pinning anyway: three of the five
// answers here decide whether an event stays on someone's grid.
import { describe, expect, it, vi } from "vitest";
import { calendarIsUnreachable, probeCalendar } from "./googleCalendarAccess";

function fetchWith(reply: { status?: number; throws?: boolean }) {
  return {
    fetch: vi.fn(async () => {
      if (reply.throws) throw new TypeError("offline");
      return { status: reply.status ?? 200, json: async () => null } as unknown as Response;
    }) as unknown as typeof fetch,
  };
}

describe("asking whether a calendar is still there", () => {
  it("reads 200 as alive and 404 as gone", async () => {
    await expect(probeCalendar("c", "t", fetchWith({ status: 200 }))).resolves.toBe("alive");
    await expect(probeCalendar("c", "t", fetchWith({ status: 404 }))).resolves.toBe("gone");
    await expect(probeCalendar("c", "t", fetchWith({ status: 410 }))).resolves.toBe("gone");
  });

  it("keeps 403 separate — a withdrawn share is not a deleted calendar", async () => {
    await expect(probeCalendar("c", "t", fetchWith({ status: 403 }))).resolves.toBe("forbidden");
  });

  it("concludes nothing from a failure to ask", async () => {
    // The important one. If a timeout could answer this question, a flaky
    // connection would become a way to make events vanish — or to pin them
    // there — depending on which way the caller leaned.
    await expect(probeCalendar("c", "t", fetchWith({ throws: true }))).resolves.toBe("unknown");
    await expect(probeCalendar("c", "t", fetchWith({ status: 500 }))).resolves.toBe("unknown");
  });

  it("acts only on the two answers that are about the calendar", () => {
    expect(["gone", "forbidden"].every((access) => calendarIsUnreachable(access as never))).toBe(true);
    expect(["alive", "unknown"].some((access) => calendarIsUnreachable(access as never))).toBe(false);
  });

  it("asks about the calendar, not its events", async () => {
    const deps = fetchWith({ status: 200 });
    await probeCalendar("work@example.com", "ya29.token", deps);
    const [url] = (deps.fetch as unknown as { mock: { calls: [string][] } }).mock.calls[0];
    expect(url).toBe("https://www.googleapis.com/calendar/v3/calendars/work%40example.com");
  });
});
