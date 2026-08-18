import { describe, expect, it } from "vitest";
import type { TaskScopeRef } from "../domain/tasks/scopeRegistry";
import { scopeRegistry, TASK_SCOPE_KINDS } from "../domain/tasks/scopeRegistry";
import {
  canonicalizeTaskUrl,
  parseTaskScope,
  parseTaskUrl,
  pathForTaskScope,
  taskUrlFor,
} from "./taskScopeUrl";

// One ref per Scope, built FROM the registry so a Scope added later cannot
// quietly skip every test below.
const REFS: TaskScopeRef[] = TASK_SCOPE_KINDS.map((kind) =>
  scopeRegistry[kind].hasId ? ({ kind, id: `id-${kind}` } as TaskScopeRef) : ({ kind } as TaskScopeRef),
);

// Gate 1, first line: every Scope URL round-trips.
describe("every Scope survives the round trip", () => {
  it("parses back into exactly what it was serialised from", () => {
    for (const ref of REFS) {
      expect(parseTaskScope(pathForTaskScope(ref))).toEqual(ref);
    }
  });

  it("serialises the paths the plan names", () => {
    expect(pathForTaskScope({ kind: "today" })).toBe("/today");
    expect(pathForTaskScope({ kind: "inbox" })).toBe("/inbox");
    expect(pathForTaskScope({ kind: "list", id: "lst_abm" })).toBe("/list/lst_abm");
    expect(pathForTaskScope({ kind: "tag", id: "tag_important" })).toBe("/tag/tag_important");
    expect(pathForTaskScope({ kind: "trash" })).toBe("/trash");
  });

  // 5.68. A tag id is derived from a name the user typed, so it can hold a
  // slash and still has to come back as itself.
  it("encodes an id that would otherwise change the shape of the path", () => {
    const ref: TaskScopeRef = { kind: "tag", id: "tag-read/notes" };
    expect(pathForTaskScope(ref)).toBe("/tag/tag-read%2Fnotes");
    expect(parseTaskScope(pathForTaskScope(ref))).toEqual(ref);
  });
});

// The parser has to tell "not mine" from "broken": the Spaces routes share the
// address bar (5.56) and must not be swept up by this module.
describe("what is not a Tasks path", () => {
  it("leaves another module's route alone", () => {
    expect(parseTaskScope("/s/spc_1/p/prj_1")).toBeNull();
    expect(canonicalizeTaskUrl("/s/spc_1/p/prj_1?view=gantt")).toBeNull();
  });

  it("refuses an id where none belongs, and a missing one where it does", () => {
    expect(parseTaskScope("/completed/extra")).toBeNull();
    expect(parseTaskScope("/list")).toBeNull();
    expect(parseTaskScope("/list/")).toBeNull();
  });
});

describe("canonicalization", () => {
  // Gate 1: "/" goes to Today, which 1.18 makes the front door.
  it("sends the front door to Today", () => {
    expect(canonicalizeTaskUrl("/")).toBe("/today");
    expect(canonicalizeTaskUrl("")).toBe("/today");
  });

  // Gate 1: the default view is never spelled out, so one place has one URL.
  it("drops a view that is already the default", () => {
    expect(canonicalizeTaskUrl("/inbox?view=list")).toBe("/inbox");
    expect(canonicalizeTaskUrl("/list/lst_abm?view=list")).toBe("/list/lst_abm");
  });

  it("keeps a view that is not", () => {
    expect(canonicalizeTaskUrl("/inbox?view=board")).toBe("/inbox?view=board");
  });

  // Gate 1: an unknown view must not reach a screen, and must not throw.
  it("replaces a view the Scope does not allow with its default", () => {
    expect(canonicalizeTaskUrl("/inbox?view=banana")).toBe("/inbox");
    expect(canonicalizeTaskUrl("/today?view=board")).toBe("/today");
    expect(canonicalizeTaskUrl("/tag/tag_x?view=board")).toBe("/tag/tag_x");
  });

  // Gate 1: an open Drawer survives the tidying.
  it("preserves an open task, and puts the query in one order", () => {
    expect(canonicalizeTaskUrl("/list/lst_abm?task=tsk_123")).toBe("/list/lst_abm?task=tsk_123");
    expect(canonicalizeTaskUrl("/list/lst_abm?task=tsk_123&view=board")).toBe(
      "/list/lst_abm?view=board&task=tsk_123",
    );
  });

  // 5.67: a navigation URL carries only what this module manages.
  it("drops a query it does not manage", () => {
    expect(canonicalizeTaskUrl("/list/lst_abm?foo=bar&view=board")).toBe("/list/lst_abm?view=board");
  });

  // 5.66 asks for the tie-break to be fixed by a test rather than left to
  // whichever parser happens to run.
  it("takes the first value when a query is repeated", () => {
    expect(parseTaskUrl("/inbox?view=board&view=list")?.view).toBe("board");
    expect(parseTaskUrl("/inbox?task=a&task=b")?.taskId).toBe("a");
  });

  it("is idempotent, so tidying a tidy URL changes nothing", () => {
    for (const url of ["/today", "/inbox?view=board", "/list/lst_abm?view=board&task=t1", "/trash"]) {
      expect(canonicalizeTaskUrl(url)).toBe(url);
    }
  });
});

describe("taskUrlFor", () => {
  it("is the inverse of the parser for every Scope", () => {
    for (const ref of REFS) {
      const url = taskUrlFor({ scope: ref, view: "list", taskId: "" });
      expect(parseTaskUrl(url)).toEqual({ scope: ref, view: "list", taskId: "" });
    }
  });

  it("refuses to write a view the Scope does not allow", () => {
    expect(taskUrlFor({ scope: { kind: "today" }, view: "board", taskId: "" })).toBe("/today");
  });
});
