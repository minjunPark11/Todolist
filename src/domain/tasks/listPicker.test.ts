import { describe, expect, it } from "vitest";
import type { List, SidebarFolder, Task } from "../../types";
import { canMoveToList, listMovePlan, listPickerGroups, selectableLists } from "./listPicker";

const NOW = "2026-08-25T00:00:00.000Z";

function list(id: string, name: string, extra: Partial<List> = {}): List {
  return {
    id,
    projectId: "",
    kind: "regular",
    name,
    order: 0,
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  } as List;
}

function folder(id: string, name: string, sortKey = 0): SidebarFolder {
  return { id, name, sortKey, createdAt: NOW, updatedAt: NOW };
}

function task(overrides: Partial<Task> = {}): Task {
  return { id: "t1", title: "Task", listId: "", parentTaskId: "", projectId: "", ...overrides } as Task;
}

const inbox = list("list-inbox", "Inbox", { kind: "inbox", order: -1 });
const research = list("l-research", "Research", { sidebarFolderId: "f-school" });
const coursework = list("l-coursework", "Coursework", { sidebarFolderId: "f-school" });
const skinidx = list("l-skinidx", "SkinIDX", { sidebarFolderId: "f-work" });
const lists = [inbox, research, coursework, skinidx];
const folders = [folder("f-school", "School", 0), folder("f-work", "Work", 1)];

const names = (groups: ReturnType<typeof listPickerGroups>) =>
  groups.map((group) => [group.folder?.name ?? null, group.lists.map((l) => l.name)]);

describe("listPickerGroups (§13.9, §13.10)", () => {
  it("puts the ungrouped Lists first, then each Folder", () => {
    expect(names(listPickerGroups(lists, folders))).toEqual([
      [null, ["Inbox"]],
      ["School", ["Research", "Coursework"]],
      ["Work", ["SkinIDX"]],
    ]);
  });

  // §13.20 has already decided an archived List is not somewhere to move to.
  it("leaves out archived and deleted Lists", () => {
    const gone = [inbox, list("l-old", "Old", { archivedAt: NOW }), list("l-dead", "Dead", { deletedAt: NOW })];
    expect(names(listPickerGroups(gone, []))).toEqual([[null, ["Inbox"]]]);
  });

  it("drops a group with nothing left under it", () => {
    expect(names(listPickerGroups([inbox], folders))).toEqual([[null, ["Inbox"]]]);
  });
});

describe("search (§13.26)", () => {
  it("filters by List name, case-insensitively", () => {
    expect(names(listPickerGroups(lists, folders, "RESE"))).toEqual([["School", ["Research"]]]);
  });

  // §13.26 puts the Folder name in the search context, and a reader who typed
  // a group's name asked for the group — not for the Lists inside it whose own
  // names happen to contain the same letters.
  it("keeps every List under a Folder whose name matches", () => {
    expect(names(listPickerGroups(lists, folders, "school"))).toEqual([["School", ["Research", "Coursework"]]]);
  });

  it("answers nothing when nothing matches, rather than everything", () => {
    expect(listPickerGroups(lists, folders, "zzz")).toEqual([]);
  });

  it("ignores surrounding whitespace", () => {
    expect(names(listPickerGroups(lists, folders, "  skinidx "))).toEqual([["Work", ["SkinIDX"]]]);
  });

  // A substring hit is a hit wherever it lands. "work" is inside both the
  // Coursework List and the Work Folder, and the picker offers both rather
  // than guessing which one was meant.
  it("offers a List and a Folder that match the same letters", () => {
    expect(names(listPickerGroups(lists, folders, "work"))).toEqual([
      ["School", ["Coursework"]],
      ["Work", ["SkinIDX"]],
    ]);
  });
});

describe("selectableLists (§13.10, §13.27)", () => {
  it("is every List and no heading, in drawn order", () => {
    expect(selectableLists(listPickerGroups(lists, folders)).map((l) => l.name)).toEqual([
      "Inbox",
      "Research",
      "Coursework",
      "SkinIDX",
    ]);
  });
});

describe("canMoveToList (§13.15)", () => {
  it("allows a root Task", () => {
    expect(canMoveToList(task())).toBe(true);
  });

  // Its List is its parent's (§2.24). Moving it alone would either break that
  // or detach it, and §13.16 refuses to do the second as a side effect.
  it("refuses a child", () => {
    expect(canMoveToList(task({ parentTaskId: "parent" }))).toBe(false);
  });
});

describe("listMovePlan (§13.11, §13.14, §13.66)", () => {
  const parent = task({ id: "p", listId: inbox.id });
  const childA = task({ id: "a", parentTaskId: "p", listId: inbox.id });
  const childB = task({ id: "b", parentTaskId: "p", listId: inbox.id });
  const grandchild = task({ id: "g", parentTaskId: "a", listId: inbox.id });
  const tree = [parent, childA, childB, grandchild];

  // §13.14, and §2.24's invariant behind it: the subtree moves as one.
  it("moves the whole subtree, root first", () => {
    const plan = listMovePlan(parent, research.id, tree, lists);
    expect(plan?.taskIds).toEqual(["p", "a", "b", "g"]);
    expect(plan?.patch).toEqual({ listId: research.id });
  });

  it("gives every Task in the subtree the same patch", () => {
    const plan = listMovePlan(parent, research.id, tree, lists);
    // One patch object, applied to all of them — they agree because they were
    // given one answer, not because four computations happened to match.
    expect(plan?.patch.listId).toBe(research.id);
  });

  // §13.11: re-selecting the List the Task is already in writes nothing.
  it("refuses a move that would change nothing", () => {
    expect(listMovePlan(parent, inbox.id, tree, lists)).toBeNull();
  });

  it("refuses a target that is not a List", () => {
    expect(listMovePlan(parent, "no-such-list", tree, lists)).toBeNull();
  });

  it("refuses to move a child on its own (§13.15)", () => {
    expect(listMovePlan(childA, research.id, tree, lists)).toBeNull();
  });

  it("moves a lone Task without inventing a subtree", () => {
    const alone = task({ id: "solo", listId: inbox.id });
    expect(listMovePlan(alone, research.id, [alone], lists)?.taskIds).toEqual(["solo"]);
  });

  // Corrupted data from another client: §22.19 says show it, do not hang on it.
  it("does not loop forever on a parent cycle", () => {
    const a = task({ id: "a", parentTaskId: "b", listId: inbox.id });
    const b = task({ id: "b", parentTaskId: "a", listId: inbox.id });
    expect(listMovePlan(a, research.id, [a, b], lists)).toBeNull();
  });
});
