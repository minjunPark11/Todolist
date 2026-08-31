// A matrix box's stored view — what it is called, and in what colour
// (TICKTICK_MATRIX_DESIGN.md §20.6, §21.3).
//
// The grouping options ride in the same record and are checked here through
// `sanitizeMatrixView`, which is this module's job: a value written by another
// version must fold to something drawable rather than crash a box. What those
// options DO is `viewGroups.test.ts`.
import { describe, expect, it } from "vitest";
import { MATRIX_LABEL_MAX, matrixQuadrantLabels, sanitizeMatrixView } from "./matrixGroups";
import { DEFAULT_GROUP_VIEW } from "./viewGroups";

describe("sanitizeMatrixView", () => {
  it("keeps what it recognises", () => {
    expect(sanitizeMatrixView({ groupBy: "none", sortKey: "title", sortOrder: "desc" })).toEqual({
      groupBy: "none",
      sortKey: "title",
      sortOrder: "desc",
    });
  });

  it("folds anything else to the default", () => {
    // These sync, so a value written by another version must not be able to
    // leave a box unable to draw itself.
    expect(sanitizeMatrixView({ groupBy: "constellation", sortKey: 7, sortOrder: null })).toEqual(
      DEFAULT_GROUP_VIEW,
    );
    expect(sanitizeMatrixView(undefined)).toEqual(DEFAULT_GROUP_VIEW);
    expect(sanitizeMatrixView("nonsense")).toEqual(DEFAULT_GROUP_VIEW);
  });

  it("does not offer priority as a sort", () => {
    // Every task in a box has the box's priority (D1), so sorting by it would
    // be a control that visibly does nothing.
    expect(sanitizeMatrixView({ sortKey: "priority" }).sortKey).toBe("dueDate");
  });
});

describe("what a box is called (§20.6)", () => {
  const base = { groupBy: "dueDate", sortKey: "dueDate", sortOrder: "asc" } as const;

  it("stores nothing for a box nobody has named", () => {
    // Absent and "" have to be the same state, or "cleared" would be a
    // preference the account carries around forever.
    const view = sanitizeMatrixView({ ...base, name: "   ", hint: "", color: "" });

    expect("name" in view).toBe(false);
    expect("hint" in view).toBe(false);
    expect("color" in view).toBe(false);
  });

  it("trims what was typed and caps how long it can be", () => {
    const view = sanitizeMatrixView({ ...base, name: "  화요일 마감  ", hint: "x".repeat(80) });

    expect(view.name).toBe("화요일 마감");
    expect(view.hint).toHaveLength(MATRIX_LABEL_MAX);
  });

  it("keeps a colour it knows and drops one it does not", () => {
    expect(sanitizeMatrixView({ ...base, color: "indigo" }).color).toBe("indigo");
    // A value from another build folds to the box's own colour rather than
    // painting something this one cannot resolve.
    expect(sanitizeMatrixView({ ...base, color: "chartreuse" }).color).toBeUndefined();
    expect(sanitizeMatrixView({ ...base, color: "#ff0000" }).color).toBeUndefined();
  });

  it("falls back to the built-in name, and to no second line at all", () => {
    expect(matrixQuadrantLabels(undefined, "Do first")).toEqual({ name: "Do first", hint: "" });
    // Naming a box does not invent a second line for it.
    expect(matrixQuadrantLabels({ ...base, name: "Tuesday" }, "Do first")).toEqual({
      name: "Tuesday",
      hint: "",
    });
    // The one way a second line exists: the user typed it.
    expect(matrixQuadrantLabels({ ...base, hint: "Before the standup" }, "Do first")).toEqual({
      name: "Do first",
      hint: "Before the standup",
    });
  });
});
