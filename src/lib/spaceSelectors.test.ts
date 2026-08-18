// Membership is the Project behind the Space, and nothing else
// (SPACES_REDESIGN_II §0.3.7, SPACES_CLICKUP_REDESIGN D6).
//
// These tests exist because the second rule that used to live here — a task
// claiming a Space by carrying a `space:<id>` tag — was removed, and a removed
// rule is only removed for as long as nothing puts it back. The incoming Space
// entity makes `space:<id>` read like a reference to a real record, so the
// tag case is asserted explicitly rather than left to be re-derived.
import { describe, expect, it } from "vitest";
import type { FocusSession, Task } from "../types";
import { getSpaceSessions, getSpaceTasks } from "./spaceSelectors";

const NOW = "2026-08-17T00:00:00.000Z";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Task",
    description: "",
    status: "todo",
    priority: "none",
    dueDate: "",
    startDate: "",
    startTime: "",
    endTime: "",
    projectId: "project-1",
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
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: "",
    archivedAt: "",
    blockedByTaskId: "",
    repeatType: "none",
    repeatInterval: 1,
    repeatDays: [],
    repeatEndDate: "",
    ...overrides,
  };
}

function session(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: "session-1",
    taskId: "task-1",
    title: "Focus",
    mode: "focus",
    status: "completed",
    durationMinutes: 25,
    accumulatedSeconds: 600,
    completed: true,
    startAt: NOW,
    endAt: NOW,
    startedAt: NOW,
    endedAt: NOW,
    pausedAt: "",
    segments: [],
    source: "focus_page",
    projectId: "project-1",
    projectName: "",
    focusNote: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("getSpaceTasks", () => {
  it("collects the tasks of the Project behind the space", () => {
    const mine = task({ id: "a", projectId: "project-1" });
    const theirs = task({ id: "b", projectId: "project-2" });
    expect(getSpaceTasks([mine, theirs], "project-1")).toEqual([mine]);
  });

  it("does NOT let a legacy `space:<id>` tag claim a task", () => {
    const tagged = task({ id: "a", projectId: "project-2", tags: ["space:project-1"] });
    expect(getSpaceTasks([tagged], "project-1")).toEqual([]);
  });

  it("keeps a task whose legacy tag agrees with its project", () => {
    // The inert string is not stripped from the record, so it must not change
    // the answer in either direction.
    const tagged = task({ id: "a", projectId: "project-1", tags: ["space:project-1"] });
    expect(getSpaceTasks([tagged], "project-1")).toEqual([tagged]);
  });

  it("returns nothing for a space with no project rather than falling back", () => {
    const tagged = task({ id: "a", projectId: "", tags: ["space:project-1"] });
    expect(getSpaceTasks([tagged], "")).toEqual([]);
  });

  it("excludes archived and deleted tasks", () => {
    const archived = task({ id: "a", status: "archived" });
    const deleted = task({ id: "b", deletedAt: NOW });
    const open = task({ id: "c" });
    expect(getSpaceTasks([archived, deleted, open], "project-1")).toEqual([open]);
  });
});

describe("getSpaceSessions", () => {
  it("collects sessions by task and by project", () => {
    const byTask = session({ id: "s1", taskId: "task-1", projectId: "" });
    const byProject = session({ id: "s2", taskId: "other", projectId: "project-1" });
    const unrelated = session({ id: "s3", taskId: "other", projectId: "project-2" });
    const tasks = [task({ id: "task-1" })];
    const found = getSpaceSessions([byTask, byProject, unrelated], tasks, "project-1");
    expect(found.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("falls back to task membership when there is no project", () => {
    const byTask = session({ id: "s1", taskId: "task-1", projectId: "project-9" });
    const found = getSpaceSessions([byTask], [task({ id: "task-1" })], "");
    expect(found.map((s) => s.id)).toEqual(["s1"]);
  });
});
