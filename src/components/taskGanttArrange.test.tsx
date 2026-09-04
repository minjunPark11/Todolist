// @vitest-environment jsdom
//
// The `Arrange tasks` panel (TIMELINE_ARRANGE_TASKS_DESIGN.md §3.1, phase 1).
//
// What is worth pinning here is the SPLIT and where its halves land: the panel
// holds exactly the Items the grid cannot draw, and it is beside the grid
// rather than under it. The split itself is `spanForItem`'s, and this is the
// test that the view asks it rather than deciding for itself.
//
// Geometry is not here. jsdom has no layout, so "220px beside a grid that gets
// the rest, and wrapped under it when the grid would fall below its floor" is
// measured in the running app and recorded in §7.2 instead.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import type { List, Task } from "../types";
import type { TaskMutation } from "../domain/tasks/mutations";
import { I18nProvider } from "../i18n";
import { TaskGanttView } from "./TaskGanttView";
import { TRAY_DRAG_MIME } from "./TimelineView";
import { projectItems } from "../domain/view/item";
import { specForSpaceView } from "../domain/view/spaceViews";
import { dateAtColumnOffset, timelineWindow } from "../domain/view/timeline";

const TODAY = "2026-09-02";

const list: List = {
  id: "l1",
  projectId: "",
  kind: "regular",
  name: "School",
  order: 0,
  isDefault: true,
  createdAt: `${TODAY}T00:00:00.000Z`,
  updatedAt: `${TODAY}T00:00:00.000Z`,
};

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "A task",
    status: "open",
    priority: "none",
    dueDate: "",
    startDate: "",
    listId: "l1",
    parentTaskId: "",
    tags: [],
    order: 0,
    createdAt: `${TODAY}T00:00:00.000Z`,
    updatedAt: `${TODAY}T00:00:00.000Z`,
    ...over,
  } as Task;
}

function draw(tasks: Task[], onOpenItem = vi.fn(), onMutateTask?: (task: Task, mutation: TaskMutation) => void) {
  const items = projectItems({ tasks, lists: [list], today: TODAY });
  render(
    <I18nProvider lang="en">
      <TaskGanttView
        items={items}
        spec={specForSpaceView("gantt", { folderId: "", listId: "l1" }, "School")}
        context={{ today: TODAY, taskById: new Map(tasks.map((row) => [row.id, row])) }}
        today={TODAY}
        tasks={tasks}
        groupLabel={() => "School"}
        onOpenItem={onOpenItem}
        onMutateTask={onMutateTask}
      />
    </I18nProvider>,
  );
  return { onOpenItem, onMutateTask };
}

const chips = () =>
  [...document.querySelectorAll(".tgv-chip")].map((chip) => chip.textContent ?? "");

afterEach(cleanup);

describe("Arrange tasks", () => {
  it("holds exactly the Tasks the grid has no dates to draw", () => {
    draw([
      task({ id: "dated", title: "Has a deadline", dueDate: "2026-09-04" }),
      task({ id: "started", title: "Has a start", startDate: "2026-09-03" }),
      task({ id: "bare", title: "Has neither" }),
    ]);

    // One date is enough for a bar (G-GANTT-01), so only the third is here.
    expect(chips()).toEqual(["Has neither"]);
  });

  it("names itself and counts what is waiting", () => {
    draw([task({ id: "a", title: "One" }), task({ id: "b", title: "Two" })]);

    const panel = screen.getByRole("complementary", { name: "Arrange tasks" });
    expect(panel.querySelector("h3")?.textContent).toBe("Arrange tasks");
    // Beside the name, not inside it — the Board's column heads settled this
    // (SCOPE_VIEW_OPTIONS_DESIGN.md §13.6.4).
    expect(panel.querySelector(".tm-count")?.textContent).toBe("2");
  });

  it("is absent when there is nothing to arrange", () => {
    draw([task({ id: "dated", dueDate: "2026-09-04" })]);
    expect(screen.queryByRole("complementary", { name: "Arrange tasks" })).toBeNull();
  });

  // §3.5: the chip opens the Task, and will still open it after phase 3 adds
  // the drag. A panel that can only be dragged from is a panel some readers
  // cannot use at all.
  it("opens a Task from its chip", async () => {
    const { onOpenItem } = draw([task({ id: "bare", title: "Has neither" })]);

    (document.querySelector(".tgv-chip") as HTMLButtonElement).click();
    expect(onOpenItem).toHaveBeenCalledTimes(1);
    expect(onOpenItem.mock.calls[0][0].sourceId).toBe("bare");
  });

  // The grid and the panel are siblings in one row now. They used to be
  // stacked, and the panel was a `<section>` after the grid rather than a
  // column beside it.
  it("puts the grid and the panel in the same row", () => {
    draw([
      task({ id: "dated", dueDate: "2026-09-04" }),
      task({ id: "bare", title: "Has neither" }),
    ]);

    const body = document.querySelector(".tgv-body");
    expect(body).toBeTruthy();
    expect(body?.querySelector(":scope > .ff-timeline")).toBeTruthy();
    expect(body?.querySelector(":scope > .tgv-arrange")).toBeTruthy();
  });
});

// §4 (phase 3): the drag, and the drop target that belongs to a column
// rather than to an Item's row.
// GANTT §11 drew the title twice on a row — in the label column and inside
// the bar — and TIMELINE_V2_DESIGN.md §4 followed §11.2's own reasoning to the
// end: the label column is the copy that is always readable, so the bar says
// the thing only it can say. What a narrow bar gives up is now a date, and the
// name never leaves the row.
describe("what a bar says", () => {
  it("names itself in the tooltip, ahead of its dates", () => {
    draw([task({ id: "b1", title: "Project A", startDate: "2026-09-08", dueDate: "2026-09-15" })]);

    const bar = document.querySelector(".ff-timeline-bar");
    // Full dates here, abbreviated ones inside: the tooltip has room and is
    // where a reader goes when the bar's own line is not enough.
    expect(bar?.getAttribute("title")).toBe("Project A · 2026-09-08 → 2026-09-15");
  });

  // Which of the two is shown is a container query on the bar's own width,
  // which jsdom has no layout to answer — the thresholds were measured in the
  // running app (§4). What this asserts is that both forms are there to pick
  // from, and that the name did not go with the title.
  it("writes the dates inside, in both the widths it may be given", () => {
    draw([task({ id: "b1", title: "Project A", startDate: "2026-09-08", dueDate: "2026-09-15" })]);

    const text = document.querySelector(".ff-timeline-bar-text");
    expect(text?.querySelector(".ff-timeline-bar-long")?.textContent).toBe("9.8 – 9.15");
    expect(text?.querySelector(".ff-timeline-bar-short")?.textContent).toBe("9.8 –");
    // The button is what a screen reader lands on, and dates alone would not
    // say which task it had reached.
    expect(text?.getAttribute("aria-label")).toBe("Project A · 9.8 – 9.15");
  });
});

// §4 phase 5: the states around the panel rather than inside it.
describe("Arrange tasks at its edges", () => {
  // An empty panel is absent, not empty — §15.5's idiom. The gate is
  // `undated.length > 0`, so there is no "nothing here yet" card to write.
  it("draws no empty panel", () => {
    draw([task({ id: "dated", dueDate: "2026-09-04" })]);
    expect(document.querySelector(".tgv-arrange")).toBeNull();
    // And the grid is still there to receive one later.
    expect(document.querySelector(".ff-timeline")).toBeTruthy();
  });

  // The first screen this feature ever shows: nothing scheduled, a pile to
  // place. The grid has no rows but keeps its day columns, so there is
  // something to drop onto.
  it("keeps the grid and its columns when every Task is still unplaced", () => {
    draw([task({ id: "bare", title: "Has neither" })], vi.fn(), vi.fn());

    expect(document.querySelector(".tgv-arrange")).toBeTruthy();
    expect(document.querySelectorAll(".ff-timeline-row")).toHaveLength(0);
    expect(document.querySelectorAll(".ff-timeline-col").length).toBeGreaterThan(0);
    // Not the empty state: that is for a Scope with no Tasks at all.
    expect(document.querySelector(".ff-empty")).toBeNull();
  });

  // Both empty is the only case the empty state is for.
  it("shows the empty state only when there is nothing either side", () => {
    draw([]);
    expect(document.querySelector(".ff-empty")).toBeTruthy();
    expect(document.querySelector(".tgv-arrange")).toBeNull();
  });

  // §3.5. The hint names the way in that this timeline actually has: a
  // read-only one cannot be dragged onto, so telling the reader to drag would
  // be an instruction they cannot follow.
  it("names the drag only where the drag exists", () => {
    draw([task({ id: "bare" })], vi.fn(), vi.fn());
    expect(document.querySelector(".tgv-arrange-hint")?.textContent).toContain("Drag");

    cleanup();
    draw([task({ id: "bare" })]);
    expect(document.querySelector(".tgv-arrange-hint")?.textContent).not.toContain("Drag");
  });
});

describe("dropping a chip on a day", () => {
  /** jsdom has no drag, so the payload is carried by hand. */
  function dataTransfer(mime: string, value: string) {
    const store: Record<string, string> = { [mime]: value };
    return {
      setData: (key: string, next: string) => {
        store[key] = next;
      },
      getData: (key: string) => store[key] ?? "",
      effectAllowed: "move",
    } as unknown as DataTransfer;
  }

  const chip = () => document.querySelector(".tgv-chip") as HTMLButtonElement;
  const lanes = () => [...document.querySelectorAll(".ff-timeline-lane")];

  // They cover the grid, so leaving them up would put a sheet of drop
  // targets over every bar.
  it("draws no lanes until a chip is in the air", () => {
    draw([task({ id: "bare", title: "Has neither" })], vi.fn(), vi.fn());
    expect(lanes()).toHaveLength(0);

    fireEvent.dragStart(chip(), { dataTransfer: dataTransfer(TRAY_DRAG_MIME, "bare") });
    expect(lanes().length).toBeGreaterThan(0);
  });

  // A cancelled drag ends with `dragend` and no drop, which is the case that
  // would otherwise leave the sheet up.
  it("takes the lanes away again when the drag ends", () => {
    draw([task({ id: "bare" })], vi.fn(), vi.fn());
    fireEvent.dragStart(chip(), { dataTransfer: dataTransfer(TRAY_DRAG_MIME, "bare") });
    fireEvent.dragEnd(chip());
    expect(lanes()).toHaveLength(0);
  });

  /**
   * jsdom has no layout, so a lane reports a zero-width box and the date the
   * pointer named would always come back empty (§13). The box is stood up by
   * hand here — which is itself the fact worth pinning: the drop reads the
   * POINTER now, not the column it fell in.
   */
  function standUp(lane: Element, left = 0, width = 100) {
    lane.getBoundingClientRect = () =>
      ({ left, width, right: left + width, top: 0, bottom: 24, height: 24, x: left, y: 0 }) as DOMRect;
  }

  it("writes the day the pointer named, not the column's first", () => {
    const onMutateTask = vi.fn();
    draw([task({ id: "bare", title: "Has neither" })], vi.fn(), onMutateTask);

    const transfer = dataTransfer(TRAY_DRAG_MIME, "bare");
    fireEvent.dragStart(chip(), { dataTransfer: transfer });
    standUp(lanes()[3]);
    // `fireEvent.drop(node, { clientX })` does not carry the coordinate through
    // this jsdom [실측] — the event has to be built and the property defined on
    // it. Halfway across the lane, which at this zoom is halfway through a week.
    const drop = createEvent.drop(lanes()[3], { dataTransfer: transfer });
    Object.defineProperty(drop, "clientX", { value: 50 });
    fireEvent(lanes()[3], drop);

    expect(onMutateTask).toHaveBeenCalledTimes(1);
    const [target, mutation] = onMutateTask.mock.calls[0];
    const patch = mutation.patch;
    expect(target.id).toBe("bare");
    // §3.4: it arrives as something that can be taken back, and the undo is
    // the field's PREVIOUS value — empty, because this Task had no deadline.
    expect(mutation.undo).toEqual({ dueDate: "" });
    expect(mutation.labelKey).toBe("tasks.undoDateChanged");
    // The view opens on `1개월`, cut into WEEKS — and the day written is the
    // one under the pointer, three days into that week rather than the Sunday
    // it starts on. That difference is the whole of §13.
    const window = timelineWindow("month", TODAY);
    expect(patch).toEqual({ dueDate: dateAtColumnOffset(window, 3, 0.5) });
    expect(patch.dueDate).not.toBe(window.edges[3]);
    // And only the deadline (§3.2).
    expect(patch).not.toHaveProperty("startDate");
  });

  // The bug the running app found: a successful drop takes the Task out of
  // the panel, so the chip UNMOUNTS and its `onDragEnd` goes with it. `dragend`
  // then reaches nothing and the lanes stay up as a sheet over the whole grid.
  it("takes the lanes away after a drop, without waiting for dragend", () => {
    const onMutateTask = vi.fn();
    draw([task({ id: "bare" })], vi.fn(), onMutateTask);

    const transfer = dataTransfer(TRAY_DRAG_MIME, "bare");
    fireEvent.dragStart(chip(), { dataTransfer: transfer });
    fireEvent.drop(lanes()[2], { dataTransfer: transfer });

    // No `dragEnd` fired here on purpose — that is the case being pinned.
    expect(lanes()).toHaveLength(0);
  });

  // A bar drag carries `text/timeline` and nothing else, so a lane must find
  // no payload and write nothing.
  it("ignores a drop that is not carrying a chip", () => {
    const onMutateTask = vi.fn();
    draw([task({ id: "bare" })], vi.fn(), onMutateTask);
    fireEvent.dragStart(chip(), { dataTransfer: dataTransfer(TRAY_DRAG_MIME, "bare") });

    fireEvent.drop(lanes()[1], { dataTransfer: dataTransfer("text/timeline", "move") });
    expect(onMutateTask).not.toHaveBeenCalled();
  });

  // §3.5: a panel that can only be dragged from is a panel some readers
  // cannot use at all, so the chip stays a button.
  it("keeps the chip a button that opens the Task", () => {
    const { onOpenItem } = draw([task({ id: "bare" })], vi.fn(), vi.fn());
    expect(chip().draggable).toBe(true);
    chip().click();
    expect(onOpenItem).toHaveBeenCalledTimes(1);
  });

  // A read-only timeline has nowhere to write the date.
  it("does not offer the drag where the view cannot write", () => {
    draw([task({ id: "bare" })]);
    expect(chip().draggable).toBe(false);
  });
});
// The column heads, and the marks that say which one is today
// (TIMELINE_V2_DESIGN.md §6 · I7). The `today` here is the prop, not the
// clock, so these hold whenever the suite runs; the line itself is placed from
// a real clock and is asserted in `e2e/ganttBars.spec.ts`.
describe("the heading of a column", () => {
  const labels = () => [...document.querySelectorAll(".ff-timeline-col")].map((col) => col.textContent ?? "");
  const zoomTo = (value: string) => fireEvent.change(screen.getByRole("combobox"), { target: { value } });

  it("names the weekday where a column IS a day (I7)", () => {
    draw([task({ id: "b1", dueDate: TODAY })]);
    zoomTo("week");

    // 2026-09-02 is a Wednesday, and the window starts on the day itself.
    expect(labels()[0]).toBe("9.2 (Wed)");
    expect(labels()[1]).toBe("9.3 (Thu)");
  });

  // A week column covers seven weekdays and a month column thirty: naming the
  // first would be implying the rest.
  it("says none where a column is a week or a month", () => {
    draw([task({ id: "b1", dueDate: TODAY })]);
    zoomTo("month");
    // The week the 2nd falls in, which starts on the Sunday before it.
    expect(labels()[0]).toBe("8.30");

    zoomTo("halfYear");
    expect(labels()[0]).toBe("2026-09");
  });

  it("marks the column today falls in", () => {
    draw([task({ id: "b1", dueDate: TODAY })]);
    zoomTo("week");

    expect(document.querySelectorAll(".ff-timeline-col.is-today")).toHaveLength(1);
    expect(document.querySelector(".ff-timeline-col.is-today")?.textContent).toBe("9.2 (Wed)");
  });

  // A day window is 24 columns of one date: `columnOf` puts today in the first
  // of them, so a mark there would badge midnight and call it now.
  it("marks none of them at the hour zoom, where every column is today", () => {
    draw([task({ id: "b1", dueDate: TODAY })]);
    zoomTo("day");

    expect(labels()[0]).toBe("00");
    expect(document.querySelectorAll(".ff-timeline-col.is-today")).toHaveLength(0);
  });
});
