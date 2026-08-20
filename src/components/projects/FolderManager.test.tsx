// @vitest-environment jsdom
//
// Folder management (SPACE_REMOVAL_IA D-2), away from the tree.
//
// The rename is the case worth the file. The field is the row, so it writes
// on Enter and on blur and NOT on every keystroke — three assertions that a
// prompt-based rename would not have needed and that an inline one cannot do
// without.
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Folder, List } from "../../types";
import { I18nProvider } from "../../i18n";
import { FolderManager } from "./FolderManager";

const NOW = "2026-08-20T00:00:00.000Z";
const PROJECT = "pj-1";

function folder(id: string, name: string, overrides: Partial<Folder> = {}): Folder {
  return { id, projectId: PROJECT, spaceId: PROJECT, name, order: 0, createdAt: NOW, updatedAt: NOW, ...overrides };
}

function list(id: string, folderId: string): List {
  return {
    id,
    projectId: PROJECT,
    kind: "regular",
    name: id,
    folderId,
    order: 0,
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
  } as List;
}

function renderManager(folders: Folder[], lists: List[] = []) {
  const spies = { onCreate: vi.fn(), onRename: vi.fn(), onArchive: vi.fn() };
  render(
    <I18nProvider lang="en">
      <FolderManager projectId={PROJECT} folders={folders} lists={lists} {...spies} />
    </I18nProvider>,
  );
  return spies;
}

afterEach(cleanup);

describe("managing a Project's Folders", () => {
  it("shows only this Project's active Folders", () => {
    renderManager([
      folder("f1", "Reading"),
      folder("f2", "Gone", { archivedAt: NOW }),
      folder("f3", "Someone else's", { projectId: "pj-2" }),
    ]);

    const names = screen.getAllByRole("textbox", { name: "Folder name" }).map((el) => (el as HTMLInputElement).value);
    expect(names).toEqual(["Reading"]);
  });

  it("says how many Lists are inside, so archiving is not a guess", () => {
    renderManager([folder("f1", "Reading")], [list("l1", "f1"), list("l2", "f1"), list("l3", "f-other")]);
    expect(screen.getByText("2 lists")).toBeTruthy();
  });

  it("counts one List as one List", () => {
    // `translate` interpolates and does not pluralise, so the singular is a
    // key of its own or it is "1 lists" forever.
    renderManager([folder("f1", "Reading")], [list("l1", "f1")]);
    expect(screen.getByText("1 list")).toBeTruthy();
  });

  it("creates from the field and clears it, and refuses a blank name", async () => {
    const user = userEvent.setup();
    const spies = renderManager([]);
    const field = screen.getByRole("textbox", { name: "New folder name" });

    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(spies.onCreate).not.toHaveBeenCalled();

    await user.type(field, "Reading");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(spies.onCreate).toHaveBeenCalledWith(PROJECT, "Reading");
    expect((field as HTMLInputElement).value).toBe("");
  });

  it("renames on Enter, and not on the way there", async () => {
    const user = userEvent.setup();
    const spies = renderManager([folder("f1", "Reading")]);
    const field = screen.getByRole("textbox", { name: "Folder name" });

    await user.clear(field);
    await user.type(field, "Papers");
    // Every keystroke would be a write, and every write a sync.
    expect(spies.onRename).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");
    expect(spies.onRename).toHaveBeenCalledWith("f1", "Papers");
  });

  it("renames on the way out too — leaving a field is not cancelling", async () => {
    const user = userEvent.setup();
    const spies = renderManager([folder("f1", "Reading")]);

    await user.clear(screen.getByRole("textbox", { name: "Folder name" }));
    await user.type(screen.getByRole("textbox", { name: "Folder name" }), "Papers");
    await user.tab();

    expect(spies.onRename).toHaveBeenCalledWith("f1", "Papers");
  });

  it("puts the stored name back on Escape, and writes nothing", async () => {
    const user = userEvent.setup();
    const spies = renderManager([folder("f1", "Reading")]);
    const field = screen.getByRole("textbox", { name: "Folder name" });

    await user.clear(field);
    await user.type(field, "Papers");
    await user.keyboard("{Escape}");

    expect((field as HTMLInputElement).value).toBe("Reading");
    expect(spies.onRename).not.toHaveBeenCalled();
  });

  it("does not write an empty name, or the name it already has", async () => {
    const user = userEvent.setup();
    const spies = renderManager([folder("f1", "Reading")]);
    const field = screen.getByRole("textbox", { name: "Folder name" });

    await user.clear(field);
    await user.keyboard("{Enter}");
    expect(spies.onRename).not.toHaveBeenCalled();
    // And the row does not sit there blank, telling the reader their Folder
    // has no name.
    expect((field as HTMLInputElement).value).toBe("Reading");

    await user.type(field, "{End}");
    await user.keyboard("{Enter}");
    expect(spies.onRename).not.toHaveBeenCalled();
  });

  it("archives the Folder the button is on", async () => {
    const user = userEvent.setup();
    const spies = renderManager([folder("f1", "Reading")]);

    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(spies.onArchive).toHaveBeenCalledWith("f1");
  });
});
