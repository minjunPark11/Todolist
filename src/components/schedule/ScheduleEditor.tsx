// The Schedule Editor popover (design §10, audit §7 Phase 6).
//
// A thin shell over the reducer: it renders state and dispatches actions, and
// decides nothing about schedules itself. §2.51 splits it this way on purpose
// — the popover owns being open and where it sits, the editor owns the draft —
// so that opening this from somewhere other than the task detail later means
// giving it a different trigger and nothing else.
//
// 시간 · 알림 · 반복 used to be SCREENS here, each replacing the calendar and
// each with a `‹` to come back from (§2.15). SCHEDULE_TIME_FIELD_DESIGN.md §4
// makes all three open UNDER THE ROW THAT ASKED, over the rows below rather
// than pushing them down, and the calendar stays where it is. Three things
// went with that change:
//
//   - `EditorPanel` lost those three members (§4.2). What is left is the grid
//     and the two range ends, which genuinely do replace the screen.
//   - The hand-rolled Escape capture listener is gone. It existed to make
//     Escape mean "back to the calendar" rather than "close the editor", and
//     the layer stack already peels exactly one level at a time (§19.24).
//   - 반복 came along even though the user only asked for two (§4.3): three
//     identical-looking rows behaving in two different ways is worse than
//     either behaviour.
import { useReducer, useState, type ReactNode } from "react";
import {
  ALL_DAY_OFFERS,
  sortReminders,
  TIMED_OFFERS,
  CLOSED,
  draftSchedule,
  formatTimeSummary,
  getRangeStage,
  hasSchedule,
  isAllDay,
  isConfirmable,
  isDirty,
  nextWholeHour,
  QUICK_DATES,
  REPEAT_PRESETS,
  scheduleEditorReducer,
  type QuickDateKey,
  type RepeatPreset,
  type Schedule,
  type ScheduleIssue,
} from "../../domain/schedule";
import type { ReminderSpec } from "../../domain/schedule";
import { ReminderList } from "./ReminderList";
import { MonthCalendar } from "./MonthCalendar";
import { TimeRow } from "./TimeRow";
import { Popover, PopoverContent, PopoverTrigger } from "../floating";
import {
  BellIcon,
  CalendarPlus7Icon,
  ClockIcon,
  CalendarNextMonthIcon,
  RepeatIcon,
  SunIcon,
  SunriseIcon,
} from "./icons";
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
  /**
   * Replaces 일정 지우기 with 취소
   * (QUICK_ADD_INPUT_BOX_DESIGN.md §6.4).
   *
   * The quick add opens this editor for a task that does not exist yet, and
   * there Clear has nothing to clear — the schedule it would empty has never
   * been written. What the reader needs in that corner is the way back out
   * without choosing, which is what this is.
   */
  onCancel?: () => void;
}

const QUICK_ICONS: Record<QuickDateKey, () => ReactNode> = {
  today: () => <SunIcon size={20} />,
  tomorrow: () => <SunriseIcon size={20} />,
  plus7: () => <CalendarPlus7Icon size={20} />,
  nextMonth: () => <CalendarNextMonthIcon size={20} />,
};

/** The wall clock, read once when 시간 is opened on an empty start (§3.3). */
function nowTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function ScheduleEditor({ taskId, locale, schedule, today, onCommit, onClose, onCancel }: ScheduleEditorProps) {
  const { t } = useT();
  const [state, dispatch] = useReducer(scheduleEditorReducer, undefined, () =>
    scheduleEditorReducer(CLOSED, { type: "OPEN", taskId, schedule, today }),
  );
  // 시간 is the one row that becomes a FIELD rather than opening a list
  // (§4.1.2), so it is the one whose openness this component has to hold.
  // 알림 and 반복 hang their lists off their own `Popover`, which already
  // knows whether it is open.
  //
  // View state, not draft state, which is why it is here and not in the
  // reducer: the reducer answers which SCHEDULES are reachable.
  const [timeOpen, setTimeOpen] = useState(false);

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

  /**
   * §3.3: the clock fills an EMPTY start, and only an empty one.
   *
   * This is the one place in this editor that reads a clock, and it is worth
   * naming why that is allowed here when `quickDate.ts` refuses it: what the
   * clock makes is a SUGGESTION in an empty field, which the user then
   * confirms or replaces. A value that is already set is never touched, so
   * reopening the editor an hour later cannot quietly move a time someone had
   * chosen.
   */
  function openTime() {
    if (state.status !== "open") return;
    if (state.draft.startTime === null) {
      dispatch({ type: "SET_START_TIME", time: nextWholeHour(nowTime()) });
    }
    setTimeOpen(true);
  }

  // One end of the range, on the same grid the Date tab uses (§11.2). It is
  // the whole calendar rather than a stripped one on purpose: the other end
  // stays painted, so the reader picks a day while seeing the span it makes.
  if (panel === "start" || panel === "end") {
    return (
      <div className="sched-editor">
        <div className="sched-panel-head">
          <button
            type="button"
            className="sched-back"
            onClick={() => dispatch({ type: "SET_PANEL", panel: "calendar" })}
          >
            {t("schedule.back")}
          </button>
          <h3>{t(panel === "start" ? "schedule.rangeStart" : "schedule.rangeEnd")}</h3>
        </div>
        <MonthCalendar
          visibleMonth={visibleMonth}
          draft={draft}
          hoverDate={hoverDate}
          today={today}
          onSelect={(date) => dispatch({ type: "SET_RANGE_DATE", which: panel, date })}
          onHover={(date) => dispatch({ type: "HOVER_DATE", date })}
          onStepMonth={(delta) => dispatch({ type: "STEP_MONTH", delta })}
          onShowMonth={(date) => dispatch({ type: "SHOW_MONTH", date })}
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

      {/* The Date tab's two: shortcuts and a grid. Neither is on the Duration
          tab (§11.2) — `오늘`, `내일`, `7일 후` and `다음 달` each answer with
          ONE day, which is not an answer to a span, and the grid moves behind
          the two fields that say which end they are setting. */}
      {draft.mode === "date" ? (
        <>
          {/* Shortcuts, not a mode (§5.3). Each is a date the user could have
              clicked in the grid below, which is why pressing one leaves the
              editor open and the calendar showing where it landed. */}
          <div className="sched-quick">
            {QUICK_DATES.map((key) => (
              <button
                type="button"
                key={key}
                className="sched-quick-item"
                onClick={() => dispatch({ type: "QUICK_DATE", key, today })}
              >
                <span className="sched-quick-icon" aria-hidden="true">
                  {QUICK_ICONS[key]()}
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
        </>
      ) : (
        <div className="sched-rows sched-range">
          {/* The two ends, each saying which one it is before it says a date.
              Both are always offered: a range with no start is what this tab
              opens as, and there is nothing to qualify yet (unlike the three
              rows below, which need a date to attach to). */}
          <SummaryRow
            label={t("schedule.rangeStart")}
            value={draft.startDate ?? t("schedule.noDate")}
            disabled={false}
            onClick={() => dispatch({ type: "SET_PANEL", panel: "start" })}
          />
          <SummaryRow
            label={t("schedule.rangeEnd")}
            value={draft.dueDate ?? t("schedule.noDate")}
            disabled={false}
            onClick={() => dispatch({ type: "SET_PANEL", panel: "end" })}
          />
          {/* Derived, not stored (§11.3): "all day" IS both times being empty.
              Turning it on clears them; turning it off opens the row that sets
              them, because picking is the only way to make the state the
              switch would be claiming. */}
          <div className="sched-row is-switch">
            <span className="sched-row-label">{t("schedule.allDay")}</span>
            <button
              type="button"
              className={`tm-switch${isAllDay(draft) ? " is-on" : ""}`}
              role="switch"
              aria-checked={isAllDay(draft)}
              aria-label={t("schedule.allDay")}
              disabled={!dated}
              onClick={() => (isAllDay(draft) ? openTime() : dispatch({ type: "CLEAR_TIME" }))}
            >
              <span className="tm-switch-knob" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* All three qualify a date, so none is offered until there is one
          (INV-03, INV-06, INV-07). */}
      <div className="sched-rows">
        {/* On the Duration tab the switch above owns this question, and the row
            appears only once there is something to show — a second door to the
            same list, standing open beside a switch that says "all day", is
            two controls disagreeing. */}
        {draft.mode === "date" || !isAllDay(draft) ? (
          timeOpen ? (
            // §4.1.2: the row IS the field, because this is the one of the
            // three that can be typed into as well as chosen from.
            <TimeRow
              draft={draft}
              locale={locale}
              onStartTime={(time) => dispatch({ type: "SET_START_TIME", time })}
              onEndTime={(time) => dispatch({ type: "SET_END_TIME", time })}
              onClear={() => {
                dispatch({ type: "CLEAR_TIME" });
                setTimeOpen(false);
              }}
              onCollapse={() => setTimeOpen(false)}
            />
          ) : (
            <SummaryRow
              icon={<ClockIcon />}
              label={t("schedule.time")}
              value={formatTimeSummary(draft, locale) || t("schedule.noTime")}
              disabled={!dated}
              onClick={openTime}
            />
          )
        ) : null}

        {/* Not a `ChoicePanel` any more, and not a panel at all: §6.15 lets a
            Task hold several of these, and the offers themselves depend on the
            draft — §6.11 gives an all-day Task different units, not the timed
            list with rows removed. */}
        <ExpandingRow
          icon={<BellIcon />}
          label={t("schedule.reminder")}
          /* §6.34: a summary, because there may be more than one. The earliest
             is named and the rest are counted — a row that listed all four
             would be wider than the popover. */
          value={reminderSummary(draft, t)}
          disabled={!dated}
        >
          <ReminderList
            draft={draft}
            locale={locale}
            onToggle={(reminder) => dispatch({ type: "TOGGLE_REMINDER", reminder })}
          />
        </ExpandingRow>

        <ExpandingRow
          icon={<RepeatIcon />}
          label={t("schedule.repeat")}
          value={t(`schedule.repeat.${draft.repeat}`)}
          disabled={!dated}
        >
          <RepeatChoices
            value={draft.repeat}
            onChoose={(repeat) => dispatch({ type: "SET_REPEAT", repeat })}
          />
        </ExpandingRow>
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
        {onCancel ? (
          <button type="button" className="sched-cancel" onClick={onCancel}>
            {t("common.cancel")}
          </button>
        ) : (
          <button type="button" className="sched-clear" onClick={() => dispatch({ type: "CLEAR_SCHEDULE" })}>
            {t("schedule.clear")}
          </button>
        )}
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
 * 반복's six, as the radiogroup they have always been.
 *
 * One of these is always in force, which is what makes it a radiogroup and not
 * the checkbox list above it — a screen reader should say "없음, selected"
 * rather than announce six unrelated controls.
 */
function RepeatChoices({ value, onChoose }: { value: RepeatPreset; onChoose: (repeat: RepeatPreset) => void }) {
  const { t } = useT();
  return (
    <div className="sched-choices" role="radiogroup" aria-label={t("schedule.repeat")}>
      {REPEAT_PRESETS.map((option) => (
        <button
          type="button"
          key={option}
          role="radio"
          aria-checked={option === value}
          className={option === value ? "sched-choice is-active" : "sched-choice"}
          onClick={() => onChoose(option)}
        >
          <span>{t(`schedule.repeat.${option}`)}</span>
          {option === value ? (
            <span className="sched-check" aria-hidden="true">
              ✓
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/**
 * §6.34's summary line: the earliest reminder, and how many more there are.
 *
 * The earliest rather than the first added, because §6.49 orders them that way
 * everywhere else and a row that disagreed with the list under it would read
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
  icon?: ReactNode;
  label: string;
  value: string;
  disabled: boolean;
  onClick: () => void;
}

function SummaryRow({ icon, label, value, disabled, onClick }: SummaryRowProps) {
  return (
    <button type="button" className="sched-row" disabled={disabled} onClick={onClick}>
      <RowFace icon={icon} label={label} value={value} />
    </button>
  );
}

/**
 * A row that opens its answer underneath itself (§4.1).
 *
 * A nested `Popover` and not a block in the flow, for the reason §4.1.1 gives:
 * the list COVERS the rows below rather than pushing them down, so the
 * calendar above does not move while a question below it is being answered.
 * The stack does the rest — Escape peels this layer and leaves the editor,
 * which is the behaviour the editor used to hand-roll with a capture listener.
 */
function ExpandingRow({
  icon,
  label,
  value,
  disabled,
  children,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <Popover placement="bottom-start" offset={4}>
      <PopoverTrigger className="sched-row" disabled={disabled}>
        <RowFace icon={icon} label={label} value={value} />
      </PopoverTrigger>
      <PopoverContent label={label} className="sched-rowsurface">
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * What every row looks like, open or shut.
 *
 * Shared so that a row that opens a list and a row that replaces the screen
 * cannot drift apart — they are the same sentence with different consequences,
 * and §4.3 is about exactly that.
 */
function RowFace({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <>
      {/* The range's two rows carry no icon: `시작`/`종료` are a pair and the
          words are the distinction, where the three rows below are each a
          different KIND of thing and the glyph is what separates them. */}
      {icon ? (
        <span className="sched-row-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="sched-row-label">{label}</span>
      <span className="sched-row-value">{value}</span>
      {/* §4 turns this a quarter turn when the row is open, which the
          stylesheet does from the trigger's own `aria-expanded`. */}
      <span className="sched-row-chevron" aria-hidden="true">
        ›
      </span>
    </>
  );
}
