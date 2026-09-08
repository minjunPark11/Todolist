// The bookkeeping half of the inbound pass — which calendars exist locally.
//
// Worth its own tests because its failure mode is silent and destructive: a
// list that could not be read must not be mistaken for a list of calendars the
// person turned off, or a timeout deletes their events.
import { describe, expect, it } from "vitest";
import { localIdFor, reconcileGoogleCalendars, type ExternalState } from "./useGoogleInboundSync";
import type { GoogleCalendarSource } from "../lib/googleCalendarSources";
import type { ExternalCalendar, ExternalCalendarEvent } from "../types";

function source(calendarId: string, selected: boolean, extra: Partial<GoogleCalendarSource> = {}): GoogleCalendarSource {
  return { calendarId, summary: calendarId, color: "#123456", writable: true, selected, primary: false, ...extra };
}

function googleCalendar(calendarId: string): ExternalCalendar {
  return {
    id: localIdFor(calendarId),
    name: calendarId,
    source: "google",
    googleCalendarId: calendarId,
    color: "#123456",
    visible: true,
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const ics: ExternalCalendar = {
  id: "ics-1",
  name: "Holidays",
  source: "ics",
  icsUrl: "https://example.com/a.ics",
  color: "#999999",
  visible: true,
  enabled: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function event(calendarId: string, uid: string): ExternalCalendarEvent {
  return {
    id: `${calendarId}:${uid}`,
    externalCalendarId: calendarId,
    externalUid: uid,
    title: "Thing",
    start: "2026-09-08",
    allDay: true,
    readOnly: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const empty: ExternalState = { calendars: [], events: [] };

describe("matching the local list to what the account chose", () => {
  it("adds a calendar that was selected", () => {
    const next = reconcileGoogleCalendars(empty, [source("work@example.com", true)]);
    expect(next.calendars).toHaveLength(1);
    expect(next.calendars[0].source).toBe("google");
    expect(next.calendars[0].googleCalendarId).toBe("work@example.com");
  });

  it("removes one that was turned off, and its events with it", () => {
    const current: ExternalState = {
      calendars: [googleCalendar("work@example.com")],
      events: [event(localIdFor("work@example.com"), "e1")],
    };
    const next = reconcileGoogleCalendars(current, [source("work@example.com", false)]);
    expect(next.calendars).toEqual([]);
    expect(next.events).toEqual([]);
  });

  it("keeps a calendar the sources did not mention at all", () => {
    // A read that failed, or a row not written yet. Forgetting the calendar
    // here would delete a person's events over a timeout.
    const current: ExternalState = {
      calendars: [googleCalendar("work@example.com")],
      events: [event(localIdFor("work@example.com"), "e1")],
    };
    const next = reconcileGoogleCalendars(current, []);
    expect(next.calendars).toHaveLength(1);
    expect(next.events).toHaveLength(1);
  });

  it("never touches an ICS subscription", () => {
    const current: ExternalState = { calendars: [ics], events: [event("ics-1", "u1")] };
    const next = reconcileGoogleCalendars(current, [source("work@example.com", true)]);
    expect(next.calendars.find((calendar) => calendar.id === "ics-1")).toEqual(ics);
    expect(next.events).toHaveLength(1);
  });

  it("takes the name and colour Google now reports", () => {
    const current: ExternalState = { calendars: [googleCalendar("work@example.com")], events: [] };
    const next = reconcileGoogleCalendars(current, [
      source("work@example.com", true, { summary: "Renamed", color: "#ff0000" }),
    ]);
    expect(next.calendars[0].name).toBe("Renamed");
    expect(next.calendars[0].color).toBe("#ff0000");
  });

  it("does not duplicate a calendar it already has", () => {
    const current: ExternalState = { calendars: [googleCalendar("a@example.com")], events: [] };
    const next = reconcileGoogleCalendars(current, [source("a@example.com", true)]);
    expect(next.calendars).toHaveLength(1);
  });
});
