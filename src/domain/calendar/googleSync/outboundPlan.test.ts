import { describe, expect, it } from "vitest";
import { isEmptyPlan, needsUpdate, planOutbound, type IdentifiedTask } from "./outboundPlan";

function task(overrides: Partial<IdentifiedTask> & { id: string }): IdentifiedTask {
  return { title: "Write it down", dueDate: "2026-09-04", ...overrides };
}

describe("sorting a pass into piles", () => {
  it("creates for a dated task that has no event yet", () => {
    const plan = planOutbound([task({ id: "t1" })]);
    expect(plan.create.map((row) => row.id)).toEqual(["t1"]);
    expect(plan.update).toHaveLength(0);
  });

  it("updates one that is already linked", () => {
    const plan = planOutbound([task({ id: "t1", googleEventId: "ev1" })]);
    expect(plan.update.map((row) => row.id)).toEqual(["t1"]);
    expect(plan.create).toHaveLength(0);
  });

  it("deletes the event of a task that lost its date", () => {
    const plan = planOutbound([task({ id: "t1", dueDate: "", googleEventId: "ev1" })]);
    expect(plan.delete).toEqual([{ taskId: "t1", eventId: "ev1" }]);
  });

  it("deletes the event of a task that went to the trash", () => {
    const plan = planOutbound([task({ id: "t1", googleEventId: "ev1", deletedAt: "2026-09-04T10:00:00Z" })]);
    expect(plan.delete).toEqual([{ taskId: "t1", eventId: "ev1" }]);
  });

  it("leaves alone a task that never had an event and does not want one", () => {
    const plan = planOutbound([task({ id: "t1", dueDate: "" })]);
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it("keeps a completed task on the calendar", () => {
    const plan = planOutbound([task({ id: "t1", googleEventId: "ev1", completedAt: "2026-09-04T09:00:00Z" })]);
    expect(plan.update.map((row) => row.id)).toEqual(["t1"]);
    expect(plan.delete).toHaveLength(0);
  });
});

describe("orphaned events", () => {
  it("go out even though no task names them", () => {
    expect(planOutbound([], ["ev-gone"]).orphans).toEqual(["ev-gone"]);
  });

  it("are not sent twice when the list repeats one", () => {
    expect(planOutbound([], ["ev-gone", "ev-gone"]).orphans).toEqual(["ev-gone"]);
  });

  it("skip an id a live task still claims, so its tombstone is not cleared by someone else's delete", () => {
    const plan = planOutbound([task({ id: "t1", googleEventId: "ev1" })], ["ev1"]);
    expect(plan.orphans).toEqual([]);
    expect(plan.update).toHaveLength(1);
  });

  it("skip an id already queued for deletion by its own task", () => {
    const plan = planOutbound([task({ id: "t1", dueDate: "", googleEventId: "ev1" })], ["ev1"]);
    expect(plan.orphans).toEqual([]);
    expect(plan.delete).toHaveLength(1);
  });

  it("ignore an empty id rather than sending a delete for nothing", () => {
    expect(planOutbound([], [""]).orphans).toEqual([]);
  });
});

describe("the cheap check", () => {
  it("says nothing to do before a token is asked for", () => {
    expect(isEmptyPlan(planOutbound([]))).toBe(true);
    expect(isEmptyPlan(planOutbound([task({ id: "t1" })]))).toBe(false);
    expect(isEmptyPlan(planOutbound([], ["ev-gone"]))).toBe(false);
  });
});

describe("not writing what is already there", () => {
  const pushed = {
    id: "t1",
    googleEventId: "ev1",
    updatedAt: "2026-09-04T10:00:00Z",
    googleSyncedAt: "2026-09-04T10:00:00Z",
  };

  it("skips a task untouched since its last push", () => {
    expect(needsUpdate(task(pushed))).toBe(false);
    expect(planOutbound([task(pushed)]).update).toHaveLength(0);
  });

  it("sends one edited since", () => {
    const edited = task({ ...pushed, updatedAt: "2026-09-04T11:00:00Z" });
    expect(needsUpdate(edited)).toBe(true);
    expect(planOutbound([edited]).update.map((row) => row.id)).toEqual(["t1"]);
  });

  it("sends one that has never been pushed", () => {
    expect(needsUpdate(task({ ...pushed, googleSyncedAt: undefined }))).toBe(true);
  });

  it("still claims its event, so a stale tombstone cannot delete it", () => {
    const plan = planOutbound([task(pushed)], ["ev1"]);
    expect(plan.update).toHaveLength(0);
    expect(plan.orphans).toEqual([]);
  });
});
