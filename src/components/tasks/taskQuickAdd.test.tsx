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
    // The Add button is part of answering the same question. Committing on the
    // way to it would write the task twice — once on blur, once on click.
    const { onCreate, field } = setup({ kind: "inbox" });
    fireEvent.change(field, { target: { value: "Still deciding" } });
    fireEvent.blur(field, { relatedTarget: screen.getByRole("button", { name: "Add" }) });
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("commits once, not twice, when the button is then pressed", () => {
    const { onCreate, field } = setup({ kind: "inbox" });
    fireEvent.change(field, { target: { value: "One task" } });
    const add = screen.getByRole("button", { name: "Add" });
    fireEvent.blur(field, { relatedTarget: add });
    fireEvent.submit(field.closest("form")!);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});

// The row's own shape (TICKTICK_COMPONENT_10_QUICK_ADD.md §10).
describe("the quick add as one quiet row", () => {
  it("offers no button until there is something to commit", () => {
    // Three things commit this form and two of them are not buttons — Enter,
    // and a click outside it. A button standing there while the field is empty
    // opens nothing and takes the eye first (§10.4).
    const { field } = setup({ kind: "inbox" });
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();

    fireEvent.change(field, { target: { value: "Something" } });
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();

    fireEvent.change(field, { target: { value: "" } });
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
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

