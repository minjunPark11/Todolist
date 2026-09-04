// GOOGLE_CALENDAR_SYNC_DESIGN.md §5.1, §8, §9.2.
//
// These are the outbound rules stated as facts rather than as intentions. The
// ones that matter most are not the happy shapes — they are the two places the
// design gave up something on purpose (§8's UNTIL bound, §5.3's wall-clock
// semantics) and the one place it refused to (§5.1's eligibility, which must
// never depend on whether a Google event currently exists).
import { describe, expect, it } from "vitest";
import { isSyncEligible, toGoogleEventBody, toRrule, type SyncableTask } from "./eventShape";

function task(overrides: Partial<SyncableTask> = {}): SyncableTask {
  return {
    title: "Write the report",
    dueDate: "2026-09-04",
    startTime: "",
    endTime: "",
    ...overrides,
  };
}

describe("isSyncEligible", () => {
  it("takes a dated task", () => {
    expect(isSyncEligible(task())).toBe(true);
  });

  it("refuses a task with no date", () => {
    expect(isSyncEligible(task({ dueDate: "" }))).toBe(false);
  });

  it("refuses a malformed date rather than sending it", () => {
    expect(isSyncEligible(task({ dueDate: "next tuesday" }))).toBe(false);
  });

  it("refuses a trashed task — §7 takes it off the calendar", () => {
    expect(isSyncEligible(task({ deletedAt: "2026-09-04T10:00:00Z" }))).toBe(false);
  });

  it("refuses a task given up on", () => {
    expect(isSyncEligible(task({ wontDoAt: "2026-09-04T10:00:00Z" }))).toBe(false);
  });

  it("KEEPS a completed task", () => {
    // The day it happened is still a fact about that day. Dropping it the
    // moment it is ticked would rewrite the calendar's record of the past.
    expect(isSyncEligible(task({ status: "completed", completedAt: "2026-09-04T18:00:00Z" }))).toBe(true);
  });

  it("takes a note — §5.1 asks about a date, not about what the item is", () => {
    expect(isSyncEligible(task({ kind: "note" }))).toBe(true);
  });
});

describe("toGoogleEventBody — all-day", () => {
  it("makes a one-day event with an exclusive end", () => {
    const body = toGoogleEventBody(task(), "Asia/Seoul");
    expect(body.start).toEqual({ date: "2026-09-04" });
    expect(body.end).toEqual({ date: "2026-09-05" });
  });

  it("crosses a month boundary without arithmetic drift", () => {
    const body = toGoogleEventBody(task({ dueDate: "2026-01-31" }), "Asia/Seoul");
    expect(body.end).toEqual({ date: "2026-02-01" });
  });

  it("spans startDate to dueDate when both are set", () => {
    const body = toGoogleEventBody(task({ startDate: "2026-09-01" }), "Asia/Seoul");
    expect(body.start).toEqual({ date: "2026-09-01" });
    expect(body.end).toEqual({ date: "2026-09-05" });
  });

  it("ignores a startDate that is not before the due date", () => {
    const body = toGoogleEventBody(task({ startDate: "2026-09-04" }), "Asia/Seoul");
    expect(body.start).toEqual({ date: "2026-09-04" });
  });
});

describe("toGoogleEventBody — timed", () => {
  it("hands Google the wall time and the zone, never an offset (§9.2)", () => {
    // The point of the whole timezone section: we do not own a tz database, so
    // we do not compute offsets. Google resolves the wall time in the named
    // zone, which is also what makes DST correct for free.
    const body = toGoogleEventBody(task({ startTime: "14:00", endTime: "15:30" }), "Asia/Seoul");
    expect(body.start).toEqual({ dateTime: "2026-09-04T14:00:00", timeZone: "Asia/Seoul" });
    expect(body.end).toEqual({ dateTime: "2026-09-04T15:30:00", timeZone: "Asia/Seoul" });
  });

  it("defaults to an hour when there is no end time", () => {
    // Matches the published ICS feed, which already answers this with an hour.
    // Two outbound paths disagreeing about the same task would be worse.
    const body = toGoogleEventBody(task({ startTime: "14:00" }), "Asia/Seoul");
    expect(body.end.dateTime).toBe("2026-09-04T15:00:00");
  });

  it("treats an end at or before the start as unset", () => {
    const body = toGoogleEventBody(task({ startTime: "14:00", endTime: "09:00" }), "Asia/Seoul");
    expect(body.end.dateTime).toBe("2026-09-04T15:00:00");
  });

  it("clamps rather than spilling into the next day", () => {
    const body = toGoogleEventBody(task({ startTime: "23:30" }), "Asia/Seoul");
    expect(body.end.dateTime).toBe("2026-09-04T23:59:00");
  });

  it("prefers the time over a span — §5.1 shape 1 beats shape 2", () => {
    const body = toGoogleEventBody(task({ startDate: "2026-09-01", startTime: "14:00" }), "Asia/Seoul");
    expect(body.start.dateTime).toBe("2026-09-04T14:00:00");
    expect(body.start.date).toBeUndefined();
  });
});

describe("toRrule", () => {
  it("is null when the task does not repeat", () => {
    expect(toRrule(task(), true)).toBeNull();
    expect(toRrule(task({ repeatType: "none" }), true)).toBeNull();
    expect(toGoogleEventBody(task(), "Asia/Seoul").recurrence).toBeUndefined();
  });

  it("maps the four frequencies", () => {
    expect(toRrule(task({ repeatType: "daily" }), true)).toBe("RRULE:FREQ=DAILY");
    expect(toRrule(task({ repeatType: "weekly" }), true)).toBe("RRULE:FREQ=WEEKLY");
    expect(toRrule(task({ repeatType: "monthly" }), true)).toBe("RRULE:FREQ=MONTHLY");
    expect(toRrule(task({ repeatType: "yearly" }), true)).toBe("RRULE:FREQ=YEARLY");
  });

  it("writes INTERVAL only when it is not 1", () => {
    expect(toRrule(task({ repeatType: "weekly", repeatInterval: 1 }), true)).toBe("RRULE:FREQ=WEEKLY");
    expect(toRrule(task({ repeatType: "weekly", repeatInterval: 2 }), true)).toBe("RRULE:FREQ=WEEKLY;INTERVAL=2");
  });

  it("turns repeatDays into BYDAY, Sunday-indexed and sorted", () => {
    // `repeatDays` holds JS weekday numbers (0 = Sunday) — domain/schedule/recurrence.
    expect(toRrule(task({ repeatType: "weekly", repeatDays: [5, 1, 3] }), true)).toBe("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(toRrule(task({ repeatType: "weekly", repeatDays: [0, 6] }), true)).toBe("RRULE:FREQ=WEEKLY;BYDAY=SU,SA");
  });

  it("omits BYDAY for a weekly task with no chosen days", () => {
    // The series then falls on DTSTART's own weekday, which is what it means.
    expect(toRrule(task({ repeatType: "weekly", repeatDays: [] }), true)).toBe("RRULE:FREQ=WEEKLY");
  });

  it("ignores repeatDays on a frequency that has no weekdays", () => {
    expect(toRrule(task({ repeatType: "monthly", repeatDays: [1, 2] }), true)).toBe("RRULE:FREQ=MONTHLY");
  });

  it("matches UNTIL's value type to the event's — §8", () => {
    // Google rejects a DATE-TIME UNTIL on an all-day series and vice versa.
    expect(toRrule(task({ repeatType: "daily", repeatEndDate: "2026-12-31" }), true)).toBe(
      "RRULE:FREQ=DAILY;UNTIL=20261231",
    );
    expect(toRrule(task({ repeatType: "daily", repeatEndDate: "2026-12-31" }), false)).toBe(
      "RRULE:FREQ=DAILY;UNTIL=20261231T235959Z",
    );
  });

  it("carries the rule into the event body", () => {
    const body = toGoogleEventBody(task({ repeatType: "weekly", repeatDays: [1] }), "Asia/Seoul");
    expect(body.recurrence).toEqual(["RRULE:FREQ=WEEKLY;BYDAY=MO"]);
  });
});
