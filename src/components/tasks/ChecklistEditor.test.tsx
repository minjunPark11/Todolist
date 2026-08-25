// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CheckItem } from "../../types";
import { I18nProvider } from "../../i18n";
import { ChecklistEditor } from "./ChecklistEditor";

afterEach(cleanup);

const NOW = "2026-08-25T00:00:00.000Z";

function item(id: string, text: string, checked = false): CheckItem {
  return {
    id,
    taskId: "t1",
    text,
    checked,
    completedAt: checked ? NOW : "",
    sortKey: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function setup(items: CheckItem[] = []) {
  const handlers = {
    onAdd: vi.fn(),
    onAddMany: vi.fn(),
    onRename: vi.fn(),
    onToggle: vi.fn(),
    onDelete: vi.fn(),
  };
  render(
    <I18nProvider lang="en">
      <ChecklistEditor items={items} {...handlers} />
    </I18nProvider>,
  );
  return handlers;
}

const draft = () => screen.getByLabelText("Add an item") as HTMLInputElement;
const rows = () => screen.getAllByLabelText("Checklist item") as HTMLInputElement[];

describe("adding a line (spec §11.22, §11.23)", () => {
  it("writes a record only once there is text", () => {
    const { onAdd } = setup();

    fireEvent.change(draft(), { target: { value: "Prepare slides" } });
    // Still nothing: the draft row is not a record.
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.keyDown(draft(), { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith("Prepare slides");
  });

  it("clears itself so the next line can be typed straight away (§11.26)", () => {
    setup();
    fireEvent.change(draft(), { target: { value: "Prepare slides" } });
    fireEvent.keyDown(draft(), { key: "Enter" });

    expect(draft().value).toBe("");
  });

  // §11.27: Enter on an empty row ends the editing rather than leaving an
  // empty record behind — there is none to leave, which is the point.
  it("writes nothing on Enter in an empty row", () => {
    const { onAdd } = setup();
    fireEvent.keyDown(draft(), { key: "Enter" });

    expect(onAdd).not.toHaveBeenCalled();
  });

  // §11.31
  it("refuses a line that is only whitespace", () => {
    const { onAdd } = setup();
    fireEvent.change(draft(), { target: { value: "    " } });
    fireEvent.keyDown(draft(), { key: "Enter" });

    expect(onAdd).not.toHaveBeenCalled();
  });

  // §11.30: clicking away is not a reason to throw the text out.
  it("commits what was typed when the row loses focus", () => {
    const { onAdd } = setup();
    fireEvent.change(draft(), { target: { value: "Email professor" } });
    fireEvent.blur(draft());

    expect(onAdd).toHaveBeenCalledWith("Email professor");
  });

  // §9.26, same reason as every other field: an IME fires Enter to end a
  // composition, and taking it for "done" cuts the word in half.
  it("does not commit on the Enter that ends an IME composition", () => {
    const { onAdd } = setup();
    fireEvent.change(draft(), { target: { value: "한글" } });
    fireEvent.keyDown(draft(), { key: "Enter", isComposing: true });

    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe("pasting several lines (§11.33, §11.34)", () => {
  it("makes one item per line, in one action", () => {
    const { onAddMany, onAdd } = setup();
    fireEvent.paste(draft(), {
      clipboardData: { getData: () => "Prepare slides\nEmail professor\r\nCheck data" },
    });

    expect(onAddMany).toHaveBeenCalledWith(["Prepare slides", "Email professor", "Check data"]);
    // Not one call per line: a paste is one Undo.
    expect(onAddMany).toHaveBeenCalledOnce();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("drops the blank lines in a pasted block", () => {
    const { onAddMany } = setup();
    fireEvent.paste(draft(), { clipboardData: { getData: () => "First\n\n  \nSecond" } });

    expect(onAddMany).toHaveBeenCalledWith(["First", "Second"]);
  });

  it("keeps text already typed in the row rather than replacing it", () => {
    const { onAddMany } = setup();
    fireEvent.change(draft(), { target: { value: "Typed first" } });
    fireEvent.paste(draft(), { clipboardData: { getData: () => "Pasted one\nPasted two" } });

    expect(onAddMany).toHaveBeenCalledWith(["Typed first", "Pasted one", "Pasted two"]);
  });

  it("leaves a single-line paste to the browser", () => {
    const { onAddMany } = setup();
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => "one line" } });
    fireEvent(draft(), event);

    expect(onAddMany).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("editing an existing line", () => {
  it("ticks it", () => {
    const { onToggle } = setup([item("c1", "Prepare slides")]);
    fireEvent.click(screen.getByLabelText("Prepare slides"));

    expect(onToggle).toHaveBeenCalledWith("c1");
  });

  it("renames it on Enter", () => {
    const { onRename } = setup([item("c1", "Prepare slides")]);
    fireEvent.change(rows()[0], { target: { value: "Prepare the slides" } });
    fireEvent.keyDown(rows()[0], { key: "Enter" });

    expect(onRename).toHaveBeenCalledWith("c1", "Prepare the slides");
  });

  // §11.30: an item edited down to nothing is an item the user removed. There
  // is no empty-item state for it to sit in.
  it("deletes it when the text is cleared", () => {
    const { onDelete, onRename } = setup([item("c1", "Prepare slides")]);
    fireEvent.change(rows()[0], { target: { value: "" } });
    fireEvent.blur(rows()[0]);

    expect(onDelete).toHaveBeenCalledWith("c1");
    expect(onRename).not.toHaveBeenCalled();
  });

  // §11.28
  it("deletes an empty line on Backspace", () => {
    const { onDelete } = setup([item("c1", "First"), item("c2", "")]);
    fireEvent.keyDown(rows()[1], { key: "Backspace" });

    expect(onDelete).toHaveBeenCalledWith("c2");
  });

  // §11.29 is explicit: Backspace inside text is text editing, not a delete.
  it("leaves Backspace alone in a line that has text", () => {
    const { onDelete } = setup([item("c1", "Prepare slides")]);
    fireEvent.keyDown(rows()[0], { key: "Backspace" });

    expect(onDelete).not.toHaveBeenCalled();
  });

  it("moves focus to the next line on Enter, so a list can be walked down", () => {
    setup([item("c1", "First"), item("c2", "Second")]);
    rows()[0].focus();
    fireEvent.keyDown(rows()[0], { key: "Enter" });

    expect(document.activeElement).toBe(rows()[1]);
  });

  it("moves focus to the draft row from the last line", () => {
    setup([item("c1", "Only")]);
    rows()[0].focus();
    fireEvent.keyDown(rows()[0], { key: "Enter" });

    expect(document.activeElement).toBe(draft());
  });

  it("goes back to the previous line after a Backspace delete (§11.28)", () => {
    setup([item("c1", "First"), item("c2", "")]);
    rows()[1].focus();
    fireEvent.keyDown(rows()[1], { key: "Backspace" });

    expect(document.activeElement).toBe(rows()[0]);
  });

  it("removes a line from its own button", () => {
    const { onDelete } = setup([item("c1", "Prepare slides")]);
    fireEvent.click(screen.getByLabelText("Delete"));

    expect(onDelete).toHaveBeenCalledWith("c1");
  });
});

// §11.21
describe("an empty checklist", () => {
  it("says it is empty rather than showing a bare row", () => {
    setup();
    expect(screen.getByText("No items yet.")).toBeTruthy();
  });

  it("stops saying so once there is a line", () => {
    setup([item("c1", "Prepare slides")]);
    expect(screen.queryByText("No items yet.")).toBeNull();
  });
});
