import { describe, expect, it } from "vitest";
import { applyPatch, markWontDo, unmarkWontDo } from "./mutations";
import { isCompleted, isTaskActive, isTaskOpen, isWontDo, matchesScope, type ScopeContext } from "./scopeQuery";
import { scopeRegistry } from "./scopeRegistry";
import type { List, Task } from "../../types";

const LIST: List = { id: "l1", spaceId: "", projectId: "", name: "List", order: 1 } as List;

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "A task",
    status: "todo",
    projectId: "",
    listId: "l1",
    completedAt: "",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...over,
  } as Task;
}

const ctx: ScopeContext = {
  tasks: [],
  lists: [LIST],
  dailyPlans: [],
  taskTags: [],
  today: "2026-08-19",
  savedFilters: [],
};

const NOW = "2026-08-19T09:00:00.000Z";

describe("Won't Do (audit D-23)", () => {
  it("reads from one field, unlike completion", () => {
    expect(isWontDo(task())).toBe(false);
    expect(isWontDo(task({ wontDoAt: NOW }))).toBe(true);
  });

  it("takes the task out of every active Scope", () => {
    const given = task({ wontDoAt: NOW });
    expect(isTaskActive(given, [LIST])).toBe(false);
    expect(isTaskOpen(given)).toBe(false);
    expect(matchesScope(given, { kind: "today" }, ctx)).toBe(false);
    expect(matchesScope(given, { kind: "list", id: "l1" }, ctx)).toBe(false);
  });

  it("lands in its own Scope and not in Completed", () => {
    const given = task({ wontDoAt: NOW });
    expect(matchesScope(given, { kind: "wontDo" }, ctx)).toBe(true);
    expect(matchesScope(given, { kind: "completed" }, ctx)).toBe(false);
    // It never writes completedAt, so completion statistics stay clean.
    expect(isCompleted(given)).toBe(false);
  });

  // A task can be finished and then given up on only by a bug, but the two
  // Scopes must still be disjoint if it happens.
  it("keeps Completed and Won't Do disjoint even for a task marked both", () => {
    const both = task({ status: "done", completedAt: NOW, wontDoAt: NOW });
    expect(matchesScope(both, { kind: "wontDo" }, ctx)).toBe(true);
    expect(matchesScope(both, { kind: "completed" }, ctx)).toBe(false);
  });

  it("loses to Trash, which outranks it", () => {
    const trashed = task({ wontDoAt: NOW, deletedAt: NOW });
    expect(matchesScope(trashed, { kind: "trash" }, ctx)).toBe(true);
    expect(matchesScope(trashed, { kind: "wontDo" }, ctx)).toBe(false);
  });

  describe("the mutation", () => {
    it("writes one field and leaves status alone", () => {
      const given = task({ status: "doing" });
      const after = applyPatch(given, markWontDo(given, NOW).patch);
      expect(after.wontDoAt).toBe(NOW);
      expect(after.status).toBe("doing");
      expect(after.completedAt).toBe("");
    });

    // P0: the mark is on this occurrence, and the rule that makes the next one
    // is not the mark's business.
    it("does not touch a repeating task's rule", () => {
      const given = task({ repeatType: "weekly", repeatInterval: 1, repeatEndDate: "2026-12-31" });
      const after = applyPatch(given, markWontDo(given, NOW).patch);
      expect(after.repeatType).toBe("weekly");
      expect(after.repeatInterval).toBe(1);
      expect(after.repeatEndDate).toBe("2026-12-31");
    });

    // P0: no automatic propagation. The parent's field is not the child's.
    it("does not reach a child task", () => {
      const parent = task({ id: "p1" });
      const child = task({ id: "c1", parentTaskId: "p1" });
      applyPatch(parent, markWontDo(parent, NOW).patch);
      expect(child.wontDoAt).toBeUndefined();
    });

    it("undoes to the value that was there, absent included", () => {
      const never = task();
      expect(markWontDo(never, NOW).undo).toEqual({ wontDoAt: undefined });

      const emptied = task({ wontDoAt: "" });
      expect(markWontDo(emptied, NOW).undo).toEqual({ wontDoAt: "" });
    });

    it("clears without needing a previous status to guess at", () => {
      const given = task({ status: "doing", wontDoAt: NOW });
      const after = applyPatch(given, unmarkWontDo(given).patch);
      expect(after.wontDoAt).toBe("");
      expect(after.status).toBe("doing");
      expect(isTaskOpen(after)).toBe(true);
    });
  });

  it("is a read-only Scope, like the two beside it", () => {
    expect(scopeRegistry.wontDo.canCreate).toBe(false);
    expect(scopeRegistry.wontDo.canManualReorder).toBe(false);
    expect(scopeRegistry.wontDo.segment).toBe("wont-do");
  });
});
