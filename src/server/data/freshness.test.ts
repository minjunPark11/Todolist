import { describe, expect, it } from "vitest";
import { freshnessFrom } from "./freshness";

const NOW = new Date("2026-08-28T01:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe("freshnessFrom", () => {
  it("calls a sync from two minutes ago live", () => {
    expect(freshnessFrom({ lastSeenAt: ago(2 * MINUTE) }, NOW).staleness).toBe("live");
  });

  it("calls one from this morning recent", () => {
    expect(freshnessFrom({ lastSeenAt: ago(6 * HOUR) }, NOW).staleness).toBe("recent");
  });

  it("calls one from last week stale", () => {
    expect(freshnessFrom({ lastSeenAt: ago(7 * 24 * HOUR) }, NOW).staleness).toBe("stale");
  });

  it("says unknown when nothing was ever recorded", () => {
    expect(freshnessFrom(null, NOW).staleness).toBe("unknown");
    expect(freshnessFrom({}, NOW).staleness).toBe("unknown");
  });

  it("measures from the later stamp", () => {
    // The difference between the two is the point (M4): an account nobody
    // edited for a week is not an account nobody synced for a week. Measuring
    // from `lastSyncedAt` alone would call a quiet week an offline one.
    const quietWeek = { lastSyncedAt: ago(7 * 24 * HOUR), lastSeenAt: ago(MINUTE) };
    expect(freshnessFrom(quietWeek, NOW).staleness).toBe("live");
    expect(freshnessFrom(quietWeek, NOW).lastSyncedAt).toBe(ago(7 * 24 * HOUR));
  });

  it("does not treat a clock ahead of ours as freshness", () => {
    // A device whose clock is a day fast would otherwise stamp the account
    // "live" forever. Unknown errs toward "check this", which is the safe
    // direction for metadata a reader acts on.
    expect(freshnessFrom({ lastSeenAt: new Date(NOW.getTime() + 24 * HOUR).toISOString() }, NOW).staleness).toBe(
      "unknown",
    );
  });

  it("ignores a stamp that is not a date", () => {
    expect(freshnessFrom({ lastSeenAt: "soon" }, NOW).staleness).toBe("unknown");
  });

  it("passes the device label through as a label", () => {
    expect(freshnessFrom({ lastSeenAt: ago(MINUTE), platform: "desktop" }, NOW).syncedFromDevice).toBe("desktop");
  });
});
