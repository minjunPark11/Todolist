import { describe, expect, it } from "vitest";
import {
  AUTO_DEFAULT_MINUTES,
  AUTO_HIGH_PRIORITY_MINUTES,
  FOCUS_LENGTH_CHOICES,
  focusSessionMinutes,
  MAX_FOCUS_MINUTES,
  MIN_FOCUS_MINUTES,
  sanitizeFocusDefaultLength,
} from "./sessionLength";

// SETTINGS_REVIEW.md 4.5: this was an inline expression in a 2000-line hook and
// nothing tested it. The point of the tests below is that "auto" reproduces it
// exactly — an account that never touches the setting must not move.

describe("the chain, most specific first", () => {
  it("gives a caller's own number priority over everything", () => {
    expect(
      focusSessionMinutes({ requestedMinutes: 12, startTime: "09:00", endTime: "11:00", preference: 45 }),
    ).toBe(12);
  });

  it("uses the task's own span when there is no request", () => {
    // The reader already said when this task runs; a global default is a
    // weaker statement than that.
    expect(focusSessionMinutes({ startTime: "09:00", endTime: "10:30", preference: 25 })).toBe(90);
    expect(focusSessionMinutes({ startTime: "13:15", endTime: "13:45", preference: "auto" })).toBe(30);
  });

  it("falls back to the reader's default when the task has no span", () => {
    expect(focusSessionMinutes({ preference: 45 })).toBe(45);
    expect(focusSessionMinutes({ startTime: "09:00", preference: 45 })).toBe(45);
    expect(focusSessionMinutes({ endTime: "09:00", preference: 45 })).toBe(45);
  });
});

describe("auto reproduces what the hook did inline", () => {
  it("is 50 minutes for a high-priority task and 30 for the rest", () => {
    expect(focusSessionMinutes({ priority: "high", preference: "auto" })).toBe(AUTO_HIGH_PRIORITY_MINUTES);
    for (const priority of ["none", "low", "medium"] as const) {
      expect(focusSessionMinutes({ priority, preference: "auto" })).toBe(AUTO_DEFAULT_MINUTES);
    }
    expect(focusSessionMinutes({ preference: "auto" })).toBe(AUTO_DEFAULT_MINUTES);
  });

  it("stops reading priority once a number is chosen", () => {
    // The heuristic is retired, not merely overridden for some tasks.
    expect(focusSessionMinutes({ priority: "high", preference: 25 })).toBe(25);
    expect(focusSessionMinutes({ priority: "none", preference: 25 })).toBe(25);
  });
});

describe("clamping", () => {
  it("keeps every session inside the range it always had", () => {
    expect(focusSessionMinutes({ requestedMinutes: 9000, preference: "auto" })).toBe(MAX_FOCUS_MINUTES);
    expect(focusSessionMinutes({ startTime: "00:00", endTime: "23:59", preference: "auto" })).toBe(MAX_FOCUS_MINUTES);
    expect(focusSessionMinutes({ preference: 9000 })).toBe(MAX_FOCUS_MINUTES);
    expect(focusSessionMinutes({ requestedMinutes: 0.2, preference: "auto" })).toBeGreaterThanOrEqual(MIN_FOCUS_MINUTES);
  });

  it("rounds to whole minutes", () => {
    expect(focusSessionMinutes({ requestedMinutes: 24.6, preference: "auto" })).toBe(25);
  });
});

describe("a span that is not one", () => {
  it("falls through to the default instead of becoming a one-minute session", () => {
    // The inline version clamped the negative difference to 1 and started a
    // 60-second session. An end before its start is broken data, not intent.
    expect(focusSessionMinutes({ startTime: "11:00", endTime: "09:00", preference: 45 })).toBe(45);
    expect(focusSessionMinutes({ startTime: "09:00", endTime: "09:00", preference: "auto" })).toBe(
      AUTO_DEFAULT_MINUTES,
    );
    expect(focusSessionMinutes({ startTime: "nope", endTime: "also nope", preference: 45 })).toBe(45);
  });
});

describe("sanitizeFocusDefaultLength", () => {
  it("passes every value the picker offers", () => {
    for (const choice of FOCUS_LENGTH_CHOICES) {
      expect(sanitizeFocusDefaultLength(choice)).toBe(choice);
      // A <select> hands back a string for both kinds.
      expect(sanitizeFocusDefaultLength(String(choice))).toBe(choice);
    }
  });

  it("answers auto for anything unreadable, so nobody's sessions shorten by accident", () => {
    for (const value of [undefined, null, "", "twelve", 0, -30, NaN, {}]) {
      expect(sanitizeFocusDefaultLength(value)).toBe("auto");
    }
  });

  it("pulls a number in range rather than discarding it", () => {
    expect(sanitizeFocusDefaultLength(9000)).toBe(MAX_FOCUS_MINUTES);
    expect(sanitizeFocusDefaultLength(37.4)).toBe(37);
  });
});
