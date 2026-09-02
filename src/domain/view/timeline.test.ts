import { describe, expect, it } from "vitest";
import type { Span } from "./span";
import { addDays } from "../../utils/date";
import { spanBounds } from "./span";
import {
  alignToZoom,
  columnUnitOf,
  dateAtColumnOffset,
  placeBar,
  shiftWindow,
  timelineWindow,
  todayColumn,
  ZOOM_COLUMNS,
} from "./timeline";

const span = (start: string, end = start): Span => ({ start, end, inferredStart: false, startTime: "", endTime: "" });

describe("timelineWindow", () => {
  it("starts a day-cut window on the date itself", () => {
    const w = timelineWindow("week", "2026-08-15");
    expect(w.from).toBe("2026-08-15");
    expect(w.to).toBe("2026-08-21"); // 7 inclusive days
    expect(w.edges).toHaveLength(ZOOM_COLUMNS.week + 1);
  });

  it("never begins mid-column", () => {
    // A month window anchored mid-month must start on the 1st, or every bar
    // would be off by the offset of whatever day the user happened to be on.
    expect(timelineWindow("halfYear", "2026-08-15").from).toBe("2026-08-01");
    // §12: the year window is ROLLING now — twelve months from this one, not
    // pinned to January, because its columns are months like `6개월`'s.
    expect(timelineWindow("year", "2026-08-15").from).toBe("2026-08-01");
    // §15: an edge carries a clock, and `from` is that edge with the clock cut
    // off — so the aligned anchor is compared against the edge itself.
    expect(alignToZoom("2026-08-15", "month")).toBe(timelineWindow("month", "2026-08-15").edges[0]);
  });

  it("covers six months and a rolling year", () => {
    expect(timelineWindow("halfYear", "2026-01-10")).toMatchObject({ from: "2026-01-01", to: "2026-06-30" });
    expect(timelineWindow("year", "2026-06-01")).toMatchObject({ from: "2026-06-01", to: "2027-05-31" });
  });

  // The point of splitting the id from the unit (§12): these two are cut the
  // same way and differ only in how many columns they run to.
  it("gives two zooms the same unit and different lengths", () => {
    expect(columnUnitOf("halfYear")).toBe(columnUnitOf("year"));
    expect(ZOOM_COLUMNS.halfYear).toBe(6);
    expect(ZOOM_COLUMNS.year).toBe(12);
  });

  it("pages by a whole window, so no time is skipped or repeated", () => {
    const w = timelineWindow("week", "2026-08-15");
    const next = timelineWindow("week", shiftWindow(w, 1));
    expect(next.from).toBe("2026-08-22"); // the day after `to`
    const back = timelineWindow("week", shiftWindow(next, -1));
    expect(back.from).toBe(w.from);
  });
});

describe("placeBar", () => {
  const w = timelineWindow("week", "2026-08-15"); // 08-15 .. 08-21, seven days

  /** A seventh of this window, which is one of its day columns. */
  const DAY = 1 / 7;
  const near = (value: number, want: number) => expect(value).toBeCloseTo(want, 6);

  // §14: the geometry is the dates, not the columns they fall in. A one-day
  // bar is one day WIDE — it used to be one column, which at week zoom made a
  // three-day task and a seven-day one identical [실측].
  it("gives a single-day bar exactly one day of width", () => {
    const p = placeBar(span("2026-08-15"), w)!;
    near(p.left, 0);
    near(p.width, DAY);
    expect(p).toMatchObject({ clippedStart: false, clippedEnd: false });
  });

  it("spans start to end inclusive", () => {
    // The 16th to the 18th is three days, and it begins one day in.
    const p = placeBar(span("2026-08-16", "2026-08-18"), w)!;
    near(p.left, DAY);
    near(p.width, 3 * DAY);
  });

  // The difference the whole change exists for: two lengths that used to draw
  // the same now differ.
  it("draws a longer task longer", () => {
    const three = placeBar(span("2026-08-16", "2026-08-18"), w)!;
    const one = placeBar(span("2026-08-16"), w)!;
    expect(three.width).toBeGreaterThan(one.width);
    near(three.width / one.width, 3);
  });

  it("clips a bar that starts before the window", () => {
    const p = placeBar(span("2026-08-01", "2026-08-17"), w)!;
    near(p.left, 0);
    // Only the part inside is drawn: the 15th to the 17th, three days.
    near(p.width, 3 * DAY);
    expect(p).toMatchObject({ clippedStart: true, clippedEnd: false });
  });

  it("clips a bar that runs past the window", () => {
    const p = placeBar(span("2026-08-20", "2026-09-30"), w)!;
    near(p.left, 5 * DAY);
    near(p.left + p.width, 1);
    expect(p).toMatchObject({ clippedStart: false, clippedEnd: true });
  });

  it("still renders a bar wider than the whole window", () => {
    // Disappearing at the zoom where it matters most is the worst outcome.
    const p = placeBar(span("2026-01-01", "2026-12-31"), w)!;
    near(p.left, 0);
    near(p.width, 1);
    expect(p).toMatchObject({ clippedStart: true, clippedEnd: true });
  });

  it("includes a bar that only touches an edge", () => {
    expect(placeBar(span("2026-08-21"), w)).not.toBeNull();
    expect(placeBar(span("2026-08-01", "2026-08-15"), w)).not.toBeNull();
  });

  it("draws nothing for a span that clears the window", () => {
    expect(placeBar(span("2026-08-22"), w)).toBeNull();
    expect(placeBar(span("2026-08-01", "2026-08-14"), w)).toBeNull();
  });

  // Months are uneven, so a fraction of the window is the only honest answer:
  // March starts 59 days into a 365-day year, not at three twelfths of it.
  it("measures a coarse window in days rather than in columns", () => {
    const months = timelineWindow("year", "2026-01-01"); // 365 days
    const p = placeBar(span("2026-03-14", "2026-05-02"), months)!;
    near(p.left, 72 / 365); // Jan 31 + Feb 28 + 13
    near(p.width, 50 / 365); // Mar 14 → May 2 inclusive
  });

  it("handles a month window across a leap February", () => {
    const months = timelineWindow("year", "2028-01-01"); // 366 days
    expect(months.to).toBe("2028-12-31");
    const p = placeBar(span("2028-02-29"), months)!;
    near(p.left, 59 / 366); // Jan 31 + Feb 28
    near(p.width, 1 / 366);
  });
});

describe("todayColumn", () => {
  it("finds the column holding today", () => {
    const w = timelineWindow("week", "2026-08-15");
    expect(todayColumn(w, "2026-08-15")).toBe(1);
    expect(todayColumn(w, "2026-08-20")).toBe(6);
  });

  it("reports nothing when today is off-window, so no marker is drawn", () => {
    const w = timelineWindow("week", "2026-08-15");
    expect(todayColumn(w, "2026-09-01")).toBeNull();
  });
});

// §13. A column is a week or a month at three of the four zooms, so a gesture
// that could name only the column could name only that week or that month.
describe("dateAtColumnOffset", () => {
  it("ignores the ratio where a column is already one day", () => {
    const days = timelineWindow("week", "2026-09-02");
    expect(dateAtColumnOffset(days, 2, 0)).toBe("2026-09-04");
    expect(dateAtColumnOffset(days, 2, 0.9)).toBe("2026-09-04");
  });

  it("names the day inside a week column", () => {
    const weeks = timelineWindow("month", "2026-09-02"); // columns start Sunday
    const start = weeks.edges[1].slice(0, 10);
    expect(dateAtColumnOffset(weeks, 1, 0)).toBe(start);
    // Three days in, which is the difference the whole change exists for.
    expect(dateAtColumnOffset(weeks, 1, 0.5)).toBe(addDays(start, 3));
  });

  // A ratio of 1 is the column's LAST day, never the first day of the next —
  // otherwise the far edge of a column would silently belong to its neighbour.
  it("stays inside the column at the far edge", () => {
    const weeks = timelineWindow("month", "2026-09-02");
    const start = weeks.edges[1].slice(0, 10);
    expect(dateAtColumnOffset(weeks, 1, 1)).toBe(addDays(start, 6));
    expect(dateAtColumnOffset(weeks, 1, 0.999999)).toBe(addDays(start, 6));
  });

  it("spreads a month column across its own length", () => {
    const months = timelineWindow("year", "2026-01-01"); // January, 31 days
    expect(dateAtColumnOffset(months, 0, 0)).toBe("2026-01-01");
    expect(dateAtColumnOffset(months, 0, 0.5)).toBe("2026-01-16");
    expect(dateAtColumnOffset(months, 0, 1)).toBe("2026-01-31");
  });

  // Both would otherwise reach the record as `NaN-NaN-NaN`.
  it("gives a usable date when the pointer reported nothing", () => {
    const weeks = timelineWindow("month", "2026-09-02");
    expect(dateAtColumnOffset(weeks, 1, Number.NaN)).toBe(weeks.edges[1].slice(0, 10));
    expect(dateAtColumnOffset(weeks, 99, 0.5)).toBe("");
  });
});

// §15. One day, cut into hours — the only zoom where the record's own times
// are legible, and the reason a boundary had to grow a clock.
describe("the day window", () => {
  const day = timelineWindow("day", "2026-09-02");

  it("covers exactly the day it was anchored on", () => {
    expect(day.from).toBe("2026-09-02");
    expect(day.to).toBe("2026-09-02");
    expect(day.edges).toHaveLength(25);
  });

  it("cuts it at every hour, ending on the next midnight", () => {
    expect(day.edges[0]).toBe("2026-09-02T00:00");
    expect(day.edges[9]).toBe("2026-09-02T09:00");
    expect(day.edges[24]).toBe("2026-09-03T00:00");
  });

  // Everything else is midnight, which is what lets `from`/`to` go on being
  // dates and every existing caller go on filtering with them.
  it("leaves every other zoom's boundaries at midnight", () => {
    for (const zoom of ["week", "month", "halfYear", "year"] as const) {
      const w = timelineWindow(zoom, "2026-09-02");
      expect(w.edges.every((edge) => edge.endsWith("T00:00"))).toBe(true);
    }
  });

  // A column under a day long cannot name more than the date it sits in — the
  // gestures write dates, and phase C is where an hour would be written.
  it("names the day for any hour column", () => {
    expect(dateAtColumnOffset(day, 9, 0.5)).toBe("2026-09-02");
    expect(dateAtColumnOffset(day, 23, 0.9)).toBe("2026-09-02");
  });
});

// §15: a span reads the hours the record set, so two tasks on one day are two
// different bars rather than one shape drawn twice.
describe("spanBounds with times", () => {
  const at = (date: string, time: string) => new Date(`${date}T${time}:00`).getTime();

  it("runs the whole day when the record set no times", () => {
    const s = { start: "2026-09-02", end: "2026-09-02", inferredStart: false, startTime: "", endTime: "" };
    expect(spanBounds(s)).toEqual({ from: at("2026-09-02", "00:00"), to: at("2026-09-03", "00:00") });
  });

  it("runs between the hours when it did", () => {
    const s = { start: "2026-09-02", end: "2026-09-02", inferredStart: false, startTime: "09:00", endTime: "10:30" };
    expect(spanBounds(s)).toEqual({ from: at("2026-09-02", "09:00"), to: at("2026-09-02", "10:30") });
  });

  // The Calendar lets a range be typed either way round, and a bar with a
  // negative width would be worse than one drawn across the day it falls on.
  it("falls back to the whole day when the hours are backwards", () => {
    const s = { start: "2026-09-02", end: "2026-09-02", inferredStart: false, startTime: "18:00", endTime: "09:00" };
    expect(spanBounds(s)).toEqual({ from: at("2026-09-02", "00:00"), to: at("2026-09-03", "00:00") });
  });
});
