import { describe, expect, it } from "vitest";
import { isTaskActive } from "./scopeQuery";
import { isTaskAlive, isTaskOpen } from "./taskState";
import type { List, Task } from "../../types";

// P0-4b-5: the second axis of D-24 — a Task can be perfectly healthy and still
// invisible, because the List holding it was put away.
//
// The app relies on this NOT being written onto the Task: §6.56 archives a
// List without touching its rows, which is what makes restoring the List bring
// them all back and why they never appear in the Task Trash. So the only place
// the rule can live is a predicate over both.

function task(over: Partial<Task> = {}): Task {
  return { id: "t1", title: "A task", status: "todo", projectId: "", listId: "l1", ...over } as Task;
}
function list(over: Partial<List> = {}): List {
  return { id: "l1", name: "List", order: 1 } as List;
}

const NOW = "2026-08-19T09:00:00.000Z";

describe("a Task whose List was put away", () => {
  const healthy = task();

  it("is still alive and still open on its own terms", () => {
    // Nothing was written on it, so axis 1 has no idea anything happened.
    expect(isTaskAlive(healthy)).toBe(true);
    expect(isTaskOpen(healthy)).toBe(true);
  });

  it("is invisible once the List is archived or deleted", () => {
    expect(isTaskActive(healthy, [list()])).toBe(true);
    expect(isTaskActive(healthy, [{ ...list(), archivedAt: NOW } as List])).toBe(false);
    expect(isTaskActive(healthy, [{ ...list(), deletedAt: NOW } as List])).toBe(false);
  });

  // The filter App.tsx applies before handing tasks to Focus, the Calendar,
  // the reminder queue and the rest.
  it("drops out of the visible set the surfaces are given", () => {
    const rows = [task({ id: "kept" }), task({ id: "hidden", listId: "gone" })];
    const lists = [list(), { id: "gone", name: "Gone", order: 2, deletedAt: NOW } as List];

    expect(rows.filter((row) => isTaskActive(row, lists)).map((row) => row.id)).toEqual(["kept"]);
  });

  it("comes back when the List does, without the Task being touched", () => {
    const before = { ...healthy };
    expect(isTaskActive(healthy, [{ ...list(), archivedAt: NOW } as List])).toBe(false);
    expect(isTaskActive(healthy, [list()])).toBe(true);
    expect(healthy).toEqual(before);
  });

  // A Task the backfill has not reached yet owns no List, and must not vanish.
  it("keeps a Task that no List claims", () => {
    expect(isTaskActive(task({ listId: "", projectId: "" }), [])).toBe(true);
  });
});
