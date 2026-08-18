import { describe, expect, it } from "vitest";
import { LIST_COLOR_PRESETS, isCustomListColor, listColorHex, parseListColor } from "./listColor";

describe("parseListColor (§13.20-§13.22)", () => {
  it("reads no colour as none", () => {
    expect(parseListColor(undefined)).toEqual({ kind: "none", stored: "", hex: "" });
    expect(parseListColor("   ")).toEqual({ kind: "none", stored: "", hex: "" });
  });

  it("reads each preset the design names", () => {
    for (const preset of LIST_COLOR_PRESETS) {
      expect(parseListColor(preset.key)).toEqual({ kind: "preset", stored: preset.key, hex: preset.hex });
    }
    expect(LIST_COLOR_PRESETS).toHaveLength(8);
  });

  it("reads a canonical hex as custom", () => {
    expect(parseListColor("#4F7AF8")).toEqual({ kind: "custom", stored: "#4F7AF8", hex: "#4f7af8" });
  });

  // The single-string trade: a preset key never begins with "#", so one value
  // says which of the three it is without a second field that could disagree.
  it("tells the three apart without a second field", () => {
    expect(parseListColor("blue").kind).toBe("preset");
    expect(parseListColor("#0a84ff").kind).toBe("custom");
    expect(parseListColor("").kind).toBe("none");
  });

  it("keeps a value it cannot draw instead of losing it", () => {
    const future = parseListColor("sunrise");
    // Not drawable here — guessing a colour would be worse than none.
    expect(future.hex).toBe("");
    expect(future.kind).toBe("none");
    // But still the value that was stored, so a client that knows it can paint.
    expect(future.stored).toBe("sunrise");
  });

  it("refuses a half-written hex rather than painting something else", () => {
    expect(listColorHex("#abc")).toBe("");
    expect(listColorHex("#12345g")).toBe("");
    expect(isCustomListColor("#abc")).toBe(false);
    expect(isCustomListColor("#4F7AF8")).toBe(true);
  });
});
