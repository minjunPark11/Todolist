import { describe, expect, it } from "vitest";
import { repeatPresetFromTask, repeatPresetToFields } from "./recurrence";

describe("repeatPresetFromTask", () => {
  it("reads the plain kinds straight through", () => {
    expect(repeatPresetFromTask({ repeatType: "none" })).toBe("none");
    expect(repeatPresetFromTask({ repeatType: "daily" })).toBe("daily");
    expect(repeatPresetFromTask({ repeatType: "monthly" })).toBe("monthly");
    expect(repeatPresetFromTask({ repeatType: "yearly" })).toBe("yearly");
  });

  it("recognises Monday–Friday as 평일", () => {
    expect(repeatPresetFromTask({ repeatType: "weekly", repeatDays: [1, 2, 3, 4, 5] })).toBe("weekdays");
    // Order and duplicates are storage noise, not a different rule.
    expect(repeatPresetFromTask({ repeatType: "weekly", repeatDays: [5, 1, 3, 2, 4] })).toBe("weekdays");
  });

  it("reads any other weekly set as 매주", () => {
    expect(repeatPresetFromTask({ repeatType: "weekly", repeatDays: [] })).toBe("weekly");
    expect(repeatPresetFromTask({ repeatType: "weekly", repeatDays: [1, 4] })).toBe("weekly");
    expect(repeatPresetFromTask({ repeatType: "weekly", repeatDays: [0, 1, 2, 3, 4, 5, 6] })).toBe("weekly");
  });

  // Rounding an interval down beats showing 없음 for a task that visibly
  // repeats.
  it("shows an unusual interval as its base preset", () => {
    expect(repeatPresetFromTask({ repeatType: "weekly", repeatInterval: 2 })).toBe("weekly");
  });

  it("treats an unknown value as no repeat", () => {
    expect(repeatPresetFromTask({ repeatType: "fortnightly" })).toBe("none");
    expect(repeatPresetFromTask({})).toBe("none");
  });
});

describe("repeatPresetToFields", () => {
  it("expands 평일 to the five weekdays", () => {
    expect(repeatPresetToFields("weekdays", "2026-08-27")).toEqual({
      repeatType: "weekly",
      repeatInterval: 1,
      repeatDays: [1, 2, 3, 4, 5],
    });
  });

  // 2026-08-27 is a Thursday, and "every week" has to mean the day the task
  // already falls on or choosing it would move the task.
  it("anchors 매주 to the schedule's own weekday", () => {
    expect(repeatPresetToFields("weekly", "2026-08-27").repeatDays).toEqual([4]);
  });

  it("leaves 매주 unanchored when there is no date yet", () => {
    expect(repeatPresetToFields("weekly", null).repeatDays).toEqual([]);
  });

  it("round-trips every preset", () => {
    for (const preset of ["none", "daily", "weekdays", "weekly", "monthly", "yearly"] as const) {
      expect(repeatPresetFromTask(repeatPresetToFields(preset, "2026-08-27"))).toBe(preset);
    }
  });
});
