// The focus trace (TIMELINE_REFERENCE_PARITY_DESIGN.md §7.1).
//
// What is worth pinning: which days a session lands on when it crosses
// midnight or a DST boundary, that a paused session is one sitting rather than
// two, where a stripe sits inside a bar the window has cut, and that the grain
// follows the COLUMN rather than the zoom's name.
import { describe, expect, it } from "vitest";
import type { FocusSegment, FocusSession } from "../../types";
import {
  focusBins,
  focusByDay,
  formatFocusDuration,
  formatLiveDuration,
  liveFocusSeconds,
  runningFocus,
  totalFocusSeconds,
  traceHeight,
} from "./focusTrace";
import { timelineWindow } from "./timeline";
import type { Span } from "./span";

const TZ = "Asia/Seoul";

function session(over: Partial<FocusSession> & { segments: FocusSegment[] }): FocusSession {
  return {
    id: "f1",
    taskId: "t1",
    title: "",
    mode: "focus",
    status: "completed",
    durationMinutes: 0,
    accumulatedSeconds: 0,
    completed: true,
    startAt: over.segments[0]?.startAt ?? "",
    endAt: "",
    startedAt: over.segments[0]?.startAt ?? "",
    endedAt: "",
    pausedAt: "",
    source: "focus_page",
    projectId: "",
    projectName: "",
    focusNote: "",
    createdAt: "",
    updatedAt: "",
    ...over,
  } as FocusSession;
}

const seg = (startAt: string, endAt: string): FocusSegment => ({ startAt, endAt });
/** A local time in the app's timezone, as the instant it names. */
const at = (local: string) => new Date(`${local}+09:00`).toISOString();

const span = (start: string, end = start): Span => ({
  start,
  end,
  inferredStart: false,
  startTime: "",
  endTime: "",
});

describe("focusByDay", () => {
  it("gathers a task's focus onto the days it happened", () => {
    const byDay = focusByDay(
      [session({ segments: [seg(at("2026-09-09T09:30:00"), at("2026-09-09T09:55:00"))] })],
      "t1",
      TZ,
      Date.parse(at("2026-09-11T12:00:00")),
    );

    expect([...byDay.keys()]).toEqual(["2026-09-09"]);
    expect(byDay.get("2026-09-09")?.seconds).toBe(25 * 60);
    expect(byDay.get("2026-09-09")?.sessionCount).toBe(1);
  });

  it("ignores another task's focus, and breaks", () => {
    const sessions = [
      session({ id: "mine", segments: [seg(at("2026-09-09T09:00:00"), at("2026-09-09T10:00:00"))] }),
      session({ id: "theirs", taskId: "t2", segments: [seg(at("2026-09-09T11:00:00"), at("2026-09-09T12:00:00"))] }),
      session({ id: "break", mode: "short_break", segments: [seg(at("2026-09-09T13:00:00"), at("2026-09-09T13:05:00"))] }),
    ];

    expect(totalFocusSeconds(focusByDay(sessions, "t1", TZ, 0))).toBe(3600);
  });

  // A sitting that ran past midnight belongs to both days, split where the
  // clock says — `focusDate` is what the records screen groups by, so a stripe
  // and a row in that table cannot disagree.
  it("splits a session that crosses midnight", () => {
    const byDay = focusByDay(
      [session({ segments: [seg(at("2026-09-09T23:00:00"), at("2026-09-10T01:00:00"))] })],
      "t1",
      TZ,
      0,
    );

    expect(byDay.get("2026-09-09")?.seconds).toBe(3600);
    expect(byDay.get("2026-09-10")?.seconds).toBe(3600);
  });

  // One sitting with a pause in it, not two. `3회 세션` on a day that held one
  // would be the wrong sentence, and stretches are what a pause produces.
  it("counts a paused session once on each day it touches", () => {
    const byDay = focusByDay(
      [
        session({
          segments: [
            seg(at("2026-09-09T09:00:00"), at("2026-09-09T09:30:00")),
            seg(at("2026-09-09T10:00:00"), at("2026-09-09T10:30:00")),
          ],
        }),
      ],
      "t1",
      TZ,
      0,
    );

    expect(byDay.get("2026-09-09")?.sessionCount).toBe(1);
    expect(byDay.get("2026-09-09")?.seconds).toBe(3600);
  });

  // The one place this differs from `recordedMs`, and on purpose: that
  // function answers "what was recorded", and this one "what is on this bar
  // right now".
  it("includes the open stretch of a session still running", () => {
    const now = Date.parse(at("2026-09-11T10:30:00"));
    const byDay = focusByDay(
      [session({ status: "running", segments: [], startAt: at("2026-09-11T10:00:00") })],
      "t1",
      TZ,
      now,
    );

    expect(byDay.get("2026-09-11")?.seconds).toBe(30 * 60);
    expect(byDay.get("2026-09-11")?.live).toBe(true);
  });

  it("resumes a running session after its last pause, not from its start", () => {
    const now = Date.parse(at("2026-09-11T11:00:00"));
    const byDay = focusByDay(
      [
        session({
          status: "running",
          // `resume` overwrote this at 10:30; `startedAt` still says 9:00.
          startAt: at("2026-09-11T10:30:00"),
          startedAt: at("2026-09-11T09:00:00"),
          segments: [seg(at("2026-09-11T09:00:00"), at("2026-09-11T09:30:00"))],
        }),
      ],
      "t1",
      TZ,
      now,
    );

    // 30 minutes recorded, then an hour paused, then 30 minutes since 10:30.
    // NOT two hours, which is what counting from `startedAt` would have said —
    // the paused hour is not work.
    expect(byDay.get("2026-09-11")?.seconds).toBe(60 * 60);
  });

  it("leaves a cancelled session off the bar", () => {
    const byDay = focusByDay(
      [session({ status: "cancelled", segments: [seg(at("2026-09-09T09:00:00"), at("2026-09-09T10:00:00"))] })],
      "t1",
      TZ,
      0,
    );
    expect(byDay.size).toBe(0);
  });
});

describe("focusBins", () => {
  const window = timelineWindow("week", "2026-09-06");

  it("places a day's stripe by its share of the bar", () => {
    const byDay = focusByDay(
      [session({ segments: [seg(at("2026-09-08T09:00:00"), at("2026-09-08T10:00:00"))] })],
      "t1",
      TZ,
      0,
    );
    // A four-day bar, 9.6 – 9.9. The 8th is its third day.
    const bins = focusBins(byDay, span("2026-09-06", "2026-09-09"), window);

    expect(bins).toHaveLength(1);
    expect(bins[0].left).toBeCloseTo(50, 5);
    expect(bins[0].width).toBeCloseTo(25, 5);
    expect(bins[0].grain).toBe("day");
  });

  // §7.1: 0% of a bar the window cut is the first day ON SCREEN, because that
  // is where `placeBar` starts drawing it.
  it("measures against the visible part of a clipped bar", () => {
    const byDay = focusByDay(
      [session({ segments: [seg(at("2026-09-07T09:00:00"), at("2026-09-07T10:00:00"))] })],
      "t1",
      TZ,
      0,
    );
    // Starts a week before the window, which opens on 9.6.
    const bins = focusBins(byDay, span("2026-08-30", "2026-09-12"), window);

    // The 7th is the second day of the seven the window shows, not the ninth
    // day of the span.
    expect(bins[0].left).toBeCloseTo(100 / 7, 5);
  });

  it("draws nothing for focus that falls outside the bar", () => {
    const byDay = focusByDay(
      [session({ segments: [seg(at("2026-09-11T09:00:00"), at("2026-09-11T10:00:00"))] })],
      "t1",
      TZ,
      0,
    );
    expect(focusBins(byDay, span("2026-09-06", "2026-09-08"), window)).toEqual([]);
  });

  // A day is half a pixel where a column is a month, so the days are gathered.
  // The rule reads the COLUMN, not the zoom's name — `6개월` and `1년` are
  // both cut into months and both group.
  it("gathers days into weeks where a column is a month", () => {
    const byDay = focusByDay(
      [
        session({ id: "a", segments: [seg(at("2026-09-07T09:00:00"), at("2026-09-07T10:00:00"))] }),
        session({ id: "b", segments: [seg(at("2026-09-09T09:00:00"), at("2026-09-09T10:00:00"))] }),
      ],
      "t1",
      TZ,
      0,
    );
    const months = timelineWindow("halfYear", "2026-09-01");
    const bins = focusBins(byDay, span("2026-09-01", "2026-09-30"), months);

    // Both fall in the week beginning Sunday 9.6.
    expect(bins).toHaveLength(1);
    expect(bins[0].grain).toBe("week");
    expect(bins[0].seconds).toBe(2 * 3600);
    expect(bins[0].sessionCount).toBe(2);
  });

  it("keeps days apart where a column is a week", () => {
    const byDay = focusByDay(
      [
        session({ id: "a", segments: [seg(at("2026-09-07T09:00:00"), at("2026-09-07T10:00:00"))] }),
        session({ id: "b", segments: [seg(at("2026-09-09T09:00:00"), at("2026-09-09T10:00:00"))] }),
      ],
      "t1",
      TZ,
      0,
    );
    const weeks = timelineWindow("month", "2026-09-06");

    expect(focusBins(byDay, span("2026-09-06", "2026-09-30"), weeks)).toHaveLength(2);
  });
});

// Four steps, not a scale. The question a glance asks is "a bit or a lot", and
// a proportional height would make 25 and 35 minutes two stripes saying the
// same thing.
describe("traceHeight", () => {
  it("is four answers with a ceiling", () => {
    expect(traceHeight(0)).toBe(0);
    expect(traceHeight(29 * 60)).toBe(2);
    expect(traceHeight(45 * 60)).toBe(3);
    expect(traceHeight(90 * 60)).toBe(4.5);
    expect(traceHeight(2 * 3600)).toBe(6);
    expect(traceHeight(9 * 3600)).toBe(6);
  });
});

describe("the two durations", () => {
  it("writes a record in hours and minutes, and nothing under a minute", () => {
    expect(formatFocusDuration(25 * 60)).toBe("25m");
    expect(formatFocusDuration(95 * 60)).toBe("1h 35m");
    expect(formatFocusDuration(120 * 60)).toBe("2h");
    expect(formatFocusDuration(30)).toBe("");
  });

  // The one number on this screen that is a stopwatch. A clock that moved once
  // a minute would read as broken.
  it("writes a running session to the second", () => {
    expect(formatLiveDuration(38 * 60 + 22)).toBe("38:22");
    expect(formatLiveDuration(3911)).toBe("1:05:11");
  });
});

describe("runningFocus", () => {
  it("finds the one session in flight, ignoring breaks", () => {
    const sessions = [
      session({ id: "done", segments: [] }),
      session({ id: "break", status: "running", mode: "short_break", segments: [] }),
      session({ id: "live", status: "running", segments: [] }),
    ];
    expect(runningFocus(sessions)?.id).toBe("live");
  });

  it("is null when nothing is running, which is the ordinary case", () => {
    expect(runningFocus([session({ segments: [] })])).toBeNull();
  });

  it("adds the closed pauses to the stretch in flight", () => {
    const now = Date.parse(at("2026-09-11T11:00:00"));
    const live = session({
      status: "running",
      startAt: at("2026-09-11T10:30:00"),
      startedAt: at("2026-09-11T09:00:00"),
      segments: [seg(at("2026-09-11T09:00:00"), at("2026-09-11T09:30:00"))],
    });
    expect(liveFocusSeconds(live, now)).toBe(60 * 60);
  });
});
