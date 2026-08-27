import { describe, expect, it } from "vitest";
import { dayOfWeekIn, minutesOfDay, resolveTimezone, timeIn, todayIn, zonedIsoString } from "./context";

// 01:00 UTC. In Seoul that is 10:00 on the 28th; in Denver it is 19:00 on the
// 27th. Every assertion below is about that one instant being two days.
const NOW = new Date("2026-08-28T01:00:00.000Z");

describe("resolveTimezone", () => {
  it("prefers what the account recorded", () => {
    expect(resolveTimezone("Asia/Seoul", "America/Denver")).toBe("Asia/Seoul");
  });

  it("falls back to the caller's hint", () => {
    expect(resolveTimezone("", "America/Denver")).toBe("America/Denver");
  });

  it("refuses rather than guessing when neither is there", () => {
    // M1: UTC would be a guess, and a guess here is an answer that is a whole
    // day wrong for most of the planet for part of every day. A refusal is
    // something the caller can act on; a wrong "today" is not.
    expect(() => resolveTimezone(undefined)).toThrow(/time zone/i);
    try {
      resolveTimezone("");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("INVALID_ARGUMENT");
    }
  });

  it("refuses a zone that is not a zone", () => {
    expect(() => resolveTimezone("Mars/Olympus")).toThrow(/IANA/);
  });
});

describe("the user's clock", () => {
  it("puts one instant on two different days", () => {
    expect(todayIn(NOW, "Asia/Seoul")).toBe("2026-08-28");
    expect(todayIn(NOW, "America/Denver")).toBe("2026-08-27");
  });

  it("reads the wall clock in the user's zone", () => {
    expect(timeIn(NOW, "Asia/Seoul")).toBe("10:00");
    expect(timeIn(NOW, "America/Denver")).toBe("19:00");
  });

  it("names the day of the week from the user's date", () => {
    expect(dayOfWeekIn(NOW, "Asia/Seoul")).toBe("Friday");
    expect(dayOfWeekIn(NOW, "America/Denver")).toBe("Thursday");
  });

  it("writes an ISO stamp carrying the user's offset", () => {
    expect(zonedIsoString(NOW, "Asia/Seoul")).toBe("2026-08-28T10:00:00+09:00");
    // Denver is on daylight time in August: -06:00, not -07:00. Computed at
    // the instant rather than read off a table, which is the whole reason.
    expect(zonedIsoString(NOW, "America/Denver")).toBe("2026-08-27T19:00:00-06:00");
  });

  it("keeps a half-hour zone honest", () => {
    expect(zonedIsoString(NOW, "Asia/Kolkata")).toBe("2026-08-28T06:30:00+05:30");
  });
});

describe("minutesOfDay", () => {
  it("reads HH:mm", () => {
    expect(minutesOfDay("09:30")).toBe(570);
    expect(minutesOfDay("24:00")).toBe(1440);
  });

  it("answers nothing for anything else", () => {
    expect(minutesOfDay("")).toBeUndefined();
    expect(minutesOfDay(undefined)).toBeUndefined();
    expect(minutesOfDay("9:30")).toBeUndefined();
    expect(minutesOfDay("25:00")).toBeUndefined();
  });
});
