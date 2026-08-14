import { describe, expect, it } from "vitest";
import {
  anchorForTaskDate,
  createHorizonAnchors,
  dateForTaskAnchorDrop,
  isCurrentHorizonAnchor,
  scheduleForHorizon,
  shiftHorizonAnchor,
} from "./horizonAnchors";

const TODAY = "2026-08-14";

describe("horizon anchors", () => {
  it("creates independent current calendar anchors", () => {
    expect(createHorizonAnchors(TODAY)).toEqual({
      year: "2026-01-01",
      month: "2026-08-01",
      week: "2026-08-09",
      day: "2026-08-14",
    });
  });

  it("moves each anchor by its own period", () => {
    expect(shiftHorizonAnchor("year", "2026-01-01", 1)).toBe("2027-01-01");
    expect(shiftHorizonAnchor("month", "2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftHorizonAnchor("week", "2026-08-09", -1)).toBe("2026-08-02");
    expect(shiftHorizonAnchor("day", "2026-08-14", 1)).toBe("2026-08-15");
  });

  it("creates exact schedules without representative goal dates", () => {
    const anchors = createHorizonAnchors(TODAY);
    expect(scheduleForHorizon("life", anchors)).toEqual({ unit: "life" });
    expect(scheduleForHorizon("month", anchors)).toEqual({ unit: "month", startDate: "2026-08-01" });
  });

  it("keeps dated Tasks on their compatibility horizon and calendar anchor", () => {
    expect(anchorForTaskDate("2026-08-17", TODAY)).toEqual({ horizon: "week", anchor: "2026-08-16" });
    expect(anchorForTaskDate("2026-09-20", TODAY)).toEqual({ horizon: "month", anchor: "2026-09-01" });
  });

  it("keeps overdue Tasks visible on the current day", () => {
    expect(anchorForTaskDate("2026-08-10", TODAY)).toEqual({ horizon: "day", anchor: TODAY });
  });

  it("places a dropped Task inside the selected period", () => {
    const anchors = { year: "2027-01-01", month: "2026-09-01", week: "2026-08-16", day: "2026-08-20" };
    expect(dateForTaskAnchorDrop("day", anchors)).toBe("2026-08-20");
    expect(dateForTaskAnchorDrop("week", anchors)).toBe("2026-08-19");
    expect(dateForTaskAnchorDrop("month", anchors)).toBe("2026-09-15");
  });

  it("recognizes whether a column is viewing the actual current period", () => {
    const current = createHorizonAnchors(TODAY);
    expect(isCurrentHorizonAnchor("month", current, current)).toBe(true);
    expect(isCurrentHorizonAnchor("month", { ...current, month: "2026-09-01" }, current)).toBe(false);
    expect(isCurrentHorizonAnchor("life", current, current)).toBe(true);
  });
});
