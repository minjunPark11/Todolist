// The three rules that keep three triggers from becoming a request storm
// (MULTI_DEVICE_SYNC_DESIGN.md §3.3, §3.5).
import { describe, expect, it } from "vitest";
import { ECHO_WINDOW_MS, FOCUS_COOLDOWN_MS, shouldPull } from "./pullSchedule";

const clock = { now: 1_000_000, lastPullAt: 0, lastSaveAt: 0 };

describe("a realtime event", () => {
  it("is ignored when it is our own save coming back", () => {
    // Every write we make is an event to us as well. Acting on it is harmless
    // and pointless: a round trip to fetch what we just sent.
    expect(shouldPull("realtime", { ...clock, lastSaveAt: clock.now - ECHO_WINDOW_MS + 1 })).toBe(false);
  });

  it("is acted on once our own write is old enough to rule out", () => {
    expect(shouldPull("realtime", { ...clock, lastSaveAt: clock.now - ECHO_WINDOW_MS })).toBe(true);
  });

  it("is acted on when this device has not saved at all", () => {
    expect(shouldPull("realtime", clock)).toBe(true);
  });
});

describe("a window regaining focus", () => {
  it("waits out the cooldown so switching windows costs nothing", () => {
    expect(shouldPull("focus", { ...clock, lastPullAt: clock.now - FOCUS_COOLDOWN_MS + 1 })).toBe(false);
  });

  it("reads again once the cooldown is up", () => {
    expect(shouldPull("focus", { ...clock, lastPullAt: clock.now - FOCUS_COOLDOWN_MS })).toBe(true);
  });

  it("does not care how recently we saved", () => {
    // Unlike realtime: a person coming back to the window wants what is there,
    // and our own save being recent says nothing about anyone else's.
    expect(shouldPull("focus", { ...clock, lastSaveAt: clock.now })).toBe(true);
  });
});

describe("the periodic tick", () => {
  it("is never suppressed", () => {
    // It is the trigger whose whole job is to still work when the other two
    // have quietly stopped. Giving it a reason to skip would take that away.
    expect(shouldPull("periodic", { now: clock.now, lastPullAt: clock.now, lastSaveAt: clock.now })).toBe(true);
  });
});
