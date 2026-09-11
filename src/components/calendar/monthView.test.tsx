// @vitest-environment jsdom
//
// The month grid, as it actually draws.
//
// Written for the same reason as `weekView.test.tsx`: the month had no
// component test, so every rule below was held up only by the JSX. They are
// the grid's contract — what a cell contains, which cell an event lands in,
// what a chip says and what clicking one does — so the inside can be
// rearranged for speed without the rearrangement being taken on trust.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CalendarItem } from "../../utils/calendarItems";
import { I18nProvider } from "../../i18n";
import { MonthView } from "./MonthView";

afterEach(cleanup);

const ANCHOR = "2026-09-11";

function item(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    key: "k1",
    layer: "task",
    sourceType: "task",
    sourceId: "t1",
    title: "Standup",
    date: ANCHOR,
    startTime: "09:00",
    endTime: "10:00",
    allDay: false,
    color: "#3b82f6",
    categoryId: "c1",
    draggable: true,
    ...overrides,
  };
}

function draw(items: CalendarItem[], props: Partial<Parameters<typeof MonthView>[0]> = {}) {
  return render(
    <I18nProvider lang="en">
      <MonthView
        anchor={ANCHOR}
        items={items}
        selectedKey=""
        dragOverId=""
        onDragStart={() => {}}
        onOverCell={() => () => {}}
        onLeaveCell={() => () => {}}
        onDropCell={() => {}}
        onClickItem={() => {}}
        onToggleDone={() => {}}
        onClickCell={() => {}}
        onOpenDay={() => {}}
        onShowAgenda={() => {}}
        {...props}
      />
    </I18nProvider>,
  );
}

const cells = () => Array.from(document.querySelectorAll(".gcal-month-cell"));
const chips = () => Array.from(document.querySelectorAll(".gcal-chip"));
const cellFor = (date: string) =>
  cells().find((cell) => cell.querySelector(".gcal-month-date")?.textContent === String(Number(date.slice(8))));

describe("the month grid", () => {
  it("draws a full grid of weeks and names the weekdays", () => {
    draw([]);
    // Whole weeks — the grid takes as many rows as the month needs, so the
    // count is a multiple of seven and covers all 30 of September's days.
    expect(cells().length % 7).toBe(0);
    expect(cells().length).toBeGreaterThanOrEqual(30);
    expect(document.querySelectorAll(".gcal-month-weekdays span")).toHaveLength(7);
    expect(chips()).toHaveLength(0);
  });

  it("puts an event in the cell for its own date", () => {
    draw([item()]);
    expect(chips()).toHaveLength(1);
    expect(cellFor(ANCHOR)!.textContent).toContain("Standup");
  });

  it("keeps two events on different days in different cells", () => {
    draw([item(), item({ key: "k2", sourceId: "t2", date: "2026-09-14", title: "Review" })]);
    expect(cellFor(ANCHOR)!.textContent).toContain("Standup");
    expect(cellFor("2026-09-14")!.textContent).toContain("Review");
    expect(cellFor(ANCHOR)!.textContent).not.toContain("Review");
  });

  // A timed event is a dot and a start time; an all-day one is a filled pill.
  it("tells a timed event from an all-day one", () => {
    draw([item(), item({ key: "k2", sourceId: "t2", allDay: true, title: "Holiday" })]);
    const timed = chips().find((c) => c.textContent?.includes("Standup"))!;
    const allDay = chips().find((c) => c.textContent?.includes("Holiday"))!;
    expect(timed.className).toContain("is-timed");
    expect(allDay.className).not.toContain("is-timed");
  });

  it("marks the picked chip and leaves the others alone", () => {
    draw([item(), item({ key: "k2", sourceId: "t2", title: "Other" })], { selectedKey: "k2" });
    const picked = chips().filter((c) => c.className.includes("is-picked"));
    expect(picked).toHaveLength(1);
    expect(picked[0].textContent).toContain("Other");
  });

  it("marks a finished item done", () => {
    draw([item({ done: true })]);
    expect(chips()[0].className).toContain("is-done");
  });

  it("hands the clicked item back with an anchor", () => {
    const onClickItem = vi.fn();
    draw([item()], { onClickItem });
    fireEvent.click(screen.getByText("Standup").closest(".gcal-chip")!);
    expect(onClickItem).toHaveBeenCalledTimes(1);
    expect(onClickItem.mock.calls[0][0].key).toBe("k1");
  });

  it("marks the cell being dragged over", () => {
    draw([], { dragOverId: ANCHOR });
    const dropping = cells().filter((c) => c.className.includes("is-drop"));
    expect(dropping).toHaveLength(1);
    expect(dropping[0]).toBe(cellFor(ANCHOR));
  });

  it("selects the anchor's cell", () => {
    draw([]);
    expect(cellFor(ANCHOR)!.className).toMatch(/is-selected|is-today/);
  });

  // See the same test in `weekView.test.tsx`: no handler means no box.
  it("draws no checkbox when nothing can be toggled", () => {
    draw([item()], { onToggleDone: undefined });
    expect(document.querySelector(".gcal-chip input[type=checkbox]")).toBeNull();
    cleanup();
    draw([item()], { onToggleDone: () => {} });
    expect(document.querySelector(".gcal-chip input[type=checkbox]")).toBeTruthy();
  });
});
