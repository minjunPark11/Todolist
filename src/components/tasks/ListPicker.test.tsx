// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { List, SidebarFolder, Task } from "../../types";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { ListPicker } from "./ListPicker";

afterEach(cleanup);

const NOW = "2026-08-25T00:00:00.000Z";

function list(id: string, name: string, extra: Partial<List> = {}): List {
  return {
    id,
    projectId: "",
    kind: "regular",
    name,
    order: 0,
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  } as List;
}

const inbox = list("list-inbox", "Inbox", { kind: "inbox", order: -1 });
const research = list("l-research", "Research", { sidebarFolderId: "f-school" });
const coursework = list("l-coursework", "Coursework", { sidebarFolderId: "f-school" });
const lists = [inbox, research, coursework];
const folders: SidebarFolder[] = [{ id: "f-school", name: "School", sortKey: 0, createdAt: NOW, updatedAt: NOW }];

function setup(taskOverrides: Partial<Task> = {}) {
  const onMove = vi.fn();
  const task = { id: "t1", title: "Task", listId: inbox.id, parentTaskId: "", projectId: "", ...taskOverrides } as Task;
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <ListPicker task={task} lists={lists} folders={folders} onMove={onMove} />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
  return onMove;
}

const trigger = () => screen.getByRole("button", { name: /^List,/ });
const search = () => screen.getByLabelText("Search lists");
const options = () => screen.getAllByRole("option").map((el) => el.textContent?.replace("✓", "").trim());

describe("the property row (§13.8)", () => {
  it("names the List it holds", () => {
    setup();
    expect(screen.getByRole("button", { name: "List, Inbox" })).not.toBeNull();
  });

  // §13.15, §13.16: there is nothing for the picker to do, and §16.28 refuses
  // a control that appears and then refuses. The line says why.
  it("is a sentence rather than a control for a child Task", () => {
    setup({ parentTaskId: "parent" });
    expect(screen.queryByRole("button", { name: /^List,/ })).toBeNull();
    expect(screen.getByText("Follows its parent task")).not.toBeNull();
  });
});

describe("the picker (§13.9, §13.10, §13.11)", () => {
  it("groups Lists under their Folder", () => {
    setup();
    fireEvent.click(trigger());
    expect(options()).toEqual(["Inbox", "Research", "Coursework"]);
    expect(screen.getByText("School")).not.toBeNull();
  });

  // §13.10: a heading is not something the reader can choose or arrow onto.
  it("does not offer the Folder heading as an option", () => {
    setup();
    fireEvent.click(trigger());
    expect(screen.queryByRole("option", { name: "School" })).toBeNull();
  });

  it("marks the List the Task is already in", () => {
    setup();
    fireEvent.click(trigger());
    expect(screen.getByRole("option", { name: /Inbox/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("option", { name: /Research/ }).getAttribute("aria-selected")).toBe("false");
  });

  it("reports the chosen List and closes", () => {
    const onMove = setup();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("option", { name: /Research/ }));
    expect(onMove).toHaveBeenCalledWith("l-research");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("search (§13.26, §13.27)", () => {
  // §19.31's default would leave focus on the trigger for a mouse open, and a
  // search field that must be clicked first is a search field in name only.
  it("takes focus however the picker was opened", () => {
    setup();
    fireEvent.click(trigger(), { detail: 1 });
    expect(document.activeElement).toBe(search());
  });

  it("filters as it is typed", () => {
    setup();
    fireEvent.click(trigger());
    fireEvent.change(search(), { target: { value: "cour" } });
    expect(options()).toEqual(["Coursework"]);
  });

  it("says so when nothing matches, rather than going blank", () => {
    setup();
    fireEvent.click(trigger());
    fireEvent.change(search(), { target: { value: "zzz" } });
    expect(screen.queryAllByRole("option")).toEqual([]);
    expect(screen.getByText("No list matches that.")).not.toBeNull();
  });

  it("chooses what the arrows are on when Enter is pressed", () => {
    const onMove = setup();
    fireEvent.click(trigger());
    fireEvent.change(search(), { target: { value: "rese" } });
    fireEvent.keyDown(search(), { key: "Enter" });
    expect(onMove).toHaveBeenCalledWith("l-research");
  });

  // Focus never leaves the field, so the option being pointed at has to be
  // announced through `aria-activedescendant` or not at all.
  it("points the field at the active option without moving focus", () => {
    setup();
    fireEvent.click(trigger());
    const active = search().getAttribute("aria-activedescendant");
    expect(active).toBe(screen.getByRole("option", { name: /Inbox/ }).id);
    fireEvent.keyDown(search(), { key: "ArrowDown" });
    expect(search().getAttribute("aria-activedescendant")).toBe(
      screen.getByRole("option", { name: /Research/ }).id,
    );
    expect(document.activeElement).toBe(search());
  });

  // Filtering must not leave the cursor on a row that is no longer drawn, and
  // must not silently slide it onto whatever now occupies that position.
  it("moves the cursor to the top when its option is filtered away", () => {
    const onMove = setup();
    fireEvent.click(trigger());
    fireEvent.change(search(), { target: { value: "cour" } });
    fireEvent.keyDown(search(), { key: "Enter" });
    expect(onMove).toHaveBeenCalledWith("l-coursework");
  });
});

describe("dismissal (§13.28)", () => {
  it("closes on an outside pointer without moving anything", () => {
    const onMove = setup();
    fireEvent.click(trigger());
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("closes on Escape without moving anything", () => {
    const onMove = setup();
    fireEvent.click(trigger());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onMove).not.toHaveBeenCalled();
  });
});
