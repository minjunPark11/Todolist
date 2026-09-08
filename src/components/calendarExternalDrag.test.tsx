// @vitest-environment jsdom
//
// Which record a grid gesture writes to (GOOGLE_CALENDAR_SYNC_DESIGN.md §6.2).
//
// The blocks look alike and the gestures are the same gestures, but there are
// two records behind them and two different writers. `externalEventShape` pins
// what each edit says; this pins who is asked to make it — and that a Google
// event's id never reaches the task scheduler, which would take it, find no
// task, and write nothing while the block sat there looking moved.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../i18n";
import { FloatingLayerProvider } from "./floating";
import { CalendarView } from "./CalendarView";
import { normalizeAppSettings } from "../domain/plannerData/normalize";
import type { ExternalCalendar, ExternalCalendarEvent } from "../types";

afterEach(cleanup);

const NOW = "2026-09-01T00:00:00.000Z";

function calendar(overrides: Partial<ExternalCalendar> = {}): ExternalCalendar {
  return {
    id: "google:cal",
    name: "FocusFlow",
    icsUrl: "",
    color: "#4f73ff",
    visible: true,
    enabled: true,
    source: "google",
    googleCalendarId: "cal@group.calendar.google.com",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function event(overrides: Partial<ExternalCalendarEvent> = {}): ExternalCalendarEvent {
  return {
    id: "google:cal:e1",
    externalCalendarId: "google:cal",
    externalUid: "e1",
    title: "Standup",
    start: "2026-09-08T05:00:00.000Z",
    end: "2026-09-08T05:30:00.000Z",
    allDay: false,
    timezone: "Asia/Seoul",
    readOnly: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function mount(events: ExternalCalendarEvent[]) {
  const onUpdateExternalEvent = vi.fn();
  const onUpdateTaskSchedule = vi.fn(() => []);
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <CalendarView
          tasks={[]}
          lists={[]}
          externalCalendars={[calendar()]}
          externalCalendarEvents={events}
          focusSessions={[]}
          onUpdateExternalCalendar={() => {}}
          onUpdateTask={() => {}}
          onUpdateTaskSchedule={onUpdateTaskSchedule}
          onCreateTask={() => ""}
          onUpdateExternalEvent={onUpdateExternalEvent}
          appSettings={normalizeAppSettings({ timezone: "Asia/Seoul" })}
        />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
  // The month grid is the view whose drop says a day and nothing else.
  fireEvent.click(screen.getByRole("button", { name: "Month" }));
  return { onUpdateExternalEvent, onUpdateTaskSchedule };
}

/** A drop on a month cell, which is all `dropCell` reads. */
function dropOnAnyCell(sourceId: string) {
  const cell = document.querySelector(".gcal-month-cell") as HTMLElement;
  fireEvent.drop(cell, { dataTransfer: { getData: () => sourceId } });
}

it("sends a dropped Google event to Google, not to the task scheduler", () => {
  const { onUpdateExternalEvent, onUpdateTaskSchedule } = mount([event()]);
  dropOnAnyCell("google:cal:e1");

  expect(onUpdateTaskSchedule).not.toHaveBeenCalled();
  expect(onUpdateExternalEvent).toHaveBeenCalledTimes(1);
  const [id, edit] = onUpdateExternalEvent.mock.calls[0];
  expect(id).toBe("google:cal:e1");
  // A day, and only a day: the clock and the kind of event are the event's.
  expect(Object.keys(edit)).toEqual(["date"]);
  expect(edit.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

it("writes nothing at all for a read-only subscription", () => {
  // It is not draggable either, so this is the second lock on the same door:
  // whatever puts an id in the drop, an ICS event has nowhere for an edit to
  // go and must not be handed to the scheduler as if it were a task.
  const { onUpdateExternalEvent, onUpdateTaskSchedule } = mount([event({ readOnly: true })]);
  dropOnAnyCell("google:cal:e1");

  expect(onUpdateExternalEvent).not.toHaveBeenCalled();
  expect(onUpdateTaskSchedule).not.toHaveBeenCalled();
});
