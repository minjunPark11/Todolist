// @vitest-environment jsdom
// Two sources, one record shape (GOOGLE_CALENDAR_SYNC_DESIGN.md §6.2).
//
// The risk in widening `ExternalCalendar` is not the widening — it is the
// records already sitting in storage, written when every external calendar was
// an ICS subscription and every event was unwritable. They carry no `source`
// and no `readOnly`, and reading either as its falsy default would turn a
// subscription into a Google calendar with no id, or hand the app permission to
// write to a file it cannot write to.
import { describe, expect, it } from "vitest";
import { loadExternalCalendarState, saveExternalCalendarState } from "./externalCalendars";
import { normalizeData } from "../domain/plannerData/normalize";

function roundTrip(calendars: unknown[], events: unknown[] = []) {
  saveExternalCalendarState({ calendars, events } as never);
  return loadExternalCalendarState();
}

const ICS = { id: "c1", name: "Holidays", icsUrl: "https://example.com/a.ics" };
const GOOGLE = { id: "c2", name: "Personal", source: "google", googleCalendarId: "me@example.com" };

describe("a stored calendar", () => {
  it("reads a record with no source as the subscription it was", () => {
    const { calendars } = roundTrip([ICS]);
    expect(calendars).toHaveLength(1);
    expect(calendars[0].source).toBe("ics");
    expect(calendars[0].icsUrl).toBe("https://example.com/a.ics");
  });

  it("keeps a Google calendar and the id it is reached by", () => {
    const { calendars } = roundTrip([GOOGLE]);
    expect(calendars[0].source).toBe("google");
    expect(calendars[0].googleCalendarId).toBe("me@example.com");
    expect(calendars[0].icsUrl).toBeUndefined();
  });

  it("drops a record missing the address its own source needs", () => {
    // Neither can be reached, and a calendar in the sidebar that can never
    // load is worse than one that is not there.
    expect(roundTrip([{ id: "c3", name: "No URL" }]).calendars).toHaveLength(0);
    expect(roundTrip([{ id: "c4", name: "No id", source: "google" }]).calendars).toHaveLength(0);
  });
});

describe("a stored event", () => {
  const base = { id: "e1", externalCalendarId: "c1", externalUid: "u1", title: "Standup", start: "2026-09-08" };

  it("is read-only when the record does not say otherwise", () => {
    expect(roundTrip([ICS], [base]).events[0].readOnly).toBe(true);
  });

  it("stays writable, with the version marker a write will need", () => {
    const { events } = roundTrip([GOOGLE], [{ ...base, readOnly: false, etag: '"abc123"' }]);
    expect(events[0].readOnly).toBe(false);
    expect(events[0].etag).toBe('"abc123"');
  });
});

describe("the account-synced copy", () => {
  it("applies the same rule as local storage", () => {
    const data = normalizeData({
      settings: { externalCalendars: [ICS, GOOGLE, { id: "c5", name: "Nowhere" }] },
    } as never);
    expect((data.settings.externalCalendars ?? []).map((calendar) => calendar.source)).toEqual(["ics", "google"]);
  });
});
