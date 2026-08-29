// @vitest-environment jsdom
//
// The column's "완료" group (TICKTICK_INBOX_COLUMNS_DESIGN.md §6, phase 2).
//
// The group exists so that a ticked card lands somewhere the eye can find it
// rather than vanishing. What has to hold is that it stays a SEPARATE half:
// finished work below the open work, collapsed, capped, and never counted in
// the number on the column's head — that number is how much is left to do.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Task } from "../../types";
import { I18nProvider } from "../../i18n";
import { INBOX_COLUMNS } from "../../domain/tasks/board";
import { TaskBoard } from "./TaskBoard";

afterEach(cleanup);

const NOW = "2026-08-29T09:00:00.000Z";

function task(id: string, overrides: Partial<Task> = {}): Task {
  return { id, title: id, status: "todo", listId: "list-inbox", tags: [], ...overrides } as Task;
}

function setup(open: Task[], finished: Task[]) {
  render(
    <I18nProvider lang="en">
      <TaskBoard
        columns={INBOX_COLUMNS}
        tasksIn={(columnId) => (columnId === "unsorted" ? open : [])}
        finishedIn={(columnId) => (columnId === "unsorted" ? finished : [])}
        columnOf={() => "unsorted"}
        openTaskId=""
        onOpen={() => {}}
        onToggleDone={vi.fn()}
        onDrop={() => {}}
        canReorder
      />
    </I18nProvider>,
  );
  return screen.getByRole("region", { name: "Unsorted" });
}

const finishedTask = (id: string) => task(id, { status: "done", completedAt: NOW });

describe("a Board column's finished work", () => {
  it("is collapsed to a count, and the cards are not in the DOM until asked for", () => {
    const column = setup([task("Open one")], [finishedTask("Done one")]);
    const head = within(column).getByRole("button", { name: /Completed/ });
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(within(column).queryByText("Done one")).toBeNull();
    // A working surface shows what is left to do. Finished work open by
    // default would push that below the fold on the one screen where it is
    // the whole question.
    expect(head.textContent).toContain("1");

    fireEvent.click(head);
    expect(within(column).getByText("Done one")).toBeTruthy();
  });

  it("is not drawn at all where there is none", () => {
    const column = setup([task("Open one")], []);
    expect(within(column).queryByRole("button", { name: /Completed/ })).toBeNull();
  });

  it("caps at five and then asks", () => {
    const many = Array.from({ length: 7 }, (_, index) => finishedTask(`Done ${index + 1}`));
    const column = setup([], many);
    fireEvent.click(within(column).getByRole("button", { name: /Completed/ }));

    expect(within(column).getByText("Done 5")).toBeTruthy();
    expect(within(column).queryByText("Done 6")).toBeNull();

    fireEvent.click(within(column).getByRole("button", { name: "Show more" }));
    expect(within(column).getByText("Done 7")).toBeTruthy();
    // Nothing left to ask for, so the link goes.
    expect(within(column).queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("keeps the head's count on the open work alone", () => {
    const column = setup([task("Open one"), task("Open two")], [finishedTask("Done one")]);
    // Two numbers on one column, and they mean different things: the head says
    // what is left, the group says what is behind. Adding the finished work to
    // the head would make neither readable.
    const head = within(column).getByRole("heading", { name: "Unsorted" }).parentElement!;
    expect(head.textContent).toContain("2");
    expect(head.textContent).not.toContain("3");
  });

  it("is drawn below the open cards, not above them", () => {
    const column = setup([task("Open one")], [finishedTask("Done one")]);
    const cards = within(column).getByLabelText("Unsorted", { selector: "ul" });
    const done = column.querySelector(".tm-column-done")!;
    expect(cards.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
