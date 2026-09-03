// The 시간 row, expanded (SCHEDULE_TIME_FIELD_DESIGN.md §4.1.2).
//
// This was `TimePanel` — a whole screen with a title and a `‹` that wiped the
// calendar away to ask for an hour (§2.15). §4.1 replaces that: the row opens
// where it is, the calendar stays where it is, and the list hangs under the
// field it belongs to.
//
// The row becoming a FIELD is what makes 시간 different from 알림 and 반복
// (§4.1.2). Those two are chosen from; this one can also be typed into, and a
// row that can be typed into is an input.
//
// Two fields rather than one, which the design's table does not show and this
// app needs (audit decisions 1-b/1-c): a schedule here is a block, not an
// instant, and which day each end lands on depends on the mode —
//
//   date mode      both times are a block on the single date
//   duration mode  the start belongs to the first day, the end to the last
//
// — so a duration really can say "Monday 09:00 through Friday 17:00", and a
// reader who takes that for "09:00–17:00 every day" has been misled by the
// layout rather than by the data. Hence the dates beside the fields.
import { type LocalDate, type LocalTime, type ScheduleDraft } from "../../domain/schedule";
import { formatClock } from "../../utils/clock";
import { useTimeFormat } from "../../utils/appPrefs";
import { useT } from "../../i18n";
import { TimeField } from "./TimeField";

interface TimeRowProps {
  draft: ScheduleDraft;
  locale: string;
  onStartTime: (time: LocalTime | null) => void;
  onEndTime: (time: LocalTime | null) => void;
  /** 시간 지우기 — both ends at once, which no single ✕ can do. */
  onClear: () => void;
  /** Escape with no list open: one more layer peeled (§4.2). */
  onCollapse: () => void;
}

/**
 * The four times most blocks start at.
 *
 * Kept beside the list rather than replaced by it: the list is 48 rows and
 * these are one press. They set the START only — an end is a length, and
 * guessing one would put a block on the calendar the user never sized.
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

export function TimeRow({ draft, locale, onStartTime, onEndTime, onClear, onCollapse }: TimeRowProps) {
  const { t } = useT();
  // §7: the app's clock setting, not the locale's convention. The old panel
  // asked Intl without it, so a reader who had chosen 24h was told "9:00 AM"
  // by this one control and 19:00 by every other.
  const timeFormat = useTimeFormat();
  const isRange = draft.startDate !== null && draft.dueDate !== null && draft.startDate !== draft.dueDate;

  return (
    <div
      className="sched-timerow"
      onKeyDown={(event) => {
        // The field stops the FIRST Escape while its list is open. This is the
        // second one, and it closes the row — one layer at a time, which is
        // what §4.2 hands to the stack instead of the hand-rolled capture
        // listener that used to live in the editor.
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        onCollapse();
      }}
    >
      <TimeField
        value={draft.startTime}
        onChange={onStartTime}
        label={t("schedule.startTime")}
        locale={locale}
        timeFormat={timeFormat}
        /* Only when the two ends are different days. On one day it would
           repeat the date already shown on the trigger. */
        hint={isRange ? dayLabel(draft.startDate ?? draft.dueDate, locale) : undefined}
        openOnMount
      />

      <div className="sched-time-presets">
        {PRESETS.map((preset) => (
          <button
            type="button"
            key={preset}
            className={draft.startTime === preset ? "is-active" : ""}
            aria-pressed={draft.startTime === preset}
            onClick={() => onStartTime(preset)}
          >
            {formatClock(preset, timeFormat, locale)}
          </button>
        ))}
      </div>

      {/* An end needs a start to measure from (`setEndTime` refuses one
          otherwise), so the field appears with it rather than sitting there
          inert. */}
      {draft.startTime !== null ? (
        <TimeField
          value={draft.endTime}
          onChange={onEndTime}
          label={t("schedule.endTime")}
          locale={locale}
          timeFormat={timeFormat}
          hint={isRange ? dayLabel(draft.dueDate, locale) : undefined}
        />
      ) : null}

      {/* §3.4: a different sentence from the ✕ inside a field. That empties
          one end; this empties the block. */}
      <button
        type="button"
        className="sched-timerow-clear"
        disabled={draft.startTime === null}
        onClick={onClear}
      >
        {t("schedule.removeTime")}
      </button>
    </div>
  );
}
