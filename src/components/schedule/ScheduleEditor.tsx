// The Schedule Editor popover (design §10, audit §7 Phase 6).
//
// A thin shell over the reducer: it renders state and dispatches actions, and
// decides nothing about schedules itself. §2.51 splits it this way on purpose
// — the popover owns being open and where it sits, the editor owns the draft —
// so that opening this from somewhere other than the task detail later means
// giving it a different trigger and nothing else.
import { useReducer } from "react";
import {
  CLOSED,
  draftSchedule,
  getRangeStage,
  isConfirmable,
  isDirty,
  scheduleEditorReducer,
  type Schedule,
  type ScheduleIssue,
} from "../../domain/schedule";
import { MonthCalendar } from "./MonthCalendar";
import { useT } from "../../i18n";

interface ScheduleEditorProps {
  taskId: string;
  /** The task's schedule as the domain sees it — already consolidated. */
  schedule: Schedule;
  today: string;
  /** Returns whatever was wrong; empty means it was written. */
  onCommit: (taskId: string, next: Schedule) => ScheduleIssue[];
  onClose: () => void;
}

export function ScheduleEditor({ taskId, schedule, today, onCommit, onClose }: ScheduleEditorProps) {
  const { t } = useT();
  const [state, dispatch] = useReducer(scheduleEditorReducer, undefined, () =>
    scheduleEditorReducer(CLOSED, { type: "OPEN", taskId, schedule, today }),
  );

  if (state.status !== "open") return null;

  const { draft, hoverDate, visibleMonth, issues } = state;
  const stage = getRangeStage(draft);
  const dirty = isDirty(draft, state.saved);

  function confirm() {
    if (state.status !== "open") return;
    const found = onCommit(state.taskId, draftSchedule(state.draft));
    // Only close on success. Closing on a refusal would discard the draft the
    // user still has to fix, and they would have to reconstruct it from the
    // error message.
    if (found.length === 0) onClose();
    else dispatch({ type: "REJECT", issues: found });
  }

  return (
    <div className="sched-editor">
      <div className="sched-tabs" role="tablist">
        {(["date", "duration"] as const).map((mode) => (
          <button
            type="button"
            key={mode}
            role="tab"
            aria-selected={draft.mode === mode}
            className={draft.mode === mode ? "is-active" : ""}
            onClick={() => dispatch({ type: "SET_MODE", mode })}
          >
            {t(`schedule.mode.${mode}`)}
          </button>
        ))}
      </div>

      <MonthCalendar
        visibleMonth={visibleMonth}
        draft={draft}
        hoverDate={hoverDate}
        today={today}
        onSelect={(date) => dispatch({ type: "SELECT_DATE", date })}
        onHover={(date) => dispatch({ type: "HOVER_DATE", date })}
        onStepMonth={(delta) => dispatch({ type: "STEP_MONTH", delta })}
      />

      {/* Not an error. A half-picked range is a waypoint, and §2.9 keeps the
          two apart: this says what is missing, the block below says what is
          wrong. */}
      {stage === "start-selected" ? (
        <p className="sched-hint">{t("schedule.pickEnd")}</p>
      ) : null}

      {issues.length > 0 ? (
        <ul className="sched-issues" role="alert">
          {issues.map((issue) => (
            <li key={`${issue.field}:${issue.code}`}>{issue.message}</li>
          ))}
        </ul>
      ) : null}

      <div className="sched-actions">
        <button type="button" className="sched-clear" onClick={() => dispatch({ type: "CLEAR_SCHEDULE" })}>
          {t("schedule.clear")}
        </button>
        <span className="sched-spacer" />
        <button type="button" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="sched-confirm"
          // Disabled for two different reasons (§2.9): the draft is not
          // finished, or nothing about it changed. Neither is an error.
          disabled={!isConfirmable(draft) || !dirty}
          onClick={confirm}
        >
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}
