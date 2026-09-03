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

  // Was §5.45's "Inbox and a real List only". Widened to every Scope whose
  // work is still live (TASK_VIEWS_EVERYWHERE_DESIGN.md §2): those Scopes now
  // have columns — the Lists they gather — and a drop that means something.
  it("allows Board everywhere the work is still live", () => {
    const withBoard = TASK_SCOPE_KINDS.filter((kind) => isViewAllowed(kind, "board"));
    expect(withBoard.sort()).toEqual(["filter", "folder", "inbox", "list", "tag", "today", "upcoming"]);
  });

  // The other half of the same rule, and the half a future widening is most
  // likely to break by accident: finished work is READ on this module, and a
  // board there is a drag that rewrites a record that is over (§2.4).
  it("keeps finished work to the list", () => {
    for (const kind of ["completed", "wontDo", "trash"] as const) {
      expect(scopeRegistry[kind].allowedViews).toEqual(["list"]);
    }
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
    expect(resolveView("today", "board")).toBe("board");
    expect(resolveView("trash", "board")).toBe("list");
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

// Add List design Phase 3 (§R.6). Gantt joined on §5.45's terms and stays
// bound to the Board's set now that both have widened.
describe("Gantt is offered wherever the Board is", () => {
  it("is allowed exactly where Board is", () => {
    const withGantt = TASK_SCOPE_KINDS.filter((kind) => scopeRegistry[kind].allowedViews.includes("gantt"));
    const withBoard = TASK_SCOPE_KINDS.filter((kind) => scopeRegistry[kind].allowedViews.includes("board"));

    // Not a coincidence to be kept in step by hand: both draw the same Scope
    // arranged by the same axis — the Board's columns are the Lists and the
    // timeline's group headings are the Lists — so a Scope that has one and
    // not the other would be showing the same arrangement twice under one
    // name and once under another.
    expect(withGantt).toEqual(withBoard);
    expect(withGantt).toEqual(["today", "upcoming", "inbox", "list", "folder", "tag", "filter"]);
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
