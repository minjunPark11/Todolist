import { describe, expect, it } from "vitest";
import type { Task, TaskPriority } from "../../types";
import { isPriority, NO_PRIORITY, PRIORITY_LEVELS, priorityChange } from "./priority";

function task(priority: TaskPriority): Task {
  return { id: "t1", title: "Ship it", priority } as Task;
}

describe("PRIORITY_LEVELS (§8.4, §8.5)", () => {
  it("holds the four levels, None first", () => {
    expect(PRIORITY_LEVELS).toEqual(["none", "low", "medium", "high"]);
  });

  it("starts at the canonical empty value (§8.3, §8.9)", () => {
    expect(PRIORITY_LEVELS[0]).toBe(NO_PRIORITY);
  });
});

describe("priorityChange (§8.7, §8.8)", () => {
  it("describes the change, with the old value to put back", () => {
    const change = priorityChange(task("none"), "high");
    expect(change?.patch).toEqual({ priority: "high" });
    expect(change?.undo).toEqual({ priority: "none" });
  });

  // §8.8. Without this the picker writes a record that changes nothing, and
  // then offers an Undo for it.
  it("refuses to make a mutation out of re-selecting the same level", () => {
    expect(priorityChange(task("high"), "high")).toBeNull();
  });

  // §8.9: clearing is choosing "none", not writing an absent value.
  it("clears by moving to none rather than to nothing", () => {
    expect(priorityChange(task("high"), "none")?.patch).toEqual({ priority: "none" });
  });
});

describe("isPriority (§8.39)", () => {
  it("accepts the four levels", () => {
    for (const level of PRIORITY_LEVELS) expect(isPriority(level)).toBe(true);
  });

  it("rejects anything else, so a bad value is not drawn as a level", () => {
    expect(isPriority("urgent")).toBe(false);
    expect(isPriority(null)).toBe(false);
    expect(isPriority(1)).toBe(false);
    expect(isPriority("")).toBe(false);
  });
});
