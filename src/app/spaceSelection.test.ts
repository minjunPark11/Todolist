import { describe, expect, it } from "vitest";
import type { Project, Space } from "../types";
import {
  filterForSelection,
  isSelected,
  NO_SELECTION,
  parseSelection,
  pathForSelection,
  resolveSelection,
  selectedFolderId,
  selectedListId,
  selectedProjectId,
  selectedSpaceId,
} from "./spaceSelection";
import { DEFAULT_SPACE_ID, makeSpace } from "../domain/spaces/spaces";

const NOW = "2026-08-17T00:00:00.000Z";

function project(id: string, spaceId?: string): Project {
  return { id, name: id, description: "", color: "#0066cc", spaceId, createdAt: NOW, updatedAt: NOW };
}

function records(spaces: Space[] = [], projects: Project[] = []) {
  return { spaces, projects };
}

describe("parseSelection", () => {
  it("reads every level of the new scheme", () => {
    expect(parseSelection("/s/s-1")).toEqual({ kind: "space", spaceId: "s-1" });
    expect(parseSelection("/s/s-1/p/p-1")).toEqual({ kind: "project", spaceId: "s-1", projectId: "p-1" });
    expect(parseSelection("/s/s-1/p/p-1/f/f-9")).toEqual({
      kind: "folder",
      spaceId: "s-1",
      projectId: "p-1",
      folderId: "f-9",
    });
    expect(parseSelection("/s/s-1/p/p-1/l/l-2")).toEqual({
      kind: "list",
      spaceId: "s-1",
      projectId: "p-1",
      listId: "l-2",
    });
  });

  it("selects nothing for every other page", () => {
    for (const path of ["/app", "/", "/board", "/s", "/s/", "/inbox"]) {
      expect(parseSelection(path)).toEqual(NO_SELECTION);
    }
  });

  it("falls back to the nearest real ancestor when the tail names nothing", () => {
    expect(parseSelection("/s/s-1/p")).toEqual({ kind: "space", spaceId: "s-1" });
    expect(parseSelection("/s/s-1/x/y")).toEqual({ kind: "space", spaceId: "s-1" });
    expect(parseSelection("/s/s-1/p/p-1/f")).toEqual({ kind: "project", spaceId: "s-1", projectId: "p-1" });
    expect(parseSelection("/s/s-1/p/p-1/x/y")).toEqual({ kind: "project", spaceId: "s-1", projectId: "p-1" });
  });

  it("survives ids that need escaping", () => {
    const path = pathForSelection({ kind: "list", spaceId: "a/b", projectId: "c d", listId: "e/f" });
    expect(parseSelection(path)).toEqual({ kind: "list", spaceId: "a/b", projectId: "c d", listId: "e/f" });
  });
});

describe("legacy paths (§33)", () => {
  // The old scheme put a PROJECT id where the new one puts a Space. Reading an
  // old link as a new one resolves that id against the wrong collection and
  // lands nowhere, so these have to be recognised.
  it("reads an old Folder path as a Project scope awaiting its Space", () => {
    expect(parseSelection("/s/p-1/f/f-9")).toEqual({
      kind: "folder",
      spaceId: "",
      projectId: "p-1",
      folderId: "f-9",
    });
  });

  it("reads an old List path the same way", () => {
    expect(parseSelection("/s/p-1/l/l-2")).toEqual({
      kind: "list",
      spaceId: "",
      projectId: "p-1",
      listId: "l-2",
    });
  });

  it("resolves the Space from the Project", () => {
    const parsed = parseSelection("/s/p-1/l/l-2");
    const resolved = resolveSelection(parsed, records([], [project("p-1", "s-7")]));
    expect(resolved).toEqual({ kind: "list", spaceId: "s-7", projectId: "p-1", listId: "l-2" });
  });

  it("resolves a Project that predates the backfill to the default Space", () => {
    const resolved = resolveSelection(parseSelection("/s/p-1/f/f-9"), records([], [project("p-1")]));
    expect(selectedSpaceId(resolved)).toBe(DEFAULT_SPACE_ID);
  });
});

describe("resolveSelection — the ambiguous /s/:id", () => {
  const space = makeSpace("s-1", "Research", NOW);

  it("leaves it a Space when the account has one by that id", () => {
    const parsed = parseSelection("/s/s-1");
    expect(resolveSelection(parsed, records([space], [project("p-1", "s-1")]))).toEqual(parsed);
  });

  it("upgrades it to a Project when the id names one — an old top-level link", () => {
    expect(resolveSelection(parseSelection("/s/p-1"), records([space], [project("p-1", "s-1")]))).toEqual({
      kind: "project",
      spaceId: "s-1",
      projectId: "p-1",
    });
  });

  it("never discards a selection it cannot resolve", () => {
    // The collections are empty during the first render. A resolver that
    // answered "nothing" would drop the deep link the user just followed.
    const parsed = parseSelection("/s/p-1/l/l-2");
    expect(resolveSelection(parsed, records())).toEqual(parsed);
    expect(resolveSelection(parseSelection("/s/unknown"), records())).toEqual({
      kind: "space",
      spaceId: "unknown",
    });
  });

  it("is idempotent once resolved", () => {
    const all = records([space], [project("p-1", "s-1")]);
    const once = resolveSelection(parseSelection("/s/p-1"), all);
    expect(resolveSelection(once, all)).toEqual(once);
  });
});

describe("pathForSelection", () => {
  it("round-trips every selection", () => {
    const selections = [
      NO_SELECTION,
      { kind: "space", spaceId: "s-1" } as const,
      { kind: "project", spaceId: "s-1", projectId: "p-1" } as const,
      { kind: "folder", spaceId: "s-1", projectId: "p-1", folderId: "f-9" } as const,
      { kind: "list", spaceId: "s-1", projectId: "p-1", listId: "l-2" } as const,
    ];
    for (const selection of selections) {
      if (selection.kind === "none") {
        expect(parseSelection(pathForSelection(selection))).toEqual(NO_SELECTION);
      } else {
        expect(parseSelection(pathForSelection(selection))).toEqual(selection);
      }
    }
  });

  it("writes only the new scheme, so a resolved legacy link stops being legacy", () => {
    const resolved = resolveSelection(parseSelection("/s/p-1/l/l-2"), records([], [project("p-1", "s-7")]));
    expect(pathForSelection(resolved)).toBe("/s/s-7/p/p-1/l/l-2");
  });
});

describe("readers", () => {
  it("answer each level, and nothing above the one that is selected", () => {
    const list = { kind: "list", spaceId: "s-1", projectId: "p-1", listId: "l-2" } as const;
    expect(selectedSpaceId(list)).toBe("s-1");
    expect(selectedProjectId(list)).toBe("p-1");
    expect(selectedListId(list)).toBe("l-2");
    expect(selectedFolderId(list)).toBe("");

    const space = { kind: "space", spaceId: "s-1" } as const;
    expect(selectedSpaceId(space)).toBe("s-1");
    // A Space is above every Project, so it names none.
    expect(selectedProjectId(space)).toBe("");

    expect(selectedSpaceId(NO_SELECTION)).toBe("");
    expect(selectedProjectId(NO_SELECTION)).toBe("");
  });
});

describe("isSelected", () => {
  it("lights exactly one row", () => {
    const selection = { kind: "list", spaceId: "s-1", projectId: "p-1", listId: "l-2" } as const;
    expect(isSelected(selection, selection)).toBe(true);
    // Neither ancestor lights up: two highlights read as two places.
    expect(isSelected(selection, { kind: "space", spaceId: "s-1" })).toBe(false);
    expect(isSelected(selection, { kind: "project", spaceId: "s-1", projectId: "p-1" })).toBe(false);
    expect(isSelected(selection, { kind: "list", spaceId: "s-1", projectId: "p-1", listId: "other" })).toBe(false);
  });

  it("matches an unresolved legacy selection against its row", () => {
    // The tree row knows its Space; a just-parsed legacy path does not. The
    // row must still light up rather than waiting for resolution.
    const legacy = parseSelection("/s/p-1/l/l-2");
    expect(isSelected(legacy, { kind: "list", spaceId: "s-7", projectId: "p-1", listId: "l-2" })).toBe(true);
  });
});

describe("filterForSelection", () => {
  it("narrows to exactly one level", () => {
    expect(filterForSelection({ kind: "project", spaceId: "s-1", projectId: "p-1" })).toEqual({ spaceId: "p-1" });
    expect(filterForSelection({ kind: "folder", spaceId: "s-1", projectId: "p-1", folderId: "f-1" })).toEqual({
      folderId: "f-1",
    });
    expect(filterForSelection({ kind: "list", spaceId: "s-1", projectId: "p-1", listId: "l-1" })).toEqual({
      listId: "l-1",
    });
    expect(filterForSelection(NO_SELECTION)).toEqual({});
  });

  it("narrows nothing at the Space level", () => {
    // `ViewFilter.spaceId` still holds a Project id — the filter language moves
    // in STEP 7. Until then a Space scope has no expression, and guessing one
    // here would put that decision in two places.
    expect(filterForSelection({ kind: "space", spaceId: "s-1" })).toEqual({});
  });
});
