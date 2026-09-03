import { describe, expect, it } from "vitest";
import { nextWholeHour, parseTimeInput, timeOptions, TIME_STEP_MINUTES } from "./timeOptions";
import { isLocalTime } from "./types";

describe("timeOptions", () => {
  it("covers the whole day in half-hours, ascending", () => {
    const options = timeOptions();
    expect(options).toHaveLength(48);
    expect(options[0]).toBe("00:00");
    expect(options[1]).toBe("00:30");
    expect(options[options.length - 1]).toBe("23:30");
    expect([...options].sort()).toEqual(options);
  });

  // §3.1: nothing is filtered. The reference list only LOOKS like it starts at
  // the current value, because it is scrolled there.
  it("keeps every step, including the ones before a typical work day", () => {
    expect(timeOptions()).toContain("02:00");
    expect(timeOptions()).toContain("00:30");
  });

  it("emits nothing the domain would refuse to store", () => {
    expect(timeOptions().every(isLocalTime)).toBe(true);
    expect(timeOptions()).not.toContain("24:00");
  });

  it("takes a finer grid, for the day one is wanted", () => {
    expect(timeOptions(15)).toHaveLength(96);
    expect(timeOptions(60)).toHaveLength(24);
    expect(TIME_STEP_MINUTES).toBe(30);
  });

  it("refuses a step that would not terminate", () => {
    expect(timeOptions(0)).toEqual([]);
    expect(timeOptions(-30)).toEqual([]);
  });
});

describe("parseTimeInput", () => {
  it("reads the shapes of §3.2's table", () => {
    expect(parseTimeInput("7")).toBe("07:00");
    expect(parseTimeInput("730")).toBe("07:30");
    expect(parseTimeInput("0730")).toBe("07:30");
    expect(parseTimeInput("7:30")).toBe("07:30");
    expect(parseTimeInput("19:00")).toBe("19:00");
    expect(parseTimeInput("1900")).toBe("19:00");
    expect(parseTimeInput("7:30 PM")).toBe("19:30");
    expect(parseTimeInput("7pm")).toBe("19:00");
    expect(parseTimeInput("오전 7:30")).toBe("07:30");
    expect(parseTimeInput("오후 7시")).toBe("19:00");
  });

  it("reads 시 and 분 as the separator they are", () => {
    expect(parseTimeInput("7시 30분")).toBe("07:30");
    expect(parseTimeInput("19시")).toBe("19:00");
  });

  it("puts noon and midnight where a clock puts them", () => {
    expect(parseTimeInput("12 AM")).toBe("00:00");
    expect(parseTimeInput("12:30 AM")).toBe("00:30");
    expect(parseTimeInput("12 PM")).toBe("12:00");
    expect(parseTimeInput("12:30 PM")).toBe("12:30");
  });

  it("tolerates spacing and case around the meridiem", () => {
    expect(parseTimeInput("  7 : 30 p.m. ")).toBe("19:30");
    expect(parseTimeInput("7:30pm")).toBe("19:30");
  });

  // The whole reason it returns null: an unreadable input must not become a
  // time, because the wrong time saves as silently as the right one.
  it("refuses rather than inventing", () => {
    expect(parseTimeInput("25:00")).toBeNull();
    expect(parseTimeInput("7:70")).toBeNull();
    expect(parseTimeInput("abc")).toBeNull();
    expect(parseTimeInput("")).toBeNull();
    expect(parseTimeInput("   ")).toBeNull();
    expect(parseTimeInput("13 PM")).toBeNull();
    expect(parseTimeInput("0 AM")).toBeNull();
    expect(parseTimeInput("24:00")).toBeNull();
    expect(parseTimeInput("12345")).toBeNull();
  });

  it("never returns something the domain would refuse", () => {
    for (const text of ["7", "730", "23:59", "오후 11시", "12 AM"]) {
      const parsed = parseTimeInput(text);
      expect(parsed !== null && isLocalTime(parsed)).toBe(true);
    }
  });
});

describe("nextWholeHour", () => {
  it("rounds up to the next whole hour", () => {
    expect(nextWholeHour("07:15")).toBe("08:00");
    expect(nextWholeHour("14:01")).toBe("15:00");
  });

  // An exact hour has not passed, so there is nothing to round away from.
  it("stays put on the hour", () => {
    expect(nextWholeHour("07:00")).toBe("07:00");
    expect(nextWholeHour("00:00")).toBe("00:00");
  });

  // §3.3: the list has no 24:00 and the date belongs to the calendar above.
  it("holds at 23:00 rather than rolling into tomorrow", () => {
    expect(nextWholeHour("23:40")).toBe("23:00");
    expect(nextWholeHour("23:00")).toBe("23:00");
  });

  it("falls back rather than propagating a value no clock produces", () => {
    expect(nextWholeHour("nonsense")).toBe("09:00");
  });
});
