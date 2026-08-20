// @vitest-environment jsdom
//
// The Projects home (SPACE_REMOVAL_IA D-1), at the layer that can answer for
// it. What a Project row DOES is one handler call, and what belongs on the
// screen at all is the question this file asks: an archived Project is not in
// the working list, a pinned one is at the top, and every action the tree's
// row menu had is reachable without the tree.
//
// The e2e half is the address and the sidebar. Here it is the screen alone.
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Project, Task } from "../../types";
import { I18nProvider } from "../../i18n";
import { ProjectsHome } from "./ProjectsHome";

const NOW = "2026-08-20T00:00:00.000Z";

function project(id: string, name: string, overrides: Partial<Project> = {}): Project {
  return { id, name, description: "", color: "#0066cc", createdAt: NOW, updatedAt: NOW, ...overrides };
}

function task(id: string, projectId: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    projectId,
    status: "todo",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Task;
}

function renderHome(projects: Project[], tasks: Task[] = []) {
  const spies = {
    onOpen: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onTogglePin: vi.fn(),
    onArchive: vi.fn(),
    onRestore: vi.fn(),
    onDelete: vi.fn(),
  };
  render(
    <I18nProvider lang="en">
      <ProjectsHome projects={projects} tasks={tasks} {...spies} />
    </I18nProvider>,
  );
  return spies;
}

/** The working list, which is the first one — the archived section is its own. */
function workingRows(): string[] {
  // Absent, not empty, when nothing is in it: the empty state replaces the
  // list rather than drawing an empty one.
  const list = document.querySelectorAll(".pjh-list")[0];
  return list ? Array.from(list.querySelectorAll(".pjh-name")).map((el) => el.textContent ?? "") : [];
}

afterEach(cleanup);

describe("the Projects home", () => {
  it("names each row by its Project, so a screen reader has something to choose", () => {
    renderHome([project("p1", "ABM")]);
    expect(screen.getByRole("button", { name: "ABM" })).toBeTruthy();
  });

  it("puts pinned Projects first, and leaves the rest where they were", () => {
    renderHome([project("p1", "ABM"), project("p2", "Blog", { pinned: true }), project("p3", "Cooking")]);
    expect(workingRows()).toEqual(["Blog", "ABM", "Cooking"]);
  });

  it("keeps archived Projects out of the working list and in their own section", () => {
    renderHome([project("p1", "ABM"), project("p2", "Old", { status: "archived", archivedAt: NOW })]);

    expect(workingRows()).toEqual(["ABM"]);
    const archived = screen.getByRole("region", { name: "Archived" });
    expect(within(archived).getByText("Old")).toBeTruthy();
    // D-20 put archived Projects with the surface that owns them, and both
    // actions belong to that surface rather than to a menu.
    expect(within(archived).getByRole("button", { name: "Restore" })).toBeTruthy();
    expect(within(archived).getByRole("button", { name: "Delete" })).toBeTruthy();
  });

  it("does not show a deleted Project in either list", () => {
    // §13.28: a record is never in both states, and a thrown-away Project is
    // not an archived one — the Trash is where it is answered for.
    renderHome([project("p1", "Gone", { deletedAt: NOW })]);
    expect(workingRows()).toEqual([]);
    expect(screen.queryByRole("region", { name: "Archived" })).toBeNull();
  });

  it("counts only the open Tasks of each Project, and draws no zero", () => {
    renderHome(
      [project("p1", "ABM"), project("p2", "Blog")],
      [task("t1", "p1"), task("t2", "p1", { status: "done", completedAt: NOW }), task("t3", "p1")],
    );

    const counts = Array.from(document.querySelectorAll(".pjh-count")).map((el) => el.textContent);
    expect(counts).toEqual(["2"]);
  });

  it("carries every action the tree's row menu had", async () => {
    const user = userEvent.setup();
    const spies = renderHome([project("p1", "ABM")]);

    await user.click(screen.getByRole("button", { name: "Actions for ABM" }));
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeTruthy();

    await user.click(screen.getByRole("menuitem", { name: "Pin" }));
    expect(spies.onTogglePin).toHaveBeenCalledWith("p1");

    await user.click(screen.getByRole("button", { name: "Actions for ABM" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(spies.onArchive).toHaveBeenCalledWith("p1");
  });

  it("says Unpin on a pinned Project — the item is the state, not a second one", async () => {
    const user = userEvent.setup();
    renderHome([project("p1", "ABM", { pinned: true })]);

    await user.click(screen.getByRole("button", { name: "Actions for ABM" }));
    expect(screen.getByRole("menuitem", { name: "Unpin" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Pin" })).toBeNull();
  });

  it("creates from the field and clears it, and refuses a blank name", async () => {
    const user = userEvent.setup();
    const spies = renderHome([]);
    const field = screen.getByRole("textbox", { name: "New project name" });

    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(spies.onCreate).not.toHaveBeenCalled();

    await user.type(field, "Thesis");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(spies.onCreate).toHaveBeenCalledWith("Thesis");
    expect((field as HTMLInputElement).value).toBe("");
  });

  it("offers the way to make the first one rather than only saying there is none", () => {
    renderHome([]);
    expect(screen.getByText("No projects yet")).toBeTruthy();
    // The empty state is a sentence; the field above it is the answer to it,
    // and it is on the screen whether or not there is anything in the list.
    expect(screen.getByRole("textbox", { name: "New project name" })).toBeTruthy();
  });
});
