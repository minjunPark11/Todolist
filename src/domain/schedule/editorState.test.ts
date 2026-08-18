import { describe, expect, it } from "vitest";
import {
  CLOSED,
  draftSchedule,
  initialMonth,
  monthOf,
  scheduleEditorReducer,
  stepMonth,
  type ScheduleEditorAction,
  type ScheduleEditorState,
} from "./editorState";
import { isDirty } from "./scheduleEquality";
import { getRangeStage } from "./scheduleQueries";
import { isConfirmable } from "./validateSchedule";
import { EMPTY_SCHEDULE, type Schedule } from "./types";

const TODAY = "2026-08-18";

function schedule(patch: Partial<Schedule> = {}): Schedule {
  return { ...EMPTY_SCHEDULE, ...patch };
}

function open(initial: Schedule = EMPTY_SCHEDULE): ScheduleEditorState {
  return scheduleEditorReducer(CLOSED, { type: "OPEN", taskId: "t1", schedule: initial, today: TODAY });
}

function run(state: ScheduleEditorState, ...actions: ScheduleEditorAction[]): ScheduleEditorState {
  return actions.reduce(scheduleEditorReducer, state);
}

/** Narrow to the open state, failing loudly rather than with `undefined`. */
function opened(state: ScheduleEditorState) {
  if (state.status !== "open") throw new Error("expected an open editor");
  return state;
}

describe("OPEN (design §2.5)", () => {
  it("starts on the calendar panel with the record own mode", () => {
    const state = opened(open(schedule({ startDate: "2026-08-17", dueDate: "2026-08-20" })));
    expect(state.panel).toBe("calendar");
    expect(state.draft.mode).toBe("duration");
    expect(state.hoverDate).toBeNull();
    expect(state.issues).toEqual([]);
  });

  it("keeps the opened schedule as the session baseline", () => {
    const state = opened(open(schedule({ dueDate: "2026-08-20" })));
    expect(state.saved).toEqual(schedule({ dueDate: "2026-08-20" }));
    expect(isDirty(state.draft, state.saved)).toBe(false);
  });

  it("opens an undated task on the Date tab", () => {
    expect(opened(open()).draft.mode).toBe("date");
  });
});

describe("initial month (design §2.6)", () => {
  it("opens on a range first day, not its last", () => {
    expect(initialMonth(schedule({ startDate: "2026-07-30", dueDate: "2026-09-02" }), TODAY)).toBe("2026-07-01");
  });

  it("opens on the date a plain schedule holds", () => {
    expect(initialMonth(schedule({ dueDate: "2026-12-25" }), TODAY)).toBe("2026-12-01");
  });

  it("opens on today when there is no schedule", () => {
    expect(initialMonth(EMPTY_SCHEDULE, TODAY)).toBe("2026-08-01");
  });
});

describe("month arithmetic", () => {
  it("anchors to the first of the month", () => {
    expect(monthOf("2026-08-18")).toBe("2026-08-01");
  });

  it("crosses a year boundary in both directions", () => {
    expect(stepMonth("2026-12-01", 1)).toBe("2027-01-01");
    expect(stepMonth("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("does not overshoot from a long month into a short one", () => {
    expect(stepMonth("2026-01-01", 1)).toBe("2026-02-01");
    expect(stepMonth("2026-03-01", -1)).toBe("2026-02-01");
  });
});

describe("date selection", () => {
  it("records the pick and clears the preview it replaced", () => {
    const state = opened(
      run(
        open(),
        { type: "SET_MODE", mode: "duration" },
        { type: "SELECT_DATE", date: "2026-08-17" },
        { type: "HOVER_DATE", date: "2026-08-20" },
        { type: "SELECT_DATE", date: "2026-08-20" },
      ),
    );
    expect(state.hoverDate).toBeNull();
    expect(getRangeStage(state.draft)).toBe("complete");
  });

  it("makes the editor dirty", () => {
    const state = opened(run(open(), { type: "SELECT_DATE", date: "2026-08-20" }));
    expect(isDirty(state.draft, state.saved)).toBe(true);
  });
});

describe("hover (design §2.44)", () => {
  it("takes a hover only while a range is half-picked", () => {
    const half = run(open(), { type: "SET_MODE", mode: "duration" }, { type: "SELECT_DATE", date: "2026-08-17" });
    expect(opened(run(half, { type: "HOVER_DATE", date: "2026-08-20" })).hoverDate).toBe("2026-08-20");
  });

  it("ignores a hover in date mode, where nothing is being previewed", () => {
    expect(opened(run(open(), { type: "HOVER_DATE", date: "2026-08-20" })).hoverDate).toBeNull();
  });

  it("ignores a hover on a finished range", () => {
    const complete = open(schedule({ startDate: "2026-08-17", dueDate: "2026-08-20" }));
    expect(opened(run(complete, { type: "HOVER_DATE", date: "2026-08-25" })).hoverDate).toBeNull();
  });

  it("drops a stale hover when the range completes", () => {
    const state = run(
      open(),
      { type: "SET_MODE", mode: "duration" },
      { type: "SELECT_DATE", date: "2026-08-17" },
      { type: "HOVER_DATE", date: "2026-08-20" },
      { type: "SELECT_DATE", date: "2026-08-20" },
      { type: "HOVER_DATE", date: "2026-08-25" },
    );
    expect(opened(state).hoverDate).toBeNull();
  });
});

describe("panels and navigation", () => {
  it("keeps the draft across a panel change (design §2.37)", () => {
    const state = run(open(), { type: "SELECT_DATE", date: "2026-08-20" }, { type: "SET_PANEL", panel: "time" });
    expect(opened(state).draft.dueDate).toBe("2026-08-20");
    expect(opened(state).panel).toBe("time");
  });

  // §2.45 — looking at another month is not an edit.
  it("does not dirty the draft by paging months", () => {
    const state = opened(run(open(schedule({ dueDate: "2026-08-20" })), { type: "STEP_MONTH", delta: 3 }));
    expect(state.visibleMonth).toBe("2026-11-01");
    expect(isDirty(state.draft, state.saved)).toBe(false);
  });

  it("does not disturb a half-picked range by paging months", () => {
    const half = run(open(), { type: "SET_MODE", mode: "duration" }, { type: "SELECT_DATE", date: "2026-08-17" });
    const paged = run(half, { type: "STEP_MONTH", delta: 1 });
    expect(getRangeStage(opened(paged).draft)).toBe("start-selected");
    expect(opened(paged).draft.startDate).toBe("2026-08-17");
  });

  it("jumps to the month holding a date", () => {
    expect(opened(run(open(), { type: "SHOW_MONTH", date: "2027-03-14" })).visibleMonth).toBe("2027-03-01");
  });
});

describe("clearing (design §2.23)", () => {
  it("empties the schedule but stays on the tab", () => {
    const state = opened(
      run(open(schedule({ startDate: "2026-08-17", dueDate: "2026-08-20" })), { type: "CLEAR_SCHEDULE" }),
    );
    expect(draftSchedule(state.draft)).toEqual(EMPTY_SCHEDULE);
    expect(state.draft.mode).toBe("duration");
  });

  it("is a real edit, and confirmable", () => {
    const state = opened(run(open(schedule({ dueDate: "2026-08-20" })), { type: "CLEAR_SCHEDULE" }));
    expect(isDirty(state.draft, state.saved)).toBe(true);
    expect(isConfirmable(state.draft)).toBe(true);
  });
});

describe("rejection (design §2.38)", () => {
  const issue = { code: "missing-due-date", field: "dueDate", message: "x" } as const;

  it("holds the issues a refused Confirm reported", () => {
    expect(opened(run(open(), { type: "REJECT", issues: [issue] })).issues).toHaveLength(1);
  });

  it("clears them on the next edit, so a fixed error stops shouting", () => {
    const state = run(open(), { type: "REJECT", issues: [issue] }, { type: "SELECT_DATE", date: "2026-08-20" });
    expect(opened(state).issues).toEqual([]);
  });
});

describe("closed is inert (design §2.43)", () => {
  it("ignores every editing action", () => {
    const actions: ScheduleEditorAction[] = [
      { type: "SELECT_DATE", date: "2026-08-20" },
      { type: "SET_MODE", mode: "duration" },
      { type: "HOVER_DATE", date: "2026-08-20" },
      { type: "SET_PANEL", panel: "time" },
      { type: "STEP_MONTH", delta: 1 },
      { type: "CLEAR_SCHEDULE" },
    ];
    for (const action of actions) {
      expect(scheduleEditorReducer(CLOSED, action)).toEqual(CLOSED);
    }
  });

  it("closes from open without leaving anything behind", () => {
    expect(run(open(schedule({ dueDate: "2026-08-20" })), { type: "CLOSE" })).toEqual(CLOSED);
  });
});

describe("Cancel restores by discarding (design §2.25)", () => {
  // There is no RESET action: the draft lives in the session, so closing
  // without writing IS the restore. Reopening reads the record again.
  it("leaves the opened schedule untouched in the session baseline", () => {
    const edited = opened(run(open(schedule({ dueDate: "2026-08-20" })), { type: "SELECT_DATE", date: "2026-09-01" }));
    expect(edited.saved).toEqual(schedule({ dueDate: "2026-08-20" }));
    expect(draftSchedule(edited.draft).dueDate).toBe("2026-09-01");
  });
});

describe("draftSchedule", () => {
  it("drops the mode, which is the editor own and not the record", () => {
    const state = opened(
      run(open(), { type: "SET_MODE", mode: "duration" }, { type: "SELECT_DATE", date: "2026-08-17" }),
    );
    expect(draftSchedule(state.draft)).not.toHaveProperty("mode");
  });
});

describe("QUICK_DATE (design §5)", () => {
  it("sets the date and follows it with the visible month", () => {
    const state = opened(
      run(open(), { type: "QUICK_DATE", key: "plus7", today: "2026-08-28", now: "10:00" }),
    );
    expect(state.draft.dueDate).toBe("2026-09-04");
    // The grid must move with it, or the shortcut looks like it did nothing.
    expect(state.visibleMonth).toBe("2026-09-01");
  });

  it("clears a range preview, since the shortcut settled the dates", () => {
    const state = opened(
      run(
        open(),
        { type: "SET_MODE", mode: "duration" },
        { type: "SELECT_DATE", date: "2026-08-20" },
        { type: "HOVER_DATE", date: "2026-08-25" },
        { type: "QUICK_DATE", key: "plus7", today: TODAY, now: "10:00" },
      ),
    );
    expect(state.hoverDate).toBeNull();
  });
});

describe("SET_REMINDER / SET_REPEAT (design §8, §9)", () => {
  it("keeps a reminder the draft can carry", () => {
    const state = opened(
      run(open(schedule({ dueDate: "2026-08-20" })), { type: "SET_REMINDER", reminder: "1h" }),
    );
    expect(state.draft.reminder).toBe("1h");
    expect(isDirty(state.draft, state.saved)).toBe(true);
  });

  // The panel filters 정시 out without a time; the reducer is what makes that
  // true even if something dispatches it anyway.
  it("refuses a reminder the draft cannot carry", () => {
    const state = opened(
      run(open(schedule({ dueDate: "2026-08-20" })), { type: "SET_REMINDER", reminder: "at-time" }),
    );
    expect(state.draft.reminder).toBe("none");
  });

  it("drops the reminder when the time it referred to goes", () => {
    const state = opened(
      run(
        open(schedule({ dueDate: "2026-08-20", startTime: "09:00" })),
        { type: "SET_REMINDER", reminder: "at-time" },
        { type: "CLEAR_TIME" },
      ),
    );
    expect(state.draft.reminder).toBe("none");
  });

  it("drops both when the schedule is cleared (INV-06, INV-07)", () => {
    const state = opened(
      run(
        open(schedule({ dueDate: "2026-08-20" })),
        { type: "SET_REMINDER", reminder: "1h" },
        { type: "SET_REPEAT", repeat: "daily" },
        { type: "CLEAR_SCHEDULE" },
      ),
    );
    expect(state.draft.reminder).toBe("none");
    expect(state.draft.repeat).toBe("none");
  });

  it("carries the repeat into the schedule it confirms", () => {
    const state = opened(
      run(open(schedule({ dueDate: "2026-08-20" })), { type: "SET_REPEAT", repeat: "weekdays" }),
    );
    expect(draftSchedule(state.draft).repeat).toBe("weekdays");
  });
});
