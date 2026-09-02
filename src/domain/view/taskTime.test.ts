// What `Show Date by: Task Time` writes (SCOPE_VIEW_OPTIONS_DESIGN.md §13.7).
//
// The three the reference's own screen shows are pinned first, by name, so a
// later change to the rule has to break them. The rest is inference and says
// so.
import { describe, expect, it } from "vitest";
import { taskTimeLabel } from "./taskTime";

// A Wednesday, as in the capture: `Wed, Today's Habit`.
const WED = "2026-09-02";

describe("Task Time", () => {
  // [관찰] The three rows in the reference's `Next 7 Days`.
  it("says Today for today", () => {
    expect(taskTimeLabel(WED, WED)).toEqual({ kind: "word", key: "common.today" });
  });

  it("names the weekday of a day in the following week", () => {
    // Mon Sep 7, five days out — the capture reads `Next Mon`.
    expect(taskTimeLabel("2026-09-07", WED)).toEqual({
      kind: "weekday",
      date: "2026-09-07",
      nextWeek: true,
    });
  });

  it("falls back to the date for work that is late", () => {
    // 13 days behind — the capture reads `Aug 20`, not `Last Thu`.
    expect(taskTimeLabel("2026-08-20", WED)).toEqual({ kind: "date", date: "2026-08-20" });
  });

  // [추론] from here down.
  it("says Tomorrow for tomorrow", () => {
    expect(taskTimeLabel("2026-09-03", WED)).toEqual({ kind: "word", key: "common.tomorrow" });
  });

  // The difference between `Fri` and `Next Fri` is which week it falls in, not
  // how many days away it is. Friday is two days out and in this same week.
  it("names a weekday in this week without a Next", () => {
    expect(taskTimeLabel("2026-09-04", WED)).toEqual({
      kind: "weekday",
      date: "2026-09-04",
      nextWeek: false,
    });
  });

  // The same two days out, read by an account whose week starts on Monday and
  // one whose week starts on Sunday, land in the same week either way — this
  // is the day where they disagree.
  it("moves the boundary with the account's week start", () => {
    // Sun Sep 6, four days out. A Sunday-start week has already turned over;
    // a Monday-start week has not.
    expect(taskTimeLabel("2026-09-06", WED, "sunday")).toMatchObject({ nextWeek: true });
    expect(taskTimeLabel("2026-09-06", WED, "monday")).toMatchObject({ nextWeek: false });
  });

  // Seven days out is a week away and has no name worth the reader working out
  // which `Wed` was meant.
  it("stops naming weekdays at a week out", () => {
    expect(taskTimeLabel("2026-09-09", WED)).toEqual({ kind: "date", date: "2026-09-09" });
  });

  it("has nothing to say about a task with no deadline", () => {
    expect(taskTimeLabel("", WED)).toBeNull();
  });
});
