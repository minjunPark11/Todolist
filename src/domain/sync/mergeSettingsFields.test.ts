// Two devices editing two different settings (MULTI_DEVICE_SYNC_DESIGN.md §4).
//
// The case that made this exist: change the language on the web, change the
// week start in the app, and the second save erased the first — not because
// anything conflicted, but because the row is one blob and it was written
// whole.
import { describe, expect, it } from "vitest";
import { mergeSettingsFields } from "./mergeSettingsFields";

const base = { language: "en", weekStart: "sunday", theme: "light" };

describe("merging one settings row", () => {
  it("keeps both edits when the two devices touched different fields", () => {
    const local = { ...base, weekStart: "monday" }; // this device
    const remote = { ...base, language: "ko" }; // the other one, already saved
    expect(mergeSettingsFields(base, local, remote)).toEqual({
      language: "ko",
      weekStart: "monday",
      theme: "light",
    });
  });

  it("lets this device win the field it actually changed", () => {
    const local = { ...base, theme: "dark" };
    const remote = { ...base, theme: "system" };
    // Same field, two answers: there is no third thing to do, and the device
    // doing the writing is the one whose answer is newer.
    expect(mergeSettingsFields(base, local, remote).theme).toBe("dark");
  });

  it("takes the account whole when there is no baseline", () => {
    // A first load: every field looks locally edited against nothing, so a
    // merge here would overwrite the account with a fresh device's defaults.
    const remote = { ...base, language: "ko" };
    expect(mergeSettingsFields(undefined, base, remote)).toBe(remote);
  });

  it("returns the account's own object when nothing local changed", () => {
    // Identity is how the save plan decides whether to write at all. A fresh
    // object here would push a row saying what the account already holds.
    const remote = { ...base, language: "ko" };
    expect(mergeSettingsFields(base, base, remote)).toBe(remote);
  });

  it("returns ours when the account has nothing new", () => {
    const local = { ...base, weekStart: "monday" };
    expect(mergeSettingsFields(base, local, base)).toBe(local);
  });

  it("carries a field we just set that the account has never heard of", () => {
    // A field this build added, saved for the first time. It is changed against
    // the baseline, so it is ours and it survives a row written by a client
    // that does not know about it.
    const local = { ...base, matrixHideCompleted: true };
    const merged = mergeSettingsFields(base, local, base);
    expect(merged).toEqual(local);
  });

  it("lets this device remove a field", () => {
    // `googleDeletedEventIds` goes away when the last tombstone clears. Absent
    // has to be able to win, or the list comes back on the next merge.
    const withField = { ...base, googleDeletedEventIds: ["ev1"] };
    const merged = mergeSettingsFields(withField, base, withField) as Record<string, unknown>;
    expect("googleDeletedEventIds" in merged).toBe(false);
  });
});
