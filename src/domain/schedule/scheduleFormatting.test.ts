// What the collapsed 시간 row says (SCHEDULE_TIME_FIELD_DESIGN.md §13.4).
//
// The formatter had no test at all, and the bug it was hiding is the kind that
// only shows up when two of them are on screen together: this one asked Intl
// for the LOCALE's convention while the field beside it asked the app's
// setting, so a reader who had chosen 24 hours saw `23:00` in the field and
// `오후 11:00` on the row above it. §13.2 makes that row the first thing they
// look at after choosing a time, which is why it is fixed now.
import { describe, expect, it } from "vitest";
import { EMPTY_SCHEDULE, type Schedule } from "./index";
import { formatTimeSummary } from "./scheduleFormatting";

const DAY = "2026-09-03";
const dated = (patch: Partial<Schedule> = {}): Schedule => ({ ...EMPTY_SCHEDULE, dueDate: DAY, ...patch });

describe("formatTimeSummary", () => {
  it("says nothing when there is no time", () => {
    expect(formatTimeSummary(dated(), "ko-KR", "24h")).toBe("");
  });

  it("writes the start in the app's clock, not the locale's", () => {
    // The bug in one line: `ko-KR` writes a 12-hour clock by default, and a
    // reader who has chosen 24 was seeing it here.
    expect(formatTimeSummary(dated({ startTime: "23:00" }), "ko-KR", "24h")).toBe("23:00");

    // The 12-hour side is asserted by shape rather than by string: which
    // marker a locale puts where is ICU's business and differs between the
    // browser and the test runner's build (`오후 11:00` there, `PM 11:00`
    // here). What this file is fixing is which SETTING is read.
    const twelve = formatTimeSummary(dated({ startTime: "23:00" }), "ko-KR", "12h");
    expect(twelve).toContain("11:00");
    expect(twelve).not.toBe("23:00");
  });

  it("falls back to the locale where the caller has no setting to pass", () => {
    // Two of the three callers format for a place with no clock setting to
    // read, so the argument is optional and the old behaviour is what they get.
    expect(formatTimeSummary(dated({ startTime: "23:00" }), "en-US")).toBe("11:00 PM");
  });

  it("writes both ends of a block, in the same clock", () => {
    const block = dated({ startDate: DAY, startTime: "09:00", endTime: "17:30" });
    expect(formatTimeSummary(block, "ko-KR", "24h")).toBe("09:00 – 17:30");
  });

  it("keeps the arrow for a block that crosses days", () => {
    // Each time belongs to its own end (audit 1-b), and the arrow is what says
    // so — a dash would read as one afternoon.
    const span = dated({ startDate: "2026-09-01", dueDate: "2026-09-04", startTime: "09:00", endTime: "17:00" });
    expect(formatTimeSummary(span, "ko-KR", "24h")).toBe("09:00 → 17:00");
  });
});
