import { describe, expect, it } from "vitest";
import { MIN_THUMB_HEIGHT, THUMB_INSET, thumbGeometry } from "./overlayScrollbar";

const at = (scrollTop: number, clientHeight: number, scrollHeight: number) =>
  thumbGeometry({ scrollTop, clientHeight, scrollHeight });

describe("thumbGeometry", () => {
  it("reproduces both heights TICKTICK_COMPONENT_02 §4 measured", () => {
    // The session recorded a thumb of 670 where the scroll range was 3px and
    // 184.3 where it was 324. Those are the only two samples in the document,
    // and they are what pins the formula down.
    expect(at(0, 673, 676).height).toBeCloseTo(670, 1);
    expect(at(0, 353.3, 677.3).height).toBeCloseTo(184.3, 1);
  });

  it("draws nothing when the content fits", () => {
    expect(at(0, 720, 720).needed).toBe(false);
    // Half a pixel of overflow is not something anyone can scroll to.
    expect(at(0, 720, 720.5).needed).toBe(false);
  });

  it("puts the thumb at the top at rest and at the bottom at the end", () => {
    const top = at(0, 720, 1588);
    const bottom = at(1588 - 720, 720, 1588);
    expect(top.offset).toBe(THUMB_INSET);
    // Flush with the lower edge, which is what the 670-in-673 sample requires.
    expect(bottom.offset + bottom.height).toBeCloseTo(720, 6);
  });

  it("moves the thumb in proportion to the scroll", () => {
    const half = at((1588 - 720) / 2, 720, 1588);
    const track = 720 - THUMB_INSET;
    expect(half.offset).toBeCloseTo(THUMB_INSET + (track - half.height) / 2, 6);
  });

  it("never lets the thumb shrink out of sight", () => {
    // 100× the window: proportionally about 7px, which is not something a
    // reader can find. The floor is ours, not the reference's.
    const tiny = at(0, 720, 72000);
    expect((720 * 720) / 72000).toBeLessThan(MIN_THUMB_HEIGHT);
    expect(tiny.height).toBe(MIN_THUMB_HEIGHT);
  });

  it("does not let the floor push the thumb outside a very short scroller", () => {
    // A 20px scroller has less track than the floor asks for; the thumb takes
    // the track instead of overflowing it.
    const short = at(0, 20, 400);
    expect(short.height).toBeLessThanOrEqual(20 - THUMB_INSET);
    expect(short.offset + short.height).toBeLessThanOrEqual(20);
  });

  it("clamps a scroll position past either end", () => {
    // Overscroll bounce reports positions outside the range.
    expect(at(-80, 720, 1588).offset).toBe(THUMB_INSET);
    const past = at(99999, 720, 1588);
    expect(past.offset + past.height).toBeCloseTo(720, 6);
  });
});
