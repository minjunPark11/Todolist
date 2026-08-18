import { describe, expect, it } from "vitest";
import { isRovingKey, rovingNext } from "./rovingChoice";

const VIEWS = ["list", "board", "gantt"] as const;

describe("rovingNext (§9.9, §9.10)", () => {
  it("moves one either way", () => {
    expect(rovingNext(VIEWS, "list", "ArrowRight")).toBe("board");
    expect(rovingNext(VIEWS, "board", "ArrowRight")).toBe("gantt");
    expect(rovingNext(VIEWS, "board", "ArrowLeft")).toBe("list");
  });

  it("treats up and down as the same axis, so a wrapped group still works", () => {
    expect(rovingNext(VIEWS, "list", "ArrowDown")).toBe("board");
    expect(rovingNext(VIEWS, "board", "ArrowUp")).toBe("list");
  });

  // A radio group is a ring in the ARIA pattern. Stopping dead at the end
  // reads as the key having failed rather than as a boundary.
  it("wraps at both ends", () => {
    expect(rovingNext(VIEWS, "gantt", "ArrowRight")).toBe("list");
    expect(rovingNext(VIEWS, "list", "ArrowLeft")).toBe("gantt");
  });

  it("puts Home and End on the ends of what is drawn", () => {
    expect(rovingNext(VIEWS, "gantt", "Home")).toBe("list");
    expect(rovingNext(VIEWS, "list", "End")).toBe("gantt");
  });

  // The colour group's first value is "" — no colour — and it is a real
  // choice, so Home lands on it exactly as §9.9 says.
  it("handles a group whose first value is the empty one", () => {
    const colors = ["", "red", "blue"] as const;
    expect(rovingNext(colors, "blue", "Home")).toBe("");
    expect(rovingNext(colors, "", "ArrowLeft")).toBe("blue");
    expect(rovingNext(colors, "", "ArrowRight")).toBe("red");
  });

  it("starts from an end when nothing is selected yet", () => {
    expect(rovingNext(VIEWS, "unknown" as never, "ArrowRight")).toBe("list");
    expect(rovingNext(VIEWS, "unknown" as never, "ArrowLeft")).toBe("gantt");
  });

  it("has nothing to answer for an empty group", () => {
    expect(rovingNext([], "x", "ArrowRight")).toBeNull();
  });

  it("claims only the keys it handles", () => {
    expect(isRovingKey("ArrowRight")).toBe(true);
    expect(isRovingKey("Home")).toBe(true);
    // Enter and Escape belong to the dialog (§9.15, §9.17), not to the group.
    expect(isRovingKey("Enter")).toBe(false);
    expect(isRovingKey("Escape")).toBe(false);
    expect(isRovingKey("Tab")).toBe(false);
  });
});
