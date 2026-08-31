import { describe, expect, it } from "vitest";
import type { Task } from "../../types";
import { inboxBucketOf } from "../tasks/board";
import {
  addInboxColumn,
  columnAsksForDate,
  columnOfTask,
  defaultInboxColumns,
  dropOutcomeForColumnId,
  moveInboxColumn,
  removeInboxColumn,
  renameInboxColumn,
  resolveInboxColumns,
  setInboxColumnRule,
  type InboxColumn,
} from "./inboxColumns";
import { EMPTY_INBOX_RULE } from "./inboxColumnRules";

const TODAY = "2026-08-29";
const CONTEXT = { today: TODAY, listId: "list-inbox" };

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Task",
    status: "todo",
    priority: "none",
    dueDate: "",
    isSomeday: false,
    listId: "list-inbox",
    tags: [],
    ...overrides,
  } as unknown as Task;
}

const ids = (columns: InboxColumn[]) => columns.map((column) => column.id);

describe("where the columns come from", () => {
  it("is the three, for an account that has never touched them", () => {
    expect(ids(resolveInboxColumns(undefined))).toEqual(["unsorted", "scheduled", "someday"]);
    // And they answer exactly what the old two-field function answered.
    for (const shape of [task(), task({ dueDate: TODAY }), task({ isSomeday: true })]) {
      expect(columnOfTask(shape, resolveInboxColumns(undefined), CONTEXT)).toBe(inboxBucketOf(shape));
    }
  });

  it("assembles phase 3's two keys into this shape, without rewriting them", () => {
    // The migration is a READ. An account that never opens the new controls is
    // never rewritten, and an older build still understands what it finds.
    const columns = resolveInboxColumns(undefined, {
      rules: { someday: { ...EMPTY_INBOX_RULE, dateBuckets: ["someday"], tagIds: ["later"] } },
      names: { someday: "Back burner" },
    });
    const someday = columns.find((column) => column.id === "someday");
    expect(someday?.name).toBe("Back burner");
    expect(someday?.rule.tagIds).toEqual(["later"]);
    // The two it says nothing about keep their built-in rules.
    expect(columns[0].rule).toEqual(defaultInboxColumns()[0].rule);
  });

  it("uses the stored list when there is one, and drops what cannot be drawn", () => {
    const columns = resolveInboxColumns([
      { id: "a", name: "  Mine  ", rule: { listIds: [], tagIds: [], dateBuckets: ["today"], priorities: [] } },
      { name: "no id at all" },
      { id: "a", name: "duplicate" },
      "not a column",
    ]);
    expect(ids(columns)).toEqual(["a"]);
    expect(columns[0].name).toBe("Mine");
  });

  it("falls back rather than drawing a board with no columns", () => {
    // No sequence of the controls can produce an empty list — the last column
    // refuses to be deleted — so an empty one means a broken write.
    expect(ids(resolveInboxColumns([]))).toEqual(["unsorted", "scheduled", "someday"]);
  });
});

describe("the ⋯ menu, as operations", () => {
  const columns = defaultInboxColumns();

  it("renames, and clearing gives the built-in name back", () => {
    const named = renameInboxColumn(columns, "someday", "  Back burner  ");
    expect(named[2].name).toBe("Back burner");
    const cleared = renameInboxColumn(named, "someday", "   ");
    expect(cleared[2].name).toBeUndefined();
    expect(cleared[2].labelKey).toBe("tasks.bucketSomeday");
  });

  it("moves left and right, and stops at the ends", () => {
    expect(ids(moveInboxColumn(columns, "someday", -1))).toEqual(["unsorted", "someday", "scheduled"]);
    expect(ids(moveInboxColumn(columns, "unsorted", -1))).toEqual(ids(columns));
    expect(ids(moveInboxColumn(columns, "someday", +1))).toEqual(ids(columns));
  });

  it("adds beside the column the menu was opened on", () => {
    const draft = { name: "This week", rule: { ...EMPTY_INBOX_RULE, dateBuckets: ["today" as const] } };
    const left = addInboxColumn(columns, { id: "scheduled", side: "left" }, draft);
    expect(left.map((column) => column.name ?? column.id)).toEqual([
      "unsorted",
      "This week",
      "scheduled",
      "someday",
    ]);
    const right = addInboxColumn(columns, { id: "scheduled", side: "right" }, draft);
    expect(right[2].name).toBe("This week");
    // A made column has no built-in label — nobody but the user chose the word.
    expect(right[2].labelKey).toBeUndefined();
    expect(right[2].id).not.toBe("");
  });

  it("puts a column with no neighbour at the end", () => {
    const added = addInboxColumn(columns, null, { name: "Last", rule: EMPTY_INBOX_RULE });
    expect(added[added.length - 1].name).toBe("Last");
  });

  it("deletes — except the last one", () => {
    const two = removeInboxColumn(columns, "scheduled");
    expect(ids(two)).toEqual(["unsorted", "someday"]);
    const one = removeInboxColumn(two, "someday");
    expect(ids(one)).toEqual(["unsorted"]);
    // A board with no columns is not a simpler board: every task in the Inbox
    // would be in the remainder and nothing could ever leave it.
    expect(ids(removeInboxColumn(one, "unsorted"))).toEqual(["unsorted"]);
  });

  it("leaves the list alone when the id is not in it", () => {
    expect(removeInboxColumn(columns, "nope")).toBe(columns);
    expect(moveInboxColumn(columns, "nope", 1)).toBe(columns);
  });

  it("what deleting costs is paid by the remainder, not hidden", () => {
    const dated = task({ dueDate: TODAY });
    expect(columnOfTask(dated, columns, CONTEXT)).toBe("scheduled");
    const without = removeInboxColumn(columns, "scheduled");
    // Not gone — unplaced. Phase 4's row is what draws this answer, which is
    // why it had to exist before this operation did.
    expect(columnOfTask(dated, without, CONTEXT)).toBeNull();
  });
});

describe("asking which day", () => {
  it("asks when the rule covers a range of days it cannot choose between", () => {
    // The built-in 일정 takes four dated buckets, so no single day satisfies
    // it and picking one would be the app deciding for the user (§6.25).
    expect(columnAsksForDate(defaultInboxColumns()[1])).toBe(true);
  });

  it("does not ask when the rule already names the day", () => {
    const only = setInboxColumnRule(defaultInboxColumns(), "scheduled", {
      ...EMPTY_INBOX_RULE,
      dateBuckets: ["today"],
    });
    expect(columnAsksForDate(only[1])).toBe(false);
    expect(columnAsksForDate(defaultInboxColumns()[0])).toBe(false);
    expect(columnAsksForDate(defaultInboxColumns()[2])).toBe(false);
  });
});

describe("a drop aimed at a column that is no longer there", () => {
  it("is refused rather than written somewhere else", () => {
    const outcome = dropOutcomeForColumnId(task(), defaultInboxColumns(), "deleted-while-dragging", CONTEXT);
    expect(outcome.accepted).toBe(false);
  });
});
