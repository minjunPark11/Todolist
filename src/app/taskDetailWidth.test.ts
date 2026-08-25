import { describe, expect, it } from "vitest";
import {
  clampTaskDetailWidth,
  detailWidthAfterDrag,
  detailWidthAfterKey,
  readStoredDetailWidth,
  TASK_DETAIL_BIG_STEP,
  TASK_DETAIL_DEFAULT_WIDTH,
  TASK_DETAIL_MAX_WIDTH,
  TASK_DETAIL_MIN_WIDTH,
  TASK_DETAIL_STEP,
} from "./taskDetailWidth";

describe("clampTaskDetailWidth (§1.12)", () => {
  it("keeps a width inside the range", () => {
    expect(clampTaskDetailWidth(420)).toBe(420);
  });

  it("stops at both ends rather than passing through", () => {
    expect(clampTaskDetailWidth(100)).toBe(TASK_DETAIL_MIN_WIDTH);
    expect(clampTaskDetailWidth(2000)).toBe(TASK_DETAIL_MAX_WIDTH);
  });

  // NaN would flow into a CSS length, and a pane with no width is a pane that
  // has silently closed.
  it("recovers from a value that is not a number", () => {
    expect(clampTaskDetailWidth(Number.NaN)).toBe(TASK_DETAIL_DEFAULT_WIDTH);
    expect(clampTaskDetailWidth(Number.POSITIVE_INFINITY)).toBe(TASK_DETAIL_DEFAULT_WIDTH);
  });

  it("rounds, because a fractional CSS pixel is a blurred divider", () => {
    expect(clampTaskDetailWidth(420.4)).toBe(420);
  });
});

describe("readStoredDetailWidth (§1.14)", () => {
  it("restores what was saved", () => {
    expect(readStoredDetailWidth("512")).toBe(512);
  });

  it("falls back for nothing stored, junk, or a value out of range", () => {
    expect(readStoredDetailWidth(null)).toBe(TASK_DETAIL_DEFAULT_WIDTH);
    expect(readStoredDetailWidth("wide")).toBe(TASK_DETAIL_DEFAULT_WIDTH);
    expect(readStoredDetailWidth("40")).toBe(TASK_DETAIL_MIN_WIDTH);
    expect(readStoredDetailWidth("9000")).toBe(TASK_DETAIL_MAX_WIDTH);
  });
});

describe("detailWidthAfterKey (§1.13)", () => {
  // The handle is on the pane's LEFT edge, so left widens. Matching the
  // sidebar's right-edge arithmetic would make the keys disagree with the drag.
  it("widens on ArrowLeft and narrows on ArrowRight", () => {
    expect(detailWidthAfterKey(480, "ArrowLeft", false)).toBe(480 + TASK_DETAIL_STEP);
    expect(detailWidthAfterKey(480, "ArrowRight", false)).toBe(480 - TASK_DETAIL_STEP);
  });

  it("takes a bigger step with Shift", () => {
    expect(detailWidthAfterKey(480, "ArrowLeft", true)).toBe(480 + TASK_DETAIL_BIG_STEP);
  });

  it("jumps to the ends with Home and End", () => {
    expect(detailWidthAfterKey(480, "Home", false)).toBe(TASK_DETAIL_MAX_WIDTH);
    expect(detailWidthAfterKey(480, "End", false)).toBe(TASK_DETAIL_MIN_WIDTH);
  });

  it("clamps at the ends instead of running past them", () => {
    expect(detailWidthAfterKey(TASK_DETAIL_MAX_WIDTH, "ArrowLeft", false)).toBe(TASK_DETAIL_MAX_WIDTH);
    expect(detailWidthAfterKey(TASK_DETAIL_MIN_WIDTH, "ArrowRight", false)).toBe(TASK_DETAIL_MIN_WIDTH);
  });

  // So the handle can leave every other key alone — Tab has to keep working.
  it("answers null for a key it does not handle", () => {
    expect(detailWidthAfterKey(480, "ArrowUp", false)).toBeNull();
    expect(detailWidthAfterKey(480, "Enter", false)).toBeNull();
  });
});

describe("detailWidthAfterDrag (§1.12)", () => {
  it("widens as the pointer moves left", () => {
    expect(detailWidthAfterDrag(480, -40)).toBe(520);
    expect(detailWidthAfterDrag(480, 40)).toBe(440);
  });

  it("stops at the ends, so a fast drag cannot overshoot", () => {
    expect(detailWidthAfterDrag(480, -1000)).toBe(TASK_DETAIL_MAX_WIDTH);
    expect(detailWidthAfterDrag(480, 1000)).toBe(TASK_DETAIL_MIN_WIDTH);
  });
});
