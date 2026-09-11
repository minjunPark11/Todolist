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
import type { FocusSession, List, Task } from "../types";
import type { TaskMutation } from "../domain/tasks/mutations";
import { I18nProvider } from "../i18n";
// The row menu is a Popover (§9.8), and a floating surface needs its layer.
import { FloatingLayerProvider } from "./floating";
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

function draw(
  tasks: Task[],
  onOpenItem = vi.fn(),
  onMutateTask?: (task: Task, mutation: TaskMutation) => void,
  focusSessions?: FocusSession[],
) {
  const items = projectItems({ tasks, lists: [list], today: TODAY });
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
      <TaskGanttView
        items={items}
        spec={specForSpaceView("gantt", { folderId: "", listId: "l1" }, "School")}
        context={{ today: TODAY, taskById: new Map(tasks.map((row) => [row.id, row])) }}
        today={TODAY}
        tasks={tasks}
        groupLabel={() => "School"}
        onOpenItem={onOpenItem}
        onMutateTask={onMutateTask}
        focusSessions={focusSessions}
        timezone="Asia/Seoul"
      />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
  return { onOpenItem, onMutateTask };
}

/**
 * The tray is a drawer now and opens shut (§4.3), so every test that looks
 * inside it opens it first — which is itself the change worth having in one
 * place rather than spread over a dozen lines.
 */
function openTray() {
  const toggle = screen.queryByRole("button", { name: /Arrange tasks/ });
  if (toggle) fireEvent.click(toggle);
}

const chips = () => {
  openTray();
  return [...document.querySelectorAll(".tgv-chip")].map((chip) => chip.textContent ?? "");
};

/**
 * Pick a zoom (§9.4).
 *
 * It was a `<select>` and this was `fireEvent.change`. The reference's control
 * says its own value and opens a menu of `menuitemradio` rows, so choosing one
 * is two presses — and the label is what the reader sees, which is why this
 * takes `1 week` rather than `week`.
 */
function zoomTo(label: string) {
  fireEvent.click(screen.getByRole("button", { name: "Zoom" }));
  fireEvent.click(screen.getByRole("menuitemradio", { name: new RegExp(`^${label}`) }));
}

/** Flip one of the two `View` switches by the words on it. */
function toggleDisplay(label: string) {
  fireEvent.click(screen.getByRole("button", { name: "View" }));
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: new RegExp(`^${label}`) }));
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
}

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
    openTray();

    const panel = screen.getByRole("complementary", { name: "Arrange tasks" });
    expect(panel.querySelector("h3")?.textContent).toBe("Arrange tasks");
    // Beside the name, not inside it — the Board's column heads settled this
    // (SCOPE_VIEW_OPTIONS_DESIGN.md §13.6.4).
    expect(panel.querySelector(".tm-count")?.textContent).toBe("2");
  });

  // §4.3: shut by default, which is the change from the column it replaces.
  // That one was on screen whenever anything was waiting in it, and on this
  // app's data something usually is. The count on the toggle says so without
  // spending 288px on saying it.
  it("opens shut, with the count on its own toggle", () => {
    draw([task({ id: "a", title: "One" }), task({ id: "b", title: "Two" })]);

    const toggle = screen.getByRole("button", { name: /Arrange tasks/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.querySelector("strong")?.textContent).toBe("2");
    expect(document.querySelector(".ff-timeline-tray.is-open")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector(".ff-timeline-tray.is-open")).toBeTruthy();
  });

  it("is absent when there is nothing to arrange", () => {
    draw([task({ id: "dated", dueDate: "2026-09-04" })]);
    expect(screen.queryByRole("complementary", { name: "Arrange tasks" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Arrange tasks/ })).toBeNull();
  });

  // §3.5: the chip opens the Task, and will still open it after phase 3 adds
  // the drag. A panel that can only be dragged from is a panel some readers
  // cannot use at all.
  it("opens a Task from its chip", async () => {
    const { onOpenItem } = draw([task({ id: "bare", title: "Has neither" })]);
    openTray();

    (document.querySelector(".tgv-chip") as HTMLButtonElement).click();
    expect(onOpenItem).toHaveBeenCalledTimes(1);
    expect(onOpenItem.mock.calls[0][0].sourceId).toBe("bare");
  });

  // §4.3: it PUSHES the card rather than covering it, which is what answers
  // §3.1's objection to the reference's overlay — "a panel over the grid hides
  // days that are on screen". So the tray is a sibling of the body rather than
  // a column inside it, and the body carries the margin.
  it("pushes the grid aside rather than covering it", () => {
    draw([
      task({ id: "dated", dueDate: "2026-09-04" }),
      task({ id: "bare", title: "Has neither" }),
    ]);

    const root = document.querySelector(".tgv");
    expect(root?.querySelector(":scope > .tgv-body > .ff-timeline")).toBeTruthy();
    expect(root?.querySelector(":scope > .ff-timeline-tray")).toBeTruthy();

    expect(root?.classList.contains("is-tray-open")).toBe(false);
    openTray();
    expect(root?.classList.contains("is-tray-open")).toBe(true);
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

  // §4.1 turned this around. The bar says WHAT and the task column says WHEN —
  // still nothing said twice, and what survives a bar too narrow for its text
  // is now the focus trace rather than nothing at all.
  it("writes its name inside, and leaves the date to the task column", () => {
    draw([task({ id: "b1", title: "Project A", startDate: "2026-09-08", dueDate: "2026-09-15" })]);

    expect(document.querySelector(".ff-timeline-bar-text")?.textContent).toBe("Project A");
    expect(document.querySelector(".ff-timeline-meta")?.textContent).toBe("9.15");
  });

  // One form, not two. A date range has a shorter half (`9.8 –`) and a title
  // has none: below the width where it fits, the bar drops it.
  it("draws one form of its name rather than a long and a short", () => {
    draw([task({ id: "b1", title: "Project A", startDate: "2026-09-08", dueDate: "2026-09-15" })]);

    expect(document.querySelector(".ff-timeline-bar-long")).toBeNull();
    expect(document.querySelector(".ff-timeline-bar-short")).toBeNull();
  });

  // A reader who cannot see the bar has no ruler to read it against, so the
  // span has to be said. The task column's `9.15` is one end of it.
  it("says the whole span to a screen reader, which has no ruler", () => {
    draw([task({ id: "b1", title: "Project A", startDate: "2026-09-08", dueDate: "2026-09-15" })]);

    expect(document.querySelector(".ff-timeline-bar-text")?.getAttribute("aria-label")).toBe(
      "Project A · 2026-09-08 → 2026-09-15",
    );
  });
});

// The task column is a row, not a legend (§2.3).
describe("the task column's row", () => {
  it("ticks a task off from the timeline", () => {
    const onMutateTask = vi.fn();
    draw([task({ id: "b1", title: "Project A", dueDate: "2026-09-08" })], vi.fn(), onMutateTask);

    fireEvent.click(screen.getByRole("checkbox", { name: /Project A/ }));

    expect(onMutateTask).toHaveBeenCalledTimes(1);
    expect(onMutateTask.mock.calls[0][1].patch.status).toBe("completed");
  });

  // §9.8: `미배치로 이동` and `일정 제거` are one action, so there is one item.
  // Clearing the dates does not remove the Task — it moves it to the tray,
  // which is where something with no dates belongs (T-GV06).
  it("clears the dates from the row menu, which drops it into the tray", async () => {
    const onMutateTask = vi.fn();
    draw(
      [task({ id: "b1", title: "Project A", startDate: "2026-09-08", dueDate: "2026-09-15" })],
      vi.fn(),
      onMutateTask,
    );

    fireEvent.click(screen.getByRole("button", { name: "Task menu" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Clear dates" }));

    expect(onMutateTask).toHaveBeenCalledTimes(1);
    expect(onMutateTask.mock.calls[0][1].patch).toEqual({ startDate: "", dueDate: "" });
  });

  // A read-only timeline has no box to tick and no dates to clear, and draws
  // neither rather than drawing them dead.
  it("offers neither where the timeline cannot be written to", () => {
    draw([task({ id: "b1", title: "Project A", dueDate: "2026-09-08" })]);

    expect(screen.queryByRole("checkbox", { name: /Project A/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Task menu" })).toBeNull();
  });
});

// §4 phase 5: the states around the panel rather than inside it.
describe("Arrange tasks at its edges", () => {
  // An empty panel is absent, not empty — §15.5's idiom. The gate is
  // `undated.length > 0`, so there is no "nothing here yet" card to write.
  it("draws no empty panel", () => {
    draw([task({ id: "dated", dueDate: "2026-09-04" })]);
    expect(document.querySelector(".ff-timeline-tray")).toBeNull();
    // And the grid is still there to receive one later.
    expect(document.querySelector(".ff-timeline")).toBeTruthy();
  });

  // The first screen this feature ever shows: nothing scheduled, a pile to
  // place. The grid has no rows but keeps its day columns, so there is
  // something to drop onto.
  it("keeps the grid and its columns when every Task is still unplaced", () => {
    draw([task({ id: "bare", title: "Has neither" })], vi.fn(), vi.fn());

    expect(document.querySelector(".ff-timeline-tray")).toBeTruthy();
    expect(document.querySelectorAll(".ff-timeline-row")).toHaveLength(0);
    expect(document.querySelectorAll(".ff-timeline-col").length).toBeGreaterThan(0);
    // Not the empty state: that is for a Scope with no Tasks at all.
    expect(document.querySelector(".ff-empty")).toBeNull();
  });

  // Both empty is the only case the empty state is for.
  it("shows the empty state only when there is nothing either side", () => {
    draw([]);
    expect(document.querySelector(".ff-empty")).toBeTruthy();
    expect(document.querySelector(".ff-timeline-tray")).toBeNull();
  });

  // §3.5. The hint names the way in that this timeline actually has: a
  // read-only one cannot be dragged onto, so telling the reader to drag would
  // be an instruction they cannot follow.
  it("names the drag only where the drag exists", () => {
    draw([task({ id: "bare" })], vi.fn(), vi.fn());
    expect(document.querySelector(".ff-timeline-tray-hint")?.textContent).toContain("Drag");

    cleanup();
    draw([task({ id: "bare" })]);
    expect(document.querySelector(".ff-timeline-tray-hint")?.textContent).not.toContain("Drag");
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

  function chip() {
    openTray();
    return document.querySelector(".tgv-chip") as HTMLButtonElement;
  }
  /**
   * ONE drop target now, not one per column (§9.5).
   *
   * The lanes were a hit area cut into pieces that nothing read: every one of
   * them answered by measuring the pointer against the track. What replaced
   * the tint on the aimed-at lane is a preview that names the DAY.
   */
  const dropArea = () => document.querySelector(".ff-timeline-droparea");

  // It covers the grid, so leaving it up would put a sheet over every bar.
  it("draws no drop target until a chip is in the air", () => {
    draw([task({ id: "bare", title: "Has neither" })], vi.fn(), vi.fn());
    expect(dropArea()).toBeNull();

    fireEvent.dragStart(chip(), { dataTransfer: dataTransfer(TRAY_DRAG_MIME, "bare") });
    expect(dropArea()).toBeTruthy();
  });

  // A cancelled drag ends with `dragend` and no drop, which is the case that
  // would otherwise leave the sheet up.
  it("takes it away again when the drag ends", () => {
    draw([task({ id: "bare" })], vi.fn(), vi.fn());
    fireEvent.dragStart(chip(), { dataTransfer: dataTransfer(TRAY_DRAG_MIME, "bare") });
    fireEvent.dragEnd(chip());
    expect(dropArea()).toBeNull();
  });

  /**
   * jsdom has no layout, so the drop area reports a zero-width box and the
   * date the pointer named would always come back empty (§13). The box is
   * stood up by hand — which is itself the fact worth pinning: the drop reads
   * the POINTER against the whole track, not the column it fell in.
   */
  function standUp(node: Element, left = 0, width = 700) {
    node.getBoundingClientRect = () =>
      ({ left, width, right: left + width, top: 0, bottom: 400, height: 400, x: left, y: 0 }) as DOMRect;
  }

  /** A drag event carrying a coordinate, which `fireEvent` alone will not. */
  function dragAt(node: Element, kind: "dragOver" | "drop", clientX: number, transfer: DataTransfer) {
    const event = kind === "drop" ? createEvent.drop(node, { dataTransfer: transfer }) : createEvent.dragOver(node, { dataTransfer: transfer });
    Object.defineProperty(event, "clientX", { value: clientX });
    Object.defineProperty(event, "clientY", { value: 100 });
    fireEvent(node, event);
  }

  it("writes the day the pointer named, not the column's first", () => {
    const onMutateTask = vi.fn();
    draw([task({ id: "bare", title: "Has neither" })], vi.fn(), onMutateTask);

    // Said out loud rather than relied on. §13 is only visible where a column
    // holds more than one day, so this test is about the month zoom whether or
    // not that is the zoom the view happens to open on.
    zoomTo("1 month");

    const transfer = dataTransfer(TRAY_DRAG_MIME, "bare");
    fireEvent.dragStart(chip(), { dataTransfer: transfer });
    const area = dropArea()!;
    standUp(area);
    // A five-week window over a 700px track: 20px a day. Aiming at 510px is
    // the 25th day, which is the fourth day of the fourth week — NOT the
    // Sunday that week starts on, which is the whole of §13.
    dragAt(area, "drop", 510, transfer);

    expect(onMutateTask).toHaveBeenCalledTimes(1);
    const [target, mutation] = onMutateTask.mock.calls[0];
    const patch = mutation.patch;
    expect(target.id).toBe("bare");
    // §3.4: it arrives as something that can be taken back, and the undo is
    // the field's PREVIOUS value — empty, because this Task had no deadline.
    expect(mutation.undo).toEqual({ dueDate: "" });
    expect(mutation.labelKey).toBe("tasks.undoDateChanged");
    // A month window is cut into WEEKS — and the day written is the one under
    // the pointer, three days into that week rather than the Sunday it starts
    // on. That difference is the whole of §13.
    const window = timelineWindow("month", TODAY);
    expect(patch).toEqual({ dueDate: dateAtColumnOffset(window, 3, 4 / 7) });
    expect(patch.dueDate).not.toBe(window.edges[3].slice(0, 10));
    // And only the deadline (§3.2).
    expect(patch).not.toHaveProperty("startDate");
  });

  // The bug the running app found: a successful drop takes the Task out of
  // the panel, so the chip UNMOUNTS and its `onDragEnd` goes with it. `dragend`
  // then reaches nothing and the lanes stay up as a sheet over the whole grid.
  it("takes the drop target away after a drop, without waiting for dragend", () => {
    const onMutateTask = vi.fn();
    draw([task({ id: "bare" })], vi.fn(), onMutateTask);

    const transfer = dataTransfer(TRAY_DRAG_MIME, "bare");
    fireEvent.dragStart(chip(), { dataTransfer: transfer });
    const area = dropArea()!;
    standUp(area);
    dragAt(area, "drop", 200, transfer);

    // No `dragEnd` fired here on purpose — that is the case being pinned.
    expect(dropArea()).toBeNull();
  });

  // A bar drag carries `text/timeline` and nothing else, so a lane must find
  // no payload and write nothing.
  it("ignores a drop that is not carrying a chip", () => {
    const onMutateTask = vi.fn();
    draw([task({ id: "bare" })], vi.fn(), onMutateTask);
    fireEvent.dragStart(chip(), { dataTransfer: dataTransfer(TRAY_DRAG_MIME, "bare") });
    const area = dropArea()!;
    standUp(area);

    dragAt(area, "drop", 200, dataTransfer("text/timeline", "move"));
    expect(onMutateTask).not.toHaveBeenCalled();
  });

  // §9.5: what replaced the tinted lane. The lane could say which COLUMN —
  // at month zoom, which WEEK — and the reader let go hoping. This names the
  // day and shows the bar that day would make.
  it("previews the day under the pointer before the chip is let go", () => {
    draw([task({ id: "bare", title: "Has neither" })], vi.fn(), vi.fn());
    zoomTo("1 month");

    const transfer = dataTransfer(TRAY_DRAG_MIME, "bare");
    fireEvent.dragStart(chip(), { dataTransfer: transfer });
    const area = dropArea()!;
    standUp(area);
    dragAt(area, "dragOver", 510, transfer);

    // The chip names the day, unpadded, as the rest of this screen writes a
    // date. 510/700 of a 35-day window is the 25th day — 9.24, counting from
    // the Sunday (8.30) the month window opens on.
    expect(document.querySelector(".ff-timeline-drop-chip")?.textContent).toBe("9.24");

    // And the ghost is one DAY wide, snapped to that day's own left edge —
    // it is the bar that would be created, and a bar starts at midnight.
    const ghost = document.querySelector(".ff-timeline-drop-ghost") as HTMLElement;
    expect(ghost.style.width).toBe(`${(1 / 35) * 100}%`);
    expect(ghost.style.left).toBe(`${(25 / 35) * 100}%`);
  });

  it("takes the preview away when the pointer leaves the grid", () => {
    draw([task({ id: "bare" })], vi.fn(), vi.fn());

    const transfer = dataTransfer(TRAY_DRAG_MIME, "bare");
    fireEvent.dragStart(chip(), { dataTransfer: transfer });
    const area = dropArea()!;
    standUp(area);
    dragAt(area, "dragOver", 200, transfer);
    expect(document.querySelector(".ff-timeline-drop-chip")).toBeTruthy();

    fireEvent.dragLeave(area);
    expect(document.querySelector(".ff-timeline-drop-chip")).toBeNull();
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

  it("names the weekday where a column IS a day (I7)", () => {
    draw([task({ id: "b1", dueDate: TODAY })]);
    zoomTo("1 week");

    // 2026-09-02 is a Wednesday, and the window starts on the day itself.
    expect(labels()[0]).toBe("9.2 (Wed)");
    expect(labels()[1]).toBe("9.3 (Thu)");
  });

  // A week column covers seven weekdays and a month column thirty: naming the
  // first would be implying the rest.
  it("says none where a column is a week or a month", () => {
    draw([task({ id: "b1", dueDate: TODAY })]);
    zoomTo("1 month");
    // The week the 2nd falls in, which starts on the Sunday before it.
    expect(labels()[0]).toBe("8.30");

    zoomTo("6 months");
    expect(labels()[0]).toBe("2026-09");
  });

  it("names the hour where a column IS an hour", () => {
    draw([task({ id: "b1", dueDate: TODAY })]);
    zoomTo("1 day");
    expect(labels()[0]).toBe("00");
  });
});

// Today, in the ruler (TIMELINE_REFERENCE_PARITY_DESIGN.md §2.2).
//
// This replaces a pill around the column's first day and a band down that
// column. Both named a COLUMN, so both had to be switched off at four of the
// five zooms to stop them making a false statement rather than a vague one —
// on a month window the pill badged `8.30` while today was `9.2`.
//
// The chip is placed from the CLOCK, by the same `windowFraction` the line
// below it uses. So it is exact at every zoom, and the two marks cannot come
// apart. The clock is faked here for exactly that reason: the chip's presence
// is now a fact about `Date.now()` rather than about the `today` prop.
describe("the today chip", () => {
  const chip = () => document.querySelector(".ff-timeline-now-chip");

  afterEach(() => vi.useRealTimers());

  function atNoonOnToday() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  }

  it("is drawn at every zoom, which is what the column pill could not be", () => {
    atNoonOnToday();
    draw([task({ id: "b1", dueDate: TODAY })]);

    for (const zoom of ["1 day", "1 week", "1 month", "6 months", "1 year"]) {
      zoomTo(zoom);
      expect(chip(), `missing at ${zoom}`).not.toBeNull();
    }
  });

  it("goes with the line when today leaves the window", () => {
    vi.useFakeTimers();
    // Two months on. Every window anchored on `today` is behind it.
    vi.setSystemTime(new Date("2026-11-02T12:00:00"));
    draw([task({ id: "b1", dueDate: TODAY })]);

    zoomTo("1 week");
    expect(chip()).toBeNull();
    expect(document.querySelector(".ff-timeline-now-line")).toBeNull();
  });

  // The one thing the two marks must agree on. They are drawn from the same
  // fraction, so this is really a test that nothing re-derived it.
  it("sits at the same fraction as the line", () => {
    atNoonOnToday();
    draw([task({ id: "b1", dueDate: TODAY })]);
    zoomTo("1 week");

    const head = document.querySelector(".ff-timeline-now-head") as HTMLElement;
    const line = document.querySelector(".ff-timeline-now-line") as HTMLElement;
    expect(head.style.left).toBe(line.style.left);
  });
});

// The ruler's upper tier (§7.2). The domain decides where the bands fall
// (`rulerBands`); what is pinned here is that the view draws them in the same
// `fr` units as the columns, and marks the boundary under them.
describe("the ruler's month strip", () => {
  const bands = () => [...document.querySelectorAll(".ff-timeline-band")] as HTMLElement[];

  it("names the month over week columns, splitting where the month does", () => {
    draw([task({ id: "b1", dueDate: TODAY })]);
    zoomTo("1 month");

    // Five weeks from 8.30 — only the first starts in August.
    expect(bands().map((band) => band.textContent)).toEqual(["2026-08", "2026-09"]);
  });

  it("names the year over month columns", () => {
    draw([task({ id: "b1", dueDate: TODAY })]);
    zoomTo("1 year");

    expect(bands().map((band) => band.textContent)).toEqual(["2026", "2027"]);
  });

  // Hours, not column count. A band given an even share drifts away from the
  // rules under it wherever the columns differ in length, which is the
  // arithmetic §17.13 already fixed once for the bars.
  it("sizes a band by time, so an uneven month is drawn the width it is", () => {
    draw([task({ id: "b1", dueDate: TODAY })]);
    zoomTo("6 months");

    // Sep–Dec = 30+31+30+31 = 122 days; Jan–Feb = 31+28 = 59.
    expect(bands().map((band) => band.style.flexGrow)).toEqual([String(122 * 24), String(59 * 24)]);
  });

  it("marks the column where a band begins, and never the first", () => {
    draw([task({ id: "b1", dueDate: TODAY })]);
    zoomTo("1 month");

    const marked = [...document.querySelectorAll(".ff-timeline-col")].map((col) =>
      col.classList.contains("is-band"),
    );
    expect(marked).toEqual([false, true, false, false, false]);
  });
});

// The shape a bar takes when it has no width to describe (D8, 재검토 §1-2).
describe("a bar with one date", () => {
  const bar = () => document.querySelector(".ff-timeline-bar");

  // §4.5 turned this around. D8 chose the diamond for the zooms where a day
  // has no width, and the reference draws one at EVERY width it reaches —
  // because what it marks is a kind, not a measurement. Having refused to add
  // a `milestone` field, the shape stays derived, but by the reference's rule.
  it("is a marker wherever a column is a day or coarser", () => {
    draw([task({ id: "b1", dueDate: TODAY })]);

    for (const zoom of ["1 week", "1 month", "6 months", "1 year"]) {
      zoomTo(zoom);
      expect(bar()?.classList.contains("is-marker"), `not a marker at ${zoom}`).toBe(true);
    }
  });

  // The one exception, and it falls out rather than being written: at the hour
  // zoom a bar's width IS the length of the work and its ends are clock
  // values, so a single date is not "one date with no width" at all.
  it("stays a rectangle at the hour zoom, where a day has real width", () => {
    draw([task({ id: "b1", dueDate: TODAY })]);
    zoomTo("1 day");

    expect(bar()?.classList.contains("is-single")).toBe(false);
    expect(bar()?.classList.contains("is-marker")).toBe(false);
  });

  it("is placed by its centre, having no width to place", () => {
    draw([task({ id: "b1", dueDate: TODAY })]);

    zoomTo("1 month");
    expect(bar()?.classList.contains("is-marker")).toBe(true);
    // Placed by its CENTRE, which is what the stylesheet's -7px pulls back.
    // Half a day into the window: the 2nd is the fourth day of a window that
    // opens on 8.30 and runs 35, so 3.5/35.
    expect((bar() as HTMLElement).style.left).toBe("10%");
    expect((bar() as HTMLElement).style.width).toBe("");
  });

  // Two dates that differ have a width, and a width is the thing a Gantt draws.
  it("leaves a range as a bar at every zoom", () => {
    draw([task({ id: "b1", startDate: "2026-09-02", dueDate: "2026-09-15" })]);

    zoomTo("1 week");
    expect(bar()?.classList.contains("is-marker")).toBe(false);

    zoomTo("1 month");
    expect(bar()?.classList.contains("is-single")).toBe(false);
    expect(bar()?.classList.contains("is-marker")).toBe(false);
    expect((bar() as HTMLElement).style.width).not.toBe("");
  });
});

// The track carries its own width now (§17), and jsdom can read the two custom
// properties that say so even though it cannot lay anything out. What is
// asserted here is the CONTRACT between this component and the stylesheet: a
// floor in pixels, and a ruler cut by time.
describe("a track as wide as its days", () => {
  const pane = () => document.querySelector(".ff-timeline") as HTMLElement;
  const varOf = (name: string) => pane().style.getPropertyValue(name);

  it("hands the stylesheet the floor the zoom asks for", () => {
    draw([task({ id: "b1", dueDate: TODAY })]);

    zoomTo("1 month");
    expect(varOf("--timeline-track-min")).toBe("560px");

    // The two that scroll. 181 days at 7px and 365 at 4 — against a pane that
    // measured 842px in the running app [실측], about 1.8 and 2.0 screens.
    zoomTo("6 months");
    expect(varOf("--timeline-track-min")).toBe("1267px");
    zoomTo("1 year");
    expect(varOf("--timeline-track-min")).toBe("1460px");
  });

  it("cuts the ruler by time rather than into equal slices", () => {
    draw([task({ id: "b1", dueDate: TODAY })]);

    // Seven day columns of 24 hours each.
    zoomTo("1 week");
    expect(varOf("--timeline-column-template")).toBe("24fr 24fr 24fr 24fr 24fr 24fr 24fr");
    // Six month columns, and September is not December. `repeat(6, 1fr)` drew
    // those the same width while the bars inside them were placed by time.
    zoomTo("6 months");
    expect(varOf("--timeline-column-template")).toBe("720fr 744fr 720fr 744fr 744fr 672fr");
  });

  // The scrollport and the canvas are separate boxes, and which one the
  // overlays live in is the whole reason they are (§17): a `right: 0` measured
  // against the scrollport stops at the fold.
  it("puts the overlays inside the canvas and not the scrollport", () => {
    draw([task({ id: "b1", dueDate: TODAY })]);
    const canvas = document.querySelector(".ff-timeline-canvas");
    expect(document.querySelector(".ff-timeline-scroll > .ff-timeline-canvas")).toBe(canvas);
    expect(canvas?.querySelector(".ff-timeline-now")).not.toBeNull();
    expect(canvas?.querySelector(".ff-timeline-head")).not.toBeNull();
  });

  // It scrolls as well as re-anchoring now, so "the window already holds
  // today" stopped being a reason to switch it off.
  it("leaves Today pressable inside the window it returns to", () => {
    draw([task({ id: "b1", dueDate: TODAY })]);
    const today = screen.getByRole("button", { name: "Today" }) as HTMLButtonElement;
    expect(today.disabled).toBe(false);
  });
});

// The focus trace (TIMELINE_REFERENCE_PARITY_DESIGN.md §7.1).
//
// The arithmetic is `focusTrace.test.ts`'s. What is pinned here is that the
// view asks it at all, that a stripe lands inside the bar rather than on the
// track, and that a running session turns the row's date into a stopwatch.
describe("the focus trace", () => {
  const at = (local: string) => new Date(`${local}+09:00`).toISOString();

  function focusSession(over: Partial<FocusSession>): FocusSession {
    return {
      id: "f1",
      taskId: "b1",
      title: "",
      mode: "focus",
      status: "completed",
      durationMinutes: 0,
      accumulatedSeconds: 0,
      completed: true,
      startAt: "",
      endAt: "",
      startedAt: "",
      endedAt: "",
      pausedAt: "",
      segments: [],
      source: "focus_page",
      projectId: "",
      projectName: "",
      focusNote: "",
      createdAt: "",
      updatedAt: "",
      ...over,
    } as FocusSession;
  }

  it("draws a stripe inside the bar for the day the work happened", () => {
    draw(
      [task({ id: "b1", startDate: "2026-09-01", dueDate: "2026-09-04" })],
      vi.fn(),
      vi.fn(),
      [focusSession({ segments: [{ startAt: at("2026-09-02T09:00:00"), endAt: at("2026-09-02T10:00:00") }] })],
    );

    const stripe = document.querySelector(".ff-timeline-bar .ff-timeline-stripe") as HTMLElement;
    expect(stripe).not.toBeNull();
    // The 2nd is the second of four days: a quarter in, a quarter wide.
    expect(stripe.style.left).toBe("25%");
    expect(stripe.style.width).toBe("25%");
    // An hour is the ladder's third rung — `< 60` is the rung below it, so
    // exactly 60 minutes is already "an afternoon of it".
    expect(stripe.style.height).toBe("4.5px");
  });

  it("totals the focus at the bar's right end", () => {
    draw(
      [task({ id: "b1", startDate: "2026-09-01", dueDate: "2026-09-04" })],
      vi.fn(),
      vi.fn(),
      [focusSession({ segments: [{ startAt: at("2026-09-02T09:00:00"), endAt: at("2026-09-02T10:35:00") }] })],
    );

    expect(document.querySelector(".ff-timeline-focus-total")?.textContent).toBe("1h 35m");
  });

  it("draws nothing at all when no session touches the task", () => {
    draw([task({ id: "b1", dueDate: "2026-09-04" })], vi.fn(), vi.fn(), []);

    expect(document.querySelector(".ff-timeline-trace")).toBeNull();
    expect(document.querySelector(".ff-timeline-focus-total")).toBeNull();
  });

  // §9.11: x is now, y is the row. A session running outside the days it was
  // planned for shows up as a node off the end of its own bar, drawn hollow —
  // it is a fact, not an error.
  it("marks a running session on the row, and says when it is off-plan", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
    try {
      draw(
        [task({ id: "b1", startDate: "2026-09-01", dueDate: "2026-09-04" })],
        vi.fn(),
        vi.fn(),
        [focusSession({ status: "running", startAt: new Date(`${TODAY}T11:00:00`).toISOString(), segments: [] })],
      );

      // The task column's date became a stopwatch.
      const meta = document.querySelector(".ff-timeline-meta.is-live");
      expect(meta?.textContent).toBe("1:00:00");

      // TODAY is 9.2, which is inside 9.1 – 9.4, so the node is solid.
      const node = document.querySelector(".ff-timeline-focus-node");
      expect(node).not.toBeNull();
      expect(node?.classList.contains("is-outside")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("draws the node hollow when the work is happening off-plan", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
    try {
      // Planned for later in the week; being worked on today.
      draw(
        [task({ id: "b1", startDate: "2026-09-05", dueDate: "2026-09-06" })],
        vi.fn(),
        vi.fn(),
        [focusSession({ status: "running", startAt: new Date(`${TODAY}T11:00:00`).toISOString(), segments: [] })],
      );

      expect(document.querySelector(".ff-timeline-focus-node")?.classList.contains("is-outside")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
