import { describe, expect, it } from "vitest";
import { CATEGORY_COLOR_PALETTE } from "../../lib/calendar/categoryModel";
import { LIST_COLOR_PRESETS } from "../tasks/listColor";
import { NEUTRAL_LIST_COLOR } from "./itemColor";
import {
  BLOCK_INK_DARK,
  BLOCK_INK_LIGHT,
  contrastRatio,
  darkenForWhiteInk,
  DARK_INK_TARGET,
  readableInkOn,
  relativeLuminance,
  tintForDarkInk,
  WHITE_INK_TARGET,
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

// One ink on every fill (CALENDAR_FILL_READABILITY_DESIGN.md §3).
//
// Picking the ink per colour cleared 4.5:1 and still produced the screenshot
// that started this: a grey block whose black text read as disabled. So the
// text is white everywhere and the colour is what gives way.
describe("making a colour safe for white text", () => {
  const PALETTE = [
    "#e5484d",
    "#f76b15",
    "#ffb224",
    "#99d52a",
    "#30a46c",
    "#0a84ff",
    "#5b5bd6",
    "#8e4ec6",
    // The Inbox grey — the colour actually on screen in the report.
    "#8e8e93",
  ];

  it("clears the target for every colour the app can fill with", () => {
    for (const colour of PALETTE) {
      const safe = darkenForWhiteInk(colour);
      expect(contrastRatio(safe, BLOCK_INK_LIGHT), `${colour} -> ${safe}`).toBeGreaterThanOrEqual(
        WHITE_INK_TARGET,
      );
    }
  });

  // The point of moving lightness rather than swapping in a new palette: a
  // colour typed into the colour input is covered by the same rule.
  it("covers a colour nobody put in a palette", () => {
    for (const colour of ["#ffffff", "#fffb00", "#c0ffee", "#ff00ff"]) {
      expect(contrastRatio(darkenForWhiteInk(colour), BLOCK_INK_LIGHT)).toBeGreaterThanOrEqual(
        WHITE_INK_TARGET,
      );
    }
  });

  it("keeps the hue, so a yellow List is still the yellow one", () => {
    const hueOf = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max === min) return 0;
      const delta = max - min;
      const raw =
        max === r ? (g - b) / delta + (g < b ? 6 : 0) : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
      return (raw * 60 + 360) % 360;
    };
    for (const colour of PALETTE) {
      const safe = darkenForWhiteInk(colour);
      const drift = Math.abs(hueOf(safe) - hueOf(colour));
      expect(Math.min(drift, 360 - drift), `${colour} -> ${safe}`).toBeLessThanOrEqual(3);
    }
  });

  it("leaves a colour that is already dark enough exactly as it was", () => {
    // Indigo and purple were the two that passed white text before any of this.
    expect(darkenForWhiteInk("#5b5bd6")).toBe("#5b5bd6");
    expect(darkenForWhiteInk("#8e4ec6")).toBe("#8e4ec6");
  });

  it("is idempotent — running it twice is running it once", () => {
    for (const colour of PALETTE) {
      const once = darkenForWhiteInk(colour);
      expect(darkenForWhiteInk(once)).toBe(once);
    }
  });

  // The safety net §7 keeps: if darkening ever failed, the ink would still
  // adapt rather than the title disappearing.
  it("always leaves the automatic ink on white", () => {
    for (const colour of [...PALETTE, "#ffffff", "#fffb00"]) {
      expect(readableInkOn(darkenForWhiteInk(colour))).toBe("light");
    }
  });

  it("hands back a colour it cannot read, for the ink rule to deal with", () => {
    expect(darkenForWhiteInk("rebeccapurple")).toBe("rebeccapurple");
    expect(darkenForWhiteInk("")).toBe("");
  });
});

// The other direction (TIMELINE_V2_DESIGN.md §5, I2-C). The timeline tints
// instead of filling, so the guarantee it needs is the mirror of the one
// above: dark text on a pale version of the same colour.
describe("tinting a colour for dark ink", () => {
  // Every colour a timeline bar can be: the eight a List can be given, plus
  // the grey the Inbox and an unknown List fall back to.
  const LIST_COLORS = [...LIST_COLOR_PRESETS.map((preset) => preset.hex), NEUTRAL_LIST_COLOR];

  /** Which channel is the largest — a coarse stand-in for "the same hue". */
  function dominant(hex: string): number {
    const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((pair) =>
      Number.parseInt(pair, 16),
    );
    return channels.indexOf(Math.max(...channels));
  }

  it("clears 4.5:1 under dark ink for every List colour", () => {
    for (const color of LIST_COLORS) {
      const ratio = contrastRatio(tintForDarkInk(color), BLOCK_INK_DARK);
      expect(ratio, `${color} tinted`).toBeGreaterThanOrEqual(DARK_INK_TARGET);
    }
  });

  // The floor alone would not have produced a tint: most of these pass 4.5:1
  // at the strength their owner picked, so a rule that stopped there would
  // have left solid bars beside pale ones (the reason §5 sets a lightness).
  it("is a tint, not the colour it was given", () => {
    for (const color of LIST_COLORS) {
      const before = relativeLuminance(color) ?? 0;
      const after = relativeLuminance(tintForDarkInk(color)) ?? 0;
      expect(after, `${color} tinted`).toBeGreaterThan(before);
      // Well clear of the 4.5 floor, which is what makes it read as a tint
      // rather than as a colour that merely passed.
      expect(contrastRatio(tintForDarkInk(color), BLOCK_INK_DARK)).toBeGreaterThan(10);
    }
  });

  it("keeps the hue, so a List is the same List on both screens", () => {
    for (const color of LIST_COLORS) {
      expect(dominant(tintForDarkInk(color)), `${color} tinted`).toBe(dominant(color));
    }
  });

  it("changes nothing the second time", () => {
    for (const color of LIST_COLORS) {
      const once = tintForDarkInk(color);
      expect(tintForDarkInk(once)).toBe(once);
    }
  });

  it("stops short of white, so the palest colour is still a bar", () => {
    expect(tintForDarkInk("#ffffff")).not.toBe("#ffffff");
    expect(relativeLuminance(tintForDarkInk("#ffffff"))).toBeLessThan(1);
  });

  it("hands back a colour it cannot parse", () => {
    expect(tintForDarkInk("rebeccapurple")).toBe("rebeccapurple");
    expect(tintForDarkInk("")).toBe("");
  });
});
