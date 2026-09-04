import { describe, expect, it } from "vitest";
import type { CheckItem, FocusSession, Task } from "../../types";
import { accountActivity } from "./accountActivity";

function task(patch: Partial<Task> & { id: string }): Task {
  return {
    title: patch.id,
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
    blockedByTaskId: "",
    repeatType: "none",
    order: 0,
    completedAt: "",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    deletedAt: "",
    ...patch,
  } as Task;
}

describe("the account's activity feed", () => {
  it("merges every task's history, newest first", () => {
    const entries = accountActivity({
      tasks: [
        task({ id: "a", createdAt: "2026-09-01T09:00:00.000Z" }),
        task({ id: "b", createdAt: "2026-09-01T10:00:00.000Z", completedAt: "2026-09-02T08:00:00.000Z" }),
      ],
      checkItems: [],
      focusSessions: [],
    });
    expect(entries.map((entry) => [entry.taskId, entry.kind])).toEqual([
      ["b", "completed"],
      ["b", "created"],
      ["a", "created"],
    ]);
  });

  it("carries the task's title, so a row can say what it is about", () => {
    const entries = accountActivity({
      tasks: [task({ id: "a", title: "Water the plants" })],
      checkItems: [],
      focusSessions: [],
    });
    expect(entries[0].taskTitle).toBe("Water the plants");
  });

  it("files check items and focus sessions under the task they belong to", () => {
    const entries = accountActivity({
      tasks: [task({ id: "a" }), task({ id: "b" })],
      checkItems: [
        { id: "c1", taskId: "b", text: "step one", completedAt: "2026-09-03T00:00:00.000Z" } as CheckItem,
      ],
      focusSessions: [
        {
          id: "f1",
          taskId: "a",
          startedAt: "2026-09-04T00:00:00.000Z",
          accumulatedSeconds: 1500,
        } as FocusSession,
      ],
    });
    const focus = entries.find((entry) => entry.kind === "focus");
    const check = entries.find((entry) => entry.kind === "checkItem");
    expect(focus?.taskId).toBe("a");
    expect(check?.taskId).toBe("b");
    // A session's row says how long it actually ran, not how long it was set to.
    expect(focus?.detail).toBe("25");
  });

  it("keeps only the newest hundred by default", () => {
    const tasks = Array.from({ length: 150 }, (_, index) =>
      task({ id: `t-${index}`, createdAt: new Date(Date.UTC(2026, 8, 1, 0, index)).toISOString() }),
    );
    const entries = accountActivity({ tasks, checkItems: [], focusSessions: [] });
    expect(entries).toHaveLength(100);
    expect(entries[0].taskId).toBe("t-149");
  });

  it("answers an empty account with an empty feed", () => {
    expect(accountActivity({ tasks: [], checkItems: [], focusSessions: [] })).toEqual([]);
  });
});
