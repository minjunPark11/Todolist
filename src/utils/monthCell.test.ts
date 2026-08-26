import { describe, expect, it } from "vitest";
import { chipCapFor, chipRowsFor, MONTH_CELL_MIN_HEIGHT } from "./monthCell";

// The heights D8 actually produces: 140px at 1920x1080, 110 at 1440x900, 80 at
// 1280x720, and the 72px floor.
const HEIGHTS = [140, 110, 80, MONTH_CELL_MIN_HEIGHT];

const CHIP_ROW = 19; // 18px chip + 1px gap
const usableIn = (cellHeight: number) => cellHeight - 12 - 22;

describe("how many chips a month cell shows", () => {
  it("shows them all when they all fit", () => {
    expect(chipCapFor(140, 3)).toBe(3);
    expect(chipCapFor(110, 2)).toBe(2);
  });

  it("spends one row on '+N more' when they do not", () => {
    // 110px: four rows fit, so three chips and a summary.
    expect(chipRowsFor(110)).toBe(4);
    expect(chipCapFor(110, 8)).toBe(3);
  });

  it("never draws more than the cell can hold — the bug that shipped in 0.19.3", () => {
    // A fixed cap of 5 put 27px of chip past a 110px cell and 57px past an 80px
    // one, onto the week below. Whatever the height, the chips plus the summary
    // have to fit inside it.
    for (const height of HEIGHTS) {
      const cap = chipCapFor(height, 8);
      const rowsDrawn = cap + 1; // the chips, plus "+N more"
      expect(rowsDrawn * CHIP_ROW).toBeLessThanOrEqual(usableIn(height) + 1);
    }
  });

  it("keeps at least one chip, even at the floor", () => {
    for (const height of HEIGHTS) {
      expect(chipCapFor(height, 8)).toBeGreaterThanOrEqual(1);
    }
    expect(chipCapFor(0, 8)).toBeGreaterThanOrEqual(1);
  });

  it("shows more of them in a taller cell", () => {
    expect(chipCapFor(140, 8)).toBeGreaterThan(chipCapFor(110, 8));
    expect(chipCapFor(110, 8)).toBeGreaterThan(chipCapFor(80, 8));
  });

  it("asks for no rows it cannot use", () => {
    for (const height of HEIGHTS) {
      expect(chipRowsFor(height) * CHIP_ROW).toBeLessThanOrEqual(usableIn(height) + 1);
    }
  });
});
