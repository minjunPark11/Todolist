import { describe, expect, it } from "vitest";
import { isSpaceViewId, SPACE_VIEWS, spaceViewDef, specForSpaceView } from "./spaceViews";

describe("SPACE_VIEWS", () => {
  // `list` and `gantt` also took goals and milestones, and `showsGoals` said
  // which views did. Both records went with the Goals feature, so every view
  // asks for the one source there is.
  it("names its one source on every view", () => {
    for (const view of SPACE_VIEWS) {
      expect(view.sources).toEqual(["task"]);
    }
  });

  it("holds no Domain Section", () => {
    // Goals and Horizons had rows here, carried as boards. A Goal is not a
    // Task read differently — it is a different record with its own Source of
    // Truth (§26, §27.2) — so a `layout` for it was the engine claiming to
    // answer a question it does not hold. They are Sections now (./spaceNav).
    const ids = SPACE_VIEWS.map((view) => view.id);
    expect(ids).not.toContain("goals");
    expect(ids).not.toContain("horizons");
    expect(isSpaceViewId("goals")).toBe(false);
    expect(isSpaceViewId("horizons")).toBe(false);
  });

  it("falls back rather than rendering nothing for an unknown id", () => {
    expect(isSpaceViewId("board")).toBe(true);
    expect(isSpaceViewId("notes")).toBe(false);
    expect(spaceViewDef("nope" as never).id).toBe("list");
  });
});

describe("specForSpaceView", () => {
  it("opens the same view at any scope", () => {
    // The definition never mentions a scope; only the caller does. That is
    // what makes one view usable at four depths (§16/§18).
    const atFolder = specForSpaceView("board", { folderId: "folder-1" }, "Board");
    const atList = specForSpaceView("board", { listId: "list-2" }, "Board");
    expect(atFolder.groupBy).toBe(atList.groupBy);
    expect(atFolder.layout).toBe(atList.layout);
    expect(atFolder.filter.folderId).toBe("folder-1");
    expect(atList.filter.listId).toBe("list-2");
  });

  it("does not carry a scope the caller dropped", () => {
    // Widening from a List back up must not leave the old listId behind, or
    // the board would stay narrowed with nothing saying why.
    const widened = specForSpaceView("board", { folderId: "folder-1" }, "Board");
    expect(widened.filter.listId).toBeUndefined();
  });

  it("gives each view+scope pair its own id", () => {
    const ids = new Set([
      specForSpaceView("board", { folderId: "f" }, "").id,
      specForSpaceView("list", { folderId: "f" }, "").id,
      specForSpaceView("board", { listId: "l" }, "").id,
    ]);
    expect(ids.size).toBe(3);
  });

  it("always names its sources, so nothing leaks between views", () => {
    for (const view of SPACE_VIEWS) {
      const spec = specForSpaceView(view.id, { folderId: "f" }, "");
      expect(spec.filter.sources).toEqual(view.sources);
    }
  });
});
