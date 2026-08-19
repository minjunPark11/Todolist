import { describe, expect, it } from "vitest";
import {
  isViewAllowed,
  resolveView,
  scopeRegistry,
  TASK_SCOPE_KINDS,
  TASK_VIEW_KINDS,
  type TaskScopeKind,
} from "./scopeRegistry";

describe("the registry says what the matrix says", () => {
  // Ten now, not the plan's nine: D-23 adds Won't Do as a third terminal
  // state beside Completed and Trash, and D-20 retires Task Archive into it.
  it("holds the canonical Scopes and no more", () => {
    expect([...TASK_SCOPE_KINDS].sort()).toEqual([
      "completed",
      "filter",
      "folder",
      "inbox",
      "list",
      "tag",
      "today",
      "trash",
      "upcoming",
      "wontDo",
    ]);
  });

  // 5.45: Board belongs to Inbox and a real List only, for the MVP.
  it("allows Board on Inbox and List alone", () => {
    const withBoard = TASK_SCOPE_KINDS.filter((kind) => isViewAllowed(kind, "board"));
    expect(withBoard.sort()).toEqual(["inbox", "list"]);
  });

  it("defaults every Scope to List (5.46)", () => {
    for (const kind of TASK_SCOPE_KINDS) {
      expect(scopeRegistry[kind].defaultView).toBe("list");
    }
  });

  it("keeps every default inside its own allowed set", () => {
    for (const kind of TASK_SCOPE_KINDS) {
      expect(isViewAllowed(kind, scopeRegistry[kind].defaultView)).toBe(true);
    }
  });

  // 12.4: the terminal Scopes are read-only. Creating into Completed, Won't Do
  // or Trash has no meaning that would not immediately contradict the Scope.
  it("refuses creation in the terminal Scopes, and allows it everywhere else", () => {
    const cannot = TASK_SCOPE_KINDS.filter((kind) => !scopeRegistry[kind].canCreate);
    expect(cannot.sort()).toEqual(["completed", "trash", "wontDo"]);
  });

  it("gives the terminal Scopes their own count semantics (12.14)", () => {
    expect(scopeRegistry.completed.countMode).toBe("completed");
    expect(scopeRegistry.wontDo.countMode).toBe("wontDo");
    expect(scopeRegistry.trash.countMode).toBe("trash");
    const active = TASK_SCOPE_KINDS.filter((kind) => scopeRegistry[kind].countMode === "active");
    expect(active).toHaveLength(7);
  });

  // 12.4 Manual reorder column. Today is the interesting one: 7.5 keeps it off
  // so that dragging a due-only Task cannot invent a TodayPlan for it.
  it("allows manual reorder only where a stored order exists to change", () => {
    const reorderable = TASK_SCOPE_KINDS.filter((kind) => scopeRegistry[kind].canManualReorder);
    expect(reorderable.sort()).toEqual(["inbox", "list"]);
  });

  // The create-owner column. Folder is not an omission: it holds several Lists
  // and the plan refuses to pick one silently.
  it("names an owner for creation in every Scope that allows it", () => {
    expect(scopeRegistry.today.createOwner).toBe("inbox");
    expect(scopeRegistry.list.createOwner).toBe("currentList");
    expect(scopeRegistry.folder.createOwner).toBe("requiresList");
    expect(scopeRegistry.completed.createOwner).toBe("none");
  });

  it("names an id-bearing URL for exactly the Scopes that point at a record", () => {
    const withId = TASK_SCOPE_KINDS.filter((kind) => scopeRegistry[kind].hasId);
    expect(withId.sort()).toEqual(["filter", "folder", "list", "tag"]);
  });
});

describe("resolveView", () => {
  it("keeps an allowed view and falls back for anything else (5.65)", () => {
    expect(resolveView("inbox", "board")).toBe("board");
    expect(resolveView("inbox", "banana")).toBe("list");
    expect(resolveView("today", "board")).toBe("list");
    expect(resolveView("list", undefined)).toBe("list");
  });

  it("never answers with a view the Scope forbids", () => {
    for (const kind of TASK_SCOPE_KINDS as TaskScopeKind[]) {
      for (const requested of ["list", "board", "gantt", ""]) {
        expect(isViewAllowed(kind, resolveView(kind, requested))).toBe(true);
      }
    }
  });
});

// Add List design Phase 3 (§R.6). Gantt joins on §5.45's terms, not its own.
describe("Gantt is offered where a Scope is one List's screen", () => {
  it("is allowed exactly where Board is", () => {
    const withGantt = TASK_SCOPE_KINDS.filter((kind) => scopeRegistry[kind].allowedViews.includes("gantt"));
    const withBoard = TASK_SCOPE_KINDS.filter((kind) => scopeRegistry[kind].allowedViews.includes("board"));

    // Not a coincidence to be kept in step by hand: both answer "is this one
    // List's screen", and a timeline over a Scope gathering several Lists
    // would draw bars whose rows belong to different places.
    expect(withGantt).toEqual(withBoard);
    expect(withGantt).toEqual(["inbox", "list"]);
  });

  it("never becomes a Scope's default — the List is still what opens", () => {
    for (const kind of TASK_SCOPE_KINDS) {
      expect(scopeRegistry[kind].defaultView).toBe("list");
    }
  });

  it("is in the set the hardening sweep walks", () => {
    expect(TASK_VIEW_KINDS).toContain("gantt");
    // Every allowed view of every Scope has to be a view this module knows,
    // or the sweep would be checking a smaller set than the registry offers.
    for (const kind of TASK_SCOPE_KINDS) {
      for (const view of scopeRegistry[kind].allowedViews) {
        expect(TASK_VIEW_KINDS).toContain(view);
      }
    }
  });
});
