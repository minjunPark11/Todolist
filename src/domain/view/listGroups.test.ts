import { describe, expect, it } from "vitest";
import type { List, Task } from "../../types";
import { groupTasksByList } from "./listGroups";

const NOW = "2026-09-03T09:00:00.000Z";

function list(id: string, name: string, overrides: Partial<List> = {}): List {
  return {
    id,
    projectId: "p1",
    name,
    order: 0,
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as List;
}

function task(id: string, listId: string): Task {
  return { id, title: id, listId, projectId: "p1", createdAt: NOW, updatedAt: NOW } as Task;
}

const alpha = list("l-alpha", "Alpha");
const beta = list("l-beta", "Beta");
const gamma = list("l-gamma", "Gamma");
const all = [alpha, beta, gamma];

describe("groupTasksByList", () => {
  it("keeps the order it is given, and does not sort for itself", () => {
    const order = [gamma, alpha, beta];
    const groups = groupTasksByList([task("t1", "l-alpha")], order, all);
    expect(groups.map((group) => group.list.id)).toEqual(["l-gamma", "l-alpha", "l-beta"]);
  });

  // §5.3, and the same answer `listAxisColumns` gives for a Folder's Board
  // columns: a Folder IS the set of its Lists, so an empty one is the answer to
  // "where else could this go".
  it("gives every List a group, including the empty ones", () => {
    const groups = groupTasksByList([task("t1", "l-beta")], all, all);
    expect(groups.map((group) => group.tasks.length)).toEqual([0, 1, 0]);
  });

  it("puts each task under the List that owns it", () => {
    const groups = groupTasksByList(
      [task("t1", "l-alpha"), task("t2", "l-beta"), task("t3", "l-alpha")],
      all,
      all,
    );
    expect(groups[0].tasks.map((item) => item.id)).toEqual(["t1", "t3"]);
    expect(groups[1].tasks.map((item) => item.id)).toEqual(["t2"]);
  });

  it("keeps the order the tasks arrived in, inside a group", () => {
    const groups = groupTasksByList([task("t2", "l-alpha"), task("t1", "l-alpha")], [alpha], all);
    expect(groups[0].tasks.map((item) => item.id)).toEqual(["t2", "t1"]);
  });

  // Membership is `listIdFor`'s answer, not the raw field — a task with no
  // `listId` still belongs somewhere.
  it("reads ownership through the domain rather than off the record", () => {
    const inbox = list("l-inbox", "Inbox", { kind: "inbox" } as Partial<List>);
    const unfiled = { id: "t1", title: "t1", listId: "", projectId: "" } as Task;
    const groups = groupTasksByList([unfiled], [inbox], [inbox]);
    expect(groups[0].tasks).toHaveLength(1);
  });

  // The claim the doc comment makes about its caller: on a Folder, `scopeQuery`
  // has already dropped anything owned elsewhere, so nothing is silently lost
  // here — but a row that does slip through must not land in the wrong group.
  it("drops nothing into a group that does not own it", () => {
    const groups = groupTasksByList([task("t1", "l-gamma")], [alpha, beta], all);
    expect(groups.flatMap((group) => group.tasks)).toEqual([]);
  });
});
