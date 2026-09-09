import { describe, expect, it } from "vitest";
import { applyOccurrenceEdit, applyOccurrenceSkip, dayBefore, planOccurrenceEdit, planOccurrenceSkip } from "./occurrenceEdit";
import type { Task } from "../../types";

const NOW = "2026-09-09T09:00:00.000Z";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "series-1", title: "Water the plants", description: "", status: "todo",
    priority: "none", dueDate: "2026-09-09", startDate: "", startTime: "", endTime: "",
    projectId: "", categoryId: "", parentTaskId: "", tags: [], notes: "",
    estimatedMinutes: 0, actualSeconds: 0, activeSessionId: "", lastFocusedAt: "",
    isSomeday: false, waitingReason: "", waitingFollowUpDate: "", order: 0,
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
    completedAt: "", archivedAt: "", blockedByTaskId: "",
    repeatType: "weekly", repeatInterval: 1, repeatDays: [], repeatEndDate: "",
    ...overrides,
  };
}

const edit = (over: Partial<Parameters<typeof planOccurrenceEdit>[0]> = {}) =>
  planOccurrenceEdit({
    series: task(), occurrenceDate: "2026-09-23", patch: { dueDate: "2026-09-24" },
    scope: "this", newTaskId: "new-1", now: NOW, ...over,
  });

describe("planOccurrenceEdit — this occurrence only", () => {
  it("writes a row for the occurrence and leaves the series alone", () => {
    const result = edit();
    expect(result.kind).toBe("materialize");
    if (result.kind !== "materialize") return;
    expect(result.occurrence.id).toBe("new-1");
    expect(result.occurrence.dueDate).toBe("2026-09-24");
  });

  it("records the date it stood for, not the one it moved to", () => {
    // The distinction the field exists for: expansion matches on where the
    // occurrence WAS, or a moved occurrence would be drawn twice — once as
    // itself and once as the gap it left behind.
    const result = edit();
    if (result.kind !== "materialize") return;
    expect(result.occurrence.recurrenceId).toBe("2026-09-23");
    expect(result.occurrence.occurrenceOf).toBe("series-1");
    expect(result.occurrence.recurrenceId).not.toBe(result.occurrence.dueDate);
  });

  it("does not let the occurrence repeat or carry the series' exceptions", () => {
    const result = edit({ series: task({ exdates: ["2026-09-30"] }) });
    if (result.kind !== "materialize") return;
    expect(result.occurrence.repeatType).toBe("none");
    expect(result.occurrence.repeatEndDate).toBe("");
    expect(result.occurrence.exdates).toBeUndefined();
    expect(result.occurrence.activeSessionId).toBe("");
  });

  it("stays on its own date when only the content changes", () => {
    const result = edit({ patch: { title: "Water the plants twice" } });
    if (result.kind !== "materialize") return;
    expect(result.occurrence.title).toBe("Water the plants twice");
    expect(result.occurrence.dueDate).toBe("2026-09-23");
  });

  it("patches the row instead of writing a second one when it already exists", () => {
    const existing = task({ id: "occ-1", repeatType: "none", recurrenceId: "2026-09-23", occurrenceOf: "series-1" });
    const result = edit({ existing });
    expect(result).toEqual({ kind: "occurrence", taskId: "occ-1", patch: { dueDate: "2026-09-24" } });
  });
});

describe("planOccurrenceEdit — the whole series", () => {
  it("edits the series in place, which is what it has always done", () => {
    expect(edit({ scope: "all" })).toEqual({
      kind: "series", taskId: "series-1", patch: { dueDate: "2026-09-24" },
    });
  });
});

// §6.4 / M4.
describe("planOccurrenceEdit — this and everything after", () => {
  it("cuts the old series the day before and starts a new one here", () => {
    const result = edit({ scope: "following", patch: { repeatDays: [4] } });
    expect(result.kind).toBe("split");
    if (result.kind !== "split") return;
    expect(result.taskId).toBe("series-1");
    expect(result.patch.repeatEndDate).toBe("2026-09-22");
    expect(result.series.id).toBe("new-1");
    expect(result.series.dueDate).toBe("2026-09-23");
    expect(result.series.repeatDays).toEqual([4]);
  });

  it("keeps the past out of it — the old series still owns its own end", () => {
    const result = edit({ scope: "following", series: task({ repeatEndDate: "2026-12-31" }) });
    if (result.kind !== "split") return;
    expect(result.patch.repeatEndDate).toBe("2026-09-22");
    expect(result.series.repeatEndDate).toBe("2026-12-31");
  });

  it("divides the exceptions at the cut", () => {
    const series = task({ exdates: ["2026-09-16", "2026-09-30"] });
    const result = edit({ scope: "following", series });
    if (result.kind !== "split") return;
    expect(result.patch.exdates).toEqual(["2026-09-16"]);
    expect(result.series.exdates).toEqual(["2026-09-30"]);
  });

  it("hands the rows at or after the cut to the new series", () => {
    // Left pointing at the old series they would be orphans expansion cannot
    // match, and the same date would draw twice.
    const result = edit({ scope: "following" });
    if (result.kind !== "split") return;
    expect(result.adopt).toEqual(["2026-09-23"]);
  });

  it("edits the series in place when the cut is its own first occurrence", () => {
    // Splitting there would leave the original ending before it starts — an
    // empty series. There is nothing before it to preserve.
    const result = edit({ scope: "following", occurrenceDate: "2026-09-09" });
    expect(result.kind).toBe("series");
  });
});

describe("planOccurrenceEdit — refusals", () => {
  it("refuses a task that is not a series", () => {
    expect(edit({ series: task({ repeatType: "none" }) })).toEqual({ kind: "refuse", reason: "not-a-series" });
  });

  it("refuses a record that is itself an occurrence", () => {
    const occurrence = task({ recurrenceId: "2026-09-09", occurrenceOf: "series-0" });
    expect(edit({ series: occurrence }).kind).toBe("refuse");
  });

  it("refuses without a date to stand for", () => {
    expect(edit({ occurrenceDate: "" })).toEqual({ kind: "refuse", reason: "no-occurrence-date" });
  });
});

const skip = (over: Partial<Parameters<typeof planOccurrenceSkip>[0]> = {}) =>
  planOccurrenceSkip({ series: task(), occurrenceDate: "2026-09-23", scope: "this", ...over });

describe("planOccurrenceSkip", () => {
  it("adds the date to the series' exceptions and writes nothing else", () => {
    expect(skip()).toEqual({ kind: "skip", taskId: "series-1", patch: { exdates: ["2026-09-23"] } });
  });

  it("keeps the exceptions sorted and free of duplicates", () => {
    const result = skip({ series: task({ exdates: ["2026-09-30", "2026-09-23"] }) });
    if (result.kind !== "skip") return;
    expect(result.patch.exdates).toEqual(["2026-09-23", "2026-09-30"]);
  });

  it("trashes the row too when the occurrence had one", () => {
    // The exception alone leaves its row on the calendar; trashing alone lets
    // the next expansion put a virtual occurrence back on the same date.
    const existing = task({ id: "occ-1", recurrenceId: "2026-09-23", occurrenceOf: "series-1" });
    const result = skip({ existing });
    if (result.kind !== "skip") return;
    expect(result.trashTaskId).toBe("occ-1");
    expect(result.patch.exdates).toEqual(["2026-09-23"]);
  });

  it("ends the series rather than listing exceptions for 'and after'", () => {
    expect(skip({ scope: "following" })).toEqual({
      kind: "end", taskId: "series-1", patch: { repeatEndDate: "2026-09-22" },
    });
  });

  it("deletes the series itself for 'all'", () => {
    expect(skip({ scope: "all" })).toEqual({ kind: "series", taskId: "series-1" });
  });
});

describe("dayBefore", () => {
  it("steps back one day across a month boundary", () => {
    expect(dayBefore("2026-10-01")).toBe("2026-09-30");
    expect(dayBefore("2026-03-01")).toBe("2026-02-28");
  });
});

describe("applyOccurrenceEdit", () => {
  const series = task();

  it("adds the materialised row", () => {
    const plan = planOccurrenceEdit({
      series, occurrenceDate: "2026-09-23", patch: { dueDate: "2026-09-24" },
      scope: "this", newTaskId: "new-1", now: NOW,
    });
    const next = applyOccurrenceEdit([series], plan, NOW);
    expect(next).toHaveLength(2);
    expect(next[1].recurrenceId).toBe("2026-09-23");
    // The series is untouched — that is what "this occurrence only" means.
    expect(next[0]).toEqual(series);
  });

  it("reparents the rows the split handed over", () => {
    const later = task({
      id: "occ-late", repeatType: "none", dueDate: "2026-09-30",
      recurrenceId: "2026-09-30", occurrenceOf: "series-1",
    });
    const earlier = task({
      id: "occ-early", repeatType: "none", dueDate: "2026-09-16",
      recurrenceId: "2026-09-16", occurrenceOf: "series-1",
    });
    const plan = planOccurrenceEdit({
      series, occurrenceDate: "2026-09-23", patch: { repeatDays: [4] },
      scope: "following", newTaskId: "new-1", now: NOW,
    });
    const next = applyOccurrenceEdit([series, earlier, later], plan, NOW);
    expect(next.find((t) => t.id === "occ-late")?.occurrenceOf).toBe("new-1");
    expect(next.find((t) => t.id === "occ-early")?.occurrenceOf).toBe("series-1");
    expect(next.find((t) => t.id === "series-1")?.repeatEndDate).toBe("2026-09-22");
  });

  it("decides the side of the cut by the date stood for, not the one moved to", () => {
    // An occurrence dragged backwards across the cut must not change series
    // just by having moved: it still stands for a date after it.
    const moved = task({
      id: "occ-moved", repeatType: "none", dueDate: "2026-09-10",
      recurrenceId: "2026-09-30", occurrenceOf: "series-1",
    });
    const plan = planOccurrenceEdit({
      series, occurrenceDate: "2026-09-23", patch: {},
      scope: "following", newTaskId: "new-1", now: NOW,
    });
    const next = applyOccurrenceEdit([series, moved], plan, NOW);
    expect(next.find((t) => t.id === "occ-moved")?.occurrenceOf).toBe("new-1");
  });
});

describe("applyOccurrenceSkip", () => {
  it("records the exception and trashes the row together", () => {
    const series = task({ id: "series-1" });
    const existing = task({ id: "occ-1", repeatType: "none", recurrenceId: "2026-09-23", occurrenceOf: "series-1" });
    const plan = planOccurrenceSkip({ series, occurrenceDate: "2026-09-23", scope: "this", existing });
    const next = applyOccurrenceSkip([series, existing], plan, NOW);
    expect(next[0].exdates).toEqual(["2026-09-23"]);
    expect(next[1].deletedAt).toBe(NOW);
  });

  it("trashes the series for 'all'", () => {
    const series = task();
    const plan = planOccurrenceSkip({ series, occurrenceDate: "2026-09-23", scope: "all" });
    expect(applyOccurrenceSkip([series], plan, NOW)[0].deletedAt).toBe(NOW);
  });
});
