// @vitest-environment jsdom
//
// Committing a quick-add without pressing anything.
//
// Enter already worked wherever the resolution was ready; what it was not, on
// Upcoming, was ready — §12.6 held the form until a date was typed, so the
// key did nothing and the button was the only way through. That refusal is
// gone (createResolver "upcoming"), and leaving the field now commits too.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TaskScopeRef } from "../../domain/tasks/scopeRegistry";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { TaskQuickAdd } from "./TaskQuickAdd";

afterEach(cleanup);

const TODAY = "2026-08-29";
const INBOX = "list-inbox";

function setup(scope: TaskScopeRef = { kind: "upcoming" }) {
  const onCreate = vi.fn();
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <TaskQuickAdd
          scope={scope}
          lists={[{ id: INBOX, name: "Inbox", kind: "inbox" } as never]}
          inboxListId={INBOX}
          today={TODAY}
          folderLists={[]}
          folders={[]}
          tags={[]}
          savedFilters={[]}
          templates={[]}
          onUseTemplate={() => {}}
          draftTitle=""
          onCreate={onCreate}
        />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
  // The field's name carries the List the task will land in now
  // (TICKTICK_COMPONENT_10 §10.3), so this matches the head of it rather than
  // the whole string.
  return { onCreate, field: screen.getByRole("textbox", { name: /^Add a task/ }) as HTMLInputElement };
}

describe("Upcoming's quick add", () => {
  it("asks for no date at all", () => {
    setup();
    expect(screen.queryByLabelText("Date")).toBeNull();
  });

  it("commits on Enter, dated the first day the Scope covers", () => {
    const { onCreate, field } = setup();
    fireEvent.change(field, { target: { value: "Book the room" } });
    fireEvent.submit(field.closest("form")!);

    expect(onCreate).toHaveBeenCalledTimes(1);
    const [title, resolution] = onCreate.mock.calls[0];
    expect(title).toBe("Book the room");
    // Not a guess in the sense §12.6 feared: the task lands at the top of the
    // very list it was typed into, rather than somewhere out of sight.
    expect(resolution.patch.dueDate).toBe(TODAY);
    expect(resolution.targetListId).toBe(INBOX);
    expect(field.value).toBe("");
  });
});

describe("leaving the field", () => {
  it("commits what is in it", () => {
    const { onCreate, field } = setup({ kind: "inbox" });
    fireEvent.change(field, { target: { value: "Typed and walked away" } });
    fireEvent.blur(field);
    expect(onCreate).toHaveBeenCalledWith("Typed and walked away", expect.objectContaining({ targetListId: INBOX }));
  });

  it("does nothing when there is nothing in it", () => {
    const { onCreate, field } = setup({ kind: "inbox" });
    fireEvent.blur(field);
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.blur(field);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("is not a commit when focus stays inside the form", () => {
    // The trailing slot is part of answering the same question — reaching for
    // the date or the menu is not walking away from the task being typed.
    const { onCreate, field } = setup({ kind: "inbox" });
    fireEvent.change(field, { target: { value: "Still deciding" } });
    fireEvent.blur(field, { relatedTarget: screen.getByRole("button", { name: "More options" }) });
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("commits once, not twice, when the form is then submitted", () => {
    const { onCreate, field } = setup({ kind: "inbox" });
    fireEvent.change(field, { target: { value: "One task" } });
    fireEvent.blur(field, { relatedTarget: screen.getByRole("button", { name: "More options" }) });
    fireEvent.submit(field.closest("form")!);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});

// The row's own shape (TICKTICK_COMPONENT_10_QUICK_ADD.md §10).
describe("the quick add as one quiet row", () => {
  it("offers no commit button at all — typing does not summon one", () => {
    // QUICK_ADD_INPUT_BOX_DESIGN.md §3.2. Two things commit this form and
    // neither is a button: Enter, and a click outside it. The reference draws
    // no button beside a typed title either.
    const { field } = setup({ kind: "inbox" });
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();

    fireEvent.change(field, { target: { value: "Something" } });
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
  });

  it("stands the day and the menu at the trailing edge, typed or not (§3)", () => {
    const { field } = setup({ kind: "inbox" });
    const trailing = document.querySelector(".tm-quickadd-trailing") as HTMLElement;
    expect(trailing).toBeTruthy();
    expect(trailing.querySelector(".tm-quickadd-date")).toBeTruthy();
    expect(trailing.querySelector(".tm-quickadd-more")).toBeTruthy();

    fireEvent.change(field, { target: { value: "Something" } });
    expect(document.querySelectorAll(".tm-quickadd-trailing").length).toBe(1);
  });

  it("says which List the task will land in", () => {
    // The one thing this screen never said. Today, a Tag and a Filter all
    // resolve to a List the reader cannot see (§10.3).
    const { field } = setup({ kind: "inbox" });
    expect(field.getAttribute("placeholder")).toBe("Add a task to Inbox");
    expect(field.getAttribute("aria-label")).toBe("Add a task to Inbox");
  });

  it("keeps the leading + as a fixture, hidden rather than removed", () => {
    // Removing it would pull the first letter typed to the left.
    const { field } = setup({ kind: "inbox" });
    const icon = document.querySelector(".tm-quickadd-icon") as HTMLElement;
    expect(icon.className).not.toContain("is-typing");

    fireEvent.change(field, { target: { value: "Typing" } });
    expect(document.querySelector(".tm-quickadd-icon")?.className).toContain("is-typing");
  });

  it("draws nothing under the row when the Scope needs nothing", () => {
    setup({ kind: "inbox" });
    expect(document.querySelector(".tm-quickadd-extras")?.children.length).toBe(0);
  });

  it("puts the Folder's List question under the row, not in it", () => {
    // A Folder must be asked which List (§12.4), and that is not a question
    // that belongs on the line where a title is typed.
    setup({ kind: "folder", id: "f1" });
    const extras = document.querySelector(".tm-quickadd-extras") as HTMLElement;
    expect(extras.querySelector("select")).toBeTruthy();
    expect(document.querySelector(".tm-quickadd-box select")).toBeNull();
  });
});

// The trailing slot and its menu (QUICK_ADD_INPUT_BOX_DESIGN.md §3–§5).
//
// What these hold is the layering rule: the draft goes OVER the Scope's
// answer, and a field nobody touched still comes from the Scope.
describe("what the quick add can be told before the task exists", () => {
  function open() {
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
  }

  it("says the day the Scope already decided (§3.1)", () => {
    // Upcoming has been writing `dueDate: today` on its own since §12.6 was
    // lifted — without ever showing it.
    setup({ kind: "upcoming" });
    expect(screen.getByRole("button", { name: "Today" })).toBeTruthy();

    cleanup();
    // The Inbox contributes no day, so the slot says it has none rather than
    // inventing one.
    setup({ kind: "inbox" });
    expect(screen.getByRole("button", { name: "Date" })).toBeTruthy();
  });

  it("carries a chosen priority into the patch, and leaves the Scope's alone", () => {
    const { onCreate, field } = setup({ kind: "inbox" });
    open();
    fireEvent.click(screen.getByRole("radio", { name: "High" }));
    fireEvent.change(field, { target: { value: "Urgent thing" } });
    fireEvent.submit(field.closest("form")!);

    expect(onCreate).toHaveBeenCalledWith("Urgent thing", expect.objectContaining({
      patch: expect.objectContaining({ priority: "high" }),
    }));
  });

  it("sends no priority at all when nobody chose one (§8.9)", () => {
    const { onCreate, field } = setup({ kind: "inbox" });
    fireEvent.change(field, { target: { value: "Plain" } });
    fireEvent.submit(field.closest("form")!);

    const [, resolution] = onCreate.mock.calls[0];
    expect("priority" in resolution.patch).toBe(false);
  });

  it("keeps the choices after a commit and clears only the title (§5.2)", () => {
    const { onCreate, field } = setup({ kind: "inbox" });
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Medium" }));
    fireEvent.change(field, { target: { value: "One" } });
    fireEvent.submit(field.closest("form")!);
    expect(field.value).toBe("");

    fireEvent.change(field, { target: { value: "Two" } });
    fireEvent.submit(field.closest("form")!);
    expect(onCreate).toHaveBeenLastCalledWith("Two", expect.objectContaining({
      patch: expect.objectContaining({ priority: "medium" }),
    }));
  });

  it("turns into a note, and a note is the only thing with a button (§3.2, §7.2)", () => {
    const { onCreate, field } = setup({ kind: "inbox" });
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Convert to Note" }));

    const note = screen.getByRole("textbox", { name: "Record inspiration and time" }) as HTMLInputElement;
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();

    fireEvent.change(note, { target: { value: "An idea" } });
    fireEvent.submit(note.closest("form")!);
    expect(onCreate).toHaveBeenCalledWith("An idea", expect.objectContaining({
      patch: expect.objectContaining({ kind: "note" }),
    }));
    // `field` is the same element — the mode changes what it says, not which
    // control it is.
    expect(field).toBe(note);
  });
});

// The chip opens the app's own schedule editor, with 취소 where the Detail has
// 일정 지우기 (QUICK_ADD_INPUT_BOX_DESIGN.md §6.4).
describe("the date chip", () => {
  it("opens the same editor the Task Detail opens", () => {
    setup({ kind: "inbox" });
    fireEvent.click(screen.getByRole("button", { name: "Date" }));

    // The editor's own tabs and shortcuts, not a stand-in built for here.
    expect(screen.getByRole("button", { name: "Today" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tomorrow" })).toBeTruthy();
    expect(document.querySelector(".sched-editor, .sched-surface")).toBeTruthy();
  });

  it("offers ‘Cancel’ rather than ‘Clear date’ — there is no schedule to empty", () => {
    setup({ kind: "inbox" });
    fireEvent.click(screen.getByRole("button", { name: "Date" }));

    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear date" })).toBeNull();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeTruthy();
  });

  it("carries what was confirmed into the created task", () => {
    const { onCreate, field } = setup({ kind: "inbox" });
    fireEvent.click(screen.getByRole("button", { name: "Date" }));
    fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    fireEvent.change(field, { target: { value: "Dated" } });
    fireEvent.submit(field.closest("form")!);

    expect(onCreate).toHaveBeenCalledWith("Dated", expect.objectContaining({
      patch: expect.objectContaining({ dueDate: "2026-08-30" }),
    }));
  });
});
