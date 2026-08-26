import { describe, expect, it } from "vitest";
import { dayHeadFormatter, dayHeadParts } from "./calendarHeader";

const WEDNESDAY = new Date("2026-08-26T00:00:00");

const render = (locale: string) =>
  dayHeadParts(dayHeadFormatter(locale), WEDNESDAY)
    .map((part) => part.value)
    .join("");

describe("the day column header", () => {
  it("writes English the way Calendar.app does, not the way CLDR does", () => {
    // The `Ed` skeleton for en gives "26 Wed". Apple's header is "Wed 26", and
    // that is the one being matched here.
    expect(render("en")).toBe("Wed 26");
  });

  it("keeps Korean's own arrangement, decoration and all", () => {
    expect(render("ko")).toBe("26일 (수)");
  });

  it("leaves the number in a part of its own, so the today circle can wrap it", () => {
    for (const locale of ["en", "ko"]) {
      const parts = dayHeadParts(dayHeadFormatter(locale), WEDNESDAY);
      const day = parts.filter((part) => part.type === "day");
      expect(day).toHaveLength(1);
      expect(day[0].value).toBe("26");
    }
  });

  it("keeps the weekday in a part of its own too", () => {
    for (const locale of ["en", "ko"]) {
      const weekday = dayHeadParts(dayHeadFormatter(locale), WEDNESDAY).filter((part) => part.type === "weekday");
      expect(weekday).toHaveLength(1);
      expect(weekday[0].value.length).toBeGreaterThan(0);
    }
  });

  it("puts the separator between them rather than dropping it", () => {
    // English has to keep its space when the order is rewritten; a header that
    // reads "Wed26" is what forgetting this looks like.
    const parts = dayHeadParts(dayHeadFormatter("en"), WEDNESDAY);
    expect(parts.map((part) => part.type)).toEqual(["weekday", "literal", "day"]);
    expect(parts[1].value).toBe(" ");
  });

  it("returns what the formatter gave when a piece is missing", () => {
    const monthOnly = new Intl.DateTimeFormat("en", { month: "long" });
    const parts = dayHeadParts(monthOnly, WEDNESDAY);
    expect(parts.map((part) => part.value).join("")).toBe("August");
  });
});
