import { describe, expect, it } from "vitest";
import type { Task } from "../../types";
import { INBOX_BUCKETS, inboxBucketOf } from "../tasks/board";
import {
  DEFAULT_INBOX_COLUMN_RULES,
  columnForTask,
  resolveInboxColumnRules,
  sanitizeInboxColumnRules,
} from "./inboxColumnRules";

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
  } as Task;
}

describe("the default column rules", () => {
  /**
   * Every shape the two fields can take, including the one §6.23 forbids.
   *
   * This is the test the whole phase exists for. The rules replace a constant
   * and a two-line function, and an account that never edits a column has to
   * see EXACTLY what it saw before — not nearly.
   */
  const shapes: Task[] = [
    task({ id: "undated" }),
    task({ id: "overdue", dueDate: "2026-08-01" }),
    task({ id: "today", dueDate: TODAY }),
    task({ id: "tomorrow", dueDate: "2026-08-30" }),
    task({ id: "later", dueDate: "2026-12-25" }),
    task({ id: "someday", isSomeday: true }),
    task({ id: "drifted", isSomeday: true, dueDate: "2026-09-10" }),
    task({ id: "done", status: "done", completedAt: "2026-08-28T00:00:00.000Z", dueDate: "2026-08-01" }),
  ];

  it("answers exactly what inboxBucketOf answers, for every shape", () => {
    for (const shape of shapes) {
      expect(columnForTask(shape, DEFAULT_INBOX_COLUMN_RULES, CONTEXT), shape.id).toBe(inboxBucketOf(shape));
    }
  });

  it("leaves nothing out — under the defaults there is no remainder", () => {
    // True only while the defaults are untouched, and it stops being true the
    // moment a rule is edited. Phase 4's remainder row is what has to exist
    // before phase 5 lets anybody edit one.
    for (const shape of shapes) {
      expect(columnForTask(shape, DEFAULT_INBOX_COLUMN_RULES, CONTEXT)).not.toBeNull();
    }
  });

  it("puts a task in exactly one column", () => {
    for (const shape of shapes) {
      const matches = INBOX_BUCKETS.filter(
        (bucket) => columnForTask(shape, { ...DEFAULT_INBOX_COLUMN_RULES }, CONTEXT) === bucket,
      );
      expect(matches).toHaveLength(1);
    }
  });

  it("keeps a finished task in the column its fields put it in", () => {
    // D2, restated for the Board: completion is not a column. A ticked task
    // stays where it was and is shown in that column's own "완료" group, so
    // ticking a card does not also relocate it.
    const done = task({ status: "done", completedAt: "2026-08-28T00:00:00.000Z", dueDate: "2026-08-01" });
    expect(columnForTask(done, DEFAULT_INBOX_COLUMN_RULES, CONTEXT)).toBe("scheduled");
  });
});

describe("first match wins", () => {
  it("gives a task matching two columns to the one on the left", () => {
    const rules = resolveInboxColumnRules({
      unsorted: { listIds: [], tagIds: [], dateBuckets: [], priorities: ["high"] },
    });
    // "Unsorted" now takes every high-priority task, dated or not, and it is
    // read first. The Matrix answers §23.4 the same way and for the same
    // reason: the leftmost box is the one the reader sees.
    expect(columnForTask(task({ priority: "high", dueDate: TODAY }), rules, CONTEXT)).toBe("unsorted");
    expect(columnForTask(task({ priority: "low", dueDate: TODAY }), rules, CONTEXT)).toBe("scheduled");
  });

  it("answers null once a rule stops covering something", () => {
    const rules = resolveInboxColumnRules({
      unsorted: { listIds: [], tagIds: [], dateBuckets: ["none"], priorities: ["high"] },
    });
    // An undated, low-priority task now matches no column at all. It is not a
    // crash and not a silent drop — it is the answer phase 4 has to draw.
    expect(columnForTask(task(), rules, CONTEXT)).toBeNull();
  });
});

describe("what a stored set may be", () => {
  it("reads a column nobody touched as its default, not as 'no conditions'", () => {
    // An absent key means untouched. Reading it as the empty rule would make
    // that column match every task in the Inbox and empty the other two.
    const resolved = resolveInboxColumnRules({});
    expect(resolved).toEqual(DEFAULT_INBOX_COLUMN_RULES);
    expect(resolveInboxColumnRules()).toEqual(DEFAULT_INBOX_COLUMN_RULES);
  });

  it("keeps only the three columns it knows, and folds junk to a usable rule", () => {
    const stored = sanitizeInboxColumnRules({
      someday: { listIds: ["l1"], tagIds: [], dateBuckets: ["someday"], priorities: [] },
      unknown: { dateBuckets: ["today"] },
      scheduled: "not a rule",
    });
    expect(Object.keys(stored).sort()).toEqual(["scheduled", "someday"]);
    expect(stored.someday?.listIds).toEqual(["l1"]);
    // A rule that arrives as nonsense becomes the empty rule rather than
    // throwing: these sync, and a value written by another build has to fold
    // to something drawable.
    expect(stored.scheduled).toEqual({ listIds: [], tagIds: [], dateBuckets: [], priorities: [] });
  });

  it("is empty for anything that is not an object", () => {
    expect(sanitizeInboxColumnRules(null)).toEqual({});
    expect(sanitizeInboxColumnRules("rules")).toEqual({});
  });
});
