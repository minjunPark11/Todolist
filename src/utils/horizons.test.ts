import { describe, expect, it } from "vitest";
import { addDays } from "./date";
import { canDropOnHorizon, dateForHorizonDrop, deriveHorizon, HORIZONS } from "./horizons";

const TODAY = "2026-08-14";

describe("deriveHorizon", () => {
  it("places an undated item on the widest horizon", () => {
    // An intention with no deadline is what "life" is for — it must be
    // placed, never dropped.
    expect(deriveHorizon(undefined, TODAY)).toBe("life");
    expect(deriveHorizon("", TODAY)).toBe("life");
  });

  it("collapses today and anything overdue onto the day column", () => {
    expect(deriveHorizon(TODAY, TODAY)).toBe("day");
    expect(deriveHorizon(addDays(TODAY, -1), TODAY)).toBe("day");
    expect(deriveHorizon(addDays(TODAY, -400), TODAY)).toBe("day");
  });

  it("walks outward through the bounded horizons", () => {
    expect(deriveHorizon(addDays(TODAY, 1), TODAY)).toBe("week");
    expect(deriveHorizon(addDays(TODAY, 7), TODAY)).toBe("week");
    expect(deriveHorizon(addDays(TODAY, 8), TODAY)).toBe("month");
    expect(deriveHorizon(addDays(TODAY, 90), TODAY)).toBe("month");
    expect(deriveHorizon(addDays(TODAY, 91), TODAY)).toBe("year");
    expect(deriveHorizon(addDays(TODAY, 365), TODAY)).toBe("year");
    expect(deriveHorizon(addDays(TODAY, 366), TODAY)).toBe("life");
  });

  it("treats an unparseable date as undated rather than as today", () => {
    // daysBetween returns 0 for a bad date, which would otherwise land the
    // item on "day" — the most disruptive place for a wrong value.
    expect(deriveHorizon("not-a-date", TODAY)).toBe("life");
    expect(deriveHorizon("2026-13", TODAY)).toBe("life");
  });

  it("orders the columns widest to nearest", () => {
    expect([...HORIZONS]).toEqual(["life", "year", "month", "week", "day"]);
  });
});

describe("dateForHorizonDrop", () => {
  it("round-trips: a dropped card lands in the column it was dropped on", () => {
    // The property that actually matters — the drag writes a date, and the
    // column is re-derived from that date (D2). If these two disagreed, cards
    // would jump columns the moment they were released.
    for (const horizon of HORIZONS) {
      expect(deriveHorizon(dateForHorizonDrop(horizon, TODAY), TODAY)).toBe(horizon);
    }
  });

  it("aims at the middle of a band, not its edge", () => {
    // A card dropped on "week" should not be one day from falling into "day".
    expect(dateForHorizonDrop("week", TODAY)).toBe(addDays(TODAY, 3));
    expect(dateForHorizonDrop("life", TODAY)).toBeUndefined();
  });
});

describe("canDropOnHorizon", () => {
  it("lets goals and milestones go anywhere", () => {
    for (const horizon of HORIZONS) {
      expect(canDropOnHorizon("path", horizon)).toBe(true);
      expect(canDropOnHorizon("milestone", horizon)).toBe(true);
    }
  });

  it("keeps tasks out of the undated horizons", () => {
    // Dropping a task on life/year would clear its date and drop it out of
    // every column — a card vanishing is worse than a refused drop.
    expect(canDropOnHorizon("task", "life")).toBe(false);
    expect(canDropOnHorizon("task", "year")).toBe(false);
    expect(canDropOnHorizon("task", "month")).toBe(true);
    expect(canDropOnHorizon("task", "week")).toBe(true);
    expect(canDropOnHorizon("task", "day")).toBe(true);
  });
});
