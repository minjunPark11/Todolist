import { describe, expect, it } from "vitest";
import { CREATE_LIST_VIEW_CHOICES, isListViewKey, resolveListView } from "./listView";
import { scopeRegistry, TASK_SCOPE_KINDS } from "./scopeRegistry";

const listPolicy = scopeRegistry.list;
const todayPolicy = scopeRegistry.today;

describe("resolveListView (§13.9)", () => {
  it("opens the View the List asked for", () => {
    expect(resolveListView("board", listPolicy)).toBe("board");
    expect(resolveListView("gantt", listPolicy)).toBe("gantt");
  });

  it("falls back when the List never chose", () => {
    expect(resolveListView(undefined, listPolicy)).toBe("list");
    expect(resolveListView("", listPolicy)).toBe("list");
  });

  // The point of storing a free string: another client may know Views this one
  // does not, and reading one back must not break anything.
  it("falls back for a View this build cannot draw, without touching what is stored", () => {
    expect(resolveListView("calendar", listPolicy)).toBe("list");
    expect(resolveListView("timeline-3d", listPolicy)).toBe("list");
  });

  it("falls back where the Scope forbids the View", () => {
    // Today's board and timeline are offered now
    // (TASK_VIEWS_EVERYWHERE_DESIGN.md §2); finished work's are not, and that
    // is the case this test exists to hold.
    expect(resolveListView("board", todayPolicy)).toBe("board");
    expect(resolveListView("board", scopeRegistry.trash)).toBe("list");
    expect(resolveListView("gantt", scopeRegistry.completed)).toBe("list");
  });

  it("never answers with a View the Scope does not allow, for any Scope or key", () => {
    for (const kind of TASK_SCOPE_KINDS) {
      const policy = scopeRegistry[kind];
      for (const key of ["list", "board", "gantt", "calendar", "nonsense", "", undefined]) {
        expect(policy.allowedViews).toContain(resolveListView(key, policy));
      }
    }
  });
});

describe("what Add List offers (§13.6)", () => {
  it("offers only Views that open", () => {
    for (const choice of CREATE_LIST_VIEW_CHOICES) {
      expect(scopeRegistry.list.allowedViews).toContain(choice);
    }
  });

  it("leaves Calendar out of the picker while keeping it a real key", () => {
    expect(CREATE_LIST_VIEW_CHOICES).not.toContain("calendar" as never);
    expect(isListViewKey("calendar")).toBe(true);
  });
});
