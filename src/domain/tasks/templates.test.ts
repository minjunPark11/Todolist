import { describe, expect, it } from "vitest";
import { sanitizeTaskTemplate } from "./templates";
import type { CheckItem, Task, TaskTemplate } from "../../types";

const NOW = "2026-08-25T10:00:00.000Z";
const BEFORE = "2026-08-01T00:00:00.000Z";

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Weekly report",
    description: "The usual sections",
    status: "open",
    priority: "high",
    dueDate: "2026-08-26",
    startDate: "",
    startTime: "09:00",
    endTime: "",
    projectId: "p1",
    categoryId: "",
    parentTaskId: "",
    listId: "l1",
    tags: ["work"],
    notes: "",
    estimatedMinutes: 0,
    actualSeconds: 4200,
    activeSessionId: "focus-1",
    lastFocusedAt: BEFORE,
    isSomeday: false,
    waitingReason: "",
    waitingFollowUpDate: "",
    order: 1000,
    createdAt: BEFORE,
    updatedAt: BEFORE,
    completedAt: "",
    blockedByTaskId: "",
    repeatType: "none",
    repeatInterval: 1,
    repeatDays: [],
    repeatEndDate: "",
    ...over,
  } as Task;
}

function counter() {
  const seen = new Map<string, number>();
  return (prefix: string) => {
    const next = (seen.get(prefix) ?? 0) + 1;
    seen.set(prefix, next);
    return `${prefix}-${next}`;
  };
}

const TARGET = { listId: "l9", projectId: "p9", status: "open" as const };

/* The `templateFromTask` and `buildFromTemplate` suites stood here. Both
   functions are gone with the feature (TASK_MENU_TRIM_DESIGN.md D2); what a
   stored account may still hold is what is tested below. */

describe("sanitizeTaskTemplate", () => {
  it("drops an item with no title, which could not be made anyway (§9.21)", () => {
    const stored = {
      id: "tpl-1",
      name: "Weekly report",
      items: [{ title: "Weekly report" }, { title: "   " }],
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(sanitizeTaskTemplate(stored)?.items).toHaveLength(1);
  });

  it("drops a template left with nothing to make", () => {
    expect(sanitizeTaskTemplate({ id: "tpl-1", items: [] })).toBeNull();
    expect(sanitizeTaskTemplate({ id: "", items: [{ title: "x" }] })).toBeNull();
  });

  it("falls back to the first item's title when the name is gone", () => {
    expect(sanitizeTaskTemplate({ id: "tpl-1", items: [{ title: "Weekly report" }] })?.name).toBe(
      "Weekly report",
    );
  });

  it("repairs a value this build does not know", () => {
    const repaired = sanitizeTaskTemplate({
      id: "tpl-1",
      items: [{ title: "x", priority: "urgent", tags: ["a", 3], parentIndex: -4 }],
    })!;
    expect(repaired.items[0].priority).toBe("none");
    expect(repaired.items[0].tags).toEqual(["a"]);
    expect(repaired.items[0].parentIndex).toBe(-1);
  });
});
