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
import type { LocalDate, LocalTime, ScheduleDraft } from "../../domain/schedule";
import { useT } from "../../i18n";

interface TimePanelProps {
  draft: ScheduleDraft;
  locale: string;
  onStartTime: (time: LocalTime | null) => void;
  onEndTime: (time: LocalTime | null) => void;
  onClear: () => void;
  onBack: () => void;
}

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
    <div className="sched-time">
      <div className="sched-cal-head">
        <button type="button" onClick={onBack} aria-label={t("schedule.back")}>
          ‹
        </button>
        <span>{t("schedule.time")}</span>
        <span />
      </div>

      <label className="sched-time-field">
        <span>
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

      <label className="sched-time-field">
        <span>
          {t("schedule.endTime")}
          {isRange ? <em>{dayLabel(endDay, locale)}</em> : null}
        </span>
        {/* An end with no start is the shape the calendar cannot draw — it
            renders as all-day and drops the value — so the field is not
            offered until there is a start to measure from. */}
        <input
          type="time"
          step={300}
          disabled={draft.startTime === null}
          value={draft.endTime ?? ""}
          onChange={(event) => onEndTime(event.target.value || null)}
        />
      </label>

      <button type="button" className="sched-clear" onClick={onClear} disabled={draft.startTime === null}>
        {t("schedule.removeTime")}
      </button>
    </div>
  );
}
