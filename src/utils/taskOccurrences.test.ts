import { describe, expect, it } from "vitest";
import { expandTaskOccurrences, occurrenceIdFor, resolveOccurrence, seriesIdOf } from "./taskOccurrences";
import type { Task } from "../types";

const TODAY = "2026-09-09"; // A Wednesday.
const RANGE = { from: "2026-09-01", to: "2026-09-30" };

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "series-1", title: "Water the plants", description: "", status: "todo",
    priority: "none", dueDate: TODAY, startDate: "", startTime: "", endTime: "",
    projectId: "", categoryId: "", parentTaskId: "", tags: [], notes: "",
    estimatedMinutes: 0, actualSeconds: 0, activeSessionId: "", lastFocusedAt: "",
    isSomeday: false, waitingReason: "", waitingFollowUpDate: "", order: 0,
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
    completedAt: "", archivedAt: "", blockedByTaskId: "",
    repeatType: "weekly", repeatInterval: 1, repeatDays: [], repeatEndDate: "",
    ...overrides,
  };
}

const dates = (tasks: Task[]) => expandTaskOccurrences(tasks, RANGE, TODAY).map((t) => t.dueDate);

describe("expandTaskOccurrences", () => {
  it("draws the weeks after the one the record already draws", () => {
    // The series itself is the 9/09 occurrence, so expansion starts at 9/16.
    expect(dates([task()])).toEqual(["2026-09-16", "2026-09-23", "2026-09-30"]);
  });

  it("ignores a task that does not repeat", () => {
    expect(dates([task({ repeatType: "none" })])).toEqual([]);
  });

  it("stops at the repeat's end date", () => {
    expect(dates([task({ repeatEndDate: "2026-09-20" })])).toEqual(["2026-09-16"]);
  });

  it("leaves out a skipped occurrence", () => {
    expect(dates([task({ exdates: ["2026-09-23"] })])).toEqual(["2026-09-16", "2026-09-30"]);
  });

  it("gives each occurrence its own id, keyed by the date it is on", () => {
    // Sharing the series id is what made `expandIcsOccurrences` lose all but
    // one occurrence from a list keyed by id.
    const ids = expandTaskOccurrences([task()], RANGE, TODAY).map((t) => t.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe(occurrenceIdFor("series-1", "2026-09-16"));
    expect(seriesIdOf(ids[0])).toBe("series-1");
    expect(seriesIdOf("plain-task-id")).toBe("");
  });

  it("marks each occurrence with the series and the date it stands for", () => {
    const [first] = expandTaskOccurrences([task()], RANGE, TODAY);
    expect(first.occurrenceOf).toBe("series-1");
    expect(first.recurrenceId).toBe("2026-09-16");
  });

  it("does not let an occurrence repeat, or own the series' exceptions", () => {
    const [first] = expandTaskOccurrences([task({ exdates: ["2026-09-30"] })], RANGE, TODAY);
    expect(first.repeatType).toBe("none");
    expect(first.repeatEndDate).toBe("");
    expect(first.exdates).toBeUndefined();
    expect(first.activeSessionId).toBe("");
  });

  it("keeps a range's length when the occurrence moves", () => {
    const span = task({ startDate: "2026-09-07", dueDate: TODAY }); // two days long
    const [first] = expandTaskOccurrences([span], RANGE, TODAY);
    expect(first.startDate).toBe("2026-09-14");
    expect(first.dueDate).toBe("2026-09-16");
  });
});

// R8 (§5.3). The one behaviour the design deliberately did NOT change.
describe("expandTaskOccurrences — the past is only what was recorded", () => {
  it("invents nothing before today, however far back the range reaches", () => {
    const wide = expandTaskOccurrences([task()], { from: "2026-01-01", to: "2026-09-30" }, TODAY);
    expect(wide.every((t) => t.dueDate >= TODAY)).toBe(true);
  });

  it("does not rebuild the occurrences a neglected repeat missed", () => {
    // Three weeks overdue. `getNextDueDate` collapses this to one thing by
    // anchoring to today, and drawing the three missed weeks would contradict
    // both that and the completion it produces.
    const neglected = task({ dueDate: "2026-08-19" });
    expect(dates([neglected])).toEqual(["2026-09-16", "2026-09-23", "2026-09-30"]);
  });

  it("steps exactly where completing the task would roll it", () => {
    // The guarantee behind reusing `getNextDueDate` instead of re-deriving the
    // rule: what is drawn and what completion produces cannot drift.
    const weekdays = task({ repeatDays: [1, 2, 3, 4, 5], dueDate: "2026-09-11" }); // Friday
    expect(dates([weekdays]).slice(0, 3)).toEqual(["2026-09-14", "2026-09-15", "2026-09-16"]);
  });
});

describe("expandTaskOccurrences — real records win their date", () => {
  it("does not draw over an occurrence that already exists", () => {
    // What M1 started writing: a finished occurrence is a real row carrying the
    // date it stood for. Drawing a virtual one on top would show the same
    // occurrence twice, once done and once not.
    const done = task({
      id: "done-1", repeatType: "none", status: "completed", completedAt: "2026-09-16T09:00:00.000Z",
      dueDate: "2026-09-16", recurrenceId: "2026-09-16", occurrenceOf: "series-1",
    });
    expect(dates([task(), done])).toEqual(["2026-09-23", "2026-09-30"]);
  });

  it("only yields the date to a record of the same series", () => {
    const other = task({
      id: "done-2", repeatType: "none", dueDate: "2026-09-16",
      recurrenceId: "2026-09-16", occurrenceOf: "some-other-series",
    });
    expect(dates([task(), other])).toContain("2026-09-16");
  });

  it("never expands a record that is itself an occurrence", () => {
    const occurrence = task({ id: "occ-1", recurrenceId: "2026-09-09", occurrenceOf: "series-1" });
    expect(dates([occurrence])).toEqual([]);
  });
});

describe("expandTaskOccurrences — bounds", () => {
  it("returns nothing without a usable range", () => {
    expect(expandTaskOccurrences([task()], { from: "", to: "" }, TODAY)).toEqual([]);
    expect(expandTaskOccurrences([task()], { from: "2026-09-30", to: "2026-09-01" }, TODAY)).toEqual([]);
  });

  it("caps a daily repeat over an absurd range rather than running away", () => {
    const daily = task({ repeatType: "daily" });
    const huge = expandTaskOccurrences([daily], { from: TODAY, to: "2099-12-31" }, TODAY);
    expect(huge.length).toBeLessThanOrEqual(400);
  });

  it("leaves a series alone once it is trashed or given up on", () => {
    expect(dates([task({ deletedAt: "2026-09-08T00:00:00.000Z" })])).toEqual([]);
    expect(dates([task({ wontDoAt: "2026-09-08T00:00:00.000Z" })])).toEqual([]);
  });
});

describe("resolveOccurrence", () => {
  const series = task();
  const stored = task({
    id: "occ-1", repeatType: "none", dueDate: "2026-09-24",
    recurrenceId: "2026-09-23", occurrenceOf: "series-1",
  });

  it("reads a virtual occurrence out of its id", () => {
    const found = resolveOccurrence([series], occurrenceIdFor("series-1", "2026-09-16"));
    expect(found?.series.id).toBe("series-1");
    expect(found?.occurrenceDate).toBe("2026-09-16");
    expect(found?.existing).toBeNull();
  });

  it("reads a materialised occurrence out of its row", () => {
    const found = resolveOccurrence([series, stored], "occ-1");
    expect(found?.occurrenceDate).toBe("2026-09-23");
    expect(found?.existing?.id).toBe("occ-1");
  });

  it("says nothing about a plain task", () => {
    expect(resolveOccurrence([task({ id: "plain", repeatType: "none" })], "plain")).toBeNull();
  });

  it("says nothing about a series' own record", () => {
    // The series draws on its own date and is edited the way it always was.
    expect(resolveOccurrence([series], "series-1")).toBeNull();
  });

  it("treats a row whose series is gone as a plain task", () => {
    // Offering "this occurrence or the whole series?" would be a choice with
    // nothing behind it.
    expect(resolveOccurrence([stored], "occ-1")).toBeNull();
  });

  it("says nothing when the id names a series that is not here", () => {
    expect(resolveOccurrence([], occurrenceIdFor("gone", "2026-09-16"))).toBeNull();
  });
});
