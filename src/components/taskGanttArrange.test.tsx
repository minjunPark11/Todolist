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
import { cleanup, render, screen } from "@testing-library/react";
import type { List, Task } from "../types";
import { I18nProvider } from "../i18n";
import { TaskGanttView } from "./TaskGanttView";
import { projectItems } from "../domain/view/item";
import { specForSpaceView } from "../domain/view/spaceViews";

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

function draw(tasks: Task[], onOpenItem = vi.fn()) {
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
      />
    </I18nProvider>,
  );
  return { onOpenItem };
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
