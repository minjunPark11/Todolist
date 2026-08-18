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

// The five tests below changed with SCHEDULE_EDITOR_PHASE0_AUDIT.md §6, 1-e.
// The work block and the deadline marker were two chips answering two
// questions; consolidation leaves one date to answer both (1-d), so keeping
// both chips would draw the same task twice on the same day. The old
// expectations are quoted in each case, since what they asserted is exactly
// what the user will notice.
describe("task chips", () => {
  it("draws one chip per day a schedule covers", () => {
    // WAS: a block on 8/17 and a separate marker on 8/20.
    // A work day and a deadline that disagree become the range between them,
    // and a range occupies every day it spans — the same per-day expansion
    // external all-day events already use.
    const items = build({ tasks: [task({ scheduledDate: "2026-08-17", dueDate: "2026-08-20" })] });
    expect(keys(items)).toEqual([
      "task-block:task-1:2026-08-17",
      "task-block:task-1:2026-08-18",
      "task-block:task-1:2026-08-19",
      "task-block:task-1:2026-08-20",
    ]);
    expect(items.every((item) => item.layer === "task")).toBe(true);
  });

  it("draws a single-day schedule as one chip with the plain key", () => {
    const items = build({ tasks: [task({ dueDate: "2026-08-20" })] });
    expect(keys(items)).toEqual(["task-block:task-1"]);
    expect(items[0].date).toBe("2026-08-20");
  });

  // The gain that comes with losing the marker: a deadline used to be
  // draggable only from the task detail.
  it("makes a plain deadline draggable, which the marker never was", () => {
    expect(build({ tasks: [task({ dueDate: "2026-08-20" })] })[0].draggable).toBe(true);
  });

  it("puts the times on the ends of a range and leaves the middle all-day", () => {
    // WAS: 09:00–10:30 on the work block, nothing on the marker.
    // Promotion drops the end time rather than move it to another day, so a
    // range keeps only its start.
    const items = build({
      tasks: [task({ scheduledDate: "2026-08-17", startTime: "09:00", endTime: "10:30", dueDate: "2026-08-19" })],
    });
    expect([items[0].startTime, items[0].endTime, items[0].allDay]).toEqual(["09:00", undefined, false]);
    expect(items.slice(1).every((item) => item.allDay && item.startTime === undefined)).toBe(true);
  });

  it("keeps both times on a single-day timed schedule", () => {
    const items = build({ tasks: [task({ scheduledDate: "2026-08-17", startTime: "09:00", endTime: "10:30" })] });
    expect([items[0].startTime, items[0].endTime, items[0].allDay]).toEqual(["09:00", "10:30", false]);
  });

  // A range has no gesture that says whether a drag moves it or resizes it.
  it("refuses to drag a multi-day range", () => {
    const items = build({ tasks: [task({ scheduledDate: "2026-08-17", dueDate: "2026-08-20" })] });
    expect(items.every((item) => item.draggable)).toBe(false);
  });

  it("treats a block with no start time as all-day", () => {
    const items = build({ tasks: [task({ scheduledDate: "2026-08-17" })] });
    expect(items[0].allDay).toBe(true);
  });

  it("drops archived and deleted tasks entirely", () => {
    expect(build({ tasks: [task({ status: "archived", scheduledDate: "2026-08-17" })] })).toEqual([]);
    expect(build({ tasks: [task({ deletedAt: NOW, scheduledDate: "2026-08-17" })] })).toEqual([]);
  });

  it("hides every completed task unless the Completed layer is on", () => {
    // WAS: a completed task kept its scheduled block regardless of the toggle,
    // and hid only its deadline. That split existed because there were two
    // chip kinds; with one, the toggle either governs it or does not.
    //
    // Governing it is the smaller change for most records, since a task with
    // only a deadline already disappeared on completion — and the plan is
    // still there for anyone who turns the layer on.
    const scheduled = task({ status: "done", scheduledDate: "2026-08-17" });
    expect(build({ tasks: [scheduled] })).toEqual([]);
    expect(keys(build({ tasks: [scheduled], layers: { ...defaultCalendarLayers, completed: true } }))).toEqual([
      "task-block:task-1",
    ]);

    const deadlineOnly = task({ status: "done", dueDate: "2026-08-20" });
    expect(build({ tasks: [deadlineOnly] })).toEqual([]);
  });

  it("never lets a completed task be dragged", () => {
    const items = build({
      tasks: [task({ status: "done", scheduledDate: "2026-08-17" })],
      layers: { ...defaultCalendarLayers, completed: true },
    });
    expect(items[0].draggable).toBe(false);
  });

  it("draws nothing for a task with no dates", () => {
    expect(build({ tasks: [task()] })).toEqual([]);
  });

  it("obeys the task layer toggle", () => {
    // WAS: the Deadline toggle drew a chip of its own. It no longer governs
    // any task chip — only project deadlines still use that layer.
    const t = task({ scheduledDate: "2026-08-17", dueDate: "2026-08-20" });
    expect(build({ tasks: [t], layers: { ...defaultCalendarLayers, task: false } })).toEqual([]);
    expect(build({ tasks: [t], layers: { ...defaultCalendarLayers, deadline: false } })).toHaveLength(4);
  });

  it("marks a repeating task on every chip", () => {
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
