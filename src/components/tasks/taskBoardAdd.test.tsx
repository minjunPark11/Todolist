// @vitest-environment jsdom
//
// The column's `+` (TICKTICK_INBOX_COLUMNS_DESIGN.md §6, phase 1).
//
// What is worth pinning here is not that typing produces a task — it is the
// column that CANNOT accept one without a date. §6.25 makes `일정` a date, so a
// title typed there with no day would be committed into the column beside it,
// which is §27.3's bug arriving through a different door. The form has to
// refuse before it writes, and it has to say so on screen rather than by doing
// nothing when Enter is pressed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Task } from "../../types";
import { I18nProvider } from "../../i18n";
import { INBOX_COLUMNS } from "../../domain/tasks/board";
import { TaskBoard } from "./TaskBoard";

afterEach(cleanup);

function setup(overrides: { onCreate?: ((columnId: string, title: string, date: string) => void) | undefined } = {}) {
  const onCreate = "onCreate" in overrides ? overrides.onCreate : vi.fn();
  render(
    <I18nProvider lang="en">
      <TaskBoard
        columns={INBOX_COLUMNS}
        tasksIn={() => [] as Task[]}
        columnOf={() => "unsorted"}
        openTaskId=""
        onOpen={() => {}}
        onToggleDone={() => {}}
        onDrop={() => {}}
        canReorder
        onCreate={onCreate}
      />
    </I18nProvider>,
  );
  return { onCreate };
}

function openAdd(column: string) {
  fireEvent.click(screen.getByRole("button", { name: `Add a task to ${column}` }));
  return screen.getByRole("textbox", { name: `Add a task to ${column}` });
}

describe("the Board column's +", () => {
  it("every column offers one, and opening one closes the last", () => {
    setup();
    const unsorted = screen.getByRole("button", { name: "Add a task to Unsorted" });
    openAdd("Unsorted");
    expect(unsorted.getAttribute("aria-expanded")).toBe("true");

    openAdd("Someday");
    // Two carets on one screen, with nothing saying which one Enter belongs
    // to, is the state this avoids.
    expect(unsorted.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("hands the column, the words and the date to the caller — and decides nothing itself", () => {
    const { onCreate } = setup();
    const field = openAdd("Someday");
    fireEvent.change(field, { target: { value: "  Read the paper  " } });
    fireEvent.submit(field.closest("form")!);
    // Trimmed, because a title of spaces is not a title. Everything else about
    // what "someday" means belongs to the domain, not to this component.
    expect(onCreate).toHaveBeenCalledWith("someday", "Read the paper", "");
  });

  it("refuses the scheduled column until a day is given", () => {
    const { onCreate } = setup();
    const field = openAdd("Scheduled");
    fireEvent.change(field, { target: { value: "Dentist" } });

    const submit = screen.getByRole("button", { name: "Add" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.submit(field.closest("form")!);
    expect(onCreate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-09-01" } });
    expect(submit.disabled).toBe(false);
    fireEvent.submit(field.closest("form")!);
    expect(onCreate).toHaveBeenCalledWith("scheduled", "Dentist", "2026-09-01");
  });

  it("asks for the day only where the column is one", () => {
    setup();
    openAdd("Unsorted");
    expect(screen.queryByLabelText("Date")).toBeNull();
  });

  it("keeps the day and clears the title, so the next one is one keystroke away", () => {
    const { onCreate } = setup();
    const field = openAdd("Scheduled");
    fireEvent.change(field, { target: { value: "First" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-09-01" } });
    fireEvent.submit(field.closest("form")!);

    expect((field as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-09-01");
    fireEvent.change(field, { target: { value: "Second" } });
    fireEvent.submit(field.closest("form")!);
    expect(onCreate).toHaveBeenLastCalledWith("scheduled", "Second", "2026-09-01");
  });

  it("Escape closes the input without writing anything", () => {
    const { onCreate } = setup();
    const field = openAdd("Unsorted");
    fireEvent.change(field, { target: { value: "Never mind" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("draws no + at all where the Scope cannot create", () => {
    // MATRIX §27.3: a control that could only fail is not a control.
    setup({ onCreate: undefined });
    expect(screen.queryByRole("button", { name: /Add a task to/ })).toBeNull();
  });
});
