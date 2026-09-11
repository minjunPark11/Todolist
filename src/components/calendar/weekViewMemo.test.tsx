// @vitest-environment jsdom
//
// What the week grid costs when something other than its blocks changes.
//
// The grid re-renders constantly and for reasons that have nothing to do with
// any particular event: a pointer drag sets state on every pointer event, up
// to 120 a second; picking a block, opening a popover and scrolling all do it
// once each. Every one of those used to rebuild every block in the week —
// `motion.div`, checkbox, formatted time and all — when at most one of them
// had actually changed.
//
// These pin the two halves of the fix, because both regress silently: the
// block is memoized, and the grid's own handlers are stable enough for the
// memo to ever answer "no".
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import type { CalendarItem } from "../../utils/calendarItems";
import { I18nProvider } from "../../i18n";

// Counted from inside the block: a block that re-renders draws its checkbox.
let blockRenders = 0;
vi.mock("./CalendarItemCheck", () => ({
  CalendarItemCheck: ({ item }: { item: CalendarItem }) => {
    blockRenders += 1;
    return <input type="checkbox" aria-label={item.title} readOnly />;
  },
}));

const { WeekView } = await import("./WeekView");

afterEach(cleanup);

const DAYS = [
  "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10",
  "2026-09-11", "2026-09-12", "2026-09-13",
];

function items(count: number): CalendarItem[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `k${i}`,
    layer: "task" as const,
    sourceType: "task" as const,
    sourceId: `t${i}`,
    title: `Event ${i}`,
    date: DAYS[i % DAYS.length],
    startTime: `${String(9 + i).padStart(2, "0")}:00`,
    endTime: `${String(9 + i).padStart(2, "0")}:45`,
    allDay: false,
    color: "#3b82f6",
    categoryId: "c1",
    draggable: true,
  }));
}

/**
 * The grid inside an owner that re-renders on its own, handing it freshly
 * built callbacks each time — which is exactly what `CalendarView` does, since
 * every one of them is written inline there.
 */
function Host({ data, selectedKey = "" }: { data: CalendarItem[]; selectedKey?: string }) {
  const [, bump] = useState(0);
  (Host as unknown as { bump?: () => void }).bump = () => bump((n) => n + 1);
  return (
    <I18nProvider lang="en">
      <WeekView
        days={DAYS}
        anchor={DAYS[0]}
        items={data}
        selectedKey={selectedKey}
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
      />
    </I18nProvider>
  );
}

const rerender = () => act(() => (Host as unknown as { bump: () => void }).bump());

describe("the week grid's blocks", () => {
  it("draw once on the way in", () => {
    blockRenders = 0;
    render(<Host data={items(5)} />);
    expect(blockRenders).toBe(5);
  });

  it("redraw none of themselves when the grid re-renders with the same items", () => {
    render(<Host data={items(5)} />);
    blockRenders = 0;

    rerender();

    expect(blockRenders).toBe(0);
  });

  // Still a live grid: a changed event redraws, and only it.
  it("redraw only the block whose item changed", () => {
    const data = items(5);
    const { rerender: setProps } = render(<Host data={data} />);
    blockRenders = 0;

    const next = [...data];
    next[2] = { ...next[2], title: "Moved" };
    setProps(<Host data={next} />);

    expect(blockRenders).toBe(1);
  });

  // Picking a block is a grid-wide state change that concerns two blocks at
  // most — the one gaining the ring and the one losing it.
  it("redraw only the block being picked", () => {
    const data = items(5);
    const { rerender: setProps } = render(<Host data={data} />);
    blockRenders = 0;

    setProps(<Host data={data} selectedKey="k3" />);

    expect(blockRenders).toBe(1);
  });
});
