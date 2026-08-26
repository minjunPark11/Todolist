import { describe, expect, it } from "vitest";
import { blockIsTight, blockShowsTime } from "./eventBlock";

// Block heights R1 produces: a 15-minute event is pinned at 24px, and the rest
// follow the row height, which is 68px at 1920x1080, 52 at 1440x900, 44 at the
// floor.
const QUARTER = 24;
const HALF_AT_1920 = 34;
const HALF_AT_1440 = 26;
const HOUR_AT_1440 = 52;
const HOUR_AT_1920 = 68;

describe("what an event block draws", () => {
  it("draws the time when both lines fit", () => {
    expect(blockShowsTime(HOUR_AT_1920)).toBe(true);
    expect(blockShowsTime(HOUR_AT_1440)).toBe(true);
  });

  it("drops the time rather than slicing it", () => {
    // 34px holds a title and 6px of a 13px time; 26px holds neither cleanly.
    expect(blockShowsTime(HALF_AT_1920)).toBe(false);
    expect(blockShowsTime(HALF_AT_1440)).toBe(false);
    expect(blockShowsTime(QUARTER)).toBe(false);
  });

  it("has a boundary, and it is where the arithmetic puts it", () => {
    // 14px chrome + 14px title + 13px time.
    expect(blockShowsTime(41)).toBe(true);
    expect(blockShowsTime(40)).toBe(false);
  });

  it("gives up its padding when that is what a title costs", () => {
    expect(blockIsTight(QUARTER)).toBe(true);
    expect(blockIsTight(HALF_AT_1440)).toBe(true);
  });

  it("keeps its padding when the title fits without the sacrifice", () => {
    expect(blockIsTight(HOUR_AT_1440)).toBe(false);
    expect(blockIsTight(HOUR_AT_1920)).toBe(false);
    // 28px is exactly 14px of chrome plus a 14px title, so the padding stays.
    expect(blockIsTight(27)).toBe(true);
    expect(blockIsTight(28)).toBe(false);
  });

  it("a tight block has room for the title it kept", () => {
    for (const height of [QUARTER, HALF_AT_1440, HALF_AT_1920]) {
      if (!blockIsTight(height)) continue;
      expect(height - 6).toBeGreaterThanOrEqual(14);
    }
  });
});
