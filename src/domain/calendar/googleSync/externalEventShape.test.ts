import { describe, expect, it } from "vitest";
import { toGoogleEventPatch, withExternalEdit } from "./externalEventShape";
import type { ExternalCalendarEvent } from "../../../types";

function event(extra: Partial<ExternalCalendarEvent> = {}): ExternalCalendarEvent {
  return {
    id: "cal:e1",
    externalCalendarId: "cal",
    externalUid: "e1",
    title: "Standup",
    // 14:00 Seoul, stored the way inbound stores it.
    start: "2026-09-08T05:00:00.000Z",
    end: "2026-09-08T05:30:00.000Z",
    allDay: false,
    timezone: "Asia/Seoul",
    readOnly: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

describe("what Google is told", () => {
  it("sends nothing when nothing changed", () => {
    // A field-less PATCH still costs a request, still bumps the etag, and still
    // comes back on the next poll looking like somebody's edit.
    expect(toGoogleEventPatch(event(), { title: "Standup" })).toBeNull();
    expect(toGoogleEventPatch(event(), {})).toBeNull();
  });

  it("sends only what the person may actually change", () => {
    // Echoing every field we hold would overwrite an attendee list or a
    // conference link with a stale copy of itself.
    const patch = toGoogleEventPatch(event(), { title: "Daily sync" });
    expect(patch).toEqual({ summary: "Daily sync" });
  });

  it("writes a wall-clock time with its zone, not a computed offset", () => {
    // dateTime + timeZone is the form that survives a daylight-saving change;
    // an offset baked in here would be whichever was current at edit time.
    const patch = toGoogleEventPatch(event(), { startTime: "15:00", endTime: "16:00" });
    expect(patch?.start).toEqual({ dateTime: "2026-09-08T15:00:00", timeZone: "Asia/Seoul" });
    expect(patch?.end).toEqual({ dateTime: "2026-09-08T16:00:00", timeZone: "Asia/Seoul" });
  });

  it("reads the day in the event's own zone, not off the UTC string", () => {
    // 09:00 Seoul on the 9th is 2026-09-09T00:00Z. Slicing the instant would
    // put the edit on the 9th in UTC and the 9th in Seoul by luck; an event
    // late in the Seoul evening is the case that breaks.
    const late = event({ start: "2026-09-08T15:00:00.000Z" }); // 2026-09-09 00:00 KST
    expect(toGoogleEventPatch(late, { startTime: "01:00" })?.start?.dateTime).toBe("2026-09-09T01:00:00");
  });

  it("puts an end before its start on the next day", () => {
    const patch = toGoogleEventPatch(event(), { startTime: "23:00", endTime: "01:00" });
    expect(patch?.start?.dateTime).toBe("2026-09-08T23:00:00");
    expect(patch?.end?.dateTime).toBe("2026-09-09T01:00:00");
  });

  it("refuses to put a clock on an all-day event", () => {
    // Writing one would silently turn it into a timed event an hour long.
    const allDay = event({ allDay: true, start: "2026-09-08", end: "2026-09-09" });
    expect(toGoogleEventPatch(allDay, { startTime: "09:00" })).toBeNull();
  });

  it("clears a note when it is emptied", () => {
    const patch = toGoogleEventPatch(event({ description: "old" }), { description: "" });
    expect(patch).toEqual({ description: "" });
  });
});

describe("what our own record becomes", () => {
  it("stays in the form inbound writes, so the grid does not jump", () => {
    // Storing Google's local string instead would move the event for anyone
    // reading it from another zone, until the next poll moved it back.
    const next = withExternalEdit(event(), { startTime: "15:00" }, "2026-09-08T00:00:00.000Z");
    expect(next.start).toBe("2026-09-08T06:00:00.000Z");
    expect(next.timezone).toBe("Asia/Seoul");
    expect(next.updatedAt).toBe("2026-09-08T00:00:00.000Z");
  });

  // CI caught this and no local run did: on Node 20 `hour12: false` overrode
  // `hourCycle` and reported midnight as hour 24 of an already-rolled-over day,
  // so the offset probe came back a full day too large. Any edit whose result
  // lands on midnight in the event's own zone moved a day. The engine version
  // is not the bug — asking two ways for the same thing was.
  it("does not move an event a day when the edit lands on midnight", () => {
    // 15:00 UTC is 2026-09-09 00:00 in Seoul: the exact instant that broke.
    const next = withExternalEdit(event(), { startTime: "00:00" }, "2026-09-08T00:00:00.000Z");
    expect(next.start).toBe("2026-09-07T15:00:00.000Z");
  });

  it("agrees with itself across the day, midnight included", () => {
    for (const time of ["00:00", "00:30", "09:00", "15:00", "23:59"]) {
      const next = withExternalEdit(event(), { startTime: time }, "2026-09-08T00:00:00.000Z");
      // Whatever the clock said, reading it back in Seoul must give it again.
      const shown = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(next.start));
      expect(shown).toBe(time);
    }
  });

  it("is the same object when the edit changes nothing", () => {
    const original = event();
    expect(withExternalEdit(original, { title: "Standup" })).toBe(original);
  });

  it("agrees with the patch about the title and the note", () => {
    const next = withExternalEdit(event(), { title: "Daily sync", description: "room 3" });
    expect(next.title).toBe("Daily sync");
    expect(next.description).toBe("room 3");
  });
});

// The grid's own gestures, which say a day and sometimes say whether the event
// is an all-day one at all (§6.2).
describe("what a drag says", () => {
  it("moves a timed event to another day and keeps its clock", () => {
    // The month grid's drop names a day and nothing else. Reading the clock off
    // the UTC string instead of the event's zone would move 14:00 to 05:00.
    const patch = toGoogleEventPatch(event(), { date: "2026-09-10" });
    expect(patch?.start).toEqual({ dateTime: "2026-09-10T14:00:00", timeZone: "Asia/Seoul" });
    expect(patch?.end).toEqual({ dateTime: "2026-09-10T14:30:00", timeZone: "Asia/Seoul" });
  });

  it("carries an overnight event's second day with it", () => {
    // 23:00 on the 8th to 01:00 on the 9th, Seoul. Moved to the 10th it is
    // still two hours long; anchoring the end to the new day would make it
    // twenty-two hours, or a start after its end.
    const overnight = event({ start: "2026-09-08T14:00:00.000Z", end: "2026-09-08T16:00:00.000Z" });
    const patch = toGoogleEventPatch(overnight, { date: "2026-09-10" });
    expect(patch?.start?.dateTime).toBe("2026-09-10T23:00:00");
    expect(patch?.end?.dateTime).toBe("2026-09-11T01:00:00");
  });

  it("sends only the edge a resize moved", () => {
    // The gesture reports a whole position either way. Sending the start it did
    // not touch bumps the etag for nothing and comes back on the next poll
    // looking like an edit somebody else made (§6.3).
    const patch = toGoogleEventPatch(event(), { date: "2026-09-08", startTime: "14:00", endTime: "15:00" });
    expect(patch?.start).toBeUndefined();
    expect(patch?.end?.dateTime).toBe("2026-09-08T15:00:00");
  });

  it("sends nothing when the drag ends where it began", () => {
    expect(toGoogleEventPatch(event(), { date: "2026-09-08", startTime: "14:00", endTime: "14:30" })).toBeNull();
  });

  it("turns a timed event into an all-day one on the day it was dropped", () => {
    // Google's end date is exclusive, so one day is start + 1.
    const patch = toGoogleEventPatch(event(), { date: "2026-09-10", allDay: true });
    expect(patch?.start).toEqual({ date: "2026-09-10" });
    expect(patch?.end).toEqual({ date: "2026-09-11" });
  });

  it("keeps an all-day event's span when it moves", () => {
    // A three-day trip dragged onto Friday is still three days. Collapsing it
    // would be an edit nobody asked for, made on the way to the one they did.
    const trip = event({ allDay: true, start: "2026-09-08", end: "2026-09-11" });
    const patch = toGoogleEventPatch(trip, { date: "2026-09-14" });
    expect(patch?.start).toEqual({ date: "2026-09-14" });
    expect(patch?.end).toEqual({ date: "2026-09-17" });
  });

  it("leaves an all-day event all-day when the drag names no clock", () => {
    // The month grid moves it to another day; inventing an hour for it there
    // is worse than leaving it as the kind of event it is.
    const allDay = event({ allDay: true, start: "2026-09-08", end: "2026-09-09" });
    const patch = toGoogleEventPatch(allDay, { date: "2026-09-10" });
    expect(patch?.start).toEqual({ date: "2026-09-10" });
    expect(patch?.end).toEqual({ date: "2026-09-11" });
  });

  it("gives an all-day event a clock when the drag into the grid names one", () => {
    const allDay = event({ allDay: true, start: "2026-09-08", end: "2026-09-09" });
    const patch = toGoogleEventPatch(allDay, { date: "2026-09-08", startTime: "09:00", endTime: "10:00", allDay: false });
    expect(patch?.start).toEqual({ dateTime: "2026-09-08T09:00:00", timeZone: "Asia/Seoul" });
    expect(patch?.end).toEqual({ dateTime: "2026-09-08T10:00:00", timeZone: "Asia/Seoul" });
  });

  it("stores the kind of event the patch just made it", () => {
    const now = "2026-09-08T00:00:00.000Z";
    const toAllDay = withExternalEdit(event(), { date: "2026-09-10", allDay: true }, now);
    expect(toAllDay.allDay).toBe(true);
    expect(toAllDay.start).toBe("2026-09-10");
    expect(toAllDay.end).toBe("2026-09-11");

    // And back: an instant with the zone alongside, the form inbound writes.
    const back = withExternalEdit(toAllDay, { date: "2026-09-10", startTime: "09:00", endTime: "10:00", allDay: false }, now);
    expect(back.allDay).toBe(false);
    expect(back.start).toBe("2026-09-10T00:00:00.000Z");
    expect(back.end).toBe("2026-09-10T01:00:00.000Z");
  });

  it("moves our own record the same day it tells Google about", () => {
    const next = withExternalEdit(event(), { date: "2026-09-10" }, "2026-09-08T00:00:00.000Z");
    expect(next.start).toBe("2026-09-10T05:00:00.000Z");
    expect(next.end).toBe("2026-09-10T05:30:00.000Z");
  });
});
