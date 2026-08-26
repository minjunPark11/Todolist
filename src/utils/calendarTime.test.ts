import { describe, expect, it } from "vitest";
import {
  clickDefaultRange,
  DAY_END,
  DAY_START,
  minutesFromPointerY,
  minutesToTime,
  SLOT_HEIGHT,
  snapDownToStep,
  snappedDragRange,
  snapUpToStep,
  TIME_SNAP_MINUTES,
  timeToMinutes,
} from "./calendarTime";

// CALENDAR_GEOMETRY_DESIGN.md §4: nothing imported this module, and D1 changes
// SLOT_HEIGHT — the one constant every pointer coordinate is derived from. These
// are the invariants that have to survive that change, written before it.

const pxPerMinute = SLOT_HEIGHT / 60;
const yFor = (minutes: number) => (minutes - DAY_START * 60) * pxPerMinute;

describe("the grid's pixel scale", () => {
  it("puts a snap step on a whole pixel", () => {
    // 15 minutes at 48px/hour is 12px. At 42.8 it would be 10.7, and every
    // pointer round-trip would carry a rounding error (D1).
    const step = TIME_SNAP_MINUTES * pxPerMinute;
    expect(Number.isInteger(step)).toBe(true);
  });

  it("puts the half-hour and the hour on whole pixels too", () => {
    expect(Number.isInteger(SLOT_HEIGHT / 2)).toBe(true);
    expect(Number.isInteger(SLOT_HEIGHT)).toBe(true);
  });

  it("covers the whole day, so nothing is unrenderable", () => {
    // D2: the window used to start at 06:00, and WeekView carried a branch that
    // grew it downward whenever an item started earlier. A full day removes the
    // reason for that branch rather than hiding it.
    expect(DAY_START).toBe(0);
    expect(DAY_END).toBe(24);
  });
});

describe("pointer Y to minutes", () => {
  it("round-trips every snapped minute of the day without loss", () => {
    for (let minutes = DAY_START * 60; minutes <= DAY_END * 60; minutes += TIME_SNAP_MINUTES) {
      const back = minutesFromPointerY(yFor(minutes), 0);
      expect(back).toBeCloseTo(minutes, 9);
      expect(snapDownToStep(back)).toBe(minutes);
    }
  });

  it("maps the top of the grid to the first minute of the day", () => {
    expect(minutesFromPointerY(0, 0)).toBe(DAY_START * 60);
  });

  it("clamps above and below instead of running off the grid", () => {
    expect(minutesFromPointerY(-500, 0)).toBe(DAY_START * 60);
    expect(minutesFromPointerY(yFor(DAY_END * 60) + 500, 0)).toBe(DAY_END * 60);
  });

  it("reads a container offset as the grid's origin", () => {
    const containerTop = 137;
    expect(minutesFromPointerY(containerTop + yFor(9 * 60), containerTop)).toBeCloseTo(9 * 60, 9);
  });

  it("is monotonic — a lower pointer never means an earlier time", () => {
    let previous = -Infinity;
    for (let y = 0; y <= yFor(DAY_END * 60); y += 7) {
      const minutes = minutesFromPointerY(y, 0);
      expect(minutes).toBeGreaterThanOrEqual(previous);
      previous = minutes;
    }
  });
});

describe("snapping", () => {
  it("snaps down and up to the step", () => {
    expect(snapDownToStep(9 * 60 + 7)).toBe(9 * 60);
    expect(snapUpToStep(9 * 60 + 7)).toBe(9 * 60 + 15);
  });

  it("leaves an already-snapped minute alone", () => {
    expect(snapDownToStep(9 * 60 + 15)).toBe(9 * 60 + 15);
    expect(snapUpToStep(9 * 60 + 15)).toBe(9 * 60 + 15);
  });
});

describe("drag range", () => {
  it("snaps the start down and the end up", () => {
    expect(snappedDragRange(9 * 60 + 7, 10 * 60 + 3)).toEqual({ startMin: 9 * 60, endMin: 10 * 60 + 15 });
  });

  it("gives a backwards drag the same range as a forwards one", () => {
    expect(snappedDragRange(10 * 60, 9 * 60)).toEqual(snappedDragRange(9 * 60, 10 * 60));
  });

  it("never produces a range shorter than one step", () => {
    const { startMin, endMin } = snappedDragRange(9 * 60 + 1, 9 * 60 + 2);
    expect(endMin - startMin).toBe(TIME_SNAP_MINUTES);
  });

  it("stays inside the grid at both ends", () => {
    const early = snappedDragRange(DAY_START * 60 - 90, DAY_START * 60 + 30);
    expect(early.startMin).toBe(DAY_START * 60);
    const late = snappedDragRange(DAY_END * 60 - 30, DAY_END * 60 + 90);
    expect(late.endMin).toBe(DAY_END * 60);
  });
});

describe("click range", () => {
  it("defaults to an hour from the snapped click point", () => {
    expect(clickDefaultRange(9 * 60 + 7)).toEqual({ startMin: 9 * 60, endMin: 10 * 60 });
  });

  it("does not extend past the end of the day", () => {
    expect(clickDefaultRange(DAY_END * 60 - 30).endMin).toBe(DAY_END * 60);
  });
});

describe("minutes and time strings", () => {
  it("round-trips through the wall-clock string", () => {
    for (let minutes = 0; minutes < 24 * 60; minutes += TIME_SNAP_MINUTES) {
      expect(timeToMinutes(minutesToTime(minutes))).toBe(minutes);
    }
  });

  it("pads both fields", () => {
    expect(minutesToTime(9 * 60 + 5)).toBe("09:05");
    expect(minutesToTime(0)).toBe("00:00");
  });
});
