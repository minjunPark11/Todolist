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
