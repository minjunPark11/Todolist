import { describe, expect, it } from "vitest";
import type { Span } from "./span";
import { addDays } from "../../utils/date";
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

const span = (start: string, end = start): Span => ({ start, end, inferredStart: false });

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
    expect(alignToZoom("2026-08-15", "month")).toBe(timelineWindow("month", "2026-08-15").from);
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
  const w = timelineWindow("week", "2026-08-15"); // 08-15 .. 08-21

  it("gives a single-day bar exactly one column", () => {
    const p = placeBar(span("2026-08-15"), w)!;
    expect(p).toMatchObject({ columnStart: 1, columnEnd: 2, clippedStart: false, clippedEnd: false });
  });

  it("spans start to end inclusive", () => {
    const p = placeBar(span("2026-08-16", "2026-08-18"), w)!;
    expect(p.columnStart).toBe(2);
    expect(p.columnEnd).toBe(5); // exclusive end of the 4th column
  });

  it("clips a bar that starts before the window", () => {
    const p = placeBar(span("2026-08-01", "2026-08-17"), w)!;
    expect(p).toMatchObject({ columnStart: 1, clippedStart: true, clippedEnd: false });
  });

  it("clips a bar that runs past the window", () => {
    const p = placeBar(span("2026-08-20", "2026-09-30"), w)!;
    expect(p).toMatchObject({ columnEnd: ZOOM_COLUMNS.week + 1, clippedStart: false, clippedEnd: true });
  });

  it("still renders a bar wider than the whole window", () => {
    // Disappearing at the zoom where it matters most is the worst outcome.
    const p = placeBar(span("2026-01-01", "2026-12-31"), w)!;
    expect(p).toMatchObject({ columnStart: 1, columnEnd: ZOOM_COLUMNS.week + 1, clippedStart: true, clippedEnd: true });
  });

  it("includes a bar that only touches an edge", () => {
    expect(placeBar(span("2026-08-21"), w)).not.toBeNull();
    expect(placeBar(span("2026-08-01", "2026-08-15"), w)).not.toBeNull();
  });

  it("draws nothing for a span that clears the window", () => {
    expect(placeBar(span("2026-08-22"), w)).toBeNull();
    expect(placeBar(span("2026-08-01", "2026-08-14"), w)).toBeNull();
  });

  it("places into the containing column at coarser zooms", () => {
    const months = timelineWindow("year", "2026-01-01");
    // Mid-month dates land in the month's column, not between columns.
    const p = placeBar(span("2026-03-14", "2026-05-02"), months)!;
    expect(p).toMatchObject({ columnStart: 3, columnEnd: 6 });
  });

  it("handles a month window across a leap February", () => {
    const months = timelineWindow("year", "2028-01-01");
    expect(months.to).toBe("2028-12-31");
    expect(placeBar(span("2028-02-29"), months)).toMatchObject({ columnStart: 2, columnEnd: 3 });
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
    const start = weeks.edges[1];
    expect(dateAtColumnOffset(weeks, 1, 0)).toBe(start);
    // Three days in, which is the difference the whole change exists for.
    expect(dateAtColumnOffset(weeks, 1, 0.5)).toBe(addDays(start, 3));
  });

  // A ratio of 1 is the column's LAST day, never the first day of the next —
  // otherwise the far edge of a column would silently belong to its neighbour.
  it("stays inside the column at the far edge", () => {
    const weeks = timelineWindow("month", "2026-09-02");
    expect(dateAtColumnOffset(weeks, 1, 1)).toBe(addDays(weeks.edges[1], 6));
    expect(dateAtColumnOffset(weeks, 1, 0.999999)).toBe(addDays(weeks.edges[1], 6));
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
    expect(dateAtColumnOffset(weeks, 1, Number.NaN)).toBe(weeks.edges[1]);
    expect(dateAtColumnOffset(weeks, 99, 0.5)).toBe("");
  });
});
