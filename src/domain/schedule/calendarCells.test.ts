import { describe, expect, it } from "vitest";
import { gridStart, monthGrid, WEEK_LENGTH } from "./calendarCells";
import { EMPTY_SCHEDULE, type Schedule, type ScheduleDraft, type ScheduleMode } from "./types";

const TODAY = "2026-08-18";

function draft(mode: ScheduleMode, patch: Partial<Schedule> = {}): ScheduleDraft {
  return { ...EMPTY_SCHEDULE, ...patch, mode };
}

/** Flatten the grid so a test can ask about one date without indexing rows. */
function cellFor(grid: ReturnType<typeof monthGrid>, date: string) {
  const cell = grid.flat().find((entry) => entry.date === date);
  if (!cell) throw new Error(`${date} is not in this grid`);
  return cell;
}

const august = (d: ScheduleDraft, hover: string | null = null) => monthGrid("2026-08-01", d, hover, TODAY);

describe("grid shape", () => {
  it("always has six rows of seven, so the popover never resizes", () => {
    for (const month of ["2026-02-01", "2026-08-01", "2026-11-01"]) {
      const grid = monthGrid(month, draft("date"), null, TODAY);
      expect(grid).toHaveLength(6);
      expect(grid.every((row) => row.length === WEEK_LENGTH)).toBe(true);
    }
  });

  it("starts on the Sunday on or before the first", () => {
    // 2026-08-01 is a Saturday, so the grid opens on 2026-07-26.
    expect(gridStart("2026-08-01")).toBe("2026-07-26");
    // 2026-11-01 is a Sunday and starts the grid itself.
    expect(gridStart("2026-11-01")).toBe("2026-11-01");
  });

  it("marks days of neighbouring months as outside", () => {
    const grid = august(draft("date"));
    expect(cellFor(grid, "2026-07-31").outsideMonth).toBe(true);
    expect(cellFor(grid, "2026-08-01").outsideMonth).toBe(false);
    expect(cellFor(grid, "2026-09-01").outsideMonth).toBe(true);
  });

  it("marks today", () => {
    const grid = august(draft("date"));
    expect(cellFor(grid, TODAY).isToday).toBe(true);
    expect(cellFor(grid, "2026-08-19").isToday).toBe(false);
  });
});

describe("selection", () => {
  it("draws a date-mode pick as a single day", () => {
    const grid = august(draft("date", { dueDate: "2026-08-20" }));
    expect(cellFor(grid, "2026-08-20").selection).toBe("single");
    expect(cellFor(grid, "2026-08-19").selection).toBe("none");
  });

  it("draws a range as start, middle and end", () => {
    const grid = august(draft("duration", { startDate: "2026-08-17", dueDate: "2026-08-20" }));
    expect(cellFor(grid, "2026-08-17").selection).toBe("start");
    expect(cellFor(grid, "2026-08-18").selection).toBe("middle");
    expect(cellFor(grid, "2026-08-19").selection).toBe("middle");
    expect(cellFor(grid, "2026-08-20").selection).toBe("end");
    expect(cellFor(grid, "2026-08-21").selection).toBe("none");
  });

  // §4.9 — a same-day range is one cell carrying the whole schedule, and needs
  // a different shape from an endpoint that continues into its neighbour.
  it("draws a same-day range as a single day, not a start touching an end", () => {
    const grid = august(draft("duration", { startDate: "2026-08-20", dueDate: "2026-08-20" }));
    expect(cellFor(grid, "2026-08-20").selection).toBe("single");
  });

  it("draws a half-picked range as a single day until an end is chosen", () => {
    const grid = august(draft("duration", { startDate: "2026-08-17" }));
    expect(cellFor(grid, "2026-08-17").selection).toBe("single");
    expect(cellFor(grid, "2026-08-20").selection).toBe("none");
  });

  it("spans a range across a month boundary", () => {
    const grid = monthGrid("2026-08-01", draft("duration", { startDate: "2026-07-30", dueDate: "2026-08-02" }), null, TODAY);
    expect(cellFor(grid, "2026-07-30").selection).toBe("start");
    expect(cellFor(grid, "2026-07-31").selection).toBe("middle");
    expect(cellFor(grid, "2026-08-02").selection).toBe("end");
  });
});

describe("preview (design §4.17–4.22)", () => {
  const halfPicked = draft("duration", { startDate: "2026-08-17" });

  it("fills the days between the start and the cursor", () => {
    const grid = august(halfPicked, "2026-08-20");
    expect(cellFor(grid, "2026-08-18").preview).toBe(true);
    expect(cellFor(grid, "2026-08-20").preview).toBe(true);
    expect(cellFor(grid, "2026-08-21").preview).toBe(false);
  });

  it("does not preview the start itself, which is already selected", () => {
    const grid = august(halfPicked, "2026-08-20");
    expect(cellFor(grid, "2026-08-17").preview).toBe(false);
    expect(cellFor(grid, "2026-08-17").selection).toBe("single");
  });

  // §4.19 — clicking before the start restarts the range rather than closing
  // it, so previewing a range backwards would promise something else.
  it("previews nothing when the cursor is before the start", () => {
    const grid = august(halfPicked, "2026-08-14");
    expect(grid.flat().some((cell) => cell.preview)).toBe(false);
  });

  it("previews nothing in date mode", () => {
    const grid = august(draft("date", { dueDate: "2026-08-17" }), "2026-08-20");
    expect(grid.flat().some((cell) => cell.preview)).toBe(false);
  });

  it("previews nothing once the range is complete", () => {
    const grid = august(draft("duration", { startDate: "2026-08-17", dueDate: "2026-08-20" }), "2026-08-25");
    expect(grid.flat().some((cell) => cell.preview)).toBe(false);
  });

  it("previews nothing without a cursor", () => {
    expect(august(halfPicked, null).flat().some((cell) => cell.preview)).toBe(false);
  });
});
