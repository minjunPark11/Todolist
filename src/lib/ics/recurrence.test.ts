// Expanding repeating events, against ICS shaped the way real calendars write
// it (FOCUSFLOW_EXTERNAL_AI_ACCESS_ARCHITECTURE.md §9.2.1, acceptance 19-20).
//
// These matter more than they look. A missing occurrence is not a missing row
// in a grid — it is an hour that reads as free, and the whole point of handing
// a calendar to something that recommends what to do next is that it knows
// which hours are not.
import { describe, expect, it } from "vitest";
import { parseIcsEvents } from "./parse";
import { expandIcsOccurrences } from "./recurrence";

function ics(...events: string[]) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Test//EN",
    "X-WR-TIMEZONE:Asia/Seoul",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

function vevent(lines: string[]) {
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");
}

function expand(text: string, from: string, to: string) {
  return expandIcsOccurrences(parseIcsEvents(text, "cal-1"), { from, to }, { viewerTimezone: "Asia/Seoul" });
}

function dates(events: Array<{ start: string }>) {
  return events.map((event) => event.start.slice(0, 10));
}

describe("weekly", () => {
  const weekly = ics(
    vevent([
      "UID:standup@test",
      "SUMMARY:Standup",
      "DTSTART;TZID=Asia/Seoul:20260302T140000",
      "DTEND;TZID=Asia/Seoul:20260302T150000",
      "RRULE:FREQ=WEEKLY",
    ]),
  );

  it("fills the range instead of appearing once", () => {
    // The bug this whole module exists for: before it, this returned exactly
    // one event, on 2026-03-02, and the other three Mondays read as free.
    expect(dates(expand(weekly, "2026-03-01", "2026-03-28"))).toEqual([
      "2026-03-02",
      "2026-03-09",
      "2026-03-16",
      "2026-03-23",
    ]);
  });

  it("gives every occurrence its own id", () => {
    // They all shared the master's id before, so anything keyed by id — a
    // React list, a Map, a de-duplicating merge — kept one and dropped the rest.
    const ids = expand(weekly, "2026-03-01", "2026-03-28").map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("cal-1:standup@test:2026-03-02");
  });

  it("keeps the time of day, and says which series it came from", () => {
    const [first, second] = expand(weekly, "2026-03-01", "2026-03-14");
    expect(first.start).toBe("2026-03-02T14:00:00");
    expect(second.start).toBe("2026-03-09T14:00:00");
    expect(second.end).toBe("2026-03-09T15:00:00");
    expect(second.occurrenceOf).toBe("standup@test");
  });

  it("does not carry the rule onto the dates it produced", () => {
    // The rule belongs to the series. An occurrence holding one would expand
    // again if it ever went back through here.
    for (const event of expand(weekly, "2026-03-01", "2026-03-14")) {
      expect(event.recurrence).toBeUndefined();
    }
  });

  it("honours BYDAY across several days a week", () => {
    const text = ics(
      vevent([
        "UID:class@test",
        "SUMMARY:Class",
        "DTSTART;TZID=Asia/Seoul:20260302T100000",
        "DTEND;TZID=Asia/Seoul:20260302T113000",
        "RRULE:FREQ=WEEKLY;BYDAY=MO,WE",
      ]),
    );
    expect(dates(expand(text, "2026-03-01", "2026-03-15"))).toEqual([
      "2026-03-02",
      "2026-03-04",
      "2026-03-09",
      "2026-03-11",
    ]);
  });

  it("honours INTERVAL", () => {
    const text = ics(
      vevent([
        "UID:fortnightly@test",
        "SUMMARY:Retro",
        "DTSTART;TZID=Asia/Seoul:20260302T160000",
        "RRULE:FREQ=WEEKLY;INTERVAL=2",
      ]),
    );
    expect(dates(expand(text, "2026-03-01", "2026-04-01"))).toEqual(["2026-03-02", "2026-03-16", "2026-03-30"]);
  });
});

describe("where a series stops", () => {
  it("stops at COUNT", () => {
    const text = ics(
      vevent([
        "UID:three@test",
        "SUMMARY:Three only",
        "DTSTART;TZID=Asia/Seoul:20260302T090000",
        "RRULE:FREQ=DAILY;COUNT=3",
      ]),
    );
    expect(dates(expand(text, "2026-03-01", "2026-03-31"))).toEqual(["2026-03-02", "2026-03-03", "2026-03-04"]);
  });

  it("stops at UNTIL", () => {
    const text = ics(
      vevent([
        "UID:until@test",
        "SUMMARY:Until",
        "DTSTART;TZID=Asia/Seoul:20260302T090000",
        "RRULE:FREQ=DAILY;UNTIL=20260304T235959Z",
      ]),
    );
    expect(dates(expand(text, "2026-03-01", "2026-03-31"))).toEqual(["2026-03-02", "2026-03-03", "2026-03-04"]);
  });

  it("stops at the end of the range", () => {
    const text = ics(
      vevent(["UID:forever@test", "SUMMARY:Forever", "DTSTART;TZID=Asia/Seoul:20260302T090000", "RRULE:FREQ=DAILY"]),
    );
    expect(expand(text, "2026-03-01", "2026-03-05")).toHaveLength(4);
  });

  it("refuses to run away on an unbounded rule over a wide range", () => {
    const text = ics(
      vevent(["UID:forever@test", "SUMMARY:Forever", "DTSTART;TZID=Asia/Seoul:20200101T090000", "RRULE:FREQ=DAILY"]),
    );
    // Six years of daily, asked for in one go. The cap is what stops a
    // malformed feed from becoming the server's whole afternoon.
    expect(expand(text, "2020-01-01", "2026-12-31").length).toBeLessThanOrEqual(400);
  });
});

describe("occurrences that were changed after the fact", () => {
  it("drops the ones EXDATE cancelled", () => {
    const text = ics(
      vevent([
        "UID:standup@test",
        "SUMMARY:Standup",
        "DTSTART;TZID=Asia/Seoul:20260302T140000",
        "RRULE:FREQ=WEEKLY",
        "EXDATE;TZID=Asia/Seoul:20260309T140000",
      ]),
    );
    expect(dates(expand(text, "2026-03-01", "2026-03-28"))).toEqual(["2026-03-02", "2026-03-16", "2026-03-23"]);
  });

  it("drops several cancellations, whether folded onto one line or many", () => {
    // The reason `getIcsProperties` exists: reading only the first EXDATE line
    // brought two cancelled meetings back.
    const text = ics(
      vevent([
        "UID:standup@test",
        "SUMMARY:Standup",
        "DTSTART;TZID=Asia/Seoul:20260302T140000",
        "RRULE:FREQ=WEEKLY",
        "EXDATE;TZID=Asia/Seoul:20260309T140000,20260316T140000",
        "EXDATE;TZID=Asia/Seoul:20260323T140000",
      ]),
    );
    expect(dates(expand(text, "2026-03-01", "2026-03-28"))).toEqual(["2026-03-02"]);
  });

  it("substitutes the one that moved, at its new time", () => {
    const text = ics(
      vevent([
        "UID:standup@test",
        "SUMMARY:Standup",
        "DTSTART;TZID=Asia/Seoul:20260302T140000",
        "DTEND;TZID=Asia/Seoul:20260302T150000",
        "RRULE:FREQ=WEEKLY",
      ]),
      vevent([
        "UID:standup@test",
        "RECURRENCE-ID;TZID=Asia/Seoul:20260309T140000",
        "SUMMARY:Standup (moved)",
        "DTSTART;TZID=Asia/Seoul:20260309T160000",
        "DTEND;TZID=Asia/Seoul:20260309T170000",
      ]),
    );
    const expanded = expand(text, "2026-03-01", "2026-03-16");
    expect(dates(expanded)).toEqual(["2026-03-02", "2026-03-09", "2026-03-16"]);
    const moved = expanded[1];
    expect(moved.start).toBe("2026-03-09T16:00:00");
    expect(moved.title).toBe("Standup (moved)");
    // Still one row, not two: the override replaced the occurrence rather than
    // joining it.
    expect(expanded.filter((event) => event.start.startsWith("2026-03-09"))).toHaveLength(1);
  });
});

describe("monthly and yearly", () => {
  it("skips a month that has no such day rather than sliding into the next", () => {
    // "The 31st, every month" has no February. Clamping to the 28th would put
    // a meeting on a day the organiser never chose.
    const text = ics(
      vevent(["UID:rent@test", "SUMMARY:Rent", "DTSTART;VALUE=DATE:20260131", "RRULE:FREQ=MONTHLY"]),
    );
    expect(dates(expand(text, "2026-01-01", "2026-04-30"))).toEqual(["2026-01-31", "2026-03-31"]);
  });

  it("repeats yearly", () => {
    const text = ics(
      vevent(["UID:bday@test", "SUMMARY:Birthday", "DTSTART;VALUE=DATE:20260415", "RRULE:FREQ=YEARLY"]),
    );
    expect(dates(expand(text, "2026-01-01", "2028-12-31"))).toEqual(["2026-04-15", "2027-04-15", "2028-04-15"]);
  });

  it("keeps an all-day occurrence all-day", () => {
    const text = ics(
      vevent(["UID:bday@test", "SUMMARY:Birthday", "DTSTART;VALUE=DATE:20260415", "RRULE:FREQ=YEARLY"]),
    );
    const [first] = expand(text, "2026-01-01", "2026-12-31");
    expect(first.allDay).toBe(true);
    expect(first.start).toBe("2026-04-15");
  });
});

describe("what it declines to expand", () => {
  it("leaves a BYSETPOS rule as a single event instead of guessing", () => {
    // "The third Tuesday" — expanding this without BYSETPOS support would put
    // the meeting on every Tuesday of the month, which is worse than showing
    // it once.
    const text = ics(
      vevent([
        "UID:board@test",
        "SUMMARY:Board meeting",
        "DTSTART;TZID=Asia/Seoul:20260317T100000",
        "RRULE:FREQ=MONTHLY;BYDAY=TU;BYSETPOS=3",
      ]),
    );
    expect(dates(expand(text, "2026-03-01", "2026-06-30"))).toEqual(["2026-03-17"]);
  });

  it("ignores an ordinal BYDAY for the same reason", () => {
    const text = ics(
      vevent([
        "UID:board@test",
        "SUMMARY:Board meeting",
        "DTSTART;TZID=Asia/Seoul:20260317T100000",
        "RRULE:FREQ=MONTHLY;BYDAY=3TU",
      ]),
    );
    // The rule still repeats monthly, just on the date DTSTART named.
    expect(dates(expand(text, "2026-03-01", "2026-05-31"))).toEqual(["2026-03-17", "2026-04-17", "2026-05-17"]);
  });
});

describe("events that do not repeat", () => {
  const single = ics(
    vevent([
      "UID:one-off@test",
      "SUMMARY:Dentist",
      "DTSTART;TZID=Asia/Seoul:20260310T093000",
      "DTEND;TZID=Asia/Seoul:20260310T101500",
    ]),
  );

  it("passes through when it falls in the range", () => {
    expect(dates(expand(single, "2026-03-01", "2026-03-31"))).toEqual(["2026-03-10"]);
  });

  it("is left out when it does not", () => {
    expect(expand(single, "2026-04-01", "2026-04-30")).toEqual([]);
  });

  it("is kept when it started earlier but runs into the range", () => {
    const text = ics(
      vevent(["UID:trip@test", "SUMMARY:Trip", "DTSTART;VALUE=DATE:20260228", "DTEND;VALUE=DATE:20260305"]),
    );
    expect(dates(expand(text, "2026-03-01", "2026-03-31"))).toEqual(["2026-02-28"]);
  });
});
