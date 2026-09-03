// @vitest-environment jsdom
//
// The Trash's List section (TRASH_PERMANENT_DELETE_DESIGN.md §16.3, §16.4).
//
// What is pinned here is the reversal itself — a deleted List IS a row in the
// Trash now — and the two things §16.4 decided about how it is drawn: no
// Detail, and the destructive half behind a question that says the number.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { List, Task } from "../../types";
import { I18nProvider } from "../../i18n";
import { TrashLists } from "./TrashLists";
import { ListDeleteForeverGate } from "./ListDeleteForeverGate";
import { TrashEmptyGate } from "./TrashEmptyGate";

const NOW = "2026-09-03T09:00:00.000Z";

afterEach(cleanup);

function list(id: string, name: string, state: Partial<List> = {}): List {
  return {
    id,
    name,
    projectId: "",
    kind: "regular",
    order: 0,
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...state,
  } as unknown as List;
}

function task(id: string, listId: string, extra: Partial<Task> = {}): Task {
  return { id, title: id, listId, parentTaskId: "", ...extra } as unknown as Task;
}

function draw(lists: List[], tasks: Task[] = []) {
  const onRestore = vi.fn();
  const onDeleteForever = vi.fn();
  render(
    <I18nProvider lang="en">
      <TrashLists lists={lists} tasks={tasks} onRestore={onRestore} onDeleteForever={onDeleteForever} />
    </I18nProvider>,
  );
  return { onRestore, onDeleteForever };
}

describe("the Lists in the Trash", () => {
  it("is absent entirely while every List is live", () => {
    // Not an empty heading: a permanent report that nothing was deleted, on
    // the screen about what was.
    draw([list("l1", "Work")]);
    expect(document.querySelector(".tm-trash-lists")).toBeNull();
  });

  it("draws what was thrown away, with the work that would come back with it", () => {
    draw([list("l1", "Work", { deletedAt: NOW })], [task("t1", "l1"), task("t2", "l1"), task("t3", "l2")]);

    const row = screen.getByText("Work").closest("li") as HTMLElement;
    expect(within(row).getByText("2 tasks")).toBeTruthy();
  });

  it("says so when a row is a leftover from archiving", () => {
    // Archiving is gone (§16.6); the word is what stops the reader wondering
    // why they cannot remember deleting it.
    draw([list("l1", "Work", { archivedAt: NOW }), list("l2", "Home", { deletedAt: NOW })]);

    const archived = screen.getByText("Work").closest("li") as HTMLElement;
    const deleted = screen.getByText("Home").closest("li") as HTMLElement;
    expect(within(archived).getByText("Archived")).toBeTruthy();
    expect(within(deleted).queryByText("Archived")).toBeNull();
  });

  it("puts the thrown-away above the leftovers", () => {
    draw([list("l1", "Archived one", { archivedAt: NOW }), list("l2", "Deleted one", { deletedAt: NOW })]);

    const names = [...document.querySelectorAll(".tm-trash-list .tm-task-title")].map((n) => n.textContent);
    expect(names).toEqual(["Deleted one", "Archived one"]);
  });

  it("restores from the row, and asks before deleting", async () => {
    const user = userEvent.setup();
    const { onRestore, onDeleteForever } = draw([list("l1", "Work", { deletedAt: NOW })]);

    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(onRestore).toHaveBeenCalledWith("l1");

    // The destructive half does not act: it hands the id up, and the caller
    // opens the question (§16.4).
    await user.click(screen.getByRole("button", { name: "Delete forever" }));
    expect(onDeleteForever).toHaveBeenCalledWith("l1");
  });
});

describe("the question a List's permanent delete asks", () => {
  it("says how many tasks go with it — the fact the verb hides", () => {
    render(
      <I18nProvider lang="en">
        <ListDeleteForeverGate
          list={list("l1", "Work", { deletedAt: NOW })}
          tasks={[task("t1", "l1"), task("t2", "l1"), task("t3", "l2")]}
          onCancel={() => {}}
          onConfirm={() => {}}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/Delete "Work" forever\?/)).toBeTruthy();
    expect(screen.getByText(/2 tasks/)).toBeTruthy();
  });

  it("is closed by having no List, like its two neighbours", () => {
    render(
      <I18nProvider lang="en">
        <ListDeleteForeverGate list={null} tasks={[]} onCancel={() => {}} onConfirm={() => {}} />
      </I18nProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("the question emptying the Trash asks (§16.5)", () => {
  function ask(summary: { tasks: number; lists: number; tasksWithLists: number } | null) {
    render(
      <I18nProvider lang="en">
        <TrashEmptyGate summary={summary} onCancel={() => {}} onConfirm={() => {}} />
      </I18nProvider>,
    );
  }

  it("says the Lists and the work inside them, separately from the task count", () => {
    // Separately, because the work inside a trashed List carries no
    // `deletedAt`: it is not in the first number, and one combined figure
    // would match neither the rows on screen nor what is about to go.
    ask({ tasks: 12, lists: 2, tasksWithLists: 5 });

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("12 tasks");
    expect(dialog.textContent).toContain("2 lists go too, and the 5 tasks inside them");
  });

  it("says nothing about Lists when there are none", () => {
    ask({ tasks: 3, lists: 0, tasksWithLists: 0 });
    expect(screen.getByRole("dialog").textContent).not.toContain("lists go too");
  });

  it("opens for a Trash holding only a List", () => {
    // The header's button appears for this case too, so the question has to.
    ask({ tasks: 0, lists: 1, tasksWithLists: 4 });
    expect(screen.getByRole("dialog").textContent).toContain("1 lists go too, and the 4 tasks inside them");
  });

  it("is closed when there is nothing to take", () => {
    ask({ tasks: 0, lists: 0, tasksWithLists: 0 });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
