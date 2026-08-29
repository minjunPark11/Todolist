// @vitest-environment jsdom
//
// The remainder row and the refusing column
// (TICKTICK_INBOX_COLUMNS_DESIGN.md §6, phase 4).
//
// Both exist for the same reason and neither is visible yet: while the three
// default rules are untouched every task fits a column and every drop is
// accepted. They are built first ON PURPOSE — phase 5 hands out a delete
// button and an editor, and the moment it does, "this task fits nowhere" and
// "this column cannot take that" become states the user can reach. A screen
// that meets them without these two has lost the task.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Task } from "../../types";
import { I18nProvider } from "../../i18n";
import { INBOX_COLUMNS } from "../../domain/tasks/board";
import { TaskBoard } from "./TaskBoard";

afterEach(cleanup);

function task(id: string): Task {
  return { id, title: id, status: "todo", listId: "list-inbox", tags: [] } as Task;
}

function setup(options: { unmatched?: Task[]; refuse?: (taskId: string, columnId: string) => string | null } = {}) {
  const onDrop = vi.fn();
  render(
    <I18nProvider lang="en">
      <TaskBoard
        columns={INBOX_COLUMNS}
        tasksIn={(columnId) => (columnId === "unsorted" ? [task("Drag me")] : [])}
        columnOf={() => "unsorted"}
        openTaskId=""
        onOpen={() => {}}
        onToggleDone={() => {}}
        onDrop={onDrop}
        canReorder
        unmatched={options.unmatched}
        dropRefusal={options.refuse}
      />
    </I18nProvider>,
  );
  return { onDrop };
}

/** Starts a drag the way a card does, so the board knows what is in the air. */
function pickUp(title: string) {
  fireEvent.dragStart(screen.getByText(title).closest("li")!);
}

describe("the remainder", () => {
  it("is absent while every task fits a column", () => {
    setup();
    expect(screen.queryByText(/fit no column/)).toBeNull();
  });

  it("names how many, and lists them", () => {
    setup({ unmatched: [task("Homeless one"), task("Homeless two")] });
    expect(screen.getByText("2 tasks fit no column")).toBeTruthy();
    const row = screen.getByRole("region", { name: "2 tasks fit no column" });
    expect(within(row).getByText("Homeless one")).toBeTruthy();
    expect(within(row).getByText("Homeless two")).toBeTruthy();
  });

  it("is not a place work can be put", () => {
    // No `+`, and it is not a drop target: it reports that some work belongs
    // nowhere, which is not the same as being somewhere.
    setup({ unmatched: [task("Homeless one")] });
    const row = screen.getByRole("region", { name: "1 tasks fit no column" });
    expect(row.className).toContain("tm-column-unmatched");
    expect(within(row).queryByRole("button", { name: /Add a task/ })).toBeNull();
  });
});

describe("a column that will not take the card", () => {
  const refuseSomeday = (_taskId: string, columnId: string) => (columnId === "someday" ? "tag" : null);

  it("says nothing until a card is actually in the air", () => {
    setup({ refuse: refuseSomeday });
    expect(screen.queryByText(/only takes tasks with another tag/)).toBeNull();
  });

  it("says why, on the column, while the card is over the board", () => {
    setup({ refuse: refuseSomeday });
    pickUp("Drag me");
    const someday = screen.getByRole("region", { name: "Someday" });
    expect(within(someday).getByText(/only takes tasks with another tag/)).toBeTruthy();
    expect(someday.className).toContain("is-refusing");
  });

  it("leaves the columns that would accept alone", () => {
    setup({ refuse: refuseSomeday });
    pickUp("Drag me");
    const scheduled = screen.getByRole("region", { name: "Scheduled" });
    expect(scheduled.className).not.toContain("is-refusing");
    expect(within(scheduled).queryByText(/only takes/)).toBeNull();
  });

  it("does not write when the card is dropped on it anyway", () => {
    // The refusal is not decoration. A drop that lands and quietly does
    // nothing is indistinguishable from a bug.
    const { onDrop } = setup({ refuse: refuseSomeday });
    pickUp("Drag me");
    fireEvent.drop(screen.getByRole("region", { name: "Someday" }));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("still writes where the column accepts", () => {
    const { onDrop } = setup({ refuse: refuseSomeday });
    pickUp("Drag me");
    fireEvent.drop(screen.getByRole("region", { name: "Unsorted" }));
    expect(onDrop).toHaveBeenCalledWith("Drag me", "unsorted", expect.any(Number));
  });
});
