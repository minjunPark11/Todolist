import { describe, expect, it } from "vitest";
import {
  ancestorsOf,
  canAddChild,
  depthOf,
  isDescendantOf,
  MAX_TASK_DEPTH,
  reparentRefusal,
  subtreeHeight,
} from "./hierarchy";

/** A chain a → b → c → …, each the child of the one before. */
function chain(...ids: string[]) {
  return ids.map((id, index) => ({ id, parentTaskId: ids[index - 1] ?? "" }));
}

describe("ancestorsOf", () => {
  it("reads root first, which is the order a breadcrumb is drawn in", () => {
    expect(ancestorsOf("c", chain("a", "b", "c")).map((task) => task.id)).toEqual(["a", "b"]);
  });

  it("answers nothing for a root", () => {
    expect(ancestorsOf("a", chain("a", "b"))).toEqual([]);
  });

  // A parent that is not loaded yet, or was deleted. §22.18 says not to
  // rewrite the broken relation; this just stops where it can no longer see.
  it("stops at a parent that is not there rather than throwing", () => {
    const tasks = [{ id: "orphan", parentTaskId: "gone" }];
    expect(ancestorsOf("orphan", tasks)).toEqual([]);
    expect(depthOf("orphan", tasks)).toBe(1);
  });

  // Corrupted data from another client. §22.19: show it, do not hang on it.
  it("does not loop forever on a cycle", () => {
    const tasks = [
      { id: "a", parentTaskId: "c" },
      { id: "b", parentTaskId: "a" },
      { id: "c", parentTaskId: "b" },
    ];
    expect(ancestorsOf("a", tasks).map((task) => task.id)).toEqual(["b", "c"]);
  });
});

describe("depthOf", () => {
  it("counts the root as level 1 (§12.49)", () => {
    const tasks = chain("a", "b", "c", "d", "e");
    expect(tasks.map((task) => depthOf(task.id, tasks))).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("subtreeHeight", () => {
  it("is 1 for a Task with no children", () => {
    expect(subtreeHeight("a", chain("a"))).toBe(1);
  });

  it("measures to the deepest leaf, not the widest branch", () => {
    const tasks = [
      { id: "a", parentTaskId: "" },
      { id: "b", parentTaskId: "a" },
      { id: "c", parentTaskId: "a" },
      { id: "d", parentTaskId: "c" },
    ];
    expect(subtreeHeight("a", tasks)).toBe(3);
    expect(subtreeHeight("b", tasks)).toBe(1);
  });

  it("terminates on a cycle rather than overflowing the stack", () => {
    const tasks = [
      { id: "a", parentTaskId: "" },
      { id: "b", parentTaskId: "a" },
      { id: "a2", parentTaskId: "b" },
    ];
    // A genuine loop: b's child claims b as a descendant of itself.
    const looped = [...tasks, { id: "b", parentTaskId: "a2" }];
    expect(() => subtreeHeight("a", looped)).not.toThrow();
  });
});

describe("canAddChild (§12.49)", () => {
  it("allows a new level while there is room", () => {
    const tasks = chain("a", "b", "c", "d");
    expect(canAddChild("d", tasks)).toBe(true);
  });

  it("refuses one under the deepest allowed level", () => {
    const tasks = chain("a", "b", "c", "d", "e");
    expect(depthOf("e", tasks)).toBe(MAX_TASK_DEPTH);
    expect(canAddChild("e", tasks)).toBe(false);
  });
});

describe("reparentRefusal (§12.6)", () => {
  const tasks = chain("a", "b", "c");

  it("allows a legitimate move", () => {
    expect(reparentRefusal("c", "a", tasks)).toBeNull();
  });

  it("always allows outdenting to a root", () => {
    expect(reparentRefusal("c", "", tasks)).toBeNull();
  });

  it("refuses a Task as its own parent", () => {
    expect(reparentRefusal("a", "a", tasks)).toBe("self");
  });

  // §12.6's "Descendant as Parent": the branch would become its own ancestor.
  it("refuses a move under something already inside it", () => {
    expect(reparentRefusal("a", "c", tasks)).toBe("cycle");
    expect(reparentRefusal("a", "b", tasks)).toBe("cycle");
  });

  it("refuses a move that would push the subtree past the limit", () => {
    // A three-level branch, and a parent already on level 3: the leaves would
    // land on level 6.
    const source = [
      { id: "x", parentTaskId: "" },
      { id: "y", parentTaskId: "x" },
      { id: "z", parentTaskId: "y" },
      ...tasks,
    ];
    expect(subtreeHeight("x", source)).toBe(3);
    expect(reparentRefusal("x", "c", source)).toBe("depth");
    // One level shallower is fine.
    expect(reparentRefusal("x", "b", source)).toBeNull();
  });

  // §22.19: existing data deeper than the limit is not rewritten, but it does
  // not become a place to add more.
  it("refuses to deepen data that is already too deep", () => {
    const deep = [...chain("a", "b", "c", "d", "e", "f", "g"), { id: "loose", parentTaskId: "" }];
    expect(canAddChild("g", deep)).toBe(false);
    expect(reparentRefusal("loose", "g", deep)).toBe("depth");
    // And not only at the very bottom: anything past level 5 is already full.
    expect(canAddChild("e", deep)).toBe(false);
  });
});

describe("isDescendantOf", () => {
  it("counts a Task as inside itself, which is what the cycle check needs", () => {
    expect(isDescendantOf("a", "a", chain("a"))).toBe(true);
  });

  it("sees through more than one level", () => {
    const tasks = chain("a", "b", "c");
    expect(isDescendantOf("c", "a", tasks)).toBe(true);
    expect(isDescendantOf("a", "c", tasks)).toBe(false);
  });
});
