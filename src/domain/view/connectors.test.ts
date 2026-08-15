import { describe, expect, it } from "vitest";
import type { List, Project, Task } from "../../types";
import { makeDefaultList } from "../spaces/hierarchy";
import { defaultListIdFor } from "../spaces/membership";
import { projectItems } from "./item";
import { timelineLinks } from "./connectors";

const TODAY = "2026-08-15";
const NOW = `${TODAY}T00:00:00.000Z`;

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Task",
    description: "",
    status: "todo",
    priority: "none",
    dueDate: "",
    startDate: "",
    scheduledDate: "",
    startTime: "",
    endTime: "",
    projectId: "space-1",
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

const projects: Project[] = [
  { id: "space-1", name: "Career", description: "", color: "#0066cc", createdAt: NOW, updatedAt: NOW },
];
const lists: List[] = [makeDefaultList(defaultListIdFor("space-1"), "space-1", NOW)];

const itemsFor = (tasks: Task[]) =>
  projectItems({ tasks, paths: [], projects, lists, today: TODAY, sources: ["task"] });

// A clean chain: "first" runs 10th-12th, "second" waits and runs 14th-16th.
const first = task({ id: "first", startDate: "2026-08-10", dueDate: "2026-08-12" });
const second = task({ id: "second", startDate: "2026-08-14", dueDate: "2026-08-16", blockedByTaskId: "first" });

describe("timelineLinks", () => {
  it("connects a task to its blocker when both are on screen", () => {
    const tasks = [first, second];
    const { links, badges } = timelineLinks(itemsFor(tasks), tasks);
    expect(links).toEqual([{ fromKey: "task:first", toKey: "task:second", conflict: false }]);
    expect(badges).toEqual([]);
  });

  it("flags a dependent that starts before its blocker finishes", () => {
    // The plan contradicts itself, and this is the one view that can show it.
    const overlapping = { ...second, startDate: "2026-08-11" };
    const tasks = [first, overlapping];
    expect(timelineLinks(itemsFor(tasks), tasks).links[0].conflict).toBe(true);
  });

  it("does not call a finished blocker a conflict", () => {
    // Work already done cannot be "not done yet" when the next thing starts.
    const done = { ...first, status: "done" as const, completedAt: NOW };
    const overlapping = { ...second, startDate: "2026-08-11" };
    const tasks = [done, overlapping];
    expect(timelineLinks(itemsFor(tasks), tasks).links[0].conflict).toBe(false);
  });

  it("badges the bar that stayed when its blocker is off-window", () => {
    // A line running off the edge cannot say where it goes (D7).
    const tasks = [first, second];
    const onlyDependent = itemsFor([second]);
    const { links, badges } = timelineLinks(onlyDependent, tasks);
    expect(links).toEqual([]);
    expect(badges).toEqual([{ itemKey: "task:second", kind: "blocker" }]);
  });

  it("badges a bar whose dependent is off-window", () => {
    const tasks = [first, second];
    const onlyBlocker = itemsFor([first]);
    const { links, badges } = timelineLinks(onlyBlocker, tasks);
    expect(links).toEqual([]);
    expect(badges).toEqual([{ itemKey: "task:first", kind: "dependent" }]);
  });

  it("reports one badge for a blocker many off-window tasks wait on", () => {
    const others = [
      task({ id: "b", blockedByTaskId: "first" }),
      task({ id: "c", blockedByTaskId: "first" }),
    ];
    const tasks = [first, ...others];
    const badges = timelineLinks(itemsFor([first]), tasks).badges;
    expect(badges).toEqual([{ itemKey: "task:first", kind: "dependent" }]);
  });

  it("ignores a dangling blocker, the same way isTaskBlocked does", () => {
    const orphan = task({ id: "orphan", blockedByTaskId: "gone", dueDate: "2026-08-14" });
    const tasks = [orphan];
    expect(timelineLinks(itemsFor(tasks), tasks)).toEqual({ links: [], badges: [] });
  });

  it("ignores a blocker that was deleted on another device", () => {
    const tombstoned = { ...first, deletedAt: NOW };
    const tasks = [tombstoned, second];
    expect(timelineLinks(itemsFor(tasks), tasks)).toEqual({ links: [], badges: [] });
  });

  it("draws nothing when no task names a blocker", () => {
    const tasks = [first, { ...second, blockedByTaskId: "" }];
    expect(timelineLinks(itemsFor(tasks), tasks)).toEqual({ links: [], badges: [] });
  });
});
