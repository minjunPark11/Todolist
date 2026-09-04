// GOOGLE_CALENDAR_SYNC_DESIGN.md §4.3, §4.2, §5.1.
//
// Two rules are load-bearing beyond their size. The identity one keeps a
// feature nobody uses from writing to every account's settings on every
// delete; the `outboundAction` one is where §5.1's refusal to infer deletion
// from absence actually lives — this function cannot see Google, by design.
import { describe, expect, it } from "vitest";
import { outboundAction, tombstonesAfterRemoval, withoutTombstone, type MappedTask } from "./tombstones";
import type { SyncableTask } from "./eventShape";

function mapped(id: string, googleEventId?: string): MappedTask {
  return googleEventId ? { id, googleEventId } : { id };
}

describe("tombstonesAfterRemoval", () => {
  it("records the event of a task that was dropped", () => {
    const before = [mapped("t1", "g1"), mapped("t2", "g2")];
    expect(tombstonesAfterRemoval(undefined, before, [mapped("t2", "g2")])).toEqual(["g1"]);
  });

  it("records several at once — emptying the Trash", () => {
    const before = [mapped("t1", "g1"), mapped("t2", "g2"), mapped("t3")];
    expect(tombstonesAfterRemoval(undefined, before, [])).toEqual(["g1", "g2"]);
  });

  it("appends to what is already waiting", () => {
    const before = [mapped("t1", "g1")];
    expect(tombstonesAfterRemoval(["g0"], before, [])).toEqual(["g0", "g1"]);
  });

  it("ignores a dropped task that never had an event", () => {
    const before = [mapped("t1")];
    expect(tombstonesAfterRemoval(undefined, before, [])).toBeUndefined();
  });

  it("returns the SAME array when nothing was orphaned", () => {
    // Not merely equal — identical. The account sync diffs on object identity,
    // so a fresh array would push appSettings to the server on every delete in
    // every account, whether or not it has ever seen Google.
    const current = ["g0"];
    const before = [mapped("t1")];
    expect(tombstonesAfterRemoval(current, before, [])).toBe(current);
  });

  it("returns the same array when nothing was removed at all", () => {
    const current = ["g0"];
    const before = [mapped("t1", "g1")];
    expect(tombstonesAfterRemoval(current, before, before)).toBe(current);
  });

  it("does not record the same event twice", () => {
    const before = [mapped("t1", "g1")];
    expect(tombstonesAfterRemoval(["g1"], before, [])).toEqual(["g1"]);
  });
});

describe("withoutTombstone", () => {
  it("drops the id whose delete landed", () => {
    expect(withoutTombstone(["g1", "g2"], "g1")).toEqual(["g2"]);
  });

  it("goes back to absent when the last one clears", () => {
    // "Absent stays absent" — an account that finished its work should hold no
    // field, not an empty array.
    expect(withoutTombstone(["g1"], "g1")).toBeUndefined();
  });

  it("returns the same array for an id it does not hold", () => {
    const current = ["g1"];
    expect(withoutTombstone(current, "g9")).toBe(current);
  });

  it("survives being called on nothing", () => {
    expect(withoutTombstone(undefined, "g1")).toBeUndefined();
  });
});

describe("outboundAction", () => {
  function task(overrides: Partial<SyncableTask & MappedTask> = {}): SyncableTask & MappedTask {
    return { id: "t1", title: "Write the report", dueDate: "2026-09-04", ...overrides };
  }

  it("creates for a dated task with no event", () => {
    expect(outboundAction(task())).toBe("create");
  });

  it("updates one that already has an event", () => {
    expect(outboundAction(task({ googleEventId: "g1" }))).toBe("update");
  });

  it("deletes when the task is trashed", () => {
    expect(outboundAction(task({ googleEventId: "g1", deletedAt: "2026-09-04T10:00:00Z" }))).toBe("delete");
  });

  it("deletes when the date is taken away", () => {
    expect(outboundAction(task({ googleEventId: "g1", dueDate: "" }))).toBe("delete");
  });

  it("does nothing for an undated task that never had an event", () => {
    expect(outboundAction(task({ dueDate: "" }))).toBe("none");
  });

  it("asks for a create again after a failed write — §4.2's implicit retry", () => {
    // A write that failed left no id behind. There is no `pending` flag to
    // keep honest: the same eligible, unlinked Task simply reads as `create`
    // on the next pass.
    const failed = task();
    expect(outboundAction(failed)).toBe("create");
    expect(outboundAction({ ...failed, googleEventId: "g1" })).toBe("update");
  });
});
