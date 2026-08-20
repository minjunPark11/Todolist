import { describe, expect, it } from "vitest";
import type { TaskScopeRef } from "../domain/tasks/scopeRegistry";
import { scopeRegistry, TASK_SCOPE_KINDS } from "../domain/tasks/scopeRegistry";
import type { List } from "../types";
import type { SearchResult } from "../domain/tasks/search";
import {
  canonicalizeTaskUrl,
  listUrlFor,
  parseSearchUrl,
  parseTaskScope,
  parseTaskUrl,
  pathForTaskScope,
  searchUrlFor,
  taskUrlFor,
  urlForSearchResult,
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

/**
 * The Space tree and the Tasks sidebar are two doors into one List, and both
 * come through here — which is the whole reason it exists. A List that opened
 * on its Board from one door and on its list from the other would be two
 * Lists to the person reading it (§13.9).
 */
describe("listUrlFor", () => {
  const lists = [
    { id: "l-plain" },
    { id: "l-board", defaultViewKey: "board" },
    { id: "l-calendar", defaultViewKey: "calendar" },
  ];

  it("opens a List in the View it stores", () => {
    expect(listUrlFor("l-board", lists)).toBe("/list/l-board?view=board");
  });

  it("leaves the default View out of the address", () => {
    expect(listUrlFor("l-plain", lists)).toBe("/list/l-plain");
  });

  it("falls back rather than failing on a View this build cannot draw", () => {
    // `calendar` is a real stored key with no Tasks Module renderer (§13.9).
    expect(listUrlFor("l-calendar", lists)).toBe("/list/l-calendar");
  });

  it("still addresses a List it has no record for", () => {
    // A tree row for a List the store has not caught up with is a row that
    // must still go somewhere; the Scope's own default is that somewhere.
    expect(listUrlFor("l-unknown", lists)).toBe("/list/l-unknown");
  });
});

// Gate 8, first and fourth lines: a result opens where the record lives, and
// the Search Page's query is in the URL while the Command Menu's never is.
describe("the Search Page URL (§10.19-§10.23)", () => {
  it("round-trips the query", () => {
    expect(parseSearchUrl(searchUrlFor("ABM 연구"))).toBe("ABM 연구");
    expect(parseSearchUrl(searchUrlFor("  spaced  "))).toBe("spaced");
  });

  it("is an empty search rather than a missing page when there is no query", () => {
    expect(searchUrlFor("   ")).toBe("/search");
    expect(parseSearchUrl("/search")).toBe("");
  });

  it("is not a Scope, and every Scope path is not it", () => {
    expect(parseSearchUrl("/today")).toBeNull();
    expect(parseSearchUrl("/list/l1")).toBeNull();
    expect(parseTaskScope("/search")).toBeNull();
    // Nothing to tidy: canonicalization is the Scopes' rule, not this page's.
    expect(canonicalizeTaskUrl("/search?q=abm")).toBeNull();
  });
});

describe("urlForSearchResult (§10.17/§10.18)", () => {
  const NOW = "2026-08-18T09:00:00.000Z";
  const lists: List[] = [
    { id: "list-inbox", projectId: "", kind: "inbox", name: "Inbox", order: -1, isDefault: false, createdAt: NOW, updatedAt: NOW },
    { id: "l1", projectId: "p1", name: "Work", order: 0, isDefault: true, createdAt: NOW, updatedAt: NOW },
  ];
  const result = (over: Partial<SearchResult>): SearchResult =>
    ({ kind: "task", id: "t1", title: "Task", ...over }) as SearchResult;

  it("opens a Task at its own List with the Drawer open — strategy B", () => {
    expect(urlForSearchResult(result({ ownerListId: "l1" }), lists)).toBe("/list/l1?task=t1");
  });

  it("opens an Inbox Task at /inbox, not at a List named after it", () => {
    expect(urlForSearchResult(result({ ownerListId: "list-inbox" }), lists)).toBe("/inbox?task=t1");
  });

  it("still opens a Task whose owner is unknown, in the Inbox", () => {
    expect(urlForSearchResult(result({ ownerListId: "gone" }), lists)).toBe("/inbox?task=t1");
  });

  it("opens every other kind at its own Scope", () => {
    expect(urlForSearchResult(result({ kind: "list", id: "l1" }), lists)).toBe("/list/l1");
    expect(urlForSearchResult(result({ kind: "list", id: "list-inbox" }), lists)).toBe("/inbox");
    expect(urlForSearchResult(result({ kind: "tag", id: "tag-work" }), lists)).toBe("/tag/tag-work");
    expect(urlForSearchResult(result({ kind: "filter", id: "f1" }), lists)).toBe("/filter/f1");
    expect(urlForSearchResult(result({ kind: "folder", id: "sf1" }), lists)).toBe("/folder/sf1");
  });

  it("sends a Project and a Space to the Spaces routes, not to a Scope (§10.16)", () => {
    const projects = [{ id: "p1", name: "Drone", spaceId: "s1", createdAt: NOW, updatedAt: NOW }] as never as Parameters<
      typeof urlForSearchResult
    >[2];
    expect(urlForSearchResult(result({ kind: "project", id: "p1" }), lists, projects)).toBe("/s/s1/p/p1");
    expect(urlForSearchResult(result({ kind: "space", id: "s1" }), lists)).toBe("/s/s1");
  });

  it("lands a Project whose record is gone somewhere real", () => {
    expect(urlForSearchResult(result({ kind: "project", id: "gone" }), lists)).toBe("/app");
  });

  it("produces URLs the parser accepts, which is what makes the Drawer open", () => {
    const url = urlForSearchResult(result({ ownerListId: "l1" }), lists);
    expect(parseTaskUrl(url)).toEqual({ scope: { kind: "list", id: "l1" }, view: "list", taskId: "t1" });
  });
});
