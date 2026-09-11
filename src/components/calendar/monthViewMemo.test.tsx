// @vitest-environment jsdom
//
// What the month grid costs when one cell's highlight moves.
//
// Dragging an event across the month sets `dragOverId` on every dragover
// event, which is a state change on the grid several times a second. That used
// to rebuild every cell and every chip in the month to move one outline. The
// cell is memoized now, and this pins both halves of that — the memo itself,
// and the handler stability without which the memo can never answer "no".
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import type { CalendarItem } from "../../utils/calendarItems";
import { I18nProvider } from "../../i18n";

// Counted from inside a chip: a cell that re-renders draws its chips again.
let chipRenders = 0;
vi.mock("./CalendarItemCheck", () => ({
  CalendarItemCheck: ({ item }: { item: CalendarItem }) => {
    chipRenders += 1;
    return <input type="checkbox" aria-label={item.title} readOnly />;
  },
}));

const { MonthView } = await import("./MonthView");

afterEach(cleanup);

const ANCHOR = "2026-09-11";

function items(count: number): CalendarItem[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `k${i}`,
    layer: "task" as const,
    sourceType: "task" as const,
    sourceId: `t${i}`,
    title: `Event ${i}`,
    date: `2026-09-${String(i + 1).padStart(2, "0")}`,
    startTime: "09:00",
    endTime: "10:00",
    allDay: false,
    color: "#3b82f6",
    categoryId: "c1",
    draggable: true,
  }));
}

/** The grid under an owner that re-renders and rebuilds its handlers, as `CalendarView` does. */
function Host({ data, dragOverId = "" }: { data: CalendarItem[]; dragOverId?: string }) {
  const [, bump] = useState(0);
  (Host as unknown as { bump?: () => void }).bump = () => bump((n) => n + 1);
  return (
    <I18nProvider lang="en">
      <MonthView
        anchor={ANCHOR}
        items={data}
        selectedKey=""
        dragOverId={dragOverId}
        onDragStart={() => {}}
        onOverCell={() => () => {}}
        onLeaveCell={() => () => {}}
        onDropCell={() => {}}
        onClickItem={() => {}}
        onToggleDone={() => {}}
        onClickCell={() => {}}
        onOpenDay={() => {}}
        onShowAgenda={() => {}}
      />
    </I18nProvider>
  );
}

describe("the month grid's cells", () => {
  // Not "once": the grid measures its own row height after layout and settles
  // on a second pass, which is a real second render of every cell. What
  // matters is that it settles — the tests below are about what happens after.
  it("draws every chip on the way in", () => {
    chipRenders = 0;
    render(<Host data={items(5)} />);
    expect(chipRenders).toBeGreaterThanOrEqual(5);
  });

  it("redraw nothing when the grid re-renders unchanged", () => {
    render(<Host data={items(5)} />);
    chipRenders = 0;

    act(() => (Host as unknown as { bump: () => void }).bump());

    expect(chipRenders).toBe(0);
  });

  // The drag case. Moving the highlight onto a day concerns that day and the
  // one it left, and nothing else in the month.
  it("redraw only the cell the highlight moves to", () => {
    const data = items(5);
    const { rerender } = render(<Host data={data} />);
    chipRenders = 0;

    // "2026-09-03" holds one event, so a cell that redraws shows up here.
    rerender(<Host data={data} dragOverId="2026-09-03" />);

    expect(chipRenders).toBe(1);
  });
});
