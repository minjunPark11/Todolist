import { describe, expect, it } from "vitest";
import { scheduleSpan } from "../schedule/scheduleQueries";
import { scheduleFromTask, scheduleToTaskPatch } from "../schedule/taskSchedule";
import { spanDays, spanForItem, spanIntersects } from "./span";

const dates = (startDate = "", dueDate = "") => ({ startDate, dueDate });

/** A record as it was stored before the work day folded away, for the suite below. */
const legacy = (startDate = "", scheduledDate = "", dueDate = "") => ({ startDate, scheduledDate, dueDate });

describe("spanForItem", () => {
  it("spans a stored start to its deadline", () => {
    expect(spanForItem(dates("2026-08-10", "2026-08-14"))).toEqual({
      start: "2026-08-10",
      end: "2026-08-14",
      inferredStart: false, startTime: "", endTime: "",
    });
  });

  it("gives a deadline-only task a one-day bar rather than no bar", () => {
    // Someone who only sets deadlines still has a timeline.
    const span = spanForItem(dates("", "2026-08-14"))!;
    expect(span).toMatchObject({ start: "2026-08-14", end: "2026-08-14" });
    expect(spanDays(span)).toBe(1);
  });

  it("marks a start it had to infer, so the bar can be drawn as a guess", () => {
    expect(spanForItem(dates("", "2026-08-13"))?.inferredStart).toBe(true);
    expect(spanForItem(dates("2026-08-11", "2026-08-13"))?.inferredStart).toBe(false);
  });

  it("never draws a backwards bar when the dates contradict each other", () => {
    // Due before it starts is user error; the bar still has to render.
    const span = spanForItem(dates("2026-08-14", "2026-08-10"))!;
    expect(span.start <= span.end).toBe(true);
    expect(span).toMatchObject({ start: "2026-08-10", end: "2026-08-14" });
    // The stored start is not the span's start, so it counts as inferred.
    expect(span.inferredStart).toBe(true);
  });

  it("keeps a fully undated item off the timeline", () => {
    expect(spanForItem(dates())).toBeNull();
  });
});

describe("spanDays", () => {
  it("counts both ends", () => {
    expect(spanDays({ start: "2026-08-10", end: "2026-08-14", inferredStart: false, startTime: "", endTime: "" })).toBe(5);
    expect(spanDays({ start: "2026-08-10", end: "2026-08-10", inferredStart: false, startTime: "", endTime: "" })).toBe(1);
  });

  it("counts across a month boundary and a leap day", () => {
    expect(spanDays({ start: "2026-08-30", end: "2026-09-02", inferredStart: false, startTime: "", endTime: "" })).toBe(4);
    expect(spanDays({ start: "2028-02-28", end: "2028-03-01", inferredStart: false, startTime: "", endTime: "" })).toBe(3);
  });
});

describe("spanIntersects", () => {
  const span = { start: "2026-08-10", end: "2026-08-14", inferredStart: false, startTime: "", endTime: "" };

  it("includes a bar that merely touches the window edge", () => {
    expect(spanIntersects(span, "2026-08-14", "2026-08-20")).toBe(true);
    expect(spanIntersects(span, "2026-08-01", "2026-08-10")).toBe(true);
  });

  it("includes a bar that spans straight through the window", () => {
    expect(spanIntersects(span, "2026-08-11", "2026-08-12")).toBe(true);
  });

  it("excludes a bar that clears the window entirely", () => {
    expect(spanIntersects(span, "2026-08-15", "2026-08-20")).toBe(false);
    expect(spanIntersects(span, "2026-08-01", "2026-08-09")).toBe(false);
  });
});

// The bar must not move when the three date fields become two.
//
// SCHEDULE_EDITOR_PHASE0_AUDIT.md consolidates `scheduledDate` away (§6, 1-d),
// and this is the reader that would notice first: it takes min/max over all
// three fields, so losing one could shrink a bar and hide a planned day. The
// `widened` rule exists precisely to stop that — the range stretches to cover
// the work day instead of dropping it.
//
// So `span.ts` needs no migration of its own. It answers the same start and
// end before and after the rewrite, which is what lets that rewrite happen
// without a coordinated change here. This pins that; if it ever fails, rule
// 1-d has started losing dates and the audit is wrong.
describe("consolidation invariance (audit §7.1)", () => {
  const records = [
    legacy("", "", "2026-08-14"),
    legacy("2026-08-10", "", "2026-08-14"),
    legacy("", "2026-08-12", ""),
    legacy("", "2026-08-12", "2026-08-12"),
    legacy("", "2026-08-12", "2026-08-14"),
    legacy("2026-08-11", "2026-08-13", "2026-08-20"),
    legacy("2026-08-11", "2026-08-09", "2026-08-20"),
    legacy("2026-08-11", "2026-08-25", "2026-08-20"),
    legacy("2026-08-14", "", "2026-08-10"),
    legacy("2026-08-10", "2026-08-12", ""),
  ];

  /**
   * The bar the old three-field reader drew: min/max over every date set.
   *
   * Spelled out here because `spanForItem` no longer knows the third field
   * (Phase 11). Without it this suite would compare the new answer against
   * itself and pin nothing — and this is the one place that still checks the
   * rewrite against what users actually had on disk.
   */
  function legacySpan(record: { startDate: string; scheduledDate: string; dueDate: string }) {
    const set = [record.startDate, record.scheduledDate, record.dueDate].filter(Boolean);
    if (set.length === 0) return null;
    return { start: set.reduce((a, b) => (a < b ? a : b)), end: set.reduce((a, b) => (a > b ? a : b)) };
  }

  it.each(records)("covers the same days once consolidated (%o)", (record) => {
    const before = legacySpan(record);
    const after = scheduleSpan(scheduleFromTask(record));
    expect(after).toEqual(before);
  });

  // The same check from the other side: once the legacy field is gone, the
  // remaining two must still describe the bar the user sees today.
  it.each(records)("covers the same days after the field is dropped (%o)", (record) => {
    const before = legacySpan(record);
    const rewritten = scheduleToTaskPatch(scheduleFromTask(record));
    expect(rewritten.scheduledDate).toBe("");
    const after = spanForItem(rewritten);
    expect(after === null ? null : { start: after.start, end: after.end }).toEqual(before);
  });
});
