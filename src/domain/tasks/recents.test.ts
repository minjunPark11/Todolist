import { describe, expect, it } from "vitest";
import type { TaskScopeRef } from "./scopeRegistry";
import { NO_RECENTS, RECENT_LIMIT, rememberScope, rememberTask, sanitizeRecents } from "./recents";

describe("rememberScope", () => {
  it("puts the newest first", () => {
    const state = rememberScope(rememberScope(NO_RECENTS, { kind: "today" }), { kind: "inbox" });
    expect(state.scopes.map((scope) => scope.kind)).toEqual(["inbox", "today"]);
  });

  it("moves a repeat visit to the front rather than listing it twice", () => {
    let state = rememberScope(NO_RECENTS, { kind: "today" });
    state = rememberScope(state, { kind: "inbox" });
    state = rememberScope(state, { kind: "today" });
    expect(state.scopes.map((scope) => scope.kind)).toEqual(["today", "inbox"]);
  });

  it("tells two Scopes of the same kind apart by id", () => {
    let state = rememberScope(NO_RECENTS, { kind: "list", id: "l1" });
    state = rememberScope(state, { kind: "list", id: "l2" });
    expect(state.scopes).toEqual([
      { kind: "list", id: "l2" },
      { kind: "list", id: "l1" },
    ]);
  });

  it("keeps identity when the Scope is already the newest", () => {
    const state = rememberScope(NO_RECENTS, { kind: "today" });
    expect(rememberScope(state, { kind: "today" })).toBe(state);
  });

  it("keeps only the last five (§10.43)", () => {
    let state = NO_RECENTS;
    for (let index = 0; index < RECENT_LIMIT + 3; index += 1) {
      state = rememberScope(state, { kind: "list", id: `l${index}` } as TaskScopeRef);
    }
    expect(state.scopes).toHaveLength(RECENT_LIMIT);
    expect(state.scopes[0]).toEqual({ kind: "list", id: `l${RECENT_LIMIT + 2}` });
  });
});

describe("rememberTask", () => {
  it("dedupes, caps and ignores nothing-at-all", () => {
    let state = rememberTask(rememberTask(NO_RECENTS, "t1"), "t2");
    state = rememberTask(state, "t1");
    expect(state.taskIds).toEqual(["t1", "t2"]);
    expect(rememberTask(state, "")).toBe(state);
    expect(rememberTask(state, "t1")).toBe(state);
  });
});

describe("sanitizeRecents", () => {
  it("reads back what was written", () => {
    const state = rememberTask(rememberScope(NO_RECENTS, { kind: "list", id: "l1" }), "t1");
    expect(sanitizeRecents(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it("drops an entry it could not navigate to", () => {
    const state = sanitizeRecents({
      scopes: [{ kind: "invented", id: "x" }, { kind: "list" }, { kind: "today" }],
      taskIds: ["t1", 42, ""],
    });
    // `list` without an id names nothing; `today` needs none.
    expect(state.scopes).toEqual([{ kind: "today" }]);
    expect(state.taskIds).toEqual(["t1"]);
  });

  it("answers empty for anything unreadable", () => {
    expect(sanitizeRecents(null)).toEqual(NO_RECENTS);
    expect(sanitizeRecents("[]")).toEqual(NO_RECENTS);
    expect(sanitizeRecents({})).toEqual(NO_RECENTS);
  });

  it("caps what it reads, so a tampered store cannot grow the list", () => {
    const many = Array.from({ length: 20 }, (_, index) => ({ kind: "list", id: `l${index}` }));
    const state = sanitizeRecents({ scopes: many, taskIds: many.map((entry) => entry.id) });
    expect(state.scopes).toHaveLength(RECENT_LIMIT);
    expect(state.taskIds).toHaveLength(RECENT_LIMIT);
  });
});
