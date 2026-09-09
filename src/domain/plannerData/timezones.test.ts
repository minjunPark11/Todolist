// What the picker offers, and what it calls things.
//
// The list itself is the platform's, so the tests worth having are about the
// promises this module adds on top: every option is one the account will keep,
// the selected zone is always among them, and the offset is read the way a
// person reads a clock rather than the way a Date happens to serialise.
import { describe, expect, it } from "vitest";
import { listTimezones, timezoneChoicePatch, timezoneLabel, timezoneOffsetMinutes } from "./timezones";
import { normalizeAppSettings } from "./normalize";

describe("the zone list", () => {
  it("offers zones this engine can actually format", () => {
    // The point of sourcing it from Intl rather than a hand-written list.
    const zones = listTimezones();
    expect(zones.length).toBeGreaterThan(20);
    expect(zones.filter((zone) => timezoneOffsetMinutes(zone) === null)).toEqual([]);
  });

  it("keeps every option choosable — normalize gives them all back", () => {
    for (const zone of listTimezones().slice(0, 50)) {
      expect(normalizeAppSettings({ timezone: zone, timezoneMode: "manual" }).timezone).toBe(zone);
    }
  });

  it("includes a zone asked for even when it is already there", () => {
    expect(listTimezones(["Asia/Seoul"]).filter((zone) => zone === "Asia/Seoul")).toEqual(["Asia/Seoul"]);
  });

  it("still offers a zone this engine has never heard of, when it is the stored one", () => {
    // `normalizeAppSettings` keeps such a value on purpose — the IANA list
    // moves and the account holds the only copy (appSettingsTimezone.test.ts).
    // Dropping it here would leave the select with nothing matching its value,
    // so a manual account would read as "Automatic".
    expect(listTimezones(["Mars/Olympus_Mons"])).toContain("Mars/Olympus_Mons");
    expect(timezoneLabel("Mars/Olympus_Mons")).toBe("Mars/Olympus_Mons");
  });

  it("sorts by name, because that is what a select's type-ahead matches", () => {
    const zones = listTimezones();
    expect([...zones].sort((a, b) => a.localeCompare(b, "en"))).toEqual(zones);
  });
});

describe("the offset", () => {
  const january = new Date("2026-01-15T12:00:00Z");
  const july = new Date("2026-07-15T12:00:00Z");

  it("reads a fixed-offset zone", () => {
    expect(timezoneOffsetMinutes("Asia/Seoul", january)).toBe(9 * 60);
    expect(timezoneOffsetMinutes("Asia/Seoul", july)).toBe(9 * 60);
    expect(timezoneOffsetMinutes("UTC", july)).toBe(0);
  });

  it("reads a negative offset as negative", () => {
    expect(timezoneOffsetMinutes("America/New_York", january)).toBe(-5 * 60);
  });

  it("follows daylight saving rather than reporting one answer all year", () => {
    // The whole reason the label is computed and not stored: the same zone is
    // two different offsets depending on when you ask.
    expect(timezoneOffsetMinutes("Europe/London", january)).toBe(0);
    expect(timezoneOffsetMinutes("Europe/London", july)).toBe(60);
  });

  it("reads a half-hour zone as minutes and not as a rounded hour", () => {
    expect(timezoneOffsetMinutes("Asia/Kolkata", january)).toBe(5 * 60 + 30);
  });

  it("is null for a zone this engine does not know", () => {
    expect(timezoneOffsetMinutes("Mars/Olympus_Mons", january)).toBeNull();
  });

  it("does not land a day out at midnight in the zone's own clock", () => {
    // `hour12: false` used to report midnight as hour 24 of an already-rolled
    // day, putting the offset a full day out (externalEventShape.ts says the
    // same thing). Asked at exactly 00:00 Asia/Seoul.
    expect(timezoneOffsetMinutes("Asia/Seoul", new Date("2026-03-01T15:00:00Z"))).toBe(9 * 60);
  });
});

describe("the label", () => {
  const january = new Date("2026-01-15T12:00:00Z");

  it("leads with the name so typing the name reaches the option", () => {
    expect(timezoneLabel("Asia/Seoul", january)).toBe("Asia/Seoul (UTC+09:00)");
  });

  it("pads and signs the offset", () => {
    expect(timezoneLabel("America/New_York", january)).toBe("America/New_York (UTC-05:00)");
    expect(timezoneLabel("Asia/Kolkata", january)).toBe("Asia/Kolkata (UTC+05:30)");
    expect(timezoneLabel("UTC", january)).toBe("UTC (UTC+00:00)");
  });

  it("falls back to the bare name rather than printing a broken offset", () => {
    expect(timezoneLabel("Mars/Olympus_Mons", january)).toBe("Mars/Olympus_Mons");
  });
});

describe("choosing in the picker", () => {
  it("pins the zone and the mode together", () => {
    // Either without the other is a bug with a name: a zone without the mode
    // is overwritten on the next start, a mode without the zone leaves the
    // account manually pinned to whatever the device last said.
    expect(timezoneChoicePatch("Asia/Seoul", "Europe/London")).toEqual({
      timezoneMode: "manual",
      timezone: "Asia/Seoul",
    });
  });

  it("restores the device's zone in the same write when going back to automatic", () => {
    expect(timezoneChoicePatch("auto", "Europe/London")).toEqual({
      timezoneMode: "auto",
      timezone: "Europe/London",
    });
  });

  it("leaves the value alone when the device cannot name its own zone", () => {
    // "" is not an answer. Writing it would strand every reader that asks the
    // account what day it is on a detection failure this account never had.
    expect(timezoneChoicePatch("auto", "")).toEqual({ timezoneMode: "auto" });
  });

  it("does not mistake a zone literally named auto for the automatic option", () => {
    // No IANA zone is called "auto", so this is a guard against the option
    // value and the zone namespace ever being made to share a slot.
    expect(timezoneChoicePatch("Etc/GMT+0", "Europe/London").timezone).toBe("Etc/GMT+0");
  });
});
