// Characterization tests, written BEFORE the calendar's task half moves onto
// the view engine (CLICKUP_IMPORT_DESIGN §4.1). 333 lines and five sources had
// no test at all, so "the refactor changed nothing" was not a claim anyone
// could check. These pin the answers first; the move has to leave them alone.
import { describe, expect, it } from "vitest";
import type { ExternalCalendar, ExternalCalendarEvent, FocusSession, Project, Task } from "../types";
import { buildCalendarItems, defaultCalendarLayers, splitFocusSegmentByDay } from "./calendarItems";

const NOW = "2026-08-15T00:00:00.000Z";

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

const project: Project = {
  id: "p1",
  name: "Research",
  description: "",
  color: "#34c759",
  createdAt: NOW,
  updatedAt: NOW,
};

function build(input: Partial<Parameters<typeof buildCalendarItems>[0]> = {}) {
  return buildCalendarItems({
    tasks: [],
    projects: [],
    layers: defaultCalendarLayers,
    projectFilter: "all",
    ...input,
  });
}

const keys = (items: { key: string }[]) => items.map((item) => item.key).sort();

describe("task blocks and deadlines", () => {
  it("makes a work block from scheduledDate and a marker from dueDate", () => {
    // D1/D2: two chips from one task, because they answer different questions.
    const items = build({ tasks: [task({ scheduledDate: "2026-08-17", dueDate: "2026-08-20" })] });
    expect(keys(items)).toEqual(["deadline:task-1", "task-block:task-1"]);
    const block = items.find((item) => item.layer === "task");
    const marker = items.find((item) => item.layer === "deadline");
    expect(block?.date).toBe("2026-08-17");
    expect(marker?.date).toBe("2026-08-20");
    expect(marker?.allDay).toBe(true);
    expect(marker?.draggable).toBe(false);
  });

  it("keeps startTime with the work block, never the deadline", () => {
    const items = build({
      tasks: [task({ scheduledDate: "2026-08-17", startTime: "09:00", endTime: "10:30", dueDate: "2026-08-20" })],
    });
    const block = items.find((item) => item.layer === "task");
    expect([block?.startTime, block?.endTime, block?.allDay]).toEqual(["09:00", "10:30", false]);
    expect(items.find((item) => item.layer === "deadline")?.startTime).toBeUndefined();
  });

  it("treats a block with no start time as all-day", () => {
    const items = build({ tasks: [task({ scheduledDate: "2026-08-17" })] });
    expect(items[0].allDay).toBe(true);
  });

  it("drops archived and deleted tasks entirely", () => {
    expect(build({ tasks: [task({ status: "archived", scheduledDate: "2026-08-17" })] })).toEqual([]);
    expect(build({ tasks: [task({ deletedAt: NOW, scheduledDate: "2026-08-17" })] })).toEqual([]);
  });

  it("keeps a completed task's scheduled block but not its deadline", () => {
    // The plan stays visible as a completed schedule; the deadline is spent.
    const items = build({
      tasks: [task({ status: "done", scheduledDate: "2026-08-17", dueDate: "2026-08-20" })],
    });
    expect(keys(items)).toEqual(["task-block:task-1"]);
    expect(items[0].draggable).toBe(false);
  });

  it("hides a completed unscheduled task unless the Completed layer is on", () => {
    const done = task({ status: "done", dueDate: "2026-08-20" });
    expect(build({ tasks: [done] })).toEqual([]);
    const shown = build({ tasks: [done], layers: { ...defaultCalendarLayers, completed: true } });
    expect(keys(shown)).toEqual(["deadline:task-1"]);
  });

  it("obeys each layer toggle on its own", () => {
    const t = task({ scheduledDate: "2026-08-17", dueDate: "2026-08-20" });
    expect(keys(build({ tasks: [t], layers: { ...defaultCalendarLayers, task: false } }))).toEqual([
      "deadline:task-1",
    ]);
    expect(keys(build({ tasks: [t], layers: { ...defaultCalendarLayers, deadline: false } }))).toEqual([
      "task-block:task-1",
    ]);
  });

  it("marks a repeating task on both chips", () => {
    const items = build({
      tasks: [task({ scheduledDate: "2026-08-17", dueDate: "2026-08-20", repeatType: "weekly" })],
    });
    expect(items.every((item) => item.repeating)).toBe(true);
  });

  it("takes the project colour when there is no category map", () => {
    const items = build({ tasks: [task({ projectId: "p1", scheduledDate: "2026-08-17" })], projects: [project] });
    expect(items[0].color).toBe("#34c759");
    expect(items[0].categoryId).toBe("");
  });
});

describe("project filter", () => {
  it("hides only what belongs to an excluded project", () => {
    // §9.6: a task with no project is never hidden by the filter.
    const items = build({
      tasks: [task({ id: "a", projectId: "p1", scheduledDate: "2026-08-17" }), task({ id: "b", scheduledDate: "2026-08-17" })],
      projects: [project],
      projectFilter: new Set<string>(),
    });
    expect(items.map((item) => item.sourceId)).toEqual(["b"]);
  });
});

describe("project deadlines", () => {
  it("draws one all-day marker per dated, live project", () => {
    const items = build({ projects: [{ ...project, dueDate: "2026-09-01", status: "active" }] });
    expect(keys(items)).toEqual(["proj:p1"]);
    expect(items[0].sourceType).toBe("project");
    expect(items[0].allDay).toBe(true);
  });

  it("requires an explicit live status, though the type does not", () => {
    // `status` is optional on Project but the guard admits only active/paused,
    // so a project built in memory without one is silently skipped. Stored
    // data never hits this — normalizeProject defaults it to "active" on load
    // — which is why it has gone unnoticed. Pinned as-is rather than changed:
    // this refactor is meant to move the task half, not to decide this.
    expect(build({ projects: [{ ...project, dueDate: "2026-09-01" }] })).toEqual([]);
  });

  it("skips projects that are undated, finished, or switched off", () => {
    expect(build({ projects: [{ ...project, status: "active" }] })).toEqual([]);
    expect(build({ projects: [{ ...project, dueDate: "2026-09-01", status: "completed" }] })).toEqual([]);
    expect(
      build({
        projects: [{ ...project, dueDate: "2026-09-01", status: "active" }],
        layers: { ...defaultCalendarLayers, projectDeadline: false },
      }),
    ).toEqual([]);
  });
});

describe("external events", () => {
  const calendar: ExternalCalendar = {
    id: "cal-1",
    name: "Team",
    icsUrl: "https://example.test/a.ics",
    color: "#af52de",
    visible: true,
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
  function event(overrides: Partial<ExternalCalendarEvent> = {}): ExternalCalendarEvent {
    return {
      id: "ev-1",
      externalCalendarId: "cal-1",
      externalUid: "uid-1",
      title: "Standup",
      start: "2026-08-17T09:00:00.000Z",
      allDay: false,
      readOnly: true,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  it("carries the calendar's identity and stays read-only", () => {
    const items = build({ externalCalendars: [calendar], externalCalendarEvents: [event()] });
    expect(items).toHaveLength(1);
    expect(items[0].readOnly).toBe(true);
    expect(items[0].draggable).toBe(false);
    expect(items[0].externalCalendarName).toBe("Team");
    expect(items[0].color).toBe("#af52de");
  });

  it("spreads an all-day range over every day it covers", () => {
    // DTEND is exclusive (RFC 5545), so a 17->20 event covers three days.
    const items = build({
      externalCalendars: [calendar],
      externalCalendarEvents: [
        event({ allDay: true, start: "2026-08-17", end: "2026-08-20" }),
      ],
    });
    expect(items.map((item) => item.date)).toEqual(["2026-08-17", "2026-08-18", "2026-08-19"]);
  });

  it("ignores events from a hidden or disabled calendar", () => {
    for (const off of [{ visible: false }, { enabled: false }]) {
      expect(build({ externalCalendars: [{ ...calendar, ...off }], externalCalendarEvents: [event()] })).toEqual([]);
    }
    expect(build({ externalCalendars: [], externalCalendarEvents: [event()] })).toEqual([]);
  });
});

describe("actual focus time", () => {
  function session(overrides: Partial<FocusSession> = {}): FocusSession {
    return {
      id: "fs-1",
      taskId: "task-1",
      title: "Deep work",
      mode: "focus",
      status: "completed",
      durationMinutes: 25,
      accumulatedSeconds: 1500,
      completed: true,
      startAt: "",
      endAt: "",
      startedAt: "",
      endedAt: "",
      pausedAt: "",
      segments: [{ startAt: "2026-08-17T09:00:00", endAt: "2026-08-17T09:25:00" }],
      source: "focus_page",
      projectId: "",
      projectName: "",
      focusNote: "",
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  it("draws one read-only block per running segment", () => {
    const items = build({ focusSessions: [session()] });
    expect(items).toHaveLength(1);
    expect([items[0].startTime, items[0].endTime]).toEqual(["09:00", "09:25"]);
    expect(items[0].readOnly).toBe(true);
  });

  it("ignores anything that is not a finished focus stretch", () => {
    expect(build({ focusSessions: [session({ status: "running" })] })).toEqual([]);
    // Breaks are rest, not executed plan time.
    expect(build({ focusSessions: [session({ mode: "short_break" })] })).toEqual([]);
    expect(build({ focusSessions: [session()], layers: { ...defaultCalendarLayers, focusActual: false } })).toEqual([]);
  });
});

describe("splitFocusSegmentByDay", () => {
  it("cuts a stretch that crosses midnight", () => {
    const parts = splitFocusSegmentByDay("2026-08-17T23:30:00", "2026-08-18T00:20:00");
    expect(parts).toEqual([
      { date: "2026-08-17", startTime: "23:30", endTime: "24:00" },
      { date: "2026-08-18", startTime: "00:00", endTime: "00:20" },
    ]);
  });

  it("refuses a stretch that does not move forward", () => {
    expect(splitFocusSegmentByDay("2026-08-17T09:00:00", "2026-08-17T09:00:00")).toEqual([]);
    expect(splitFocusSegmentByDay("nonsense", "2026-08-17T09:00:00")).toEqual([]);
  });

  it("gives a sub-minute stretch a visible sliver", () => {
    const parts = splitFocusSegmentByDay("2026-08-17T09:00:00", "2026-08-17T09:00:20");
    expect(parts).toEqual([{ date: "2026-08-17", startTime: "09:00", endTime: "09:01" }]);
  });
});
