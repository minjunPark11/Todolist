// The chip's four values (TASK_TAG_CHIPS_DESIGN.md §5, §6).
//
// The point of these is that this file decides NOTHING about contrast — the
// calendar's rule does, and these check that it was actually called rather
// than approximated here.
import { describe, expect, it } from "vitest";
import { tagChipColors, NEUTRAL_TAG_FILL_LIGHT, NEUTRAL_TAG_FILL_DARK } from "./tagColor";
import { contrastRatio, BLOCK_INK_DARK, BLOCK_INK_LIGHT } from "../calendar/readableInk";

describe("tagChipColors", () => {
  it("leaves a tag nobody coloured neutral", () => {
    // Every tag, until someone opens the editor. An auto-assigned hue was the
    // first draft and was dropped with the editor decision (§1.3).
    expect(tagChipColors({})).toMatchObject({
      fillLight: NEUTRAL_TAG_FILL_LIGHT,
      fillDark: NEUTRAL_TAG_FILL_DARK,
    });
    expect(tagChipColors({ color: "" }).fillLight).toBe(NEUTRAL_TAG_FILL_LIGHT);
  });

  it("reads a preset key the way a List does", () => {
    const byKey = tagChipColors({ color: "red" });
    const byHex = tagChipColors({ color: "#e5484d" });
    expect(byKey).toEqual(byHex);
  });

  it("clears the bar in both themes", () => {
    // Yellow is the hard one: white text cannot read on it and dark text can,
    // so the two answers have to differ.
    const yellow = tagChipColors({ color: "yellow" });
    expect(contrastRatio(yellow.fillLight, BLOCK_INK_DARK)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(yellow.fillDark, BLOCK_INK_LIGHT)).toBeGreaterThanOrEqual(5);
  });

  it("falls back to neutral for a value this build cannot read", () => {
    // Not erased — `parseListColor` keeps it, so a preset from a later release
    // paints again on a client that knows it.
    expect(tagChipColors({ color: "chartreuse" }).fillLight).toBe(NEUTRAL_TAG_FILL_LIGHT);
  });
});
