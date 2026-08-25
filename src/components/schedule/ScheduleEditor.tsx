// The Schedule Editor popover (design §10, audit §7 Phase 6).
//
// A thin shell over the reducer: it renders state and dispatches actions, and
// decides nothing about schedules itself. §2.51 splits it this way on purpose
// — the popover owns being open and where it sits, the editor owns the draft —
// so that opening this from somewhere other than the task detail later means
// giving it a different trigger and nothing else.
import { useEffect, useReducer } from "react";
import {
  ALL_DAY_OFFERS,
  sortReminders,
  TIMED_OFFERS,
  CLOSED,
  draftSchedule,
  formatTimeSummary,
  getRangeStage,
  hasSchedule,
  isConfirmable,
  isDirty,
  QUICK_DATES,
  REPEAT_PRESETS,
  scheduleEditorReducer,
  type QuickDateKey,
  type Schedule,
  type ScheduleIssue,
} from "../../domain/schedule";
import type { ReminderSpec } from "../../domain/schedule";
import { ChoicePanel } from "./ChoicePanel";
import { ReminderPanel } from "./ReminderPanel";
import { MonthCalendar } from "./MonthCalendar";
import { TimePanel } from "./TimePanel";
import { useT } from "../../i18n";

interface ScheduleEditorProps {
  taskId: string;
  locale: string;
  /** The task's schedule as the domain sees it — already consolidated. */
  schedule: Schedule;
  today: string;
  /** Returns whatever was wrong; empty means it was written. */
  onCommit: (taskId: string, next: Schedule) => ScheduleIssue[];
  onClose: () => void;
}

const QUICK_ICONS: Record<QuickDateKey, string> = {
  today: "☀️",
  tomorrow: "🌅",
  plus7: "📅",
  tonight: "🌙",
};

/** The wall clock, as the domain's `HH:mm`. Read at press time, never stored. */
function nowTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function ScheduleEditor({ taskId, locale, schedule, today, onCommit, onClose }: ScheduleEditorProps) {
  const { t } = useT();
  const [state, dispatch] = useReducer(scheduleEditorReducer, undefined, () =>
    scheduleEditorReducer(CLOSED, { type: "OPEN", taskId, schedule, today }),
  );

  // Escape in a subpanel goes back to the calendar rather than closing the
  // editor (design §2.16). Capture phase on the document, because the popover
  // closes from its own document-level listener (`useOutsideClose`) and the
  // only way to get there first — regardless of where focus happens to be —
  // is to catch the key on the way down and stop it.
  //
  // Read outside the early return below, since hooks cannot be conditional.
  const openPanel = state.status === "open" ? state.panel : "calendar";
  useEffect(() => {
    if (openPanel === "calendar") return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      dispatch({ type: "SET_PANEL", panel: "calendar" });
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [openPanel]);

  if (state.status !== "open") return null;

  const { draft, hoverDate, visibleMonth, issues, panel } = state;
  const stage = getRangeStage(draft);
  const dirty = isDirty(draft, state.saved);
  const dated = hasSchedule(draft);

  function confirm() {
    if (state.status !== "open") return;
    const found = onCommit(state.taskId, draftSchedule(state.draft));
    // Only close on success. Closing on a refusal would discard the draft the
    // user still has to fix, and they would have to reconstruct it from the
    // error message.
    if (found.length === 0) onClose();
    else dispatch({ type: "REJECT", issues: found });
  }

  // The subpanels replace the calendar rather than sitting beside it (§2.15).
  // Back returns here with the draft intact — each panel edits a different
  // part of one draft, not a draft of its own (§2.37).
  if (panel === "time") {
    return (
      <div className="sched-editor">
        <TimePanel
          draft={draft}
          locale={locale}
          onStartTime={(time) => dispatch({ type: "SET_START_TIME", time })}
          onEndTime={(time) => dispatch({ type: "SET_END_TIME", time })}
          onClear={() => dispatch({ type: "CLEAR_TIME" })}
          onBack={() => dispatch({ type: "SET_PANEL", panel: "calendar" })}
        />
      </div>
    );
  }

  if (panel === "reminder") {
    return (
      <div className="sched-editor">
        {/* Not a `ChoicePanel` any more: §6.15 lets a Task hold several of
            these, and a radiogroup would drop the previous one on every
            choice. The offers themselves depend on the draft — §6.11 gives an
            all-day Task different units, not the timed list with rows
            removed. */}
        <ReminderPanel
          draft={draft}
          onToggle={(reminder) => dispatch({ type: "TOGGLE_REMINDER", reminder })}
          onBack={() => dispatch({ type: "SET_PANEL", panel: "calendar" })}
        />
      </div>
    );
  }

  if (panel === "repeat") {
    return (
      <div className="sched-editor">
        <ChoicePanel
          title={t("schedule.repeat")}
          options={REPEAT_PRESETS}
          value={draft.repeat}
          label={(option) => t(`schedule.repeat.${option}`)}
          onChoose={(repeat) => dispatch({ type: "SET_REPEAT", repeat })}
          onBack={() => dispatch({ type: "SET_PANEL", panel: "calendar" })}
        />
      </div>
    );
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

      {/* Shortcuts, not a mode (§5.3). Each is a date the user could have
          clicked in the grid below, which is why pressing one leaves the
          editor open and the calendar showing where it landed. */}
      <div className="sched-quick">
        {QUICK_DATES.map((key) => (
          <button
            type="button"
            key={key}
            className="sched-quick-item"
            onClick={() => dispatch({ type: "QUICK_DATE", key, today, now: nowTime() })}
          >
            <span className="sched-quick-icon" aria-hidden="true">
              {QUICK_ICONS[key]}
            </span>
            <span className="sched-quick-label">{t(`schedule.quick.${key}`)}</span>
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
        onShowMonth={(date) => dispatch({ type: "SHOW_MONTH", date })}
      />

      {/* All three qualify a date, so none is offered until there is one
          (INV-03, INV-06, INV-07). */}
      <div className="sched-rows">
        <SummaryRow
          icon="🕐"
          label={t("schedule.time")}
          value={formatTimeSummary(draft, locale) || t("schedule.noTime")}
          disabled={!dated}
          onClick={() => dispatch({ type: "SET_PANEL", panel: "time" })}
        />
        <SummaryRow
          icon="🔔"
          label={t("schedule.reminder")}
          /* §6.34: a summary, because there may be more than one. The earliest
             is named and the rest are counted — a row that listed all four
             would be wider than the popover. */
          value={reminderSummary(draft, t)}
          disabled={!dated}
          onClick={() => dispatch({ type: "SET_PANEL", panel: "reminder" })}
        />
        <SummaryRow
          icon="🔁"
          label={t("schedule.repeat")}
          value={t(`schedule.repeat.${draft.repeat}`)}
          disabled={!dated}
          onClick={() => dispatch({ type: "SET_PANEL", panel: "repeat" })}
        />
      </div>

      {/* Not an error. A half-picked range is a waypoint, and §2.9 keeps the
          two apart: this says what is missing, the block below says what is
          wrong. */}
      {stage === "start-selected" ? <p className="sched-hint">{t("schedule.pickEnd")}</p> : null}

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
        <button
          type="button"
          className="sched-confirm"
          // Disabled for two different reasons (§2.9): the draft is not
          // finished, or nothing about it changed. Neither is an error.
          disabled={!isConfirmable(draft) || !dirty}
          onClick={confirm}
        >
          {t("common.confirm")}
        </button>
      </div>
    </div>
  );
}

/**
 * §6.34's summary line: the earliest reminder, and how many more there are.
 *
 * The earliest rather than the first added, because §6.49 orders them that way
 * everywhere else and a row that disagreed with the panel under it would read
 * as a bug. An absolute reminder has no preset label, so it shows its own
 * moment.
 */
function reminderSummary(draft: Schedule, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const sorted = sortReminders(draft.reminders, draft);
  const first = sorted[0];
  if (!first) return t("schedule.reminder.none");

  const label =
    first.type === "absolute"
      ? (first.absoluteAt ?? "").replace("T", " ")
      : t(`schedule.reminder.${offerIdOf(first)}`);
  return sorted.length > 1 ? t("schedule.reminder.more", { label, n: sorted.length - 1 }) : label;
}

/** Which offer a relative reminder came from, for its label. */
function offerIdOf(reminder: ReminderSpec): string {
  const match = [...TIMED_OFFERS, ...ALL_DAY_OFFERS].find(
    (offer) => offer.offsetMinutes === reminder.offsetMinutes && offer.allDayTime === reminder.allDayTime,
  );
  // A migrated or hand-written offset that matches no offer still has to say
  // something; the minutes are the honest fallback.
  return match?.id ?? "custom-offset";
}

interface SummaryRowProps {
  icon: string;
  label: string;
  value: string;
  disabled: boolean;
  onClick: () => void;
}

function SummaryRow({ icon, label, value, disabled, onClick }: SummaryRowProps) {
  return (
    <button type="button" className="sched-row" disabled={disabled} onClick={onClick}>
      <span className="sched-row-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="sched-row-label">{label}</span>
      <span className="sched-row-value">{value}</span>
      <span className="sched-row-chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );
}
