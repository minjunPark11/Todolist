import { describe, expect, it } from "vitest";
import { spanDays, spanForItem, spanIntersects } from "./span";

const dates = (startDate = "", scheduledDate = "", dueDate = "") => ({ startDate, scheduledDate, dueDate });

describe("spanForItem", () => {
  it("spans a stored start to its deadline", () => {
    expect(spanForItem(dates("2026-08-10", "", "2026-08-14"))).toEqual({
      start: "2026-08-10",
      end: "2026-08-14",
      inferredStart: false,
    });
  });

  it("gives a deadline-only task a one-day bar rather than no bar", () => {
    // Someone who only sets deadlines still has a timeline.
    const span = spanForItem(dates("", "", "2026-08-14"))!;
    expect(span).toMatchObject({ start: "2026-08-14", end: "2026-08-14" });
    expect(spanDays(span)).toBe(1);
  });

  it("marks a start it had to infer, so the bar can be drawn as a guess", () => {
    expect(spanForItem(dates("", "2026-08-11", "2026-08-13"))?.inferredStart).toBe(true);
    expect(spanForItem(dates("2026-08-11", "", "2026-08-13"))?.inferredStart).toBe(false);
  });

  it("covers a planned day that falls outside start..due", () => {
    // The calendar block is real work; a bar that excluded it would hide it.
    expect(spanForItem(dates("2026-08-11", "2026-08-20", "2026-08-13"))).toMatchObject({
      start: "2026-08-11",
      end: "2026-08-20",
    });
  });

  it("never draws a backwards bar when the dates contradict each other", () => {
    // Due before it starts is user error; the bar still has to render.
    const span = spanForItem(dates("2026-08-14", "", "2026-08-10"))!;
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
    expect(spanDays({ start: "2026-08-10", end: "2026-08-14", inferredStart: false })).toBe(5);
    expect(spanDays({ start: "2026-08-10", end: "2026-08-10", inferredStart: false })).toBe(1);
  });

  it("counts across a month boundary and a leap day", () => {
    expect(spanDays({ start: "2026-08-30", end: "2026-09-02", inferredStart: false })).toBe(4);
    expect(spanDays({ start: "2028-02-28", end: "2028-03-01", inferredStart: false })).toBe(3);
  });
});

describe("spanIntersects", () => {
  const span = { start: "2026-08-10", end: "2026-08-14", inferredStart: false };

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
