// @vitest-environment jsdom
//
// Naming a Board column (TICKTICK_INBOX_COLUMNS_DESIGN.md §6, phase 5a).
//
// Renaming is the one item on the reference app's column menu that could be
// built before the rules reach the screen, and the reason is the property
// these tests keep: a name says nothing about membership. Nothing moves, so
// nothing can end up in a column that no longer exists — which is what the
// other four items would risk without phase 4's remainder row.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Task } from "../../types";
import { I18nProvider } from "../../i18n";
import { COLUMN_NAME_MAX, inboxBoardColumns, sanitizeInboxColumnNames } from "../../domain/tasks/board";
import { TaskBoard } from "./TaskBoard";

afterEach(cleanup);

function setup(names: Record<string, string> = {}, withRename = true) {
  const onRename = vi.fn();
  render(
    <I18nProvider lang="en">
      <TaskBoard
        columns={inboxBoardColumns(names)}
        tasksIn={() => [] as Task[]}
        columnOf={() => "unsorted"}
        openTaskId=""
        onOpen={() => {}}
        onToggleDone={() => {}}
        onDrop={() => {}}
        canReorder
        onRename={withRename ? onRename : undefined}
      />
    </I18nProvider>,
  );
  return { onRename };
}

const openEditor = (column: string) => {
  fireEvent.click(screen.getByRole("button", { name: `Rename ${column}` }));
  return screen.getByRole("textbox", { name: `Rename ${column}` }) as HTMLInputElement;
};

describe("naming a column", () => {
  it("opens seeded with the name on screen, built-in ones included", () => {
    setup();
    // An empty box would ask the user to remember what the column was called
    // before they can adjust it.
    expect(openEditor("Someday").value).toBe("Someday");
  });

  it("commits on Enter, trimmed", () => {
    const { onRename } = setup();
    const field = openEditor("Someday");
    fireEvent.change(field, { target: { value: "  Later maybe  " } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("someday", "Later maybe");
  });

  it("commits on blur — clicking away from a name you typed reads as done", () => {
    const { onRename } = setup();
    const field = openEditor("Unsorted");
    fireEvent.change(field, { target: { value: "Inbox pile" } });
    fireEvent.blur(field);
    expect(onRename).toHaveBeenCalledWith("unsorted", "Inbox pile");
  });

  it("Escape puts back what was there and writes nothing", () => {
    const { onRename } = setup();
    const field = openEditor("Unsorted");
    fireEvent.change(field, { target: { value: "Discarded" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("shows the user's name where they set one", () => {
    setup({ someday: "Later maybe" });
    expect(screen.getByRole("button", { name: "Rename Later maybe" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Rename Someday" })).toBeNull();
  });

  it("is not offered where the columns are not the user's to name", () => {
    setup({}, false);
    expect(screen.queryByRole("button", { name: /Rename/ })).toBeNull();
    expect(screen.getByRole("heading", { name: "Someday" })).toBeTruthy();
  });
});

describe("what a stored name may be", () => {
  it("drops a cleared name rather than storing a blank", () => {
    // "Cleared" and "never named" have to stay the same state, or a column
    // ends up with an empty header and no way back to its own label.
    expect(sanitizeInboxColumnNames({ someday: "   " })).toEqual({});
    expect(inboxBoardColumns({}).map((column) => column.name)).toEqual([undefined, undefined, undefined]);
  });

  it("caps a long one instead of refusing it", () => {
    const long = "x".repeat(COLUMN_NAME_MAX + 20);
    expect(sanitizeInboxColumnNames({ unsorted: long }).unsorted).toHaveLength(COLUMN_NAME_MAX);
  });

  it("keeps only the three columns it knows", () => {
    expect(sanitizeInboxColumnNames({ someday: "Later", nope: "x", scheduled: 7 })).toEqual({ someday: "Later" });
    expect(sanitizeInboxColumnNames("names")).toEqual({});
  });

  it("leaves the rule alone — a name is not a condition", () => {
    // The whole reason this could ship before phase 4: renaming moves nothing.
    const named = inboxBoardColumns({ scheduled: "This week" });
    expect(named[1]).toMatchObject({ id: "scheduled", requiresDate: true, name: "This week" });
  });
});
