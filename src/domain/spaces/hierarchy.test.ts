import { describe, expect, it } from "vitest";
import type { Folder, List, Status } from "../../types";
import {
  activeLists,
  addFolder,
  addList,
  archiveFolder,
  archiveList,
  DEFAULT_STATUSES,
  defaultListFor,
  folderlessLists,
  hasDoneStatus,
  INBOX_LIST_ID,
  listDisplayName,
  listsInFolder,
  makeDefaultList,
  moveListToFolder,
  patchList,
  sanitizeFolder,
  sanitizeList,
  shouldRevealLists,
  standaloneLists,
  statusDisplayLabel,
  statusesFor,
} from "./hierarchy";

const NOW = "2026-08-15T00:00:00.000Z";

function list(overrides: Partial<List> = {}): List {
  return {
    id: "list-1",
    projectId: "space-1",
    spaceId: "space-1",
    name: "Tasks",
    order: 0,
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function folder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: "folder-1",
    projectId: "space-1",
    spaceId: "space-1",
    name: "H1",
    order: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("sanitizeList", () => {
  it("drops a list with no id or no space — neither can be reached", () => {
    expect(sanitizeList({ spaceId: "space-1" })).toBeNull();
    expect(sanitizeList({ id: "list-1" })).toBeNull();
    expect(sanitizeList(null)).toBeNull();
  });

  it("treats an empty folderId as folderless rather than as a folder named ''", () => {
    expect(sanitizeList({ id: "l", spaceId: "s", folderId: "" })?.folderId).toBeUndefined();
  });

  it("keeps a status override only when it can still express done", () => {
    const usable = sanitizeList({
      id: "l",
      projectId: "s",
      spaceId: "s",
      statuses: [{ id: "a", group: "active" }, { id: "d", group: "done" }],
    });
    expect(usable?.statuses).toHaveLength(2);

    // Without a done status the app could not tell when work finished, so the
    // override is discarded and the Space's set is inherited instead.
    const unusable = sanitizeList({
      id: "l",
      projectId: "s",
      spaceId: "s",
      statuses: [{ id: "a", group: "active" }],
    });
    expect(unusable?.statuses).toBeUndefined();
  });

  it("carries fields it does not know (M0)", () => {
    expect(sanitizeList({ id: "l", spaceId: "s", futureField: 1 })).toMatchObject({ futureField: 1 });
  });

  // Add List design §13.20-§13.22 and §13.3-§13.7. Both are stored as written.
  it("keeps a colour and a default View key", () => {
    expect(sanitizeList({ id: "l", spaceId: "s", color: "#ff8800", defaultViewKey: "board" })).toMatchObject({
      color: "#ff8800",
      defaultViewKey: "board",
    });
  });

  it("treats an empty colour or View key as 'the user did not choose'", () => {
    const list = sanitizeList({ id: "l", spaceId: "s", color: "  ", defaultViewKey: "" });
    expect(list?.color).toBeUndefined();
    expect(list?.defaultViewKey).toBeUndefined();
  });

  // §13.7's reason for a text key rather than an enum, and M0's reason for
  // insisting on it: validating the VOCABULARY here is how this build would
  // strip a View a newer build wrote and then save the record back without it.
  // What this build can open is decided when the List is opened, not here.
  it("keeps a View key it cannot open, and a colour it cannot draw", () => {
    expect(sanitizeList({ id: "l", spaceId: "s", defaultViewKey: "timeline-3d" })?.defaultViewKey).toBe("timeline-3d");
    expect(sanitizeList({ id: "l", spaceId: "s", color: "palette.sunrise" })?.color).toBe("palette.sunrise");
  });

  // The rename's whole safety story. A record written before it carries only
  // `spaceId`; a client from before it DROPS any List without one. So the old
  // key is read as the owner and written straight back beside the new one.
  it("reads a pre-rename record through its legacy key", () => {
    expect(sanitizeList({ id: "l", spaceId: "p1" })).toMatchObject({ projectId: "p1", spaceId: "p1" });
  });

  it("always writes both keys, so an older client still sees the List", () => {
    expect(sanitizeList({ id: "l", projectId: "p1" })).toMatchObject({ projectId: "p1", spaceId: "p1" });
  });

  it("lets the new key win when the two disagree", () => {
    const list = sanitizeList({ id: "l", projectId: "p1", spaceId: "stale" });
    expect(list).toMatchObject({ projectId: "p1", spaceId: "p1" });
  });
});

describe("sanitizeFolder", () => {
  it("drops a folder with no space", () => {
    expect(sanitizeFolder({ id: "f" })).toBeNull();
  });

  it("carries fields it does not know (M0)", () => {
    expect(sanitizeFolder({ id: "f", spaceId: "s", futureField: 1 })).toMatchObject({ futureField: 1 });
  });
});

describe("reads", () => {
  it("separates folderless lists from ones inside a folder", () => {
    const lists = [list({ id: "loose" }), list({ id: "filed", folderId: "folder-1" })];
    expect(folderlessLists(lists, "space-1").map((item) => item.id)).toEqual(["loose"]);
    expect(listsInFolder(lists, "folder-1").map((item) => item.id)).toEqual(["filed"]);
  });

  it("hides archived lists", () => {
    const lists = [list({ id: "a" }), list({ id: "b", archivedAt: NOW })];
    expect(activeLists(lists, "space-1").map((item) => item.id)).toEqual(["a"]);
  });

  it("prefers the default list, and falls back to the first when none is flagged", () => {
    const flagged = [list({ id: "a" }), list({ id: "b", isDefault: true, order: 5 })];
    expect(defaultListFor(flagged, "space-1")?.id).toBe("b");

    const none = [list({ id: "a" }), list({ id: "b", order: 1 })];
    expect(defaultListFor(none, "space-1")?.id).toBe("a");
  });
});

describe("shouldRevealLists", () => {
  it("stays hidden while a space has a single list", () => {
    expect(shouldRevealLists([list()], "space-1", undefined)).toBe(false);
  });

  it("reveals once a second list exists", () => {
    expect(shouldRevealLists([list({ id: "a" }), list({ id: "b" })], "space-1", undefined)).toBe(true);
  });

  it("stays revealed after dropping back to one — the flag is one-way (U2)", () => {
    // Re-deciding from the count would make a whole tree level disappear when
    // the user merely deleted a list.
    expect(shouldRevealLists([list()], "space-1", true)).toBe(true);
  });
});

describe("statusesFor", () => {
  const override: Status[] = [{ id: "x", label: "X", color: "#000", order: 0, group: "done" }];

  it("uses the list's own set when it has one", () => {
    expect(statusesFor(list({ statuses: override }), DEFAULT_STATUSES)).toBe(override);
  });

  it("inherits the space's set otherwise", () => {
    expect(statusesFor(list(), DEFAULT_STATUSES)).toBe(DEFAULT_STATUSES);
    expect(statusesFor(undefined, DEFAULT_STATUSES)).toBe(DEFAULT_STATUSES);
  });

  it("ships a default set that can express completion", () => {
    expect(hasDoneStatus(DEFAULT_STATUSES)).toBe(true);
  });
});

describe("listDisplayName", () => {
  const LABEL = "작업";

  it("translates the name the app gave", () => {
    expect(listDisplayName(makeDefaultList("list-1", "space-1", NOW), LABEL)).toBe(LABEL);
  });

  it("leaves a name the user gave alone", () => {
    // The whole point: a default List someone renamed is in their own words
    // already, and a translation must not overwrite it.
    expect(listDisplayName(list({ isDefault: true, name: "디자인 검토" }), LABEL)).toBe("디자인 검토");
  });

  it("does not translate a non-default List that happens to be called Tasks", () => {
    expect(listDisplayName(list({ isDefault: false, name: "Tasks" }), LABEL)).toBe("Tasks");
  });

  it("answers for a List that is not there, so callers need no second branch", () => {
    expect(listDisplayName(undefined, LABEL)).toBe("");
  });
});

describe("statusDisplayLabel", () => {
  const t = (key: string) => `t:${key}`;

  it("translates a default status by its id", () => {
    expect(statusDisplayLabel(DEFAULT_STATUSES[0], t)).toBe("t:status.inbox");
    expect(statusDisplayLabel({ id: "done", label: "Done" }, t)).toBe("t:status.done");
  });

  it("leaves a column the user named alone", () => {
    // Their words already — a translation would overwrite them.
    expect(statusDisplayLabel({ id: "bl-review", label: "In review" }, t)).toBe("In review");
  });

  it("gives every default an answer, so no column falls back to English", () => {
    for (const status of DEFAULT_STATUSES) {
      expect(statusDisplayLabel(status, t)).toBe(`t:status.${status.id}`);
    }
  });
});

describe("writes preserve identity", () => {
  it("returns the SAME array when the id is unknown", () => {
    const current = [list()];
    expect(patchList(current, "missing", { name: "x" }, NOW)).toBe(current);
  });

  it("replaces only the touched list", () => {
    const untouched = list({ id: "list-2" });
    const next = patchList([list(), untouched], "list-1", { name: "Renamed" }, NOW);
    expect(next[0].name).toBe("Renamed");
    expect(next[1]).toBe(untouched);
  });

  it("refuses to move a list to another space through a patch", () => {
    const next = patchList([list()], "list-1", { spaceId: "space-9" }, NOW);
    expect(next[0].spaceId).toBe("space-1");
  });
});

describe("archiveList", () => {
  it("refuses to archive the default list — items need a floor to fall back to", () => {
    const current = [makeDefaultList("list-1", "space-1", NOW)];
    expect(archiveList(current, "list-1", NOW)).toBe(current);
  });

  it("archives an ordinary list", () => {
    expect(archiveList([list()], "list-1", NOW)[0].archivedAt).toBe(NOW);
  });

  it("is a no-op on an already archived list", () => {
    const current = [list({ archivedAt: NOW })];
    expect(archiveList(current, "list-1", NOW)).toBe(current);
  });
});

describe("archiveFolder", () => {
  it("keeps the lists, moving them up to the space", () => {
    // Losing a grouping must not look like losing the work it grouped.
    const folders = [folder()];
    const lists = [list({ id: "inside", folderId: "folder-1" })];
    const next = archiveFolder(folders, lists, "folder-1", NOW);
    expect(next.folders[0].archivedAt).toBe(NOW);
    expect(next.lists[0].folderId).toBeUndefined();
    expect(next.lists[0].archivedAt).toBeUndefined();
  });

  it("is a no-op for an unknown folder", () => {
    const folders = [folder()];
    const lists = [list()];
    const next = archiveFolder(folders, lists, "missing", NOW);
    expect(next.folders).toBe(folders);
    expect(next.lists).toBe(lists);
  });
});

describe("moveListToFolder", () => {
  it("moves a list into a folder in the same space", () => {
    const next = moveListToFolder([list()], "list-1", "folder-1", [folder()], NOW);
    expect(next[0].folderId).toBe("folder-1");
  });

  it("moves a list back out to the space", () => {
    const next = moveListToFolder([list({ folderId: "folder-1" })], "list-1", undefined, [folder()], NOW);
    expect(next[0].folderId).toBeUndefined();
  });

  it("refuses a folder belonging to another space", () => {
    const current = [list()];
    const other = [folder({ id: "folder-9", projectId: "space-9", spaceId: "space-9" })];
    expect(moveListToFolder(current, "list-1", "folder-9", other, NOW)).toBe(current);
  });

  it("is a no-op when the list is already there", () => {
    const current = [list({ folderId: "folder-1" })];
    expect(moveListToFolder(current, "list-1", "folder-1", [folder()], NOW)).toBe(current);
  });
});

describe("append helpers", () => {
  it("puts a new list after the existing ones", () => {
    const next = addList([list({ id: "a", order: 0 }), list({ id: "b", order: 1 })], list({ id: "c" }));
    expect(next[2].order).toBe(2);
  });

  it("puts a new folder after the existing ones", () => {
    const next = addFolder([folder({ id: "a", order: 0 })], folder({ id: "b" }));
    expect(next[1].order).toBe(1);
  });

  it("creates the default list already flagged and first", () => {
    const created = makeDefaultList("list-1", "space-1", NOW);
    expect(created.isDefault).toBe(true);
    expect(created.order).toBe(0);
  });
});

// Migration Phase 4 (§6.72). The plan relaxes a `NOT NULL`; there is no such
// constraint here, so what it relaxes is `sanitizeList`'s gate. `kind` carries
// the distinction the constraint used to: a List that says it stands alone is
// kept, one that merely lost its owner is not.
describe("standalone List (Migration Phase 4)", () => {
  const standalone = list({ id: "standalone", projectId: "", kind: "regular", name: "블로그" });
  const inbox = list({ id: INBOX_LIST_ID, projectId: "", kind: "inbox" });
  const owned = list({ id: "owned", projectId: "p1" });
  const all = [standalone, inbox, owned];

  it("keeps a regular List that belongs to no Project (§6.3)", () => {
    expect(sanitizeList({ id: "l", kind: "regular", name: "블로그" })).toMatchObject({
      id: "l",
      projectId: "",
      kind: "regular",
    });
  });

  it("still drops a List that merely lost its owner", () => {
    expect(sanitizeList({ id: "l", name: "블로그" })).toBeNull();
  });

  it("keeps the Inbox, which has belonged to no Project since Phase 2", () => {
    expect(sanitizeList({ id: INBOX_LIST_ID, kind: "inbox" })).toMatchObject({
      projectId: "",
      kind: "inbox",
    });
  });

  // §6.79 and §6.80 keep both kinds of ownerless List out of Project and Space
  // queries. The trap is the query that asks with no Project: before this it
  // gathered exactly the Lists that belong to nobody, which is the opposite of
  // the right answer.
  it("answers nothing for an empty Project rather than every ownerless List", () => {
    expect(activeLists(all, "")).toEqual([]);
    expect(defaultListFor(all, "")).toBeUndefined();
  });

  it("leaves a Project's own Lists untouched", () => {
    expect(activeLists(all, "p1").map((entry) => entry.id)).toEqual(["owned"]);
  });

  it("gathers standalone Lists without sweeping up the Inbox", () => {
    expect(standaloneLists(all).map((entry) => entry.id)).toEqual(["standalone"]);
  });
});

// Add List Phase 2. A List made from the Tasks sidebar belongs to no Project,
// so `kind` is the only thing standing between it and `sanitizeList`.
describe("a List that belongs to no Project", () => {
  it("survives a round trip when it says what kind it is", () => {
    const standalone = sanitizeList({ id: "l1", projectId: "", kind: "regular", name: "학교" });
    expect(standalone).toMatchObject({ id: "l1", projectId: "", kind: "regular" });
  });

  it("is still dropped when it merely lost its owner", () => {
    expect(sanitizeList({ id: "l1", projectId: "", name: "학교" })).toBeNull();
  });

  it("is what standaloneLists gathers", () => {
    const lists = [
      sanitizeList({ id: "l1", projectId: "", kind: "regular", name: "학교" })!,
      sanitizeList({ id: "l2", projectId: "p1", name: "일" })!,
    ];
    expect(standaloneLists(lists).map((list) => list.id)).toEqual(["l1"]);
  });
});
