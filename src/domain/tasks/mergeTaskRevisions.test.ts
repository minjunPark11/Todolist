// The three-way merge (TASK_CONFLICT_FIELD_MERGE_DESIGN.md M2).
//
// The function has one invariant and the rest is bookkeeping: **every value in
// the result was actually written by one of the three sides.** A merge that
// invents a combination nobody saved is worse than the conflict it replaced,
// because a conflict at least announces itself.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  mergeTaskRevisions,
  TASK_MERGE_BASE_FIELDS,
  TASK_MERGE_GROUPS,
  TASK_MERGE_REMOTE_FIELDS,
  TASK_MERGE_STAMP_FIELD,
} from "./mergeTaskRevisions";
import type { Task } from "../../types";

const NOW = "2026-09-10T12:00:00.000Z";
const base: Task = {
  id: "t", title: "회의", description: "", status: "todo", priority: "none",
  dueDate: "2026-09-10", startDate: "", startTime: "", endTime: "",
  projectId: "", categoryId: "", parentTaskId: "", tags: [], notes: "",
  estimatedMinutes: 0, actualSeconds: 0, activeSessionId: "", lastFocusedAt: "",
  isSomeday: false, waitingReason: "", waitingFollowUpDate: "", order: 0,
  createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  completedAt: "", blockedByTaskId: "",
  repeatType: "none", repeatInterval: 1, repeatDays: [], repeatEndDate: "",
} as Task;

const merge = (local: Task | null, remote: Task | null, from: Task | null = base) =>
  mergeTaskRevisions(from, local, remote, NOW);
const ok = (result: ReturnType<typeof merge>) => {
  if (!result.ok) throw new Error(`expected a merge, got ${result.reason} ${result.groups.join()}`);
  return result.task;
};

describe("the group table", () => {
  it("covers every field Task declares", () => {
    // §D4 makes a forgotten field SAFE — it falls through to "unknown" and
    // stops the merge rather than being handed a side. This makes it loud as
    // well, so the next person adding a field is told rather than discovering
    // that merging quietly stopped working.
    const source = readFileSync(new URL("../../types.ts", import.meta.url), "utf8");
    const body = /export interface Task \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? "";
    const declared = [...body.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(30);

    const placed = new Set<string>([
      ...Object.values(TASK_MERGE_GROUPS).flat() as string[],
      ...TASK_MERGE_REMOTE_FIELDS as string[],
      ...TASK_MERGE_BASE_FIELDS as string[],
      TASK_MERGE_STAMP_FIELD,
    ]);
    expect(declared.filter((field) => !placed.has(field))).toEqual([]);
  });

  it("puts each field in exactly one place", () => {
    const all = [
      ...Object.values(TASK_MERGE_GROUPS).flat() as string[],
      ...TASK_MERGE_REMOTE_FIELDS as string[],
      ...TASK_MERGE_BASE_FIELDS as string[],
      TASK_MERGE_STAMP_FIELD,
    ];
    expect(all.length).toBe(new Set(all).size);
  });
});

describe("edits that do not overlap", () => {
  it("keeps both when the two changed different groups", () => {
    // The whole point. Neither device has anything to answer.
    const local = { ...base, dueDate: "2026-09-12" };
    const remote = { ...base, title: "팀 회의" };
    expect(ok(merge(local, remote))).toMatchObject({ dueDate: "2026-09-12", title: "팀 회의" });
  });

  it("leaves a group nobody touched exactly where it started", () => {
    const merged = ok(merge({ ...base, title: "Mine" }, { ...base, priority: "high" }));
    expect(merged.dueDate).toBe(base.dueDate);
    expect(merged.tags).toEqual([]);
  });

  it("accepts the same change made on both sides", () => {
    const both = { ...base, title: "같은 제목" };
    expect(ok(merge(both, both)).title).toBe("같은 제목");
  });

  it("takes a group from whichever side moved it, in either direction", () => {
    expect(ok(merge({ ...base, notes: "mine" }, base)).notes).toBe("mine");
    expect(ok(merge(base, { ...base, notes: "theirs" })).notes).toBe("theirs");
  });
});

describe("edits that do overlap", () => {
  it("refuses when both changed the same group differently, and names it", () => {
    const result = merge({ ...base, title: "내 제목" }, { ...base, title: "그쪽 제목" });
    expect(result).toMatchObject({ ok: false, reason: "contested", groups: ["content"] });
  });

  it("treats coupled fields as one, so no record appears that nobody wrote", () => {
    // Finishing on one device and binning it on the other. Field by field this
    // would produce status "done" with a deletedAt — a row neither side saved.
    const done = { ...base, status: "done", completedAt: NOW } as Task;
    const binned = { ...base, deletedAt: NOW } as Task;
    expect(merge(done, binned)).toMatchObject({ ok: false, reason: "contested", groups: ["lifecycle"] });
  });

  it("names every contested group, not just the first", () => {
    const local = { ...base, title: "A", priority: "high" } as Task;
    const remote = { ...base, title: "B", priority: "low" } as Task;
    expect(merge(local, remote)).toMatchObject({ groups: ["content", "importance"] });
  });

  it("does not call a group contested when one side changed it back to base", () => {
    // Local edited and undid; remote edited. Only one side actually moved.
    expect(ok(merge({ ...base }, { ...base, title: "Theirs" })).title).toBe("Theirs");
  });
});

describe("what it will not merge", () => {
  it("refuses without a common ancestor", () => {
    expect(merge({ ...base, title: "A" }, { ...base, title: "B" }, null))
      .toMatchObject({ ok: false, reason: "no-base" });
  });

  it("refuses when either side is a deletion", () => {
    expect(merge(null, base)).toMatchObject({ ok: false, reason: "deleted" });
    expect(merge(base, null)).toMatchObject({ ok: false, reason: "deleted" });
  });

  it("refuses when a field this build does not know about differs", () => {
    // Forward compatibility means an account can hold fields this build has
    // never heard of, and there is no way to tell which group they belong to.
    const local = { ...base, snoozedUntil: "2026-10-01" } as unknown as Task;
    const remote = { ...base, snoozedUntil: "2026-11-01" } as unknown as Task;
    expect(merge(local, remote)).toMatchObject({ ok: false, reason: "unknown-field", fields: ["snoozedUntil"] });
  });

  it("carries an unknown field the two agree on", () => {
    const carried = { ...base, snoozedUntil: "2026-10-01" } as unknown as Task;
    const merged = ok(merge({ ...carried, title: "Mine" } as Task, carried));
    expect((merged as unknown as Record<string, unknown>).snoozedUntil).toBe("2026-10-01");
  });
});

describe("the fields that are not edits", () => {
  it("takes the Google binding from the remote row", () => {
    // Where the row is attached is a fact about the database, not something
    // either device meant.
    const local = { ...base, googleEventId: "stale", title: "Mine" } as Task;
    const remote = { ...base, googleEventId: "current" } as Task;
    expect(ok(merge(local, remote)).googleEventId).toBe("current");
  });

  it("keeps identity and creation from where the two agreed", () => {
    const local = { ...base, createdAt: "2020-01-01T00:00:00.000Z", title: "Mine" } as Task;
    const merged = ok(merge(local, base));
    expect(merged.id).toBe("t");
    expect(merged.createdAt).toBe(base.createdAt);
  });

  it("stamps the merge time rather than picking a clock to trust", () => {
    // Clocks disagree between devices; "latest wins" is exactly the rule this
    // design refuses (§D6).
    const local = { ...base, title: "Mine", updatedAt: "2099-01-01T00:00:00.000Z" } as Task;
    const remote = { ...base, priority: "high", updatedAt: "1999-01-01T00:00:00.000Z" } as Task;
    const merged = ok(merge(local, remote));
    expect(merged.updatedAt).toBe(NOW);
    expect(merged.title).toBe("Mine");
    expect(merged.priority).toBe("high");
  });
});

describe("the invariant", () => {
  it("never produces a value none of the three sides wrote", () => {
    // Said as a property rather than an example: for every key in the result,
    // that key's value came from base, local or remote — except the stamp,
    // which is the one thing the merge itself authors.
    const local = { ...base, title: "Mine", dueDate: "2026-09-30", tags: ["a"] } as Task;
    // Different groups from `local` on purpose: `notes` would be content, the
    // same group the title is in, and that is a question rather than a merge.
    const remote = { ...base, priority: "high", waitingReason: "Theirs", googleEventId: "e" } as Task;
    const merged = ok(merge(local, remote)) as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(merged)) {
      if (key === TASK_MERGE_STAMP_FIELD) continue;
      const sides = [base, local, remote].map((side) => (side as unknown as Record<string, unknown>)[key]);
      expect(sides.map((v) => JSON.stringify(v)), key).toContain(JSON.stringify(value));
    }
  });

  it("returns base itself when neither side changed anything", () => {
    const merged = ok(merge({ ...base }, { ...base }));
    expect({ ...merged, updatedAt: base.updatedAt }).toEqual(base);
  });
});
