// `getTodayBuckets` had no test, and SCHEDULE_EDITOR_PHASE0_AUDIT.md §6 (1-e)
// changed what it returns: `dueToday` and `scheduledToday` were two rows
// because a task could be due one day and planned for another, and the two
// dates have merged. The sidebar's Today count sums these buckets, so a
// mistake here is a number the user sees disagreeing with the list.
import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import { getTodayBuckets } from "./planner";

const TODAY = "2026-08-18";
const NOW = `${TODAY}T00:00:00.000Z`;

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Task",
    description: "",
    status: "todo",
    priority: "none",
    dueDate: "",
    startDate: "",
    startTime: "",
    endTime: "",
    projectId: "",
    categoryId: "",
    parentTaskId: "",
    tags: [],
    notes: "",
    estimatedMinutes: 0,
    actualSeconds: 0,
    activeSessionId: "",
    lastFocusedAt: "",
    isSomeday: false,
    waitingReason: "",
    waitingFollowUpDate: "",
    order: 0,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: "",
    archivedAt: "",
    blockedByTaskId: "",
    repeatType: "none",
    repeatInterval: 1,
    repeatDays: [],
    repeatEndDate: "",
    ...overrides,
  };
}

const ids = (tasks: Task[]) => tasks.map((entry) => entry.id).sort();

describe("getTodayBuckets", () => {
  it("puts a deadline and a work day on the same row", () => {
    // WAS: `dueToday` and `scheduledToday`, one each. Both records are the
    // same shape now — one date — which is the point.
    const buckets = getTodayBuckets(
      [task({ id: "due", dueDate: TODAY }), task({ id: "work", dueDate: TODAY })],
      TODAY,
    );
    expect(ids(buckets.dueToday)).toEqual(["due", "work"]);
  });

  it("counts a range as today's from its first day", () => {
    const buckets = getTodayBuckets(
      [task({ id: "running", startDate: TODAY, dueDate: "2026-08-21" })],
      TODAY,
    );
    expect(ids(buckets.dueToday)).toEqual(["running"]);
    expect(buckets.overdue).toEqual([]);
  });

  it("keeps a running range out of overdue until its end has passed", () => {
    const started = [task({ id: "running", startDate: "2026-08-16", dueDate: "2026-08-20" })];
    expect(ids(getTodayBuckets(started, TODAY).dueToday)).toEqual(["running"]);
    expect(ids(getTodayBuckets(started, "2026-08-21").overdue)).toEqual(["running"]);
  });

  it("leaves a future schedule out of both rows", () => {
    const buckets = getTodayBuckets([task({ id: "later", dueDate: "2026-09-01" })], TODAY);
    expect(buckets.dueToday).toEqual([]);
    expect(buckets.overdue).toEqual([]);
  });

  it("reports an undated task nowhere", () => {
    const buckets = getTodayBuckets([task({ id: "bare" })], TODAY);
    expect([...buckets.dueToday, ...buckets.overdue]).toEqual([]);
  });

  // The bucket order is a precedence chain (spec §0.1.7), so these still win
  // over any date the task carries.
  it("keeps the earlier buckets ahead of the dates", () => {
    const buckets = getTodayBuckets(
      [
        task({ id: "done", status: "done", completedAt: NOW, dueDate: TODAY }),
        task({ id: "waiting", status: "waiting", dueDate: "2026-08-01" }),
        task({ id: "doing", status: "doing", dueDate: "2026-08-01" }),
      ],
      TODAY,
    );
    expect(ids(buckets.doneToday)).toEqual(["done"]);
    expect(ids(buckets.waiting)).toEqual(["waiting"]);
    expect(ids(buckets.inProgress)).toEqual(["doing"]);
    expect(buckets.overdue).toEqual([]);
  });

  it("skips deleted tasks", () => {
    const buckets = getTodayBuckets([task({ id: "gone", dueDate: TODAY, deletedAt: NOW })], TODAY);
    expect(buckets.dueToday).toEqual([]);
  });
});
