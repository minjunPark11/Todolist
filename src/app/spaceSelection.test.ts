import { describe, expect, it } from "vitest";
import {
  isSelected,
  NO_SELECTION,
  parseSelection,
  pathForSelection,
  selectedListId,
  selectedSpaceId,
  selectedFolderId,
  filterForSelection,
} from "./spaceSelection";

describe("parseSelection", () => {
  it("reads a Space", () => {
    expect(parseSelection("/s/space-1")).toEqual({ kind: "space", spaceId: "space-1" });
  });

  it("reads a List inside its Space", () => {
    // The Space rides along so the tree knows which branch to open without
    // having to look the List up first.
    expect(parseSelection("/s/space-1/l/list-2")).toEqual({
      kind: "list",
      spaceId: "space-1",
      listId: "list-2",
    });
  });

  it("selects nothing for every other page", () => {
    for (const path of ["/app", "/", "/board", "/s", "/s/", "/inbox"]) {
      expect(parseSelection(path)).toEqual(NO_SELECTION);
    }
  });

  it("reads a Folder", () => {
    expect(parseSelection("/s/space-1/f/folder-9")).toEqual({
      kind: "folder",
      spaceId: "space-1",
      folderId: "folder-9",
    });
  });

  it("falls back to the Space when the tail names nothing", () => {
    // A truncated link should still land somewhere real.
    expect(parseSelection("/s/space-1/l")).toEqual({ kind: "space", spaceId: "space-1" });
    expect(parseSelection("/s/space-1/f")).toEqual({ kind: "space", spaceId: "space-1" });
    expect(parseSelection("/s/space-1/x/y")).toEqual({ kind: "space", spaceId: "space-1" });
  });

  it("survives ids that need escaping", () => {
    const path = pathForSelection({ kind: "list", spaceId: "a/b", listId: "c d" });
    expect(parseSelection(path)).toEqual({ kind: "list", spaceId: "a/b", listId: "c d" });
  });
});

describe("pathForSelection", () => {
  it("round-trips every selection", () => {
    const selections = [
      NO_SELECTION,
      { kind: "space", spaceId: "space-1" } as const,
      { kind: "list", spaceId: "space-1", listId: "list-2" } as const,
      { kind: "folder", spaceId: "space-1", folderId: "folder-9" } as const,
    ];
    for (const selection of selections) {
      if (selection.kind === "none") {
        expect(parseSelection(pathForSelection(selection))).toEqual(NO_SELECTION);
      } else {
        expect(parseSelection(pathForSelection(selection))).toEqual(selection);
      }
    }
  });
});

describe("readers", () => {
  it("answers the Space for both kinds, and the List only for one", () => {
    const list = { kind: "list", spaceId: "space-1", listId: "list-2" } as const;
    expect(selectedSpaceId(list)).toBe("space-1");
    expect(selectedListId(list)).toBe("list-2");
    expect(selectedSpaceId({ kind: "space", spaceId: "space-1" })).toBe("space-1");
    expect(selectedListId({ kind: "space", spaceId: "space-1" })).toBe("");
    expect(selectedSpaceId(NO_SELECTION)).toBe("");
  });
});

describe("isSelected", () => {
  it("lights exactly one row", () => {
    const selection = { kind: "list", spaceId: "space-1", listId: "list-2" } as const;
    expect(isSelected(selection, selection)).toBe(true);
    // The Space of a selected List stays unlit: two highlights read as two
    // places, and the branch already shows where the list hangs from.
    expect(isSelected(selection, { kind: "space", spaceId: "space-1" })).toBe(false);
    expect(isSelected(selection, { kind: "list", spaceId: "space-1", listId: "other" })).toBe(false);
  });
});

describe("filterForSelection", () => {
  it("narrows to exactly one level", () => {
    // The three scopes of §16. Each names one field, so a Folder view is not
    // silently also a Space view — the tightest scope is the whole answer.
    expect(filterForSelection({ kind: "space", spaceId: "space-1" })).toEqual({ spaceId: "space-1" });
    expect(filterForSelection({ kind: "folder", spaceId: "space-1", folderId: "f-1" })).toEqual({
      folderId: "f-1",
    });
    expect(filterForSelection({ kind: "list", spaceId: "space-1", listId: "l-1" })).toEqual({
      listId: "l-1",
    });
    expect(filterForSelection(NO_SELECTION)).toEqual({});
  });

  it("answers the folder only for a folder selection", () => {
    expect(selectedFolderId({ kind: "folder", spaceId: "s", folderId: "f-1" })).toBe("f-1");
    expect(selectedFolderId({ kind: "space", spaceId: "s" })).toBe("");
  });
});
