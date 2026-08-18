// The Schedule Editor's state machine (design §2, audit §7 Phase 5).
//
// A reducer rather than a pile of useState calls, because the interesting part
// of this screen is not any single value but which combinations are reachable.
// Design §2.43 lists seven states that must never occur — a hover date with no
// range started, a panel open on a closed editor — and a reducer is where
// "must never occur" can be enforced once instead of at every setter.
//
// What is NOT here, and why:
//
//   saving / saveError    Design §2.12–2.14 model a save lifecycle because
//                         Confirm calls an async mutation. This app's
//                         `updateTaskSchedule` is synchronous — it updates
//                         state and a background queue persists the whole
//                         document — so there is no interval during which a
//                         draft is in flight, and a "saving" state nothing can
//                         ever observe would be a lie in the type.
//
//   rangeStage / dirty    Derived, never stored (design §1.28, §2.7, §2.8).
//   canConfirm            The queries in this folder answer them from the
//                         draft, which is the only way they cannot drift.
import { clearSchedule, clearTime, selectDate, setEndTime, setStartTime } from "./scheduleCommands";
import { draftFromSchedule, setScheduleMode } from "./scheduleMode";
import { getRangeStage } from "./scheduleQueries";
import type { LocalDate, LocalTime, Schedule, ScheduleDraft, ScheduleMode } from "./types";
import type { ScheduleIssue } from "./validateSchedule";

/** Which sub-panel the editor is showing (design §2.4). */
export type EditorPanel = "calendar" | "time" | "reminder" | "repeat";

export type ScheduleEditorState =
  | { status: "closed" }
  | {
      status: "open";
      /** Whose schedule is being edited. */
      taskId: string;
      /**
       * The schedule as it was when this session opened (design §2.47).
       *
       * Fixed for the life of the session: it is what Cancel restores and what
       * `isDirty` measures against. Re-reading the task instead would make
       * both answers move whenever anything else touched the record.
       */
      saved: Schedule;
      draft: ScheduleDraft;
      panel: EditorPanel;
      /** First day of the month the calendar is showing. */
      visibleMonth: LocalDate;
      /** The cell under the cursor, for range preview (design §2.11). */
      hoverDate: LocalDate | null;
      /** Set when a Confirm was refused; cleared by the next edit. */
      issues: ScheduleIssue[];
    };

export type ScheduleEditorAction =
  | { type: "OPEN"; taskId: string; schedule: Schedule; today: LocalDate }
  | { type: "CLOSE" }
  | { type: "SELECT_DATE"; date: LocalDate }
  | { type: "SET_MODE"; mode: ScheduleMode }
  | { type: "SET_START_TIME"; time: LocalTime | null }
  | { type: "SET_END_TIME"; time: LocalTime | null }
  | { type: "CLEAR_TIME" }
  | { type: "CLEAR_SCHEDULE" }
  | { type: "HOVER_DATE"; date: LocalDate | null }
  | { type: "SET_PANEL"; panel: EditorPanel }
  | { type: "STEP_MONTH"; delta: number }
  | { type: "SHOW_MONTH"; date: LocalDate }
  | { type: "REJECT"; issues: ScheduleIssue[] };

export const CLOSED: ScheduleEditorState = { status: "closed" };

/** First day of `date`'s month — the calendar's anchor. */
export function monthOf(date: LocalDate): LocalDate {
  return `${date.slice(0, 7)}-01`;
}

/** Shift a month anchor by `delta` months, staying on the first. */
export function stepMonth(anchor: LocalDate, delta: number): LocalDate {
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7)) - 1 + delta;
  const shifted = new Date(Date.UTC(year, month, 1));
  return shifted.toISOString().slice(0, 10);
}

/**
 * Which month to open on (design §2.6).
 *
 * The schedule's first day, so a range opens where it begins rather than where
 * it ends; today when there is no schedule, because that is the month someone
 * about to pick a date is thinking in.
 */
export function initialMonth(schedule: Schedule, today: LocalDate): LocalDate {
  return monthOf(schedule.startDate ?? schedule.dueDate ?? today);
}

/** The draft as a plain schedule, ready for `updateTaskSchedule`. */
export function draftSchedule(draft: ScheduleDraft): Schedule {
  return {
    startDate: draft.startDate,
    dueDate: draft.dueDate,
    startTime: draft.startTime,
    endTime: draft.endTime,
    timezone: draft.timezone,
  };
}

/**
 * Editing anything clears a previous rejection.
 *
 * An error that outlives the thing it was about is worse than no error: the
 * user fixes the date and the message still sits there, so they stop reading
 * it (design §2.38).
 */
function edited(state: Extract<ScheduleEditorState, { status: "open" }>, draft: ScheduleDraft) {
  return { ...state, draft, issues: [] };
}

export function scheduleEditorReducer(
  state: ScheduleEditorState,
  action: ScheduleEditorAction,
): ScheduleEditorState {
  if (action.type === "OPEN") {
    return {
      status: "open",
      taskId: action.taskId,
      saved: action.schedule,
      draft: draftFromSchedule(action.schedule),
      panel: "calendar",
      visibleMonth: initialMonth(action.schedule, action.today),
      hoverDate: null,
      issues: [],
    };
  }

  if (action.type === "CLOSE") return CLOSED;

  // Everything below is meaningless on a closed editor, and answering it
  // anyway is how a stray action from an unmounting popover reopens one
  // (design §2.43, I-01).
  if (state.status === "closed") return state;

  switch (action.type) {
    case "SELECT_DATE": {
      // Picking clears the hover it was previewing — the preview has become
      // the selection, and leaving it set would draw both (design §2.11).
      const next = edited(state, selectDate(state.draft, action.date));
      return { ...next, hoverDate: null };
    }

    case "SET_MODE":
      return edited(state, setScheduleMode(state.draft, action.mode));

    case "SET_START_TIME":
      return edited(state, setStartTime(state.draft, action.time));

    case "SET_END_TIME":
      return edited(state, setEndTime(state.draft, action.time));

    case "CLEAR_TIME":
      return edited(state, clearTime(state.draft));

    case "CLEAR_SCHEDULE": {
      const next = edited(state, clearSchedule(state.draft));
      return { ...next, hoverDate: null };
    }

    case "HOVER_DATE": {
      // §2.44. A hover only means something while a range is half-picked:
      // that is the one state where the cell under the cursor implies an end
      // the user has not committed to. Anywhere else there is nothing to
      // preview, and storing it would light up cells for no reason.
      if (getRangeStage(state.draft) !== "start-selected") {
        return state.hoverDate === null ? state : { ...state, hoverDate: null };
      }
      return { ...state, hoverDate: action.date };
    }

    case "SET_PANEL":
      // The draft survives a panel change (design §2.37) — each panel owns
      // different fields of the same draft, not a draft of its own.
      return { ...state, panel: action.panel };

    case "STEP_MONTH":
      // Navigation is not editing (design §2.45): looking at March does not
      // make the draft dirty, and must not disturb a half-picked range.
      return { ...state, visibleMonth: stepMonth(state.visibleMonth, action.delta) };

    case "SHOW_MONTH":
      return { ...state, visibleMonth: monthOf(action.date) };

    case "REJECT":
      return { ...state, issues: action.issues };

    default:
      return state;
  }
}
