import { describe, expect, it } from "vitest";
import type { CheckItem } from "../../types";
import {
  checkItemsForTask,
  checklistProgress,
  duplicateCheckItems,
  isChecklistMode,
  pruneOrphanCheckItems,
  removeCheckItemsForTask,
  sanitizeCheckItem,
  sortKeyForMovedCheckItem,
  sortKeyForNewCheckItem,
  toggleCheckItemPatch,
} from "./checkItems";
import { ORDER_STEP } from "./sortKey";

const NOW = "2026-08-23T00:00:00.000Z";

function item(overrides: Partial<CheckItem> = {}): CheckItem {
  return {
    id: "c1",
    taskId: "t1",
    text: "A line",
    checked: false,
    completedAt: "",
    sortKey: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("checkItemsForTask", () => {
  it("gathers only its own Task's lines, in key order", () => {
    const items = [
      item({ id: "b", sortKey: 2000 }),
      item({ id: "a", sortKey: 1000 }),
      item({ id: "other", taskId: "t2", sortKey: 0 }),
    ];
    expect(checkItemsForTask("t1", items).map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  // Two devices adding a line offline both land on the same next key. Falling
  // back to `createdAt` would order the list by whichever clock was ahead,
  // and it would reshuffle on sync.
  it("breaks a tied key by text, not by when it was written", () => {
    const items = [
      item({ id: "z", text: "Zebra", sortKey: 1000, createdAt: "2026-01-01T00:00:00.000Z" }),
      item({ id: "a", text: "Apple", sortKey: 1000, createdAt: "2026-12-01T00:00:00.000Z" }),
    ];
    expect(checkItemsForTask("t1", items).map((entry) => entry.id)).toEqual(["a", "z"]);
  });

  it("answers nothing for no Task", () => {
    expect(checkItemsForTask("", [item()])).toEqual([]);
  });
});

describe("checklistProgress", () => {
  it("is derived from the lines, never stored", () => {
    const items = [item({ id: "a", checked: true }), item({ id: "b" }), item({ id: "c", taskId: "t2" })];
    expect(checklistProgress("t1", items)).toEqual({ done: 1, total: 2 });
  });

  it("is zero for a Task with no lines", () => {
    expect(checklistProgress("t9", [item()])).toEqual({ done: 0, total: 0 });
  });
});

describe("isChecklistMode", () => {
  // A Task written before the field existed is prose, which is what it always
  // was — no record has to be rewritten for the mode to arrive.
  it("treats an absent mode as description", () => {
    expect(isChecklistMode({ contentMode: undefined })).toBe(false);
    expect(isChecklistMode({ contentMode: "checklist" })).toBe(true);
  });
});

describe("sanitizeCheckItem", () => {
  it("refuses a line with no id or no Task", () => {
    expect(sanitizeCheckItem({ id: "c1" })).toBeNull();
    expect(sanitizeCheckItem({ taskId: "t1" })).toBeNull();
    expect(sanitizeCheckItem("nonsense")).toBeNull();
  });

  // `checked` and `completedAt` say the same thing, and two fields that say
  // the same thing are two fields that can disagree.
  it("repairs a tick with no time, and drops a time with no tick", () => {
    expect(sanitizeCheckItem({ id: "c", taskId: "t", checked: true, updatedAt: NOW })?.completedAt).toBe(NOW);
    expect(sanitizeCheckItem({ id: "c", taskId: "t", checked: false, completedAt: NOW })?.completedAt).toBe("");
  });

  // M0: a field this build has never heard of survives the round trip, or a
  // client one version behind erases what a newer one wrote.
  it("carries a field it does not know", () => {
    const sanitized = sanitizeCheckItem({ id: "c", taskId: "t", futureField: 42 }) as unknown as Record<string, unknown>;
    expect(sanitized.futureField).toBe(42);
  });

  it("keeps an empty line, which the editor refuses but storage may hold", () => {
    expect(sanitizeCheckItem({ id: "c", taskId: "t", text: "" })?.text).toBe("");
  });
});

describe("ordering", () => {
  it("appends after the last line", () => {
    const items = [item({ id: "a", sortKey: 0 }), item({ id: "b", sortKey: ORDER_STEP })];
    expect(sortKeyForNewCheckItem("t1", items)).toBe(ORDER_STEP * 2);
  });

  it("starts at zero for the first line", () => {
    expect(sortKeyForNewCheckItem("t1", [])).toBe(0);
  });

  it("places a moved line between its new neighbours", () => {
    const items = [
      item({ id: "a", sortKey: 0 }),
      item({ id: "b", sortKey: 1000 }),
      item({ id: "c", sortKey: 2000 }),
    ];
    // `c` dropped between `a` and `b` — the moving line is not its own
    // neighbour, or the key would be computed against where it already is.
    expect(sortKeyForMovedCheckItem("t1", items, "c", 1)).toBe(500);
  });

  // Null is the signal to renumber, not a failure to hide: a caller that
  // ignored it would write a key equal to its neighbour, and a tie is a list
  // that reorders itself on the next render.
  it("reports no room when two neighbours already share a key", () => {
    const items = [item({ id: "a", sortKey: 500 }), item({ id: "b", sortKey: 500 })];
    expect(sortKeyForMovedCheckItem("t1", items, "c", 1)).toBeNull();
  });

  it("reports no room when the keys are adjacent doubles", () => {
    const items = [item({ id: "a", sortKey: 1 }), item({ id: "b", sortKey: 1 + Number.EPSILON })];
    expect(sortKeyForMovedCheckItem("t1", items, "c", 1)).toBeNull();
  });
});

describe("toggleCheckItemPatch", () => {
  it("moves the time with the tick, in both directions", () => {
    expect(toggleCheckItemPatch(item(), NOW)).toEqual({ checked: true, completedAt: NOW, updatedAt: NOW });
    expect(toggleCheckItemPatch(item({ checked: true, completedAt: NOW }), NOW)).toEqual({
      checked: false,
      completedAt: "",
      updatedAt: NOW,
    });
  });
});

describe("removal", () => {
  it("takes a Task's lines with it and leaves the others", () => {
    const items = [item({ id: "a" }), item({ id: "b", taskId: "t2" })];
    expect(removeCheckItemsForTask("t1", items).map((entry) => entry.id)).toEqual(["b"]);
  });

  it("returns the same array when there was nothing to remove", () => {
    const items = [item({ taskId: "t2" })];
    expect(removeCheckItemsForTask("t1", items)).toBe(items);
    expect(removeCheckItemsForTask("", items)).toBe(items);
  });

  it("prunes lines whose Task is gone, against the survivors", () => {
    const items = [item({ id: "a", taskId: "t1" }), item({ id: "b", taskId: "gone" })];
    expect(pruneOrphanCheckItems([{ id: "t1" }], items).map((entry) => entry.id)).toEqual(["a"]);
  });

  it("returns the same array when every line still has its Task", () => {
    const items = [item({ taskId: "t1" })];
    expect(pruneOrphanCheckItems([{ id: "t1" }], items)).toBe(items);
  });
});

describe("duplicateCheckItems", () => {
  // A copy is work still to do. Carrying the ticks across would hand the user
  // a checklist claiming to be half finished.
  it("copies the text and order, and unticks everything", () => {
    const items = [
      item({ id: "a", text: "First", sortKey: 0, checked: true, completedAt: NOW }),
      item({ id: "b", text: "Second", sortKey: 1000 }),
    ];
    const copies = duplicateCheckItems("t1", "t2", items, (index) => `copy-${index}`, "2026-09-01T00:00:00.000Z");

    expect(copies.map((entry) => [entry.id, entry.text, entry.taskId, entry.checked, entry.completedAt])).toEqual([
      ["copy-0", "First", "t2", false, ""],
      ["copy-1", "Second", "t2", false, ""],
    ]);
    expect(copies.map((entry) => entry.sortKey)).toEqual([0, 1000]);
  });

  it("copies nothing for a Task with no lines", () => {
    expect(duplicateCheckItems("t9", "t2", [item()], (index) => `copy-${index}`, NOW)).toEqual([]);
  });
});

// The distinction Chapter 26 §26.4 exists to protect. These are two records
// with two purposes that happen to look alike, and nothing here should make
// one reachable from the other.
describe("a CheckItem is not a Subtask", () => {
  it("holds text and a tick, and no Task fields", () => {
    const keys = Object.keys(item()).sort();
    expect(keys).toEqual(["checked", "completedAt", "createdAt", "id", "sortKey", "taskId", "text", "updatedAt"]);
    for (const absent of ["dueDate", "priority", "tags", "parentTaskId", "status", "listId"]) {
      expect(keys).not.toContain(absent);
    }
  });
});
