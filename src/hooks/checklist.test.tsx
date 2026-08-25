// @vitest-environment jsdom
//
// The checklist as the user actually meets it: through the planner store, with
// Undo behind it. The conversion is the part worth testing here rather than in
// the domain — §11.14 is a claim about a transaction, and a transaction is not
// visible in a pure function.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { popUndo } from "../lib/undoStack";

const store = new Map<string, string>();
vi.mock("../platform", () => ({
  platform: {
    storage: {
      getSync: (key: string) => store.get(key) ?? null,
      setSync: (key: string, value: string) => void store.set(key, value),
      removeSync: (key: string) => void store.delete(key),
    },
  },
}));

import { usePlannerData } from "./usePlannerData";

// The undo stack merges pushes within 150ms into one group, so that a single
// user action fanning out to several stores is one Ctrl+Z. A test does its
// setup and its subject in the same millisecond, which would merge them —
// this clock is what keeps them apart. Only the stack reads `Date.now`; the
// records still get real timestamps.
let clock = 0;

/** Past the grouping window, so what follows is its own undoable action. */
function separately() {
  clock += 200;
}

beforeEach(() => {
  store.clear();
  clock = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => clock);
});

afterEach(() => {
  while (popUndo());
  vi.restoreAllMocks();
  cleanup();
});

/** A planner holding one Task, and that Task's id. */
function plannerWithTask(description = "") {
  const { result } = renderHook(() => usePlannerData());
  let id = "";
  act(() => {
    id = result.current.addTask({ title: "Talk prep", description });
  });
  separately();
  return { result, id };
}

const lines = (result: { current: ReturnType<typeof usePlannerData> }, taskId: string) =>
  result.current.checkItems
    .filter((item) => item.taskId === taskId)
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((item) => `${item.checked ? "x" : " "} ${item.text}`);

const task = (result: { current: ReturnType<typeof usePlannerData> }, id: string) =>
  result.current.tasks.find((entry) => entry.id === id)!;

describe("editing a checklist", () => {
  it("adds a line, and refuses one that is only whitespace", () => {
    const { result, id } = plannerWithTask();

    act(() => {
      result.current.addCheckItem(id, "Prepare slides");
      result.current.addCheckItem(id, "   ");
    });

    expect(lines(result, id)).toEqual(["  Prepare slides"]);
  });

  it("keeps added lines in the order they were added", () => {
    const { result, id } = plannerWithTask();

    act(() => {
      result.current.addCheckItem(id, "First");
    });
    act(() => {
      result.current.addCheckItem(id, "Second");
    });

    expect(lines(result, id)).toEqual(["  First", "  Second"]);
  });

  it("ticks and unticks, moving the completion time with the tick", () => {
    const { result, id } = plannerWithTask();
    act(() => {
      result.current.addCheckItem(id, "Prepare slides");
    });
    const itemId = result.current.checkItems[0].id;

    act(() => {
      result.current.toggleCheckItem(itemId);
    });
    expect(result.current.checkItems[0].completedAt).not.toBe("");

    act(() => {
      result.current.toggleCheckItem(itemId);
    });
    expect(result.current.checkItems[0].completedAt).toBe("");
  });

  it("trims on rename and leaves the inner spacing alone", () => {
    const { result, id } = plannerWithTask();
    act(() => {
      result.current.addCheckItem(id, "Prepare slides");
    });

    act(() => {
      result.current.updateCheckItemText(result.current.checkItems[0].id, "  Prepare  the  slides  ");
    });

    expect(result.current.checkItems[0].text).toBe("Prepare  the  slides");
  });

  it("deletes one line and leaves the rest", () => {
    const { result, id } = plannerWithTask();
    act(() => {
      result.current.addCheckItems(id, ["First", "Second", "Third"]);
    });

    act(() => {
      result.current.deleteCheckItem(result.current.checkItems[1].id);
    });

    expect(lines(result, id)).toEqual(["  First", "  Third"]);
  });

  // §11.34: a paste is one action, so Ctrl+Z takes back the paste — not the
  // last line of it.
  it("treats a multi-line paste as one action", () => {
    const { result, id } = plannerWithTask();

    act(() => {
      result.current.addCheckItems(id, ["First", "  ", "Second", "Third"]);
    });
    expect(lines(result, id)).toEqual(["  First", "  Second", "  Third"]);

    act(() => {
      popUndo();
    });
    expect(lines(result, id)).toEqual([]);
  });

  it("moves a line to a new position", () => {
    const { result, id } = plannerWithTask();
    act(() => {
      result.current.addCheckItems(id, ["First", "Second", "Third"]);
    });
    const third = result.current.checkItems[2].id;

    act(() => {
      result.current.moveCheckItem(third, 0);
    });

    expect(lines(result, id)).toEqual(["  Third", "  First", "  Second"]);
  });

  // Renumbering is the fallback when two neighbours have no room between them.
  // What matters is that the user sees the order they asked for.
  it("still lands in the right place when the keys have run out of room", () => {
    const { result, id } = plannerWithTask();
    act(() => {
      result.current.addCheckItems(id, ["First", "Second", "Third"]);
    });
    const [a, b, c] = result.current.checkItems.map((item) => item.id);
    // Squeeze the first two together, so there is nothing between them.
    act(() => {
      result.current.moveCheckItem(b, 0);
      result.current.moveCheckItem(b, 1);
    });

    act(() => {
      result.current.moveCheckItem(c, 1);
    });

    expect(lines(result, id)).toEqual(["  First", "  Third", "  Second"]);
    expect([a, b, c].length).toBe(3);
  });
});

describe("the mode toggle (spec §11.5, §11.14)", () => {
  it("moves the Description into lines, and leaves no second copy", () => {
    const { result, id } = plannerWithTask("Prepare slides\nEmail professor\n\nCheck data");

    act(() => {
      result.current.setTaskContentMode(id, "checklist");
    });

    expect(lines(result, id)).toEqual(["  Prepare slides", "  Email professor", "  Check data"]);
    // §11.13: exactly one active content. Two copies is how they start
    // disagreeing.
    expect(task(result, id).description).toBe("");
    expect(task(result, id).contentMode).toBe("checklist");
  });

  // §11.15. The conversion changes the shape of the data, so it has to be
  // takeable back — and in one step, because it was one action.
  it("comes back whole on a single Undo", () => {
    const original = "Prepare slides\nEmail professor";
    const { result, id } = plannerWithTask(original);

    act(() => {
      result.current.setTaskContentMode(id, "checklist");
    });
    separately();
    act(() => {
      popUndo();
    });

    expect(task(result, id).description).toBe(original);
    expect(task(result, id).contentMode ?? "description").toBe("description");
    expect(lines(result, id)).toEqual([]);
  });

  it("writes the ticks down on the way back to prose (§11.19)", () => {
    const { result, id } = plannerWithTask();
    act(() => {
      result.current.setTaskContentMode(id, "checklist");
      result.current.addCheckItems(id, ["Prepare slides", "Email professor"]);
    });
    act(() => {
      result.current.toggleCheckItem(result.current.checkItems[1].id);
    });

    act(() => {
      result.current.setTaskContentMode(id, "description");
    });

    expect(task(result, id).description).toBe("- [ ] Prepare slides\n- [x] Email professor");
    expect(lines(result, id)).toEqual([]);
  });

  it("does not lose which lines were done across a full round trip", () => {
    const { result, id } = plannerWithTask();
    act(() => {
      result.current.setTaskContentMode(id, "checklist");
      result.current.addCheckItems(id, ["Prepare slides", "Email professor"]);
    });
    act(() => {
      result.current.toggleCheckItem(result.current.checkItems[1].id);
    });

    act(() => {
      result.current.setTaskContentMode(id, "description");
    });
    act(() => {
      result.current.setTaskContentMode(id, "checklist");
    });

    expect(lines(result, id)).toEqual(["  Prepare slides", "x Email professor"]);
  });

  // §11.6 and §11.16: nothing to move means nothing to ask about.
  it("switches an empty Task either way without inventing a line", () => {
    const { result, id } = plannerWithTask();

    act(() => {
      result.current.setTaskContentMode(id, "checklist");
    });
    expect(lines(result, id)).toEqual([]);

    act(() => {
      result.current.setTaskContentMode(id, "description");
    });
    expect(task(result, id).description).toBe("");
  });

  it("does nothing when the Task is already in that mode", () => {
    const { result, id } = plannerWithTask("Some prose");
    const before = task(result, id);

    act(() => {
      result.current.setTaskContentMode(id, "description");
    });

    expect(task(result, id)).toBe(before);
  });
});
