import { describe, expect, it } from "vitest";
import { isOccurrenceTask, planOccurrenceOutbound, planSkippedInstances, startOfDayIn } from "./occurrenceOutbound";
import { isSyncEligible } from "./eventShape";
import type { Task } from "../../../types";

const SEOUL = "Asia/Seoul";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "occ-1", title: "Water the plants", description: "", status: "todo",
    priority: "none", dueDate: "2026-09-24", startDate: "", startTime: "", endTime: "",
    projectId: "", categoryId: "", parentTaskId: "", tags: [], notes: "",
    estimatedMinutes: 0, actualSeconds: 0, activeSessionId: "", lastFocusedAt: "",
    isSomeday: false, waitingReason: "", waitingFollowUpDate: "", order: 0,
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
    completedAt: "", archivedAt: "", blockedByTaskId: "",
    repeatType: "none", repeatInterval: 1, repeatDays: [], repeatEndDate: "",
    recurrenceId: "2026-09-23", occurrenceOf: "series-1",
    ...overrides,
  };
}

describe("isOccurrenceTask", () => {
  it("needs both fields, because one alone is a record on its own", () => {
    expect(isOccurrenceTask(task())).toBe(true);
    expect(isOccurrenceTask({ recurrenceId: "2026-09-23", occurrenceOf: "" })).toBe(false);
    expect(isOccurrenceTask({ recurrenceId: "", occurrenceOf: "series-1" })).toBe(false);
    expect(isOccurrenceTask({})).toBe(false);
  });
});

// The urgent half of M6. M3 started writing occurrence rows, and to the plain
// outbound path one looks exactly like an ordinary dated task.
describe("isSyncEligible refuses an occurrence", () => {
  it("does not give a second event to a date the series' rule already draws", () => {
    // Otherwise the same occurrence lands on Google twice, on two days: once
    // from the series' RRULE on the original date, once as a standalone event
    // on the day it was moved to.
    expect(isSyncEligible(task())).toBe(false);
  });

  it("still syncs an ordinary dated task, and the series itself", () => {
    expect(isSyncEligible(task({ recurrenceId: undefined, occurrenceOf: undefined }))).toBe(true);
    const series = task({
      id: "series-1", repeatType: "weekly", recurrenceId: undefined, occurrenceOf: undefined,
    });
    expect(isSyncEligible(series)).toBe(true);
  });
});

describe("planOccurrenceOutbound", () => {
  const series = { id: "series-1", googleEventId: "event-1" };

  it("addresses the series' event and the instant the occurrence was on", () => {
    const plan = planOccurrenceOutbound({ occurrence: task(), series, timezone: SEOUL });
    expect(plan).toEqual({
      kind: "override",
      masterEventId: "event-1",
      // Midnight on 9/23 in Seoul is 15:00 UTC on 9/22.
      originalStart: "2026-09-22T15:00:00.000Z",
    });
  });

  it("addresses where it WAS, not where it was moved to", () => {
    const plan = planOccurrenceOutbound({
      occurrence: task({ recurrenceId: "2026-09-23", dueDate: "2026-09-30" }), series, timezone: SEOUL,
    });
    if (plan.kind !== "override") return;
    expect(plan.originalStart.slice(0, 10)).toBe("2026-09-22"); // 9/23 Seoul
  });

  it("never creates — it waits for the series to have an event to hang on", () => {
    // A create here is the duplication this module exists to prevent.
    expect(planOccurrenceOutbound({
      occurrence: task(), series: { id: "series-1", googleEventId: "" }, timezone: SEOUL,
    })).toEqual({ kind: "hold", reason: "series-not-synced" });

    expect(planOccurrenceOutbound({ occurrence: task(), series: null, timezone: SEOUL }))
      .toEqual({ kind: "hold", reason: "series-missing" });

    expect(planOccurrenceOutbound({
      occurrence: task({ recurrenceId: "" }), series, timezone: SEOUL,
    })).toEqual({ kind: "hold", reason: "no-occurrence-date" });
  });
});

describe("planSkippedInstances", () => {
  it("turns each skipped date into an instance to cancel", () => {
    // Google has no EXDATE field on an event; it has an instance whose status
    // is cancelled. So a skip is a write to that instance, not to the series.
    const plans = planSkippedInstances(
      { googleEventId: "event-1", exdates: ["2026-09-23", "2026-09-30"] }, SEOUL);
    expect(plans).toHaveLength(2);
    expect(plans[0]).toEqual({ masterEventId: "event-1", originalStart: "2026-09-22T15:00:00.000Z" });
  });

  it("has nothing to say about a series with no event or no exceptions", () => {
    expect(planSkippedInstances({ googleEventId: "", exdates: ["2026-09-23"] }, SEOUL)).toEqual([]);
    expect(planSkippedInstances({ googleEventId: "event-1" }, SEOUL)).toEqual([]);
  });
});

describe("startOfDayIn", () => {
  it("reads midnight in the connection's zone, not the machine's", () => {
    expect(startOfDayIn("2026-09-23", SEOUL)).toBe("2026-09-22T15:00:00.000Z");
    expect(startOfDayIn("2026-09-23", "UTC")).toBe("2026-09-23T00:00:00.000Z");
  });

  it("follows a zone across its own DST change rather than assuming an offset", () => {
    // New York is -04:00 in July and -05:00 in January. An assumed offset puts
    // one of these an hour out, and an occurrence an hour out at midnight is an
    // occurrence on the wrong day.
    expect(startOfDayIn("2026-07-15", "America/New_York")).toBe("2026-07-15T04:00:00.000Z");
    expect(startOfDayIn("2026-01-15", "America/New_York")).toBe("2026-01-15T05:00:00.000Z");
  });

  it("says nothing rather than guessing when the date or zone is unusable", () => {
    expect(startOfDayIn("not-a-date", SEOUL)).toBe("");
    expect(startOfDayIn("2026-09-23", "Not/AZone")).toBe("");
  });
});
