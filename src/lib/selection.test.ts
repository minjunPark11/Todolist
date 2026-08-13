import { describe, expect, it } from "vitest";
import {
  clearSelection,
  emptySelection,
  isSelected,
  pruneSelection,
  selectAll,
  selectOnly,
  selectRange,
  toggleSelected,
  type SelectionState,
} from "./selection";

const rows = ["a", "b", "c", "d", "e"];

function state(ids: string[], anchor = ids[ids.length - 1] ?? ""): SelectionState {
  return { ids, anchor };
}

describe("selectOnly", () => {
  it("replaces the selection and sets the anchor", () => {
    expect(selectOnly(state(["a", "b"]), "d")).toEqual({ ids: ["d"], anchor: "d" });
  });

  it("returns the same reference when already the sole selection", () => {
    const current = state(["c"]);
    expect(selectOnly(current, "c")).toBe(current);
  });
});

describe("toggleSelected", () => {
  it("adds and removes without touching the rest", () => {
    const added = toggleSelected(state(["a"]), "c");
    expect(added.ids).toEqual(["a", "c"]);
    expect(toggleSelected(added, "a").ids).toEqual(["c"]);
  });

  it("moves the anchor even when deselecting", () => {
    expect(toggleSelected(state(["a", "b"]), "b").anchor).toBe("b");
  });
});

describe("selectRange", () => {
  it("fills in from the anchor, in either direction", () => {
    expect(selectRange(state(["b"], "b"), "d", rows).ids).toEqual(["b", "c", "d"]);
    expect(selectRange(state(["d"], "d"), "b", rows).ids).toEqual(["d", "b", "c"]);
  });

  it("keeps the anchor so repeated shift-clicks grow from one origin", () => {
    const first = selectRange(state(["b"], "b"), "d", rows);
    expect(first.anchor).toBe("b");
    // Shrinking back to c must still be measured from b, not from d.
    expect(selectRange(first, "c", rows).ids).toEqual(["b", "c", "d"]);
  });

  it("does not duplicate rows already selected", () => {
    const current: SelectionState = { ids: ["c"], anchor: "b" };
    expect(selectRange(current, "d", rows).ids).toEqual(["c", "b", "d"]);
  });

  it("falls back to a plain click when the anchor is gone", () => {
    expect(selectRange({ ids: [], anchor: "zz" }, "c", rows)).toEqual({ ids: ["c"], anchor: "c" });
    expect(selectRange(emptySelection, "c", rows)).toEqual({ ids: ["c"], anchor: "c" });
  });

  it("ignores a target that is not in the list", () => {
    const current = state(["a"]);
    expect(selectRange(current, "zz", rows)).toBe(current);
  });
});

describe("pruneSelection", () => {
  it("drops ids that left the list", () => {
    expect(pruneSelection(state(["a", "zz", "c"]), rows).ids).toEqual(["a", "c"]);
  });

  it("clears an anchor that left the list", () => {
    expect(pruneSelection({ ids: ["a"], anchor: "zz" }, rows).anchor).toBe("");
  });

  it("returns the same reference when nothing changed, so React can skip a render", () => {
    const current = state(["a", "b"]);
    expect(pruneSelection(current, rows)).toBe(current);
  });
});

describe("clearSelection and selectAll", () => {
  it("clears to the shared empty value", () => {
    expect(clearSelection(state(["a"]))).toEqual(emptySelection);
    expect(clearSelection(emptySelection)).toBe(emptySelection);
  });

  it("selects every row and anchors on the last", () => {
    expect(selectAll(rows)).toEqual({ ids: rows, anchor: "e" });
    expect(selectAll([])).toEqual({ ids: [], anchor: "" });
  });
});

describe("isSelected", () => {
  it("reports membership", () => {
    expect(isSelected(state(["a", "c"]), "c")).toBe(true);
    expect(isSelected(state(["a", "c"]), "b")).toBe(false);
  });
});
