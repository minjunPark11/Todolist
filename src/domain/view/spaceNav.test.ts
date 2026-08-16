import { describe, expect, it } from "vitest";
import {
  isSection,
  isSpaceNavId,
  isTaskView,
  navItem,
  navItemsForScope,
  PENDING_TASK_VIEWS,
  SPACE_NAV,
  viewDefForNav,
} from "./spaceNav";
import { SPACE_VIEWS } from "./spaceViews";

describe("the classification (§12)", () => {
  it("calls Goals and Horizons Sections, not Task Views", () => {
    // The distinction the registry exists for: a Goal is a different record
    // with its own Source of Truth, not a Task read a different way (§26).
    expect(isSection("goals")).toBe(true);
    expect(isSection("horizons")).toBe(true);
    expect(isSection("overview")).toBe(true);
    expect(isTaskView("board")).toBe(true);
    expect(isTaskView("list")).toBe(true);
  });

  it("gives a Section no view definition at all", () => {
    // Absence IS the classification. A Section with a definition would be a
    // Task View wearing a different label, which is what this replaced.
    expect(viewDefForNav("goals")).toBeUndefined();
    expect(viewDefForNav("horizons")).toBeUndefined();
    expect(viewDefForNav("overview")).toBeUndefined();
    expect(viewDefForNav("board")?.groupBy).toBe("status");
  });

  it("keeps the Task View ids in step with the view table", () => {
    const inNav = SPACE_NAV.filter((item) => item.kind === "task-view").map((item) => item.id).sort();
    const inTable = SPACE_VIEWS.map((view) => view.id).sort();
    expect(inNav).toEqual(inTable);
  });

  it("rejects an id that is neither", () => {
    expect(isSpaceNavId("board")).toBe(true);
    expect(isSpaceNavId("notes")).toBe(false);
    expect(navItem("nope" as never).id).toBe("overview");
  });
});

describe("navItemsForScope (§14)", () => {
  it("keeps the canonical order, whatever it drops", () => {
    // Order is declared once, in SPACE_NAV. A scope removes items; it never
    // rearranges them, or the same bar would read differently at two levels.
    const project = navItemsForScope("project").map((item) => item.id);
    const space = navItemsForScope("space").map((item) => item.id);
    const canonical = SPACE_NAV.map((item) => item.id);
    for (const list of [project, space]) {
      expect(list).toEqual(canonical.filter((id) => list.includes(id)));
    }
  });

  it("drops Board at the Space level (§0.3.3)", () => {
    // Statuses belong to a Project, so a Space holding two of them has no
    // defined column set. Absent beats a board that cannot say what its
    // columns mean.
    expect(navItemsForScope("space").map((item) => item.id)).not.toContain("board");
    expect(navItemsForScope("project").map((item) => item.id)).toContain("board");
    expect(navItemsForScope("folder").map((item) => item.id)).toContain("board");
    expect(navItemsForScope("list").map((item) => item.id)).toContain("board");
  });

  it("hides a Task View whose renderer is not connected yet", () => {
    // A tab that renders nothing is worse than a tab that is not there. This
    // set empties in STEP 9 and goes with it.
    for (const pending of PENDING_TASK_VIEWS) {
      expect(navItemsForScope("project").map((item) => item.id)).not.toContain(pending);
    }
    expect(navItemsForScope("project").map((item) => item.id)).toEqual([
      "overview",
      "list",
      "board",
      "goals",
      "horizons",
    ]);
  });

  it("never hides a Section", () => {
    for (const scope of ["space", "project", "folder", "list"] as const) {
      const ids = navItemsForScope(scope).map((item) => item.id);
      expect(ids).toContain("overview");
      expect(ids).toContain("goals");
      expect(ids).toContain("horizons");
    }
  });
});
