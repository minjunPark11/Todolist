// @vitest-environment jsdom
// Which events the popover offers to change (GOOGLE_CALENDAR_SYNC_DESIGN.md §6.2).
//
// The gate used to be `sourceType === "task"`, because every external event
// came from a file nobody could write to. Now the question is whether the
// change has somewhere to go, and for a Google calendar the account owns, it
// does. An ICS subscription is unchanged: still a file, still read-only.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { EventPopover } from "./EventPopover";
import type { CalendarItem } from "../../utils/calendarItems";

afterEach(cleanup);

function item(extra: Partial<CalendarItem> = {}): CalendarItem {
  return {
    key: "external:google:cal:e1:2026-09-08",
    layer: "external",
    sourceType: "external",
    sourceId: "google:cal:e1",
    title: "Standup",
    date: "2026-09-08",
    startTime: "14:00",
    endTime: "14:30",
    allDay: false,
    color: "#4f73ff",
    categoryId: "external",
    draggable: true,
    readOnly: false,
    ...extra,
  };
}

function mount(overrides: Partial<CalendarItem>,
  handlers: { onSaveQuickEdit?: unknown; onDelete?: unknown } = {}, initialMemo?: string) {
  const onSaveQuickEdit = vi.fn();
  const onDelete = vi.fn();
  render(
    <I18nProvider lang="en">
      <EventPopover
        item={item(overrides)}
        anchor={{ x: 0, y: 0 } as never}
        onClose={() => {}}
        initialMemo={initialMemo}
        onSaveQuickEdit={handlers.onSaveQuickEdit === null ? undefined : onSaveQuickEdit}
        onDelete={handlers.onDelete === null ? undefined : onDelete}
      />
    </I18nProvider>,
  );
  return { onSaveQuickEdit, onDelete };
}

it("offers to edit and delete a Google event the account may write", () => {
  const { onDelete } = mount({});
  expect(screen.getByLabelText("Delete event")).toBeTruthy();
  // The quick-edit affordance: external events used to stop at the source line.
  expect(screen.getByText("Add memo or URL")).toBeTruthy();
  expect(screen.getByText(/edits go back to Google/)).toBeTruthy();

  // The keyboard path is the same rule, and it reaches Google.
  fireEvent.keyDown(window, { key: "Delete" });
  expect(onDelete).toHaveBeenCalledTimes(1);
});

it("offers nothing on a read-only subscription", () => {
  const { onDelete } = mount({ readOnly: true });
  expect(screen.queryByLabelText("Delete event")).toBeNull();
  expect(screen.queryByText("Add memo or URL")).toBeNull();
  expect(screen.getByText(/read-only/)).toBeTruthy();

  fireEvent.keyDown(window, { key: "Delete" });
  expect(onDelete).not.toHaveBeenCalled();
});

it("sends the edit as a description, which is what the box means here", () => {
  const { onSaveQuickEdit } = mount({});
  fireEvent.click(screen.getByText("Add memo or URL"));
  fireEvent.submit(document.querySelector(".gcal-popover-edit") as HTMLFormElement);
  expect(onSaveQuickEdit).toHaveBeenCalledWith(
    expect.objectContaining({ sourceId: "google:cal:e1" }),
    expect.objectContaining({ startTime: "14:00", endTime: "14:30" }),
  );
});

// The memo box IS the Google description here, so it has to arrive filled.
// CalendarView used to pass `initialMemo` for tasks only and "" for external
// events, which meant a quick edit that only moved the time submitted an empty
// memo over whatever description Google held — and `toGoogleEventPatch` sends
// "" as a real change, so the description was wiped.
it("shows the description Google holds and does not wipe it on a time-only edit", () => {
  const { onSaveQuickEdit } = mount({}, {}, "Agenda: roadmap, then Q4 budget");
  fireEvent.click(screen.getByText("Add memo or URL"));
  expect((screen.getByLabelText("Memo") as HTMLTextAreaElement).value)
    .toBe("Agenda: roadmap, then Q4 budget");

  fireEvent.submit(document.querySelector(".gcal-popover-edit") as HTMLFormElement);
  expect(onSaveQuickEdit).toHaveBeenCalledWith(
    expect.objectContaining({ sourceId: "google:cal:e1" }),
    expect.objectContaining({ memo: "Agenda: roadmap, then Q4 budget" }),
  );
});
