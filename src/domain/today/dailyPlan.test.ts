import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
vi.mock("../../platform", () => ({
  platform: {
    storage: {
      getSync: (key: string) => storage.get(key) ?? null,
      setSync: (key: string, value: string) => void storage.set(key, value),
    },
  },
}));

import type { TaskDailyPlan } from "../../types";
import {
  adoptLegacyBucketOverrides,
  applyBucketOverrides,
  bucketOverridesFor,
  dailyPlanIdFor,
  planTaskForDate,
  prunePlansBefore,
  readLegacyBucketOverrides,
  sanitizeDailyPlan,
} from "./dailyPlan";

const NOW = "2026-08-18T00:00:00.000Z";
const LATER = "2026-08-18T09:00:00.000Z";
const TODAY = "2026-08-18";
const LEGACY_KEY = "todayPage.bucketOverrides.v1";

function plan(overrides: Partial<TaskDailyPlan> = {}): TaskDailyPlan {
  return {
    id: dailyPlanIdFor(TODAY, "t1"),
    taskId: "t1",
    planDate: TODAY,
    bucket: "now",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("sanitizeDailyPlan", () => {
  it("drops a plan that decides nothing", () => {
    expect(sanitizeDailyPlan({ planDate: TODAY, bucket: "now" })).toBeNull();
    expect(sanitizeDailyPlan({ taskId: "t1", bucket: "now" })).toBeNull();
    expect(sanitizeDailyPlan(null)).toBeNull();
  });

  // The pair IS the decision: it says the task is planned for that day, which
  // is what puts a task with no due date into Today (§12.5.1). A bucket that
  // is not one of the three is dropped without taking the membership with it.
  it("keeps a plan that names a day but no part of it", () => {
    expect(sanitizeDailyPlan({ taskId: "t1", planDate: TODAY })).toMatchObject({
      taskId: "t1",
      planDate: TODAY,
    });
    expect(sanitizeDailyPlan({ taskId: "t1", planDate: TODAY })?.bucket).toBeUndefined();
    expect(sanitizeDailyPlan({ taskId: "t1", planDate: TODAY, bucket: "someday" })?.bucket).toBeUndefined();
  });

  it("rebuilds a missing id from the pair that identifies the row", () => {
    expect(sanitizeDailyPlan({ taskId: "t1", planDate: TODAY, bucket: "later" })).toMatchObject({
      id: dailyPlanIdFor(TODAY, "t1"),
      bucket: "later",
    });
  });

  it("carries fields it does not know (M0)", () => {
    expect(
      sanitizeDailyPlan({ taskId: "t1", planDate: TODAY, bucket: "now", futureField: 1 }),
    ).toMatchObject({ futureField: 1 });
  });
});

describe("bucketOverridesFor", () => {
  it("answers for one date only", () => {
    const plans = [plan(), plan({ id: "p-y", taskId: "t2", planDate: "2026-08-17", bucket: "later" })];
    expect(bucketOverridesFor(plans, TODAY)).toEqual({ t1: "now" });
  });
});

// The Today page hands over a whole snapshot on every change, because its undo
// restores one. If that meant rewriting the day, every plan record would go up
// the wire on every move — the write amplification `diffChangedRecords` exists
// to avoid, since it decides what to sync by object identity.
describe("applyBucketOverrides", () => {
  const existing = [
    plan(),
    plan({ id: dailyPlanIdFor(TODAY, "t2"), taskId: "t2", bucket: "next" }),
    plan({ id: dailyPlanIdFor("2026-08-19", "t3"), taskId: "t3", planDate: "2026-08-19", bucket: "later" }),
  ];

  it("returns the same array when the snapshot says what the records already say", () => {
    expect(applyBucketOverrides(existing, TODAY, { t1: "now", t2: "next" }, LATER)).toBe(existing);
  });

  it("keeps the object identity of a plan whose bucket did not change", () => {
    const next = applyBucketOverrides(existing, TODAY, { t1: "now", t2: "later" }, LATER);
    expect(next.find((entry) => entry.taskId === "t1")).toBe(existing[0]);
    expect(next.find((entry) => entry.taskId === "t2")).not.toBe(existing[1]);
    expect(next.find((entry) => entry.taskId === "t2")?.updatedAt).toBe(LATER);
  });

  it("never touches another date", () => {
    const next = applyBucketOverrides(existing, TODAY, {}, LATER);
    expect(next.find((entry) => entry.planDate === "2026-08-19")).toBe(existing[2]);
  });

  // Clearing the day resets where things sit in it. It does not evict from
  // Today a task whose only claim to being there is the plan itself.
  it("clears a dropped task's bucket and keeps it on the day", () => {
    const next = applyBucketOverrides(existing, TODAY, { t2: "next" }, LATER);
    const t1 = next.find((entry) => entry.taskId === "t1" && entry.planDate === TODAY);
    expect(t1).toBeDefined();
    expect(t1?.bucket).toBeUndefined();
    expect(bucketOverridesFor(next, TODAY)).toEqual({ t2: "next" });
  });

  it("creates a plan at the id both devices would pick", () => {
    const next = applyBucketOverrides([], TODAY, { t9: "later" }, LATER);
    expect(next).toEqual([
      { id: dailyPlanIdFor(TODAY, "t9"), taskId: "t9", planDate: TODAY, bucket: "later", createdAt: LATER, updatedAt: LATER },
    ]);
  });
});

describe("prunePlansBefore", () => {
  it("drops days nothing reads any more, and keeps today", () => {
    const plans = [plan({ id: "old", planDate: "2026-08-17" }), plan()];
    expect(prunePlansBefore(plans, TODAY).map((entry) => entry.planDate)).toEqual([TODAY]);
  });

  it("returns the same array when nothing is stale", () => {
    const plans = [plan()];
    expect(prunePlansBefore(plans, TODAY)).toBe(plans);
  });
});

describe("the localStorage blob this replaces", () => {
  beforeEach(() => storage.clear());

  it("reads a plan written by a device that had no records", () => {
    storage.set(LEGACY_KEY, JSON.stringify({ date: TODAY, overrides: { t1: "now", t2: "bogus" } }));
    expect(readLegacyBucketOverrides()).toEqual({ planDate: TODAY, overrides: { t1: "now" } });
  });

  it("answers nothing for a blob that is absent or unreadable", () => {
    expect(readLegacyBucketOverrides()).toBeNull();
    storage.set(LEGACY_KEY, "{oops");
    expect(readLegacyBucketOverrides()).toBeNull();
  });

  // Merged by id, the same rule the other legacy adoptions follow: a repeated
  // read adds nothing twice, and a synced plan that has already arrived wins.
  it("adopts what the account does not already hold", () => {
    storage.set(LEGACY_KEY, JSON.stringify({ date: TODAY, overrides: { t1: "later", t2: "now" } }));
    const synced = [plan()]; // t1 already arrived, saying "now"
    const adopted = adoptLegacyBucketOverrides(synced, NOW);
    expect(bucketOverridesFor(adopted, TODAY)).toEqual({ t1: "now", t2: "now" });
    expect(adoptLegacyBucketOverrides(adopted, NOW)).toBe(adopted);
  });
});

// §12.5.3: a task captured from Today has no due date, so this record is the
// only thing keeping it there.
describe("planTaskForDate", () => {
  it("puts a task on a day without deciding where in it", () => {
    const [added] = planTaskForDate([], "t9", TODAY, NOW);
    expect(added).toMatchObject({ id: dailyPlanIdFor(TODAY, "t9"), taskId: "t9", planDate: TODAY });
    expect(added.bucket).toBeUndefined();
  });

  it("returns the same array when the task is already on that day", () => {
    const plans = [plan()];
    expect(planTaskForDate(plans, "t1", TODAY, NOW)).toBe(plans);
  });

  it("leaves a bucket the user already chose alone", () => {
    const plans = [plan({ bucket: "later" })];
    expect(planTaskForDate(plans, "t1", TODAY, NOW)[0].bucket).toBe("later");
  });
});
