import { describe, expect, it } from "vitest";
import { TASK_SCOPE_KINDS, scopeRegistry, type TaskScopeRef } from "../tasks/scopeRegistry";
import {
  DEFAULT_SCOPE_VIEW_OPTIONS,
  pruneScopeViewOptions,
  sanitizeScopeViewOptions,
  scopeHasViewOptions,
  scopeOptionKey,
  viewOptionsFor,
  type ScopeViewOptions,
} from "./scopeViewOptions";

/** One ref per Scope, built FROM the registry so a later Scope cannot skip these. */
const REFS: TaskScopeRef[] = TASK_SCOPE_KINDS.map((kind) =>
  scopeRegistry[kind].hasId ? ({ kind, id: `id-${kind}` } as TaskScopeRef) : ({ kind } as TaskScopeRef),
);

describe("which Scopes get a menu", () => {
  // §3.1: three lists of work that is over. Half the menu loses its meaning on
  // them — "완료 숨기기" on Completed is a button that empties the screen.
  it("refuses the three that are finished work", () => {
    expect(scopeHasViewOptions("completed")).toBe(false);
    expect(scopeHasViewOptions("wontDo")).toBe(false);
    expect(scopeHasViewOptions("trash")).toBe(false);
  });

  it("offers every other Scope, including Folder and Filter", () => {
    for (const kind of TASK_SCOPE_KINDS) {
      if (kind === "completed" || kind === "wontDo" || kind === "trash") continue;
      expect(scopeHasViewOptions(kind), kind).toBe(true);
    }
  });
});

describe("the key one Scope's options are stored under", () => {
  it("is the Scope's own address, flattened", () => {
    expect(scopeOptionKey({ kind: "today" })).toBe("today");
    expect(scopeOptionKey({ kind: "list", id: "l1" })).toBe("list:l1");
    expect(scopeOptionKey({ kind: "tag", id: "t3" })).toBe("tag:t3");
  });

  // A Scope with no options has nowhere to put one, which is what stops a
  // stray key from ever being written.
  it("is empty for a Scope that has none", () => {
    expect(scopeOptionKey({ kind: "trash" })).toBe("");
    expect(scopeOptionKey({ kind: "completed" })).toBe("");
  });

  it("gives every Scope that has one a distinct key", () => {
    const keys = REFS.map(scopeOptionKey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("reading a stored record back", () => {
  // Field by field, not by spreading: a value a newer client wrote has to land
  // on something this one can draw, or it reaches a `<select>` with no such
  // option.
  it("replaces a value it cannot draw with the default", () => {
    const read = sanitizeScopeViewOptions({
      dateBy: "constellation",
      kanbanSize: 12,
      showInputBox: "yes",
      hideCompleted: null,
      showDetails: undefined,
    });
    expect(read).toEqual(DEFAULT_SCOPE_VIEW_OPTIONS);
  });

  it("keeps the values it can", () => {
    expect(
      sanitizeScopeViewOptions({ dateBy: "countdown", kanbanSize: "large", showInputBox: false }),
    ).toEqual({
      ...DEFAULT_SCOPE_VIEW_OPTIONS,
      dateBy: "countdown",
      kanbanSize: "large",
      showInputBox: false,
    });
  });

  // The promise the defaults make: an account that never opens the menu
  // behaves exactly as the app does today.
  it("reads nothing at all as the defaults", () => {
    expect(sanitizeScopeViewOptions(undefined)).toEqual(DEFAULT_SCOPE_VIEW_OPTIONS);
    expect(viewOptionsFor(undefined, { kind: "today" })).toBe(DEFAULT_SCOPE_VIEW_OPTIONS);
    expect(viewOptionsFor({}, { kind: "list", id: "l1" })).toBe(DEFAULT_SCOPE_VIEW_OPTIONS);
  });
});

describe("sweeping the keys whose Scope is gone", () => {
  const opts = (over: Partial<ScopeViewOptions> = {}): ScopeViewOptions => ({
    ...DEFAULT_SCOPE_VIEW_OPTIONS,
    ...over,
  });
  const live = {
    listIds: ["l1"],
    folderIds: ["f1"],
    tagIds: ["t1"],
    filterIds: ["q1"],
  };

  it("keeps the fixed Scopes, which cannot stop existing", () => {
    const stored = { today: opts(), upcoming: opts(), inbox: opts() };
    expect(pruneScopeViewOptions(stored, live)).toBe(stored);
  });

  it("keeps a key whose record is still there, and drops one whose is not", () => {
    const swept = pruneScopeViewOptions(
      { "list:l1": opts({ dateBy: "countdown" }), "list:gone": opts(), "tag:t1": opts() },
      live,
    );
    expect(Object.keys(swept ?? {}).sort()).toEqual(["list:l1", "tag:t1"]);
    expect(swept?.["list:l1"].dateBy).toBe("countdown");
  });

  // Q5. A trashed List is still a record — it can be restored, and coming back
  // with its view settings emptied is a loss nobody asked for and nobody could
  // see coming. The sweep takes the ids it is given, and a trashed List is in
  // them; what removes the key is the List being REMOVED.
  it("keeps a trashed List, because a trashed List is still a record", () => {
    const stored = { "list:l1": opts({ showDetails: true }) };
    // `l1` is trashed but present — exactly what the store holds after
    // `trashList`, and what `permanentlyDeleteList` later takes away.
    expect(pruneScopeViewOptions(stored, { ...live, listIds: ["l1"] })).toBe(stored);
    expect(Object.keys(pruneScopeViewOptions(stored, { ...live, listIds: [] }) ?? {})).toEqual([]);
  });

  it("drops a kind this client does not know", () => {
    const swept = pruneScopeViewOptions({ today: opts(), constellation: opts() }, live);
    expect(Object.keys(swept ?? {})).toEqual(["today"]);
  });

  // The same object back when nothing was orphaned, so an account with no
  // strays is not marked dirty on every load.
  it("hands back what it was given when nothing is orphaned", () => {
    const stored = { today: opts(), "list:l1": opts() };
    expect(pruneScopeViewOptions(stored, live)).toBe(stored);
    expect(pruneScopeViewOptions(undefined, live)).toBeUndefined();
  });
});
