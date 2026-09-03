import { describe, expect, it } from "vitest";
import type { List, SidebarFolder } from "../../types";
import {
  activeSidebarFolders,
  addSidebarFolder,
  folderIdFor,
  isFolderCollapsed,
  listsInFolder,
  moveListToSidebarFolder,
  removeSidebarFolder,
  renameSidebarFolder,
  sanitizeSidebarFolder,
  toggleFolderCollapsed,
} from "./sidebarFolders";

const NOW = "2026-08-18T09:00:00.000Z";
const LATER = "2026-08-18T10:00:00.000Z";

function list(overrides: Partial<List> = {}): List {
  return {
    id: "l1",
    projectId: "p1",
    name: "List",
    order: 0,
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function folder(overrides: Partial<SidebarFolder> = {}): SidebarFolder {
  return { id: "sf1", name: "Personal", createdAt: NOW, updatedAt: NOW, ...overrides };
}

describe("sanitizeSidebarFolder", () => {
  it("keeps a named group and carries unknown fields (M0)", () => {
    const kept = sanitizeSidebarFolder({ id: "sf1", name: " Personal ", collapsed: true, createdAt: NOW, updatedAt: NOW });
    expect(kept).toMatchObject({ id: "sf1", name: "Personal" });
    expect((kept as unknown as { collapsed: boolean }).collapsed).toBe(true);
  });

  it("drops a group the user could not tell from any other", () => {
    expect(sanitizeSidebarFolder({ id: "sf1", name: "   " })).toBeNull();
    expect(sanitizeSidebarFolder({ name: "Personal" })).toBeNull();
    expect(sanitizeSidebarFolder("nope")).toBeNull();
  });
});

describe("folderIdFor — one answer for the sidebar and the Scope", () => {
  it("answers the domain Folder while nothing has been moved", () => {
    expect(folderIdFor(list({ folderId: "f1" }))).toBe("f1");
  });

  it("answers the sidebar group once the user has placed the List", () => {
    expect(folderIdFor(list({ folderId: "f1", sidebarFolderId: "sf1" }))).toBe("sf1");
  });

  it("answers nothing for a List that hangs under neither", () => {
    expect(folderIdFor(list())).toBe("");
    expect(folderIdFor(list({ sidebarFolderId: "  " }))).toBe("");
  });
});

describe("listsInFolder", () => {
  it("collects Lists from different Projects under one group (§6.36)", () => {
    const lists = [
      list({ id: "l1", projectId: "p1", sidebarFolderId: "sf1", name: "B" }),
      list({ id: "l2", projectId: "p2", sidebarFolderId: "sf1", name: "A" }),
      list({ id: "l3", projectId: "p1", folderId: "f1" }),
    ];
    expect(listsInFolder("sf1", lists).map((item) => item.id)).toEqual(["l2", "l1"]);
  });

  it("orders by the sidebar's own key when there is one", () => {
    const lists = [
      list({ id: "l1", sidebarFolderId: "sf1", order: 0, sidebarSortKey: 5 }),
      list({ id: "l2", sidebarFolderId: "sf1", order: 9, sidebarSortKey: 1 }),
    ];
    expect(listsInFolder("sf1", lists).map((item) => item.id)).toEqual(["l2", "l1"]);
  });

  it("leaves out archived and binned Lists", () => {
    const lists = [
      list({ id: "l1", sidebarFolderId: "sf1", archivedAt: NOW }),
      list({ id: "l2", sidebarFolderId: "sf1", deletedAt: NOW }),
    ];
    expect(listsInFolder("sf1", lists)).toEqual([]);
  });
});

describe("groups", () => {
  it("appends after the last group and orders by key then name", () => {
    const folders = addSidebarFolder([folder({ id: "sf1", sortKey: 0 })], " Work ", "sf2", NOW);
    expect(folders[1]).toMatchObject({ id: "sf2", name: "Work", sortKey: 1 });
    expect(activeSidebarFolders(folders).map((item) => item.id)).toEqual(["sf1", "sf2"]);
    expect(addSidebarFolder(folders, "  ", "sf3", NOW)).toBe(folders);
  });

  it("renames in place and keeps identity when nothing changed", () => {
    const folders = [folder({ id: "sf1", name: "Personal" })];
    expect(renameSidebarFolder(folders, "sf1", "Home", NOW)[0]).toMatchObject({ name: "Home" });
    expect(renameSidebarFolder(folders, "sf1", "Personal", NOW)).toBe(folders);
    expect(renameSidebarFolder(folders, "sf1", " ", NOW)).toBe(folders);
  });

  it("deleting a group keeps its Lists, and hands them back to the domain Folder (§6.57)", () => {
    const folders = [folder({ id: "sf1" })];
    const lists = [list({ id: "l1", folderId: "f1", sidebarFolderId: "sf1" }), list({ id: "l2" })];
    const next = removeSidebarFolder(folders, lists, "sf1", LATER);
    expect(next.folders).toEqual([]);
    expect(next.lists).toHaveLength(2);
    expect(next.lists[0].sidebarFolderId).toBeUndefined();
    expect(folderIdFor(next.lists[0])).toBe("f1");
    expect(next.lists[1]).toBe(lists[1]);
  });

  it("touches nothing when the deleted group held no Lists", () => {
    const lists = [list({ id: "l1" })];
    expect(removeSidebarFolder([folder()], lists, "sf1", LATER).lists).toBe(lists);
  });
});

describe("moveListToSidebarFolder", () => {
  it("places a List without touching its Project (D19)", () => {
    const lists = [list({ id: "l1", projectId: "p1", folderId: "f1" })];
    const next = moveListToSidebarFolder(lists, "l1", "sf1", LATER);
    expect(next[0]).toMatchObject({ projectId: "p1", folderId: "f1", sidebarFolderId: "sf1", updatedAt: LATER });
  });

  it("taking a List out removes the field rather than emptying it", () => {
    const lists = [list({ id: "l1", folderId: "f1", sidebarFolderId: "sf1" })];
    const next = moveListToSidebarFolder(lists, "l1", "", LATER);
    expect("sidebarFolderId" in next[0]).toBe(false);
    expect(folderIdFor(next[0])).toBe("f1");
  });

  it("keeps identity when the List is already there", () => {
    const lists = [list({ id: "l1", sidebarFolderId: "sf1" })];
    expect(moveListToSidebarFolder(lists, "l1", "sf1", LATER)).toBe(lists);
    expect(moveListToSidebarFolder(lists, "nope", "sf2", LATER)).toBe(lists);
  });
});

// FOLDER_TREE_AND_VIEW_DESIGN.md §13.1. One array covering both kinds of
// group, because only one of them could have carried a field of its own.
describe("folding a group", () => {
  it("reads absent as nothing folded", () => {
    expect(isFolderCollapsed(undefined, "sf1")).toBe(false);
    expect(isFolderCollapsed([], "sf1")).toBe(false);
  });

  it("flips one id and leaves the rest", () => {
    expect(toggleFolderCollapsed(["sf1"], "sf2")).toEqual(["sf1", "sf2"]);
    expect(toggleFolderCollapsed(["sf1", "sf2"], "sf1")).toEqual(["sf2"]);
    expect(isFolderCollapsed(toggleFolderCollapsed(undefined, "sf1"), "sf1")).toBe(true);
  });

  it("takes no id at all as no change", () => {
    expect(toggleFolderCollapsed(["sf1"], "")).toEqual(["sf1"]);
    expect(isFolderCollapsed(["sf1", ""], "")).toBe(false);
  });
});
