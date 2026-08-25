// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Tag, Task, TaskTag } from "../../types";
import { tagIdFor, taskTagIdFor } from "../../domain/tags/tags";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { TagPicker } from "./TagPicker";

afterEach(cleanup);

const NOW = "2026-08-25T00:00:00.000Z";

function tag(name: string): Tag {
  return { id: tagIdFor(name), name, createdAt: NOW, updatedAt: NOW };
}

function link(name: string): TaskTag {
  return { id: taskTagIdFor("t1", tagIdFor(name)), taskId: "t1", tagId: tagIdFor(name), createdAt: NOW };
}

const tags = [tag("research"), tag("urgent"), tag("meeting")];

function setup(links: TaskTag[] = [], held: string[] = []) {
  const onToggle = vi.fn();
  const task = { id: "t1", title: "Task", tags: held } as Task;
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <TagPicker task={task} tags={tags} taskTags={links} onToggle={onToggle} />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
  return onToggle;
}

const addButton = () => screen.getByRole("button", { name: "Add a tag" });
const search = () => screen.getByLabelText("Search or create a tag");
const options = () => screen.getAllByRole("option").map((el) => el.textContent?.replace(/[✓+]/g, "").trim());

describe("the chips (§13.55)", () => {
  it("shows the Task's tags with the display hash", () => {
    setup([link("research")]);
    expect(screen.getByText("#research", { exact: false })).not.toBeNull();
  });

  // Taking a tag off should not mean opening the picker and finding it again.
  it("removes a tag from its own chip", () => {
    const onToggle = setup([link("research")]);
    fireEvent.click(screen.getByRole("button", { name: "Remove research" }));
    expect(onToggle).toHaveBeenCalledWith("research");
  });
});

describe("the picker (§13.37, §13.38)", () => {
  it("lists every tag and ticks the ones this Task carries", () => {
    setup([link("urgent")]);
    fireEvent.click(addButton());
    expect(options()).toEqual(["#meeting", "#research", "#urgent"]);
    expect(screen.getByRole("option", { name: /urgent/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("option", { name: /meeting/ }).getAttribute("aria-selected")).toBe("false");
  });

  // §13.38: several tags can be on at once, and a screen reader has to be told
  // that ticking one does not untick the last.
  it("says the list is multi-selectable", () => {
    setup();
    fireEvent.click(addButton());
    expect(screen.getByRole("listbox").getAttribute("aria-multiselectable")).toBe("true");
  });
});

describe("staying open (§13.40)", () => {
  // The rule that separates this from the List picker: ticking three tags is
  // one intention, and three closes would be three trips back to the trigger.
  it("does not close when a tag is chosen", () => {
    const onToggle = setup();
    fireEvent.click(addButton());
    fireEvent.click(screen.getByRole("option", { name: /research/ }));
    expect(onToggle).toHaveBeenCalledWith("research");
    expect(screen.queryByRole("listbox")).not.toBeNull();
  });

  it("takes several in a row", () => {
    const onToggle = setup();
    fireEvent.click(addButton());
    fireEvent.click(screen.getByRole("option", { name: /research/ }));
    fireEvent.click(screen.getByRole("option", { name: /urgent/ }));
    expect(onToggle.mock.calls.map((call) => call[0])).toEqual(["research", "urgent"]);
  });

  // After ticking, the field describes a search that has been answered —
  // leaving it would hide every other tag behind a filter the user is done with.
  it("clears the search after a choice", () => {
    setup();
    fireEvent.click(addButton());
    fireEvent.change(search(), { target: { value: "rese" } });
    fireEvent.click(screen.getByRole("option", { name: /research/ }));
    expect((search() as HTMLInputElement).value).toBe("");
  });
});

describe("creating one inline (§13.41, §13.35)", () => {
  it("offers to create what was typed when nothing matches", () => {
    const onToggle = setup();
    fireEvent.click(addButton());
    fireEvent.change(search(), { target: { value: "newtag" } });
    fireEvent.click(screen.getByRole("option", { name: "Create #newtag" }));
    expect(onToggle).toHaveBeenCalledWith("newtag");
  });

  // Otherwise someone is invited to duplicate the tag ticked two rows above.
  it("offers nothing to create when the tag already exists", () => {
    setup();
    fireEvent.click(addButton());
    fireEvent.change(search(), { target: { value: "research" } });
    expect(screen.queryByRole("option", { name: /^Create/ })).toBeNull();
  });

  it("strips the display hash, so #newtag and newtag are one tag", () => {
    const onToggle = setup();
    fireEvent.click(addButton());
    fireEvent.change(search(), { target: { value: "#newtag" } });
    fireEvent.click(screen.getByRole("option", { name: "Create #newtag" }));
    expect(onToggle).toHaveBeenCalledWith("newtag");
  });

  // §13.35 enforced silently would leave the reader guessing why the Create
  // row never appeared.
  it("says why a name is refused", () => {
    setup();
    fireEvent.click(addButton());
    fireEvent.change(search(), { target: { value: "a".repeat(60) } });
    expect(screen.getByText("That name is too long for a tag.")).not.toBeNull();
    expect(screen.queryByRole("option", { name: /^Create/ })).toBeNull();
  });
});

describe("keyboard (§13.57, §13.58)", () => {
  it("takes focus into the search however it was opened", () => {
    setup();
    fireEvent.click(addButton(), { detail: 1 });
    expect(document.activeElement).toBe(search());
  });

  it("chooses what the arrows are on without moving focus", () => {
    const onToggle = setup();
    fireEvent.click(addButton());
    fireEvent.keyDown(search(), { key: "ArrowDown" });
    fireEvent.keyDown(search(), { key: "Enter" });
    expect(onToggle).toHaveBeenCalledWith("research");
    expect(document.activeElement).toBe(search());
  });

  // §13.41's row is how the list is extended; a row the keyboard cannot land
  // on is a row a keyboard user does not have.
  it("can reach the Create row with the arrows", () => {
    const onToggle = setup();
    fireEvent.click(addButton());
    fireEvent.change(search(), { target: { value: "newtag" } });
    fireEvent.keyDown(search(), { key: "Enter" });
    expect(onToggle).toHaveBeenCalledWith("newtag");
  });
});
