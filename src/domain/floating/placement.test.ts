import { describe, expect, it } from "vitest";
import { computePlacement, DEFAULT_COLLISION_PADDING, DEFAULT_OFFSET, isAnchorHidden } from "./placement";
import type { Placement, Rect } from "./types";

const VIEWPORT = { width: 1000, height: 800 };

/** A 100×24 trigger, the size of a property row's button. */
function anchor(x: number, y: number, width = 100, height = 24): Rect {
  return { x, y, width, height };
}

function place(a: Rect, floating = { width: 240, height: 300 }, placement: Placement = "bottom-start", viewport = VIEWPORT) {
  return computePlacement({ anchor: a, floating, viewport, placement });
}

describe("computePlacement — the ordinary case", () => {
  it("hangs below the anchor's leading edge, one offset away", () => {
    const result = place(anchor(120, 200));
    expect(result.x).toBe(120);
    expect(result.y).toBe(200 + 24 + DEFAULT_OFFSET);
    expect(result.placement).toBe("bottom-start");
    expect(result.didFlip).toBe(false);
    expect(result.didShift).toBe(false);
  });

  it("lines a bottom-end surface up with the anchor's trailing edge", () => {
    const result = place(anchor(600, 200), { width: 240, height: 300 }, "bottom-end");
    expect(result.x).toBe(600 + 100 - 240);
  });

  it("centres a top-center surface over the anchor", () => {
    const result = place(anchor(500, 400), { width: 80, height: 30 }, "top-center");
    expect(result.x).toBe(500 + 50 - 40);
    expect(result.y).toBe(400 - DEFAULT_OFFSET - 30);
  });
});

describe("computePlacement — flip (§19.13)", () => {
  // The case the old context menu got wrong: near the bottom, it drew
  // downwards anyway and ran off the window.
  it("flips above the anchor when there is no room below", () => {
    const result = place(anchor(120, 700));
    expect(result.placement).toBe("top-start");
    expect(result.didFlip).toBe(true);
    expect(result.y).toBe(700 - DEFAULT_OFFSET - 300);
    expect(result.y).toBeGreaterThanOrEqual(0);
  });

  it("stays below when below still fits exactly", () => {
    // 800 − (400 + 24) − 6 offset − 8 padding = 362 of room for a 300 surface.
    expect(place(anchor(120, 400)).didFlip).toBe(false);
  });

  // §19.13's point is that the user can see the surface. Flipping into an even
  // smaller gap would move it AND show less of it.
  it("does not flip when the opposite side is no better", () => {
    // Taller than the window either way: below has 562 of room, above has 178.
    // Flipping would move it and show less of it.
    const taller = { width: 240, height: 1000 };
    const result = place(anchor(120, 200), taller);
    expect(result.didFlip).toBe(false);
    expect(result.placement).toBe("bottom-start");
    expect(result.maxHeight).toBe(562);
  });

  it("flips a right-side surface to the left", () => {
    const result = place(anchor(900, 300, 60), { width: 300, height: 200 }, "right-start");
    expect(result.placement).toBe("left-start");
    expect(result.x).toBe(900 - DEFAULT_OFFSET - 300);
  });
});

describe("computePlacement — shift (§19.14, §19.15)", () => {
  it("pulls a surface back inside the right edge", () => {
    const result = place(anchor(900, 200));
    expect(result.didShift).toBe(true);
    expect(result.x + 240).toBeLessThanOrEqual(VIEWPORT.width - DEFAULT_COLLISION_PADDING);
  });

  it("keeps the collision padding at the left edge too", () => {
    const result = place(anchor(2, 200), { width: 240, height: 100 }, "bottom-end");
    expect(result.x).toBe(DEFAULT_COLLISION_PADDING);
  });

  // §19.14: shifted, but not so far it stops reading as this anchor's surface.
  it("still overlaps the anchor after shifting", () => {
    const trigger = anchor(960, 200, 30);
    const result = place(trigger, { width: 240, height: 100 });
    const overlap = Math.min(result.x + 240, trigger.x + trigger.width) - Math.max(result.x, trigger.x);
    expect(overlap).toBeGreaterThan(0);
  });

  it("gives up the overlap rather than the viewport when both cannot hold", () => {
    // A surface wider than the window: visible wins (§19.16 then caps it).
    const result = computePlacement({
      anchor: anchor(10, 100),
      floating: { width: 900, height: 100 },
      viewport: { width: 320, height: 800 },
      placement: "bottom-start",
    });
    expect(result.x).toBe(DEFAULT_COLLISION_PADDING);
    expect(result.maxWidth).toBe(320 - DEFAULT_COLLISION_PADDING * 2);
  });
});

describe("computePlacement — size caps (§19.16, §19.17)", () => {
  it("caps the height at the room on the chosen side", () => {
    const result = place(anchor(120, 600), { width: 240, height: 400 });
    // Flips: above has 600 − 6 − 8 = 586, below has 800 − 624 − 14 = 162.
    expect(result.placement).toBe("top-start");
    expect(result.maxHeight).toBe(586);
  });

  it("reports a cap even when nothing is constrained, so a later resize is", () => {
    const result = place(anchor(120, 100), { width: 240, height: 100 });
    expect(result.maxHeight).toBeGreaterThan(100);
    expect(result.maxWidth).toBe(VIEWPORT.width - DEFAULT_COLLISION_PADDING * 2);
  });

  it("never returns a negative cap for an anchor jammed against the edge", () => {
    const result = place(anchor(120, 799, 100, 1), { width: 240, height: 300 });
    expect(result.maxHeight).toBeGreaterThanOrEqual(0);
    expect(result.maxWidth).toBeGreaterThanOrEqual(0);
  });
});

describe("isAnchorHidden (§19.19, §19.20)", () => {
  it("is false while any part of the trigger is on screen", () => {
    expect(isAnchorHidden(anchor(0, -10, 100, 24), VIEWPORT)).toBe(false);
    expect(isAnchorHidden(anchor(990, 400), VIEWPORT)).toBe(false);
  });

  // Otherwise a popover closes itself on the frame it opens: before layout
  // every rect is 0×0 at the origin, which is indistinguishable by geometry
  // from a trigger that has just scrolled off the top.
  it("is false for an anchor that has not been laid out", () => {
    expect(isAnchorHidden({ x: 0, y: 0, width: 0, height: 0 }, VIEWPORT)).toBe(false);
  });

  it("is true once it has scrolled out entirely", () => {
    expect(isAnchorHidden(anchor(120, -24), VIEWPORT)).toBe(true);
    expect(isAnchorHidden(anchor(120, 800), VIEWPORT)).toBe(true);
    expect(isAnchorHidden(anchor(-100, 400), VIEWPORT)).toBe(true);
  });
});
