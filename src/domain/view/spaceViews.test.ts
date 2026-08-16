import { describe, expect, it } from "vitest";
import {
  isSpaceViewId,
  showsGoals,
  SPACE_VIEWS,
  spaceViewDef,
  specForSpaceView,
} from "./spaceViews";

describe("SPACE_VIEWS", () => {
  it("separates tasks from goals by filter, not by place", () => {
    // U5: the two mix in a List. Which one you are looking at is a view
    // setting, so the difference has to live in `sources` and nowhere else.
    expect(spaceViewDef("board").sources).toEqual(["task"]);
    expect(showsGoals("list")).toBe(true);
    expect(showsGoals("board")).toBe(false);
  });

  it("asks the time question of every kind of work", () => {
    expect(spaceViewDef("gantt").sources).toEqual(["task", "goal", "milestone"]);
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
    const atSpace = specForSpaceView("board", { spaceId: "space-1" }, "Board");
    const atList = specForSpaceView("board", { listId: "list-2" }, "Board");
    expect(atSpace.groupBy).toBe(atList.groupBy);
    expect(atSpace.layout).toBe(atList.layout);
    expect(atSpace.filter.spaceId).toBe("space-1");
    expect(atList.filter.listId).toBe("list-2");
  });

  it("carries a Project scope, which is a level of its own now", () => {
    const atProject = specForSpaceView("board", { projectId: "p-1" }, "Board");
    expect(atProject.filter.projectId).toBe("p-1");
    expect(atProject.filter.spaceId).toBeUndefined();
  });

  it("does not carry a scope the caller dropped", () => {
    // Widening from a List back up must not leave the old listId behind, or
    // the board would stay narrowed with nothing saying why.
    const widened = specForSpaceView("board", { spaceId: "space-1" }, "Board");
    expect(widened.filter.listId).toBeUndefined();
    expect(widened.filter.folderId).toBeUndefined();
    expect(widened.filter.projectId).toBeUndefined();
  });

  it("gives each view+scope pair its own id", () => {
    const ids = new Set([
      specForSpaceView("board", { spaceId: "s" }, "").id,
      specForSpaceView("list", { spaceId: "s" }, "").id,
      specForSpaceView("board", { listId: "l" }, "").id,
    ]);
    expect(ids.size).toBe(3);
  });

  it("always names its sources, so nothing leaks between views", () => {
    for (const view of SPACE_VIEWS) {
      const spec = specForSpaceView(view.id, { spaceId: "s" }, "");
      expect(spec.filter.sources).toEqual(view.sources);
    }
  });
});
