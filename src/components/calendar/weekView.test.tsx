// @vitest-environment jsdom
//
// The week grid, as it actually draws.
//
// This file exists because the grid had no component test at all: every rule
// below was enforced only by reading the JSX. They are written as the grid's
// contract rather than as a description of its current shape — what a block
// says, where it sits, what happens when it is clicked — so that the file can
// be leaned on while the inside is rearranged for speed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CalendarItem } from "../../utils/calendarItems";
import { I18nProvider } from "../../i18n";
import { WeekView } from "./WeekView";

afterEach(cleanup);

const DAYS = [
  "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10",
  "2026-09-11", "2026-09-12", "2026-09-13",
];

function item(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    key: "k1",
    layer: "task",
    sourceType: "task",
    sourceId: "t1",
    title: "Standup",
    date: DAYS[1],
    startTime: "09:00",
    endTime: "10:00",
    allDay: false,
    color: "#3b82f6",
    categoryId: "c1",
    draggable: true,
    ...overrides,
  };
}

function draw(items: CalendarItem[], props: Partial<Parameters<typeof WeekView>[0]> = {}) {
  return render(
    <I18nProvider lang="en">
      <WeekView
        days={DAYS}
        anchor={DAYS[0]}
        items={items}
        selectedKey=""
        onClickItem={() => {}}
        onToggleDone={() => {}}
        onClickAllDaySlot={() => {}}
        onResizeItem={() => {}}
        onMoveItem={() => {}}
        onMoveItemToAllDay={() => {}}
        durationForSource={() => 60}
        draft={null}
        aiPlacements={[]}
        onSelectionStart={() => {}}
        onDraftCreate={() => {}}
        {...props}
      />
    </I18nProvider>,
  );
}

const blocks = () => Array.from(document.querySelectorAll(".gcal-time-block"));
const topOf = (el: Element) => parseFloat((el as HTMLElement).style.top);
const heightOf = (el: Element) => parseFloat((el as HTMLElement).style.height);

describe("the week grid", () => {
  it("draws one block per timed item, and none for an empty week", () => {
    draw([]);
    expect(blocks()).toHaveLength(0);
    cleanup();
    draw([item(), item({ key: "k2", sourceId: "t2", date: DAYS[3], title: "Review" })]);
    expect(blocks()).toHaveLength(2);
    expect(screen.getByText("Standup")).toBeTruthy();
    expect(screen.getByText("Review")).toBeTruthy();
  });

  // Geometry is the grid's whole job: a block that draws in the wrong place is
  // worse than one that does not draw.
  it("puts a later block lower, and a longer one taller", () => {
    draw([
      item({ key: "early", sourceId: "a", startTime: "09:00", endTime: "10:00" }),
      item({ key: "late", sourceId: "b", startTime: "14:00", endTime: "16:00", title: "Long" }),
    ]);
    const [early, late] = blocks().sort((a, b) => topOf(a) - topOf(b));
    expect(topOf(early)).toBeLessThan(topOf(late));
    expect(heightOf(late)).toBeGreaterThan(heightOf(early));
  });

  // Two events at the same hour share the width rather than hiding each other.
  it("splits the column between overlapping blocks", () => {
    draw([
      item({ key: "a", sourceId: "a", title: "A" }),
      item({ key: "b", sourceId: "b", title: "B" }),
    ]);
    const widths = blocks().map((el) => (el as HTMLElement).style.width);
    expect(widths).toHaveLength(2);
    for (const width of widths) expect(width).toContain("50%");
  });

  it("draws an all-day item in the all-day band, not the time grid", () => {
    draw([item({ allDay: true, startTime: "", endTime: "", title: "Holiday" })]);
    expect(blocks()).toHaveLength(0);
    expect(document.querySelector(".gcal-chip")).toBeTruthy();
    expect(screen.getByText("Holiday")).toBeTruthy();
  });

  it("hands the clicked item back with an anchor", () => {
    const onClickItem = vi.fn();
    draw([item()], { onClickItem });
    fireEvent.click(screen.getByText("Standup").closest(".gcal-time-block")!);
    expect(onClickItem).toHaveBeenCalledTimes(1);
    expect(onClickItem.mock.calls[0][0].key).toBe("k1");
  });

  it("marks the picked block and leaves the others alone", () => {
    draw([item(), item({ key: "k2", sourceId: "t2", title: "Other" })], { selectedKey: "k2" });
    const picked = blocks().filter((el) => el.className.includes("is-picked"));
    expect(picked).toHaveLength(1);
    expect(picked[0].textContent).toContain("Other");
  });

  it("marks a finished item done", () => {
    draw([item({ done: true })]);
    expect(blocks()[0].className).toContain("is-done");
  });

  it("draws an external event as external, and without a drag handle", () => {
    draw([item({ layer: "external", sourceType: "external", draggable: false, title: "Ext" })]);
    expect(blocks()[0].className).toContain("is-external");
  });

  // The hour rows behind the blocks, one per hour per day, plus the gutter.
  it("draws the hour grid for every day", () => {
    draw([]);
    const columns = document.querySelectorAll(".gcal-time-col");
    expect(columns).toHaveLength(DAYS.length);
    const slots = document.querySelectorAll(".gcal-time-slot");
    expect(slots.length).toBe(columns.length * document.querySelectorAll(".gcal-time-label").length);
    expect(slots.length).toBeGreaterThan(0);
  });

  it("names every day in the header", () => {
    draw([]);
    expect(document.querySelectorAll(".gcal-col-head").length).toBe(DAYS.length);
  });

  // A caller that passes no handler is saying these items cannot be finished
  // from the grid, and no box should be drawn. Easy to break by "stabilising"
  // the handler into a wrapper that is always a function.
  it("draws no checkbox when nothing can be toggled", () => {
    draw([item()], { onToggleDone: undefined });
    expect(document.querySelector(".gcal-time-block input[type=checkbox]")).toBeNull();
    cleanup();
    draw([item()], { onToggleDone: () => {} });
    expect(document.querySelector(".gcal-time-block input[type=checkbox]")).toBeTruthy();
  });
});
