import { describe, expect, it } from "vitest";
import type { Span } from "./span";
import {
  alignToZoom,
  placeBar,
  shiftWindow,
  timelineWindow,
  todayColumn,
  ZOOM_COLUMNS,
} from "./timeline";

const span = (start: string, end = start): Span => ({ start, end, inferredStart: false });

describe("timelineWindow", () => {
  it("starts a day window on the date itself", () => {
    const w = timelineWindow("day", "2026-08-15");
    expect(w.from).toBe("2026-08-15");
    expect(w.to).toBe("2026-08-28"); // 14 inclusive days
    expect(w.edges).toHaveLength(ZOOM_COLUMNS.day + 1);
  });

  it("never begins mid-column", () => {
    // A month window anchored mid-month must start on the 1st, or every bar
    // would be off by the offset of whatever day the user happened to be on.
    expect(timelineWindow("month", "2026-08-15").from).toBe("2026-08-01");
    expect(timelineWindow("year", "2026-08-15").from).toBe("2026-01-01");
    expect(alignToZoom("2026-08-15", "week")).toBe(timelineWindow("week", "2026-08-15").from);
  });

  it("covers a year of months and five years", () => {
    expect(timelineWindow("month", "2026-01-10")).toMatchObject({ from: "2026-01-01", to: "2026-12-31" });
    expect(timelineWindow("year", "2026-06-01")).toMatchObject({ from: "2026-01-01", to: "2030-12-31" });
  });

  it("pages by a whole window, so no time is skipped or repeated", () => {
    const w = timelineWindow("day", "2026-08-15");
    const next = timelineWindow("day", shiftWindow(w, 1));
    expect(next.from).toBe("2026-08-29"); // the day after `to`
    const back = timelineWindow("day", shiftWindow(next, -1));
    expect(back.from).toBe(w.from);
  });
});

describe("placeBar", () => {
  const w = timelineWindow("day", "2026-08-15"); // 08-15 .. 08-28

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
    const p = placeBar(span("2026-08-27", "2026-09-30"), w)!;
    expect(p).toMatchObject({ columnEnd: ZOOM_COLUMNS.day + 1, clippedStart: false, clippedEnd: true });
  });

  it("still renders a bar wider than the whole window", () => {
    // Disappearing at the zoom where it matters most is the worst outcome.
    const p = placeBar(span("2026-01-01", "2026-12-31"), w)!;
    expect(p).toMatchObject({ columnStart: 1, columnEnd: ZOOM_COLUMNS.day + 1, clippedStart: true, clippedEnd: true });
  });

  it("includes a bar that only touches an edge", () => {
    expect(placeBar(span("2026-08-28"), w)).not.toBeNull();
    expect(placeBar(span("2026-08-01", "2026-08-15"), w)).not.toBeNull();
  });

  it("draws nothing for a span that clears the window", () => {
    expect(placeBar(span("2026-08-29"), w)).toBeNull();
    expect(placeBar(span("2026-08-01", "2026-08-14"), w)).toBeNull();
  });

  it("places into the containing column at coarser zooms", () => {
    const months = timelineWindow("month", "2026-01-01");
    // Mid-month dates land in the month's column, not between columns.
    const p = placeBar(span("2026-03-14", "2026-05-02"), months)!;
    expect(p).toMatchObject({ columnStart: 3, columnEnd: 6 });
  });

  it("handles a month window across a leap February", () => {
    const months = timelineWindow("month", "2028-01-01");
    expect(months.to).toBe("2028-12-31");
    expect(placeBar(span("2028-02-29"), months)).toMatchObject({ columnStart: 2, columnEnd: 3 });
  });
});

describe("todayColumn", () => {
  it("finds the column holding today", () => {
    const w = timelineWindow("day", "2026-08-15");
    expect(todayColumn(w, "2026-08-15")).toBe(1);
    expect(todayColumn(w, "2026-08-20")).toBe(6);
  });

  it("reports nothing when today is off-window, so no marker is drawn", () => {
    const w = timelineWindow("day", "2026-08-15");
    expect(todayColumn(w, "2026-09-01")).toBeNull();
  });
});
