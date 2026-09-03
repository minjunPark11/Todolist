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
import { applyQuickDate, type QuickDateKey } from "./quickDate";
import { reconcileReminders, toggleReminder } from "./reminders";
import { clearSchedule, clearTime, selectDate, setEndTime, setRangeDate, setStartTime } from "./scheduleCommands";
import { draftFromSchedule, setScheduleMode } from "./scheduleMode";
import { getRangeStage } from "./scheduleQueries";
import type {
  LocalDate,
  LocalTime,
  ReminderSpec,
  RepeatPreset,
  Schedule,
  ScheduleDraft,
  ScheduleMode,
} from "./types";
import type { ScheduleIssue } from "./validateSchedule";

/** Which sub-panel the editor is showing (design §2.4). */
/**
 * Which surface the editor is showing.
 *
 * `start` and `end` are the same month grid as `calendar`, opened for ONE end
 * of a range and returning as soon as a day is picked
 * (TASK_DETAIL_SCHEDULE_BODY_DESIGN.md §11.2). They are panels rather than a
 * flag on `calendar` because that is what the reader sees: a surface with a
 * title, a way back, and one question on it — the shape `time`, `reminder`
 * and `repeat` already have.
 */
export type EditorPanel = "calendar" | "time" | "reminder" | "repeat" | "start" | "end";

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
  /**
   * One end of a range, named rather than inferred (§11.2).
   *
   * Closes the panel it was answered on: the field asked one question and has
   * its answer, so keeping the grid up would be waiting for something.
   */
  | { type: "SET_RANGE_DATE"; which: "start" | "end"; date: LocalDate }
  | { type: "SET_START_TIME"; time: LocalTime | null }
  | { type: "SET_END_TIME"; time: LocalTime | null }
  | { type: "CLEAR_TIME" }
  | { type: "CLEAR_SCHEDULE" }
  | { type: "HOVER_DATE"; date: LocalDate | null }
  | { type: "SET_PANEL"; panel: EditorPanel }
  | { type: "STEP_MONTH"; delta: number }
  | { type: "SHOW_MONTH"; date: LocalDate }
  /**
   * One of the four shortcuts. Carries `today` rather than reading a clock, so
   * that the reducer stays pure and a test can press 내일 without owning the
   * machine's date (design §5.40).
   *
   * It carried `now` as well while the fourth shortcut was 오늘 밤 and set a
   * time. 다음 달 names a day, so there is no hour left for any of the four to
   * ask about.
   */
  | { type: "QUICK_DATE"; key: QuickDateKey; today: LocalDate }
  | { type: "TOGGLE_REMINDER"; reminder: ReminderSpec }
  | { type: "SET_REPEAT"; repeat: RepeatPreset }
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
    reminders: draft.reminders,
    repeat: draft.repeat,
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
  // Every edit re-checks the reminders, because most of them can invalidate
  // one: clearing the time removes what "at the time" refers to, clearing the
  // dates removes what any relative reminder refers to (INV-06, §6.30), and
  // gaining or losing a time converts between the two families (§6.32,
  // §6.33). Doing it here rather than in each case is what stops one new
  // action from being the one that forgets.
  const reminders = reconcileReminders(draft.reminders, draft);
  const repeat = draft.dueDate === null && draft.startDate === null ? "none" : draft.repeat;
  return { ...state, draft: { ...draft, reminders, repeat }, issues: [] };
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

    case "SET_RANGE_DATE": {
      const next = edited(state, setRangeDate(state.draft, action.which, action.date));
      return { ...next, panel: "calendar", hoverDate: null };
    }

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

    case "QUICK_DATE": {
      const draft = applyQuickDate(state.draft, action.key, action.today);
      const next = edited(state, draft);
      // Follow the result (design §5.34). A shortcut that set a date three
      // months out while the grid stayed put would look like it did nothing.
      const landed = draft.startDate ?? draft.dueDate ?? state.visibleMonth;
      return { ...next, hoverDate: null, visibleMonth: monthOf(landed) };
    }

    case "TOGGLE_REMINDER":
      // Through `edited`, which is what rejects a reminder the current draft
      // cannot carry — the panel offers the list, this enforces it. A toggle
      // rather than a set, because §6.17's panel is multi-select and §6.19's
      // remove is the same gesture as §6.18's add.
      return edited(state, {
        ...state.draft,
        reminders: toggleReminder(state.draft.reminders, action.reminder),
      });

    case "SET_REPEAT":
      return edited(state, { ...state.draft, repeat: action.repeat });

    case "REJECT":
      return { ...state, issues: action.issues };

    default:
      return state;
  }
}
