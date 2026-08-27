import { describe, expect, it } from "vitest";
import {
  clickDefaultRange,
  DAY_END,
  DAY_START,
  clampHoursAtATime,
  HOURS_AT_A_TIME,
  HOURS_AT_A_TIME_CHOICES,
  MAX_HOURS_AT_A_TIME,
  MIN_HOURS_AT_A_TIME,
  MIN_SLOT_HEIGHT,
  minutesFromPointerY,
  minutesToTime,
  slotHeightFor,
  snapDownToStep,
  snappedDragRange,
  snapUpToStep,
  TIME_SNAP_MINUTES,
  timeToMinutes,
} from "./calendarTime";

// CALENDAR_GEOMETRY_DESIGN.md §4: nothing imported this module, and the row
// height is the one number every pointer coordinate is derived from. R1 turned
// that number from a constant into a function of the measured viewport, so the
// invariants below are stated for whatever the function returns rather than for
// a literal.

/** Viewport heights worth checking: two real windows, the floor, and the edges. */
const VIEWPORTS = [862, 682, 482, 306, 1400, 120];

describe("slotHeightFor", () => {
  it("fits HOURS_AT_A_TIME into the height when there is room", () => {
    // 862px is the grid at 1920x1080 with the current chrome.
    expect(862 / slotHeightFor(862)).toBeCloseTo(HOURS_AT_A_TIME, 0);
    expect(682 / slotHeightFor(682)).toBeCloseTo(HOURS_AT_A_TIME, 0);
  });

  it("stops at the floor instead of compressing further", () => {
    // Below this the grid scrolls; Calendar.app does the same, which is why its
    // own guide captures are scrolled to a fraction of a row.
    expect(slotHeightFor(306)).toBe(MIN_SLOT_HEIGHT);
    expect(slotHeightFor(1)).toBe(MIN_SLOT_HEIGHT);
    expect(slotHeightFor(0)).toBe(MIN_SLOT_HEIGHT);
  });

  it("survives a viewport that has not been measured yet", () => {
    expect(slotHeightFor(NaN)).toBe(MIN_SLOT_HEIGHT);
    expect(slotHeightFor(-40)).toBe(MIN_SLOT_HEIGHT);
  });

  it("always lands on a multiple of four, so a snap step is a whole pixel", () => {
    for (const viewport of VIEWPORTS) {
      const slot = slotHeightFor(viewport);
      expect(slot % 4).toBe(0);
      expect(Number.isInteger((TIME_SNAP_MINUTES * slot) / 60)).toBe(true);
    }
  });

  it("never returns less than the floor, for any viewport", () => {
    for (let viewport = 0; viewport <= 2000; viewport += 7) {
      expect(slotHeightFor(viewport)).toBeGreaterThanOrEqual(MIN_SLOT_HEIGHT);
    }
  });

  it("grows with the window rather than staying put", () => {
    // The point of R1: a taller window means taller rows, which is what a real
    // Mac shows and what a fixed constant could not reproduce.
    expect(slotHeightFor(862)).toBeGreaterThan(slotHeightFor(682));
    expect(slotHeightFor(682)).toBeGreaterThan(slotHeightFor(482));
  });

  // SETTINGS_REVIEW.md 4.4: the divisor is the reader's, not a constant.
  it("fits whatever hour count it is given", () => {
    for (const hours of HOURS_AT_A_TIME_CHOICES) {
      // 1400px is tall enough that even 24 rows clear the floor, so the
      // division is what is under test rather than the clamp. The row lands
      // within the snap of an exact fit — asking for 24 cannot also ask for a
      // multiple of four to divide 1400 evenly.
      expect(Math.abs(slotHeightFor(1400, hours) - 1400 / hours)).toBeLessThanOrEqual(2);
    }
  });

  it("means shorter rows the more hours are asked for", () => {
    expect(slotHeightFor(862, 6)).toBeGreaterThan(slotHeightFor(862, 12));
    expect(slotHeightFor(862, 12)).toBeGreaterThan(slotHeightFor(862, 24));
  });

  it("keeps every invariant at every hour count", () => {
    for (const hours of HOURS_AT_A_TIME_CHOICES) {
      for (const viewport of VIEWPORTS) {
        const slot = slotHeightFor(viewport, hours);
        expect(slot % 4).toBe(0);
        expect(slot).toBeGreaterThanOrEqual(MIN_SLOT_HEIGHT);
        expect(Number.isInteger((TIME_SNAP_MINUTES * slot) / 60)).toBe(true);
      }
    }
  });

  it("answers the default when the count is unusable", () => {
    // The dataset is a string channel and can hold anything, including nothing.
    expect(slotHeightFor(862, NaN)).toBe(slotHeightFor(862, HOURS_AT_A_TIME));
    expect(slotHeightFor(862, 0)).toBe(slotHeightFor(862, HOURS_AT_A_TIME));
  });
});

describe("clampHoursAtATime", () => {
  it("passes every value the picker can produce through unchanged", () => {
    for (const hours of HOURS_AT_A_TIME_CHOICES) {
      expect(clampHoursAtATime(hours)).toBe(hours);
      // A <select> hands back a string, and so does the root dataset.
      expect(clampHoursAtATime(String(hours))).toBe(hours);
    }
  });

  it("offers the whole range Calendar.app does, and nothing outside it", () => {
    expect(HOURS_AT_A_TIME_CHOICES[0]).toBe(MIN_HOURS_AT_A_TIME);
    expect(HOURS_AT_A_TIME_CHOICES[HOURS_AT_A_TIME_CHOICES.length - 1]).toBe(MAX_HOURS_AT_A_TIME);
    expect(HOURS_AT_A_TIME_CHOICES).toContain(HOURS_AT_A_TIME);
  });

  it("pulls an out-of-range number to the nearest hour it can draw", () => {
    // A client with a wider range keeps its intent; it does not get reset.
    expect(clampHoursAtATime(2)).toBe(MIN_HOURS_AT_A_TIME);
    expect(clampHoursAtATime(48)).toBe(MAX_HOURS_AT_A_TIME);
    expect(clampHoursAtATime(9.4)).toBe(9);
  });

  it("answers the default for a value that never was", () => {
    // Not the floor: an absent or unreadable setting is not a request for six
    // hours, and 12 is what every account was showing before this existed.
    expect(clampHoursAtATime(undefined)).toBe(HOURS_AT_A_TIME);
    expect(clampHoursAtATime("")).toBe(HOURS_AT_A_TIME);
    expect(clampHoursAtATime("twelve")).toBe(HOURS_AT_A_TIME);
    expect(clampHoursAtATime(null)).toBe(HOURS_AT_A_TIME);
    expect(clampHoursAtATime(0)).toBe(HOURS_AT_A_TIME);
    expect(clampHoursAtATime(-8)).toBe(HOURS_AT_A_TIME);
  });
});

describe("the grid's extent", () => {
  it("covers the whole day, so nothing is unrenderable", () => {
    // D2: the window used to start at 06:00, and WeekView carried a branch that
    // grew it downward whenever an item started earlier. A full day removes the
    // reason for that branch rather than hiding it.
    expect(DAY_START).toBe(0);
    expect(DAY_END).toBe(24);
  });
});

describe("pointer Y to minutes", () => {
  const cases = VIEWPORTS.map((viewport) => [viewport, slotHeightFor(viewport)] as const);

  it("round-trips every snapped minute of the day without loss, at every row height", () => {
    for (const [, slot] of cases) {
      const yFor = (minutes: number) => ((minutes - DAY_START * 60) / 60) * slot;
      for (let minutes = DAY_START * 60; minutes <= DAY_END * 60; minutes += TIME_SNAP_MINUTES) {
        const back = minutesFromPointerY(yFor(minutes), 0, slot);
        expect(back).toBeCloseTo(minutes, 9);
        expect(snapDownToStep(back)).toBe(minutes);
      }
    }
  });

  it("maps the top of the grid to the first minute of the day", () => {
    for (const [, slot] of cases) {
      expect(minutesFromPointerY(0, 0, slot)).toBe(DAY_START * 60);
    }
  });

  it("clamps above and below instead of running off the grid", () => {
    const slot = slotHeightFor(682);
    expect(minutesFromPointerY(-500, 0, slot)).toBe(DAY_START * 60);
    expect(minutesFromPointerY((DAY_END - DAY_START) * slot + 500, 0, slot)).toBe(DAY_END * 60);
  });

  it("reads a container offset as the grid's origin", () => {
    const slot = slotHeightFor(682);
    const containerTop = 137;
    expect(minutesFromPointerY(containerTop + 9 * slot, containerTop, slot)).toBeCloseTo(9 * 60, 9);
  });

  it("is monotonic — a lower pointer never means an earlier time", () => {
    const slot = slotHeightFor(862);
    let previous = -Infinity;
    for (let y = 0; y <= (DAY_END - DAY_START) * slot; y += 7) {
      const minutes = minutesFromPointerY(y, 0, slot);
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
