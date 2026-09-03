// @vitest-environment jsdom
//
// What each row in the tree SAYS it is (FOLDER_TREE_AND_VIEW_DESIGN.md §3).
//
// Until now the only thing separating a Folder from a List here was 26px of
// indent — a Folder never announced itself, the reader inferred one from
// something being underneath it. These pin the two facts that replaced that:
// the leading glyph says the kind, and the order of the children is the app's
// one answer to that question (§5.2).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { List, SidebarFolder } from "../../types";
import type { ScopeContext } from "../../domain/tasks/scopeQuery";
import { I18nProvider } from "../../i18n";
import { TasksSidebar } from "./TasksSidebar";

afterEach(cleanup);

const NOW = "2026-09-03T09:00:00.000Z";

function list(id: string, name: string, overrides: Partial<List> = {}): List {
  return {
    id,
    projectId: "",
    kind: "regular",
    name,
    order: 0,
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as List;
}

const folder: SidebarFolder = { id: "f1", name: "School", sortKey: 0, createdAt: NOW, updatedAt: NOW };

function setup(
  lists: List[],
  sidebarFolders: SidebarFolder[] = [folder],
  fold: { collapsedFolderIds?: string[]; onToggleFolder?: (id: string) => void } = {},
) {
  const ctx: ScopeContext = { tasks: [], lists, dailyPlans: [], taskTags: [], today: "2026-09-03" };
  render(
    <I18nProvider lang="en">
      <TasksSidebar
        ctx={ctx}
        folders={[]}
        sidebarFolders={sidebarFolders}
        tags={[]}
        savedFilters={[]}
        onCreateList={() => {}}
        collapsedFolderIds={fold.collapsedFolderIds}
        onToggleFolder={fold.onToggleFolder}
        current={null}
        onNavigate={vi.fn()}
      />
    </I18nProvider>,
  );
}

const rowFor = (name: string) => screen.getByRole("button", { name }).closest("button") as HTMLElement;

describe("what a row says it is (§3)", () => {
  it("gives a Folder and a List different glyphs", () => {
    setup([list("l1", "Alpha", { sidebarFolderId: "f1" })]);

    const folderGlyph = rowFor("School").querySelector(".tm-row-icon svg");
    const listGlyph = rowFor("Alpha").querySelector(".tm-row-icon svg");
    expect(folderGlyph).toBeTruthy();
    expect(listGlyph).toBeTruthy();
    expect(folderGlyph?.innerHTML).not.toBe(listGlyph?.innerHTML);
  });

  // §3.4: give the glyph to some rows and not others and the labels of one
  // column start at two different x.
  it("gives every row one, Smart Lists included", () => {
    setup([list("l1", "Alpha", { sidebarFolderId: "f1" })]);
    for (const name of ["Today", "Next 7 days", "Inbox", "Completed", "Trash", "School", "Alpha"]) {
      expect(rowFor(name).querySelector(".tm-row-icon svg"), name).toBeTruthy();
    }
  });

  // They are drawings and not characters, for the three reasons
  // `schedule/icons.tsx` sets out — the glyph, the colour and the size would
  // otherwise all belong to the platform rather than to this app.
  it("draws them rather than spelling them in emoji", () => {
    setup([list("l1", "Alpha", { sidebarFolderId: "f1" })]);
    const sidebar = document.querySelector(".tm-sidebar") as HTMLElement;
    expect(/\p{Extended_Pictographic}/u.test(sidebar.textContent ?? "")).toBe(false);
  });

  it("keeps the glyph out of the row's name", () => {
    // §3.5. `aria-hidden`, so what a screen reader says and what the screen
    // shows are the same string.
    setup([list("l1", "Alpha", { sidebarFolderId: "f1" })]);
    expect(rowFor("Alpha").querySelector(".tm-row-icon")?.getAttribute("aria-hidden")).toBe("true");
  });

  // §3.2. It used to be the first child of the row.
  it("puts the List's colour after the label, not before it", () => {
    setup([list("l1", "Alpha", { sidebarFolderId: "f1", color: "blue" })]);
    const children = [...rowFor("Alpha").children].map((child) => child.className);
    expect(children.indexOf("tm-dot")).toBeGreaterThan(children.indexOf("tm-row-label"));
  });
});

describe("the order of a Folder's children (§5.2)", () => {
  it("follows the sidebar's own key before the List's order", () => {
    setup([
      list("l1", "Alpha", { sidebarFolderId: "f1", order: 0, sidebarSortKey: 2 }),
      list("l2", "Beta", { sidebarFolderId: "f1", order: 1, sidebarSortKey: 1 }),
    ]);
    const names = [...document.querySelectorAll(".tm-group .tm-row-label")].map((el) => el.textContent);
    expect(names).toEqual(["School", "Beta", "Alpha"]);
  });

  // A List pointing at a group that is not there used to land in a bucket
  // nothing rendered — present in the account, on no screen.
  it("shows a List whose group is gone at the top level", () => {
    setup([list("l1", "Orphan", { sidebarFolderId: "f-deleted" })], []);
    expect(screen.getByRole("button", { name: "Orphan" })).toBeTruthy();
  });
});

// FOLDER_TREE_AND_VIEW_DESIGN.md §13.
describe("folding a Folder (§13)", () => {
  it("gives the fold its own control, and leaves the row going to the Folder", () => {
    const onToggle = vi.fn();
    setup([list("l1", "Alpha", { sidebarFolderId: "f1" })], [folder], { onToggleFolder: onToggle });

    const fold = screen.getByRole("button", { name: "Collapse School" });
    expect(fold.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(fold);
    expect(onToggle).toHaveBeenCalledWith("f1");
    // The row itself is a different button and still navigates.
    expect(screen.getByRole("button", { name: "School" })).not.toBe(fold);
  });

  it("takes the children out of the tree rather than hiding them", () => {
    setup([list("l1", "Alpha", { sidebarFolderId: "f1" })], [folder], { collapsedFolderIds: ["f1"] });
    // Not `display: none`: a folded Folder's children should be out of the tab
    // order and out of a screen reader's reading of the tree.
    expect(screen.queryByRole("button", { name: "Alpha" })).toBeNull();
    expect(screen.getByRole("button", { name: "Expand School" }).getAttribute("aria-expanded")).toBe("false");
  });

  // §13.3: the glyph says it too, on purpose — in a long tree the eye finds
  // the 16px mark before the 12px one.
  it("swaps the folder glyph with the fold", () => {
    setup([list("l1", "Alpha", { sidebarFolderId: "f1" })], [folder]);
    const open = rowFor("School").querySelector(".tm-row-icon svg")?.innerHTML ?? "";
    cleanup();

    setup([list("l1", "Alpha", { sidebarFolderId: "f1" })], [folder], { collapsedFolderIds: ["f1"] });
    const shut = rowFor("School").querySelector(".tm-row-icon svg")?.innerHTML ?? "";

    expect(open).not.toBe("");
    expect(shut).not.toBe(open);
  });

  it("folds nothing when nobody has folded anything", () => {
    setup([list("l1", "Alpha", { sidebarFolderId: "f1" })]);
    expect(screen.getByRole("button", { name: "Alpha" })).toBeTruthy();
  });
});
