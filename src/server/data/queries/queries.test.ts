// The acceptance criteria of §22, proved with no account and no network.
//
// That is Phase 3's whole argument: the hard parts of this feature are data
// questions, not protocol questions, and they can be settled first. Every
// number below is one an AI would say out loud to somebody planning their day.
import { describe, expect, it } from "vitest";
import { parseIcsEvents } from "../../../lib/ics/parse";
import { getCurrentContext } from "./currentContext";
import { getFreeTimeBlocks, getCalendarRange } from "./calendar";
import { getOverdueTasks, getTaskDetail, getTasks, searchTasks } from "./tasks";
import { getTodayTasks } from "./todayTasks";
import { fixtureContext, settingsRows, task, type TableRows } from "../../test/fixtures";
import type { ExternalEventsResult } from "../calendar/icsSource";

const TODAY = "2026-08-28"; // A Friday, in Seoul, at 10:00 (see fixtures).

// A weekly meeting that has been running since the 7th. The 28th is its
// fourth occurrence, and it exists in the file exactly once — which is the
// bug §9.2.1 was raised for: without expansion the calendar shows it on the
// 7th only, and every Friday after that reads as free.
const WEEKLY_MEETING_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:standup@example.com
SUMMARY:Team sync
LOCATION:Room 3
DESCRIPTION:Dial-in 555-0199, passcode 4821
DTSTART;TZID=Asia/Seoul:20260807T150000
DTEND;TZID=Asia/Seoul:20260807T160000
RRULE:FREQ=WEEKLY;BYDAY=FR
END:VEVENT
END:VCALENDAR`;

const CALENDAR_ID = "cal-work";

function externalEvents(): ExternalEventsResult {
  const events = parseIcsEvents(WEEKLY_MEETING_ICS, CALENDAR_ID);
  return {
    events,
    statuses: [{ name: "Work", ok: true, eventCount: events.length, fetchedAt: "2026-08-28T00:58:00.000Z" }],
    partial: false,
  };
}

function rows(overrides: TableRows = {}): TableRows {
  return {
    tasks: [
      task({
        id: "t-chapter",
        title: "Write the chapter",
        dueDate: TODAY,
        startDate: TODAY,
        startTime: "13:00",
        endTime: "14:00",
        estimatedMinutes: 60,
        priority: "high",
        contentMode: "checklist",
        projectId: "p-thesis",
        listId: "l-thesis",
      }),
      task({ id: "t-late", title: "Return the library books", dueDate: "2026-08-20" }),
      task({ id: "t-blocked", title: "Submit the chapter", dueDate: "2026-09-01", blockedByTaskId: "t-chapter" }),
      task({ id: "t-done", title: "Read the reviews", dueDate: TODAY, status: "completed", completedAt: `${TODAY}T02:00:00.000Z` }),
    ],
    subtasks: [{ id: "s-1", taskId: "t-chapter", title: "Outline it", completed: true }],
    check_items: [
      { id: "c-1", taskId: "t-chapter", text: "Section 1", checked: true, sortKey: 1 },
      { id: "c-2", taskId: "t-chapter", text: "Section 2", checked: false, sortKey: 2 },
    ],
    projects: [{ id: "p-thesis", name: "Thesis", status: "active", color: "#007AFF" }],
    lists: [{ id: "l-thesis", name: "Chapters", projectId: "p-thesis", spaceId: "p-thesis" }],
    settings: settingsRows({
      settings: {
        externalCalendars: [
          { id: CALENDAR_ID, name: "Work", icsUrl: "https://example.com/work.ics", color: "#4f73ff", enabled: true, visible: true },
        ],
      },
      appSettings: { timezone: "Asia/Seoul" },
      syncState: { lastSyncedAt: "2026-08-28T00:55:00.000Z", lastSeenAt: "2026-08-28T00:55:00.000Z", platform: "desktop" },
    }),
    ...overrides,
  };
}

describe("§22-4 and §22-20: a repeating meeting is on today, and today is not free during it", () => {
  it("puts the fourth occurrence of a weekly meeting on today's schedule", async () => {
    const ctx = fixtureContext(rows(), { external: externalEvents() });
    const context = await getCurrentContext(ctx);

    const meeting = context.todaySchedule.find((entry) => entry.kind === "external");
    expect(meeting).toMatchObject({ title: "Team sync", date: TODAY, startTime: "15:00", endTime: "16:00" });
    expect(meeting?.repeating).toBe(true);
    expect(context.meta.externalCalendars?.[0]).toMatchObject({ name: "Work", ok: true });
  });

  it("reports those hours as busy rather than free", async () => {
    // R9's actual damage: without RRULE expansion this window reads as free
    // and an assistant confidently schedules work inside a standing meeting.
    const ctx = fixtureContext(rows(), { external: externalEvents() });
    const free = await getFreeTimeBlocks(ctx, TODAY, "09:00", "18:00");

    expect(free.busy).toContainEqual({ start: "15:00", end: "16:00", title: "Team sync", kind: "external" });
    expect(free.blocks.some((block) => block.start < "16:00" && block.end > "15:00")).toBe(false);
    expect(free.blocks).toContainEqual({ start: "16:00", end: "18:00", minutes: 120 });
  });

  it("keeps the meeting's description out of the answer", async () => {
    // §16.1: an invitation body carries dial-in numbers and attendees. The
    // title, the hours and the room answer the scheduling question.
    const ctx = fixtureContext(rows(), { external: externalEvents() });
    const calendar = await getCalendarRange(ctx, TODAY, TODAY);
    const meeting = calendar.entries.find((entry) => entry.kind === "external");

    expect(meeting?.location).toBe("Room 3");
    expect(JSON.stringify(calendar.entries)).not.toContain("555-0199");
  });
});

describe("§22-3: how long is free before the next thing", () => {
  it("counts the minutes to the next event and how many of them are free", async () => {
    const ctx = fixtureContext(rows(), { external: externalEvents() });
    const context = await getCurrentContext(ctx);

    // 10:00 now; the chapter block starts at 13:00 and nothing sits between.
    expect(context.nextEvent?.title).toBe("Write the chapter");
    expect(context.minutesUntilNextEvent).toBe(180);
    expect(context.freeMinutesUntilNextEvent).toBe(180);
    expect(context.highPriority.map((item) => item.id)).toContain("t-chapter");
  });

  it("carries the estimate a reader needs to answer 'what fits'", async () => {
    const ctx = fixtureContext(rows(), { external: externalEvents() });
    const result = await getTasks(ctx, { status: "open" });
    const chapter = result.items.find((item) => item.id === "t-chapter");

    expect(chapter?.estimatedMinutes).toBe(60);
  });
});

describe("§22-5: the unfinished parts of one task", () => {
  it("returns subtasks and checklist lines", async () => {
    const ctx = fixtureContext(rows());
    const detail = await getTaskDetail(ctx, "t-chapter");

    expect(detail.subtasks).toEqual([{ id: "s-1", title: "Outline it", completed: true }]);
    expect(detail.checklist).toEqual([
      { id: "c-1", title: "Section 1", completed: true },
      { id: "c-2", title: "Section 2", completed: false },
    ]);
    expect(detail.progress).toEqual({ done: 1, total: 2 });
    expect(detail.blocking).toEqual([{ id: "t-blocked", title: "Submit the chapter" }]);
  });

  it("finds it by name first", async () => {
    const ctx = fixtureContext(rows());
    const found = await searchTasks(ctx, "chapter");

    expect(found.items.map((item) => item.id)).toEqual(["t-chapter", "t-blocked"]);
  });
});

describe("§22-10: one id is as unknown as another", () => {
  it("answers the same way for a task that never existed and one that is not yours", async () => {
    const ctx = fixtureContext(rows());
    // RLS keeps user B's row out of the slice entirely, so from here both ids
    // are simply absent — which is the point. The error must not become an
    // oracle for "does this id exist somewhere".
    const unknown = await getTaskDetail(ctx, "task-that-never-was").catch((error) => error);
    const foreign = await getTaskDetail(ctx, "t-user-b-secret").catch((error) => error);

    expect(unknown.code).toBe("NOT_FOUND");
    expect(foreign.code).toBe("NOT_FOUND");
    expect(foreign.message).toBe(unknown.message);
  });
});

describe("§22-6: an account that has not synced says so", () => {
  it("calls a day-old account stale and carries the stamp", async () => {
    const stale = rows({
      settings: settingsRows({
        settings: {},
        appSettings: { timezone: "Asia/Seoul" },
        syncState: { lastSyncedAt: "2026-08-25T01:00:00.000Z", lastSeenAt: "2026-08-25T01:00:00.000Z", platform: "web" },
      }),
    });
    const ctx = fixtureContext(stale);
    const result = await getTodayTasks(ctx);

    expect(result.meta.freshness.staleness).toBe("stale");
    expect(result.meta.freshness.lastSyncedAt).toBe("2026-08-25T01:00:00.000Z");
    expect(result.meta.freshness.syncedFromDevice).toBe("web");
  });

  it("says unknown rather than fresh when nothing recorded a sync", async () => {
    const ctx = fixtureContext(rows({ settings: settingsRows({ appSettings: { timezone: "Asia/Seoul" } }) }));
    const result = await getTodayTasks(ctx);

    expect(result.meta.freshness.staleness).toBe("unknown");
  });
});

describe("§22-18: one calendar failing does not take the answer down", () => {
  it("still answers, and names the calendar that failed", async () => {
    const ctx = fixtureContext(rows(), {
      external: {
        events: [],
        statuses: [{ name: "Work", ok: false, error: "Calendar request timed out." }],
        partial: true,
      },
    });
    const calendar = await getCalendarRange(ctx, TODAY, TODAY);

    expect(calendar.entries.some((entry) => entry.kind === "task")).toBe(true);
    expect(calendar.meta.partial).toBe(true);
    expect(calendar.meta.externalCalendars).toEqual([
      { name: "Work", ok: false, error: "Calendar request timed out." },
    ]);
  });
});

describe("today, as the app itself decides it", () => {
  it("buckets today's work and counts what was finished", async () => {
    const ctx = fixtureContext(rows(), { external: externalEvents() });
    const result = await getTodayTasks(ctx);
    const all = [...result.buckets.now, ...result.buckets.next, ...result.buckets.later];

    expect(result.date).toBe(TODAY);
    expect(result.timezone).toBe("Asia/Seoul");
    expect(all.map((item) => item.id)).toContain("t-chapter");
    // Overdue work is today's problem: the app's own Today rule says so.
    expect(all.map((item) => item.id)).toContain("t-late");
    expect(all.map((item) => item.id)).not.toContain("t-done");
    expect(result.completedCount).toBe(1);
  });

  it("marks what is late and what is waiting on something else", async () => {
    const ctx = fixtureContext(rows());
    const overdue = await getOverdueTasks(ctx);
    const blocked = (await getTasks(ctx, { status: "open" })).items.find((item) => item.id === "t-blocked");

    expect(overdue.items.map((item) => item.id)).toEqual(["t-late"]);
    expect(overdue.items[0].daysUntilDue).toBe(-8);
    expect(blocked?.isBlocked).toBe(true);
  });

  it("names the list and project a task belongs to", async () => {
    const ctx = fixtureContext(rows());
    const chapter = (await getTasks(ctx, { projectId: "p-thesis" })).items[0];

    expect(chapter).toMatchObject({ listName: "Chapters", projectName: "Thesis" });
  });
});

describe("what a reader is never handed", () => {
  it("leaves ordering, sections and settings out of a task summary", async () => {
    const ctx = fixtureContext(rows());
    const result = await getTasks(ctx, {});
    const serialized = JSON.stringify(result.items);

    for (const field of ["order", "sortKey", "sectionId", "categoryId", "activeSessionId", "deletedAt", "archivedAt"]) {
      expect(serialized).not.toContain(`"${field}"`);
    }
  });

  it("keeps description and notes out of list answers", async () => {
    // §16.1: long text belongs to the detail tool, where a reader asked for
    // one task, not to a list of fifty.
    const withProse = rows({
      tasks: [task({ id: "t-prose", title: "Draft", description: "a private paragraph", notes: "a private note" })],
    });
    const ctx = fixtureContext(withProse);
    const list = JSON.stringify((await getTasks(ctx, {})).items);

    expect(list).not.toContain("private paragraph");
    expect(list).not.toContain("private note");
    expect((await getTaskDetail(ctx, "t-prose")).description).toBe("a private paragraph");
  });
});
