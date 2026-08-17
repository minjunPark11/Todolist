import { describe, expect, it } from "vitest";
import { addDays } from "./date";
import { deriveHorizon } from "./horizons";

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

});
