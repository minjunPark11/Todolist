// The Time subpanel (design §7, audit §6 decisions 1-b and 1-c).
//
// Two inputs, but which day each one lands on depends on the mode, and saying
// so is most of this component's job:
//
//   date mode      both times are a block on the single date
//   duration mode  the start belongs to the first day, the end to the last
//
// That second case is the one the design does not have. §1.11 models date-mode
// time as a single instant and this app keeps blocks in both modes, so a
// duration really can say "Monday 09:00 through Friday 17:00" — and a user who
// reads that as "09:00–17:00 every day" has been misled by the layout rather
// than the data. Hence the dates beside the fields.
import {
  formatLocalTime,
  type LocalDate,
  type LocalTime,
  type ScheduleDraft,
} from "../../domain/schedule";
import { useT } from "../../i18n";

interface TimePanelProps {
  draft: ScheduleDraft;
  locale: string;
  onStartTime: (time: LocalTime | null) => void;
  onEndTime: (time: LocalTime | null) => void;
  onClear: () => void;
  onBack: () => void;
}

/**
 * The four times most blocks start at.
 *
 * Presets rather than a scroller: a `<input type="time">` is four keystrokes
 * and the common answers are a click. They set the START only — an end is a
 * length, and guessing one would put a block on the calendar the user never
 * sized.
 */
const PRESETS: readonly LocalTime[] = ["09:00", "13:00", "18:00", "21:00"];

function dayLabel(date: LocalDate | null, locale: string): string {
  if (date === null) return "";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function TimePanel({ draft, locale, onStartTime, onEndTime, onClear, onBack }: TimePanelProps) {
  const { t } = useT();
  const isRange = draft.startDate !== null && draft.dueDate !== null && draft.startDate !== draft.dueDate;
  const startDay = draft.startDate ?? draft.dueDate;
  const endDay = draft.dueDate;

  return (
    <div className="sched-panel">
      <div className="sched-panel-head">
        <button type="button" className="sched-panel-back" onClick={onBack} aria-label={t("schedule.back")}>
          ‹
        </button>
        <span className="sched-panel-title">{t("schedule.time")}</span>
        <span className="sched-panel-spacer" />
      </div>

      <div className="sched-panel-body">
        <label className="sched-time-field">
          <span className="sched-time-label">
            {t("schedule.startTime")}
            {/* Only when the two ends are different days. On one day it would
                repeat the date already shown on the trigger. */}
            {isRange ? <em>{dayLabel(startDay, locale)}</em> : null}
          </span>
          <input
            type="time"
            step={300}
            value={draft.startTime ?? ""}
            onChange={(event) => onStartTime(event.target.value || null)}
          />
        </label>

        <div className="sched-time-presets">
          {PRESETS.map((preset) => (
            <button
              type="button"
              key={preset}
              className={draft.startTime === preset ? "is-active" : ""}
              aria-pressed={draft.startTime === preset}
              onClick={() => onStartTime(preset)}
            >
              {formatLocalTime(preset, locale)}
            </button>
          ))}
        </div>

        {/* An end needs a start to measure from (`setEndTime` refuses one
            otherwise), so the field appears with it rather than sitting there
            inert. */}
        {draft.startTime !== null ? (
          <label className="sched-time-field">
            <span className="sched-time-label">
              {t("schedule.endTime")}
              {isRange ? <em>{dayLabel(endDay, locale)}</em> : null}
            </span>
            <input
              type="time"
              step={300}
              value={draft.endTime ?? ""}
              onChange={(event) => onEndTime(event.target.value || null)}
            />
          </label>
        ) : null}

        <p className="sched-note">{t("schedule.timeNote")}</p>
      </div>

      <div className="sched-panel-foot">
        <button type="button" className="sched-panel-clear" disabled={draft.startTime === null} onClick={onClear}>
          {t("schedule.removeTime")}
        </button>
      </div>
    </div>
  );
}
