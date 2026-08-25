import { describe, expect, it } from "vitest";
import { taskActivity } from "./activity";
import type { CheckItem, FocusSession, Task } from "../../types";

const CREATED = "2026-08-01T09:00:00.000Z";
const LATER = "2026-08-20T09:00:00.000Z";
const LATEST = "2026-08-25T09:00:00.000Z";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Write the release notes",
    description: "",
    status: "open",
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
    order: 0,
    createdAt: CREATED,
    updatedAt: CREATED,
    completedAt: "",
    blockedByTaskId: "",
    repeatType: "none",
    repeatInterval: 1,
    repeatDays: [],
    repeatEndDate: "",
    ...overrides,
  } as Task;
}

function session(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: "f1",
    taskId: "t1",
    title: "Write the release notes",
    mode: "focus",
    status: "completed",
    durationMinutes: 25,
    accumulatedSeconds: 1500,
    completed: true,
    startAt: LATER,
    endAt: LATER,
    startedAt: LATER,
    endedAt: LATER,
    pausedAt: "",
    segments: [],
    source: "focus_page",
    projectId: "",
    projectName: "",
    focusNote: "",
    createdAt: LATER,
    updatedAt: LATER,
    ...overrides,
  };
}

const NO_SOURCES = { checkItems: [], focusSessions: [] };

describe("taskActivity (§25.7)", () => {
  it("always has the one event every Task has", () => {
    expect(taskActivity(task(), NO_SOURCES)).toEqual([
      { id: "t1:created", kind: "created", at: CREATED },
    ]);
  });

  it("reads the terminal timestamps the Task carries", () => {
    const finished = task({ completedAt: LATER, wontDoAt: LATEST, deletedAt: LATEST, pinnedAt: LATER });
    const kinds = taskActivity(finished, NO_SOURCES).map((entry) => entry.kind);

    expect(kinds).toContain("completed");
    expect(kinds).toContain("wontDo");
    expect(kinds).toContain("trashed");
    expect(kinds).toContain("pinned");
  });

  it("puts the newest first", () => {
    const finished = task({ completedAt: LATEST, pinnedAt: LATER });
    expect(taskActivity(finished, NO_SOURCES).map((entry) => entry.kind)).toEqual([
      "completed",
      "pinned",
      "created",
    ]);
  });

  it("records each focus session with the minutes actually spent", () => {
    const entries = taskActivity(task(), {
      checkItems: [],
      // 20 minutes spent on a session that was set to 25.
      focusSessions: [session({ accumulatedSeconds: 1200 })],
    });
    expect(entries[0]).toEqual({ id: "f1:focus", kind: "focus", at: LATER, detail: "20" });
  });

  it("dates a session by when it began, not by the last resume", () => {
    // `startAt` moves on every resume; `startedAt` does not. Reading the wrong
    // one makes a session paused over lunch claim to have begun after it.
    const paused = session({ startedAt: LATER, startAt: LATEST });
    expect(taskActivity(task(), { checkItems: [], focusSessions: [paused] })[0].at).toBe(LATER);
  });

  it("ignores sessions and lines belonging to another Task", () => {
    const other: CheckItem = {
      id: "c9", taskId: "t2", text: "Someone else's line", checked: true,
      sortKey: 1, completedAt: LATEST, createdAt: CREATED, updatedAt: LATEST,
    };
    const entries = taskActivity(task(), {
      checkItems: [other],
      focusSessions: [session({ id: "f9", taskId: "t2" })],
    });
    expect(entries.map((entry) => entry.kind)).toEqual(["created"]);
  });

  it("records a ticked checklist line by its text, and skips the unticked ones", () => {
    const items: CheckItem[] = [
      { id: "c1", taskId: "t1", text: "Draft it", checked: true, sortKey: 1, completedAt: LATER, createdAt: CREATED, updatedAt: LATER },
      { id: "c2", taskId: "t1", text: "Still to do", checked: false, sortKey: 2, completedAt: "", createdAt: CREATED, updatedAt: CREATED },
    ];
    const entries = taskActivity(task(), { checkItems: items, focusSessions: [] });
    expect(entries.filter((entry) => entry.kind === "checkItem")).toEqual([
      { id: "c1:done", kind: "checkItem", at: LATER, detail: "Draft it" },
    ]);
  });

  it("adds Edited only when it says something the other entries do not", () => {
    // Completing a Task stamps `updatedAt` as well, and a history whose top
    // two rows are "Completed" and "Edited" one second apart is a history
    // repeating itself.
    const finished = task({ completedAt: LATEST, updatedAt: LATEST });
    expect(taskActivity(finished, NO_SOURCES).map((entry) => entry.kind)).toEqual([
      "completed",
      "created",
    ]);

    const edited = task({ completedAt: LATER, updatedAt: LATEST });
    expect(taskActivity(edited, NO_SOURCES)[0].kind).toBe("updated");
  });

  it("gives entries ids that survive a re-render", () => {
    const busy = task({ completedAt: LATER, pinnedAt: LATEST });
    const ids = taskActivity(busy, NO_SOURCES).map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(taskActivity(busy, NO_SOURCES).map((entry) => entry.id)).toEqual(ids);
  });
});
