import { describe, expect, it } from "vitest";
import type { SavedFilter } from "../../types";
import type { TaskScopeRef } from "./scopeRegistry";
import { scopeRegistry, TASK_SCOPE_KINDS } from "./scopeRegistry";
import { canCommit, resolveCreateContext, type CreateContext } from "./createResolver";

const TODAY = "2026-08-18";
const INBOX = "list-inbox";

function ctx(overrides: Partial<CreateContext> = {}): CreateContext {
  return { inboxListId: INBOX, today: TODAY, ...overrides };
}

// Gate 4 (§16.27): the resolver's answers must be §12.4's matrix, row for row.
describe("Gate 4 — the create matrix", () => {
  it("Today lands in the Inbox and plans the day, inventing no due date", () => {
    const result = resolveCreateContext({ kind: "today" }, ctx());
    expect(result.targetListId).toBe(INBOX);
    expect(result.dailyPlan).toEqual({ planDate: TODAY });
    // Being planned for today and being due today are different claims.
    expect(result.patch.dueDate).toBeUndefined();
    expect(canCommit(result)).toBe(true);
  });

  it("Upcoming refuses to commit without a date, then takes the one given", () => {
    const empty = resolveCreateContext({ kind: "upcoming" }, ctx());
    expect(empty.requiredBeforeCommit).toEqual(["date"]);
    expect(empty.targetListId).toBeNull();
    expect(canCommit(empty)).toBe(false);

    const dated = resolveCreateContext({ kind: "upcoming" }, ctx({ chosenDate: "2026-08-21" }));
    expect(dated.patch.dueDate).toBe("2026-08-21");
    expect(dated.targetListId).toBe(INBOX);
    expect(canCommit(dated)).toBe(true);
  });

  it("Inbox lands in the Inbox", () => {
    expect(resolveCreateContext({ kind: "inbox" }, ctx()).targetListId).toBe(INBOX);
  });

  it("List lands in that List", () => {
    expect(resolveCreateContext({ kind: "list", id: "l-abm" }, ctx()).targetListId).toBe("l-abm");
  });

  it("Folder asks which of its Lists, and takes no answer from outside it", () => {
    const scope: TaskScopeRef = { kind: "folder", id: "f-school" };
    const unanswered = resolveCreateContext(scope, ctx({ folderListIds: ["l-abm", "l-eng"] }));
    expect(unanswered.requiredBeforeCommit).toEqual(["list"]);
    expect(canCommit(unanswered)).toBe(false);

    const answered = resolveCreateContext(
      scope,
      ctx({ folderListIds: ["l-abm", "l-eng"], chosenListId: "l-eng" }),
    );
    expect(answered.targetListId).toBe("l-eng");
    expect(canCommit(answered)).toBe(true);

    // A List from another Folder is not an answer to this question.
    const foreign = resolveCreateContext(
      scope,
      ctx({ folderListIds: ["l-abm", "l-eng"], chosenListId: "l-other" }),
    );
    expect(foreign.requiredBeforeCommit).toEqual(["list"]);
    expect(foreign.targetListId).toBeNull();
  });

  it("Tag lands in the Inbox carrying the Tag it was made under", () => {
    const result = resolveCreateContext({ kind: "tag", id: "tag-work" }, ctx());
    expect(result.targetListId).toBe(INBOX);
    // By id, and not inside `patch` — `Task.tags` holds names, so writing the
    // id there would tag the task `tag-work`.
    expect(result.applyTagIds).toEqual(["tag-work"]);
    expect(result.patch.tags).toBeUndefined();
  });

  it("Filter falls back to the Inbox when it names no record", () => {
    const result = resolveCreateContext({ kind: "filter", id: "flt_1" }, ctx());
    expect(result.targetListId).toBe(INBOX);
    expect(result.patch).toEqual({});
  });

  it("Filter takes the List its spec names, and applies what it filters by (§12.11)", () => {
    const saved: SavedFilter = {
      id: "flt_1",
      name: "Work, due today",
      spec: {
        version: 1,
        all: [
          { field: "list", op: "eq", value: "l1" },
          { field: "tag", op: "includes", value: "tag-work" },
          { field: "due", op: "on", value: "today" },
        ],
      },
      createdAt: `${TODAY}T00:00:00.000Z`,
      updatedAt: `${TODAY}T00:00:00.000Z`,
    };
    const result = resolveCreateContext({ kind: "filter", id: "flt_1" }, ctx({ savedFilters: [saved] }));
    expect(result.targetListId).toBe("l1");
    expect(result.patch).toEqual({ dueDate: TODAY });
    expect(result.applyTagIds).toEqual(["tag-work"]);
    expect(canCommit(result)).toBe(true);
  });

  it("Filter falls back to the Inbox when its spec names no single List", () => {
    const saved: SavedFilter = {
      id: "flt_2",
      name: "Anything high",
      spec: { version: 1, all: [{ field: "priority", op: "eq", value: "high" }] },
      createdAt: `${TODAY}T00:00:00.000Z`,
      updatedAt: `${TODAY}T00:00:00.000Z`,
    };
    const result = resolveCreateContext({ kind: "filter", id: "flt_2" }, ctx({ savedFilters: [saved] }));
    expect(result.targetListId).toBe(INBOX);
    expect(result.patch).toEqual({ priority: "high" });
  });

  it("Completed and Trash cannot create at all", () => {
    for (const kind of ["completed", "trash"] as const) {
      const result = resolveCreateContext({ kind }, ctx());
      expect(result.enabled).toBe(false);
      expect(canCommit(result)).toBe(false);
    }
  });
});

describe("the resolver agrees with the registry it is paired with", () => {
  it("is disabled for exactly the Scopes the registry says cannot create", () => {
    for (const kind of TASK_SCOPE_KINDS) {
      const scope = (scopeRegistry[kind].hasId ? { kind, id: "x" } : { kind }) as TaskScopeRef;
      expect(resolveCreateContext(scope, ctx()).enabled).toBe(scopeRegistry[kind].canCreate);
    }
  });

  // §12.16's last line: `createTask()` is never handed a null target. Either a
  // requirement is outstanding, or there is a List to write into.
  it("never offers a committable resolution without a List", () => {
    for (const kind of TASK_SCOPE_KINDS) {
      const scope = (scopeRegistry[kind].hasId ? { kind, id: "x" } : { kind }) as TaskScopeRef;
      const result = resolveCreateContext(scope, ctx({ folderListIds: [] }));
      if (canCommit(result)) expect(result.targetListId).toBeTruthy();
      else expect(result.requiredBeforeCommit.length > 0 || !result.enabled).toBe(true);
    }
  });
});
