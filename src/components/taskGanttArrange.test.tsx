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
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { List, Task } from "../types";
import type { TaskMutation } from "../domain/tasks/mutations";
import { I18nProvider } from "../i18n";
import { TaskGanttView } from "./TaskGanttView";
import { TRAY_DRAG_MIME } from "./TimelineView";
import { projectItems } from "../domain/view/item";
import { specForSpaceView } from "../domain/view/spaceViews";
import { timelineWindow } from "../domain/view/timeline";

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
// GANTT_TIMELINE_DESIGN.md §11. The title is drawn twice on a row — in the
// label column and inside the bar — and at the default zoom half the bars are
// too narrow to hold it. The bar's copy gives way; the tooltip is what a
// narrow bar has left to say what it is.
describe("a bar that cannot hold its title", () => {
  it("names itself in the tooltip, ahead of its dates", () => {
    draw([task({ id: "b1", title: "Project A", startDate: "2026-09-08", dueDate: "2026-09-15" })]);

    const bar = document.querySelector(".ff-timeline-bar");
    // The name first: the dates alone do not say which task this is, and on a
    // narrow bar they would be all there is.
    expect(bar?.getAttribute("title")).toBe("Project A · 2026-09-08 → 2026-09-15");
  });

  // The hiding itself is a container query on the bar's own width, which jsdom
  // has no layout to answer — measured in the running app instead (§11.3).
  it("keeps the text in the DOM for the widths that can show it", () => {
    draw([task({ id: "b1", title: "Project A", startDate: "2026-09-08", dueDate: "2026-09-15" })]);
    expect(document.querySelector(".ff-timeline-bar-text")?.textContent).toContain("Project A");
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

  it("writes the deadline of the column it was let go over", () => {
    const onMutateTask = vi.fn();
    draw([task({ id: "bare", title: "Has neither" })], vi.fn(), onMutateTask);

    const transfer = dataTransfer(TRAY_DRAG_MIME, "bare");
    fireEvent.dragStart(chip(), { dataTransfer: transfer });
    fireEvent.drop(lanes()[3], { dataTransfer: transfer });

    expect(onMutateTask).toHaveBeenCalledTimes(1);
    const [target, mutation] = onMutateTask.mock.calls[0];
    const patch = mutation.patch;
    expect(target.id).toBe("bare");
    // §3.4: it arrives as something that can be taken back, and the undo is
    // the field's PREVIOUS value — empty, because this Task had no deadline.
    expect(mutation.undo).toEqual({ dueDate: "" });
    expect(mutation.labelKey).toBe("tasks.undoDateChanged");
    // The view opens on `1개월`, which is cut into WEEKS (§12) — so the fourth
    // column is three weeks out, and the date written is the day that week
    // BEGINS (§3.3). Not the day the pointer was over: at this zoom there is
    // no such day, which is the whole reason that rule exists.
    expect(patch).toEqual({ dueDate: timelineWindow("month", TODAY).edges[3] });
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