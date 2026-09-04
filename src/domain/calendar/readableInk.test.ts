import { describe, expect, it } from "vitest";
import { CATEGORY_COLOR_PALETTE } from "../../lib/calendar/categoryModel";
import {
  BLOCK_INK_DARK,
  BLOCK_INK_LIGHT,
  contrastRatio,
  readableInkOn,
  relativeLuminance,
} from "./readableInk";

// The claim D3-D rests on: a filled block is readable for EVERY colour the
// app can put on it, once the ink is chosen per colour instead of fixed.
describe("the ink a filled block gets", () => {
  it("clears 4.5:1 on every colour in the palette", () => {
    for (const color of CATEGORY_COLOR_PALETTE) {
      const ink = readableInkOn(color) === "light" ? BLOCK_INK_LIGHT : BLOCK_INK_DARK;
      const ratio = contrastRatio(color, ink);
      expect(ratio, `${color} with ${ink}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  // The reason the choice has to be made at all: fixing the ink to white —
  // which is what copying the reference app would have meant — fails on most
  // of this palette. If this ever passes, the palette changed and §3.3 of the
  // design should be re-read rather than this test deleted.
  it("is a choice worth making — white alone fails six of the eight", () => {
    const failing = CATEGORY_COLOR_PALETTE.filter(
      (color) => contrastRatio(color, BLOCK_INK_LIGHT) < 4.5,
    );
    expect(failing).toHaveLength(6);
  });

  it("picks white on the dark colours and black on the light ones", () => {
    expect(readableInkOn("#0066cc")).toBe("light");
    expect(readableInkOn("#5856d6")).toBe("light");
    expect(readableInkOn("#34c759")).toBe("dark");
    expect(readableInkOn("#ff9500")).toBe("dark");
  });

  it("reads three-digit hex, with or without the hash", () => {
    expect(relativeLuminance("#fff")).toBe(relativeLuminance("#ffffff"));
    expect(relativeLuminance("06c")).toBe(relativeLuminance("#0066cc"));
  });

  // An unreadable setting must not produce an invisible title: the fill falls
  // back to the accent, which is dark, so the ink falls back to light.
  it("falls back to light ink for a colour it cannot parse", () => {
    expect(readableInkOn("")).toBe("light");
    expect(readableInkOn("rebeccapurple")).toBe("light");
    expect(readableInkOn("#12345")).toBe("light");
  });

  it("reports 1 for a ratio it cannot compute", () => {
    expect(contrastRatio("nope", "#ffffff")).toBe(1);
  });
});
