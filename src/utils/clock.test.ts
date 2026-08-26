import { describe, expect, it } from "vitest";
import { formatClock, formatClockRange, formatHourLabel, hour12For } from "./clock";

describe("24-hour", () => {
  it("writes what the schedule stores", () => {
    expect(formatClock("13:00", "24h", "en")).toBe("13:00");
    expect(formatClock("09:05", "24h", "ko")).toBe("09:05");
  });

  it("pads a single-digit hour, whatever the stored string looked like", () => {
    expect(formatClock("9:05", "24h", "en")).toBe("09:05");
  });

  it("labels the hour column without minutes", () => {
    expect(formatHourLabel(0, "24h", "en")).toBe("00:00");
    expect(formatHourLabel(13, "24h", "ko")).toBe("13:00");
  });
});

describe("12-hour", () => {
  it("writes afternoon as afternoon", () => {
    expect(formatClock("13:00", "12h", "en")).toMatch(/1:00\s*PM/i);
  });

  it("hands the locale to Intl instead of pinning one", () => {
    // The defect this replaces: the formatter was `Intl.DateTimeFormat("en", …)`,
    // so Korean never got 오후 at all.
    //
    // The words themselves are NOT asserted here. Node's ICU in this repo has
    // Korean month names but not Korean day periods — it answers "PM 1:00"
    // where a browser answers "오후 1:00" — so a test on the string would be
    // testing the runtime's data, not this function. What is checkable here is
    // that the hour reads as an afternoon hour rather than a 13, in both.
    for (const locale of ["en", "ko"]) {
      const twelve = formatClock("13:00", "12h", locale);
      expect(twelve).toContain("1:00");
      expect(twelve).not.toBe(formatClock("13:00", "24h", locale));
    }
  });

  it("keeps midnight and noon apart", () => {
    expect(formatClock("00:00", "12h", "en")).toMatch(/12:00\s*AM/i);
    expect(formatClock("12:00", "12h", "en")).toMatch(/12:00\s*PM/i);
  });
});

describe("the locale's own convention", () => {
  it("asks Intl rather than deciding", () => {
    expect(hour12For("locale")).toBeUndefined();
    expect(hour12For("12h")).toBe(true);
    expect(hour12For("24h")).toBe(false);
  });

  it("produces something for both languages", () => {
    for (const locale of ["en", "ko"]) {
      expect(formatClock("13:00", "locale", locale).length).toBeGreaterThan(0);
    }
  });
});

describe("the end of a day", () => {
  it("writes 24:00 as a time a clock can show", () => {
    // Schedules store 24:00 for "to the end of the day"; no clock face has a
    // 24 on it, so the 12-hour reading is midnight — the same instant.
    expect(formatClock("24:00", "24h", "en")).toBe("24:00");
    expect(formatClock("24:00", "12h", "en")).toMatch(/12:00\s*AM/i);
  });
});

describe("input it cannot read", () => {
  it("shows the string rather than inventing a time", () => {
    for (const bad of ["", "later", "25:00", "12:99", "1230"]) {
      expect(formatClock(bad, "12h", "en")).toBe(bad);
    }
  });
});

describe("ranges", () => {
  it("keeps the separator the calendar already used", () => {
    expect(formatClockRange("09:00", "10:30", "24h", "en")).toBe("09:00 – 10:30");
  });

  it("drops the dash when there is no end", () => {
    expect(formatClockRange("09:00", "", "24h", "en")).toBe("09:00");
    expect(formatClockRange("09:00", undefined, "24h", "en")).toBe("09:00");
  });

  it("writes nothing when there is no start", () => {
    // An all-day item reaches this with no times at all.
    expect(formatClockRange(undefined, undefined, "24h", "en")).toBe("");
    expect(formatClockRange("", "10:00", "24h", "en")).toBe("");
  });
});
