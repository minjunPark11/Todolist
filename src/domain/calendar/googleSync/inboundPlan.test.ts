import { describe, expect, it } from "vitest";
import {
  applyInboundPlan,
  isEmptyInboundPlan,
  planInbound,
  type KnownEvent,
} from "./inboundPlan";
import type { GoogleEventResource } from "./inboundShape";
import type { ExternalCalendarEvent } from "../../../types";

const CAL = "cal-1";
const options = { externalCalendarId: CAL, writable: true, now: "2026-09-08T00:00:00.000Z" };

function plan(items: GoogleEventResource[], known: Record<string, KnownEvent> = {}) {
  return planInbound({ items, known: new Map(Object.entries(known)), options });
}

function held(externalUid: string, extra: Partial<ExternalCalendarEvent> = {}): ExternalCalendarEvent {
  return {
    id: `${CAL}:${externalUid}`,
    externalCalendarId: CAL,
    externalUid,
    title: "Held",
    start: "2026-09-08",
    allDay: true,
    readOnly: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

const timed: GoogleEventResource = {
  id: "e1",
  status: "confirmed",
  etag: '"v1"',
  summary: "Standup",
  start: { dateTime: "2026-09-08T14:00:00+09:00", timeZone: "Asia/Seoul" },
  end: { dateTime: "2026-09-08T14:30:00+09:00", timeZone: "Asia/Seoul" },
  updated: "2026-09-07T10:00:00.000Z",
};

describe("§7.1 — absence is never deletion", () => {
  // The design names this the top-level defence of the whole feature, and asks
  // for exactly this test. A `syncToken` expires (410) and the recovery is a
  // full re-list — which is also what the first pass looks like. If absence
  // meant deletion, one expired cursor would bin everything the user owns,
  // and delete wins has no confirmation step to catch it.
  it("removes nothing when a full re-list omits events we hold", () => {
    const result = plan([timed]);
    expect(result.cancelled).toEqual([]);

    const current = [held("e1"), held("e2"), held("e3")];
    const next = applyInboundPlan(current, CAL, result);

    // e2 and e3 did not appear in the response at all. They stay.
    expect(next.map((event) => event.externalUid).sort()).toEqual(["e1", "e2", "e3"]);
  });

  it("removes nothing at all from an empty response", () => {
    const current = [held("e1"), held("e2")];
    const next = applyInboundPlan(current, CAL, plan([]));
    expect(next).toHaveLength(2);
  });

  it("deletes only what Google explicitly cancelled", () => {
    const result = plan([{ id: "e2", status: "cancelled" }]);
    expect(result.cancelled).toEqual(["e2"]);

    const next = applyInboundPlan([held("e1"), held("e2"), held("e3")], CAL, result);
    expect(next.map((event) => event.externalUid)).toEqual(["e1", "e3"]);
  });

  it("leaves other calendars' events alone", () => {
    const other: ExternalCalendarEvent = { ...held("e1"), id: "cal-2:e1", externalCalendarId: "cal-2" };
    const next = applyInboundPlan([other], CAL, plan([{ id: "e1", status: "cancelled" }]));
    expect(next).toEqual([other]);
  });
});

describe("§6.3 — our own write must not come back as news", () => {
  it("skips an item whose etag is the one our write returned", () => {
    const result = plan([timed], { e1: { etag: '"v1"' } });
    expect(result.echoes).toBe(1);
    expect(result.upsert).toEqual([]);
    expect(isEmptyInboundPlan(result)).toBe(true);
  });

  it("takes it when the etag moved on — that is somebody else's edit", () => {
    const result = plan([timed], { e1: { etag: '"v0"' } });
    expect(result.echoes).toBe(0);
    expect(result.upsert).toHaveLength(1);
  });

  it("takes it when we hold no etag to compare", () => {
    expect(plan([timed], { e1: {} }).upsert).toHaveLength(1);
  });
});

describe("the record a response produces", () => {
  it("converts a timed event to UTC and keeps its zone", () => {
    // Slicing Google's offset form would show 14:00 to a reader in London.
    const [event] = plan([timed]).upsert;
    expect(event.start).toBe("2026-09-08T05:00:00.000Z");
    expect(event.allDay).toBe(false);
    expect(event.timezone).toBe("Asia/Seoul");
    expect(event.updatedAt).toBe("2026-09-07T10:00:00.000Z");
  });

  it("leaves an all-day event as a bare date, which is how it is recognised", () => {
    const [event] = plan([{ id: "e9", start: { date: "2026-09-08" }, end: { date: "2026-09-09" } }]).upsert;
    expect(event.start).toBe("2026-09-08");
    expect(event.allDay).toBe(true);
  });

  it("is writable exactly when the calendar is", () => {
    expect(plan([timed]).upsert[0].readOnly).toBe(false);
    const readOnly = planInbound({
      items: [timed],
      known: new Map(),
      options: { ...options, writable: false },
    });
    expect(readOnly.upsert[0].readOnly).toBe(true);
  });

  it("keeps the age of a record we already had", () => {
    const [event] = plan([timed], { e1: { createdAt: "2025-05-05T00:00:00.000Z" } }).upsert;
    expect(event.createdAt).toBe("2025-05-05T00:00:00.000Z");
  });

  it("carries the repeat rule and the cancelled occurrences", () => {
    const [event] = plan([
      { ...timed, recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE", "EXDATE;VALUE=DATE:20261225"] },
    ]).upsert;
    expect(event.recurrence?.freq).toBe("WEEKLY");
    expect(event.exdates).toEqual(["20261225"]);
  });

  it("drops an item with no id or no start, which could not be drawn or written", () => {
    expect(plan([{ status: "confirmed", start: { date: "2026-09-08" } }]).upsert).toEqual([]);
    expect(plan([{ id: "e5", status: "confirmed" }]).upsert).toEqual([]);
  });

  it("adds an event we did not have", () => {
    const next = applyInboundPlan([held("e1")], CAL, plan([timed, { ...timed, id: "e7", etag: '"z"' }]));
    expect(next.map((event) => event.externalUid).sort()).toEqual(["e1", "e7"]);
  });
});

// One occurrence of a series, cancelled (GOOGLE_SYNC_HARDENING_DESIGN.md §5).
//
// The row Google sends names the INSTANCE, and the record we hold is the
// series, so the id-based deletion this module already did found nothing at all
// — cancelling this Tuesday's standup changed precisely nothing on the grid.
describe("a cancelled occurrence", () => {
  const master: ExternalCalendarEvent = {
    id: `${CAL}:standup`,
    externalCalendarId: CAL,
    externalUid: "standup",
    title: "Standup",
    start: "2026-09-01T00:00:00.000Z",
    end: "2026-09-01T00:30:00.000Z",
    allDay: false,
    timezone: "Asia/Seoul",
    readOnly: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    recurrence: { freq: "WEEKLY", interval: 1 },
  };

  const cancelledInstance = {
    id: "standup_20260908T000000Z",
    status: "cancelled",
    recurringEventId: "standup",
    originalStartTime: { dateTime: "2026-09-08T09:00:00+09:00", timeZone: "Asia/Seoul" },
  };

  it("becomes an exdate on the series, not a deletion of it", () => {
    const cancellation = plan([cancelledInstance]);
    expect(cancellation.cancelledOccurrences).toEqual([
      { masterUid: "standup", originalStart: "2026-09-08T00:00:00.000Z" },
    ]);

    const next = applyInboundPlan([master], CAL, cancellation);
    // The series survives — only the one date comes off it.
    expect(next).toHaveLength(1);
    expect(next[0].exdates).toEqual(["2026-09-08T00:00:00.000Z"]);
  });

  it("marks the date on a series that arrives in the same response", () => {
    // A full listing carries both. Applying the cancellation before the upsert
    // would mark a series that is not in hand yet, and lose it.
    const cancellation = plan([
      { ...cancelledInstance },
      {
        id: "standup",
        summary: "Standup",
        start: { dateTime: "2026-09-01T09:00:00+09:00", timeZone: "Asia/Seoul" },
        end: { dateTime: "2026-09-01T09:30:00+09:00", timeZone: "Asia/Seoul" },
        recurrence: ["RRULE:FREQ=WEEKLY"],
      },
    ]);

    const next = applyInboundPlan([], CAL, cancellation);
    expect(next).toHaveLength(1);
    expect(next[0].externalUid).toBe("standup");
    expect(next[0].exdates).toEqual(["2026-09-08T00:00:00.000Z"]);
  });

  it("also removes the record standing in for that occurrence", () => {
    // The meeting that had been MOVED to Thursday is held under the instance
    // id, so it has to go as well as the date being marked.
    const moved: ExternalCalendarEvent = {
      ...master,
      id: `${CAL}:standup_20260908T000000Z`,
      externalUid: "standup_20260908T000000Z",
      recurrence: undefined,
      recurrenceId: "2026-09-08T00:00:00.000Z",
    };
    const cancellation = plan([cancelledInstance]);

    const next = applyInboundPlan([master, moved], CAL, cancellation);
    expect(next.map((event) => event.externalUid)).toEqual(["standup"]);
    expect(next[0].exdates).toEqual(["2026-09-08T00:00:00.000Z"]);
  });

  it("leaves a cancellation whose series we do not hold alone", () => {
    const cancellation = plan([cancelledInstance]);
    const other: ExternalCalendarEvent = { ...master, id: `${CAL}:other`, externalUid: "other" };
    expect(applyInboundPlan([other], CAL, cancellation)).toEqual([other]);
  });

  it("says nothing twice when the same cancellation comes back", () => {
    const cancellation = plan([cancelledInstance]);
    const already = { ...master, exdates: ["2026-09-08T00:00:00.000Z"] };
    const next = applyInboundPlan([already], CAL, cancellation);
    expect(next[0]).toBe(already);
  });

  it("still deletes an ordinary cancelled event", () => {
    // The other half of the split: no recurringEventId, so the id IS the event.
    const cancellation = plan([{ id: "standup", status: "cancelled" }]);
    expect(cancellation.cancelledOccurrences).toEqual([]);
    expect(applyInboundPlan([master], CAL, cancellation)).toEqual([]);
  });
});

// Which events the account may write, beyond which calendars it may write
// (GOOGLE_SYNC_HARDENING_DESIGN.md §8).
describe("the kind of event", () => {
  function planOne(item: Record<string, unknown>) {
    return plan([{ id: "e1", summary: "X", start: { date: "2026-09-08" }, ...item }]).upsert[0];
  }

  it("keeps a birthday read-only on a calendar the account owns", () => {
    // accessRole says writer; Google still refuses the PATCH. Offering the
    // gesture would draw an edit that comes back undone on the next poll.
    const event = planOne({ eventType: "birthday" });
    expect(event.readOnly).toBe(true);
    expect(event.eventType).toBe("birthday");
  });

  it("treats a missing eventType as the ordinary kind", () => {
    // The permissive read, on purpose (§8.2): the conservative one would lock
    // every event in the account the day Google stopped sending the field.
    const event = planOne({});
    expect(event.readOnly).toBe(false);
    expect(event.eventType).toBeUndefined();
  });

  it("does not make a read-only calendar writable", () => {
    const event = planInbound({
      items: [{ id: "e1", summary: "X", start: { date: "2026-09-08" }, eventType: "default" }],
      known: new Map(),
      options: { externalCalendarId: CAL, writable: false },
    }).upsert[0];
    expect(event.readOnly).toBe(true);
  });
});
