// 사용자 지정 알림 (SCHEDULE_TIME_FIELD_DESIGN.md §6).
//
// The one place in this editor that keeps Save and Cancel, and §5 says why:
// everywhere else a press lands on the draft immediately, so a second
// confirmation would be a third one for the same value. This is a BUILDER —
// a count, a unit and sometimes an hour, assembled into one reminder — so it
// has a middle state that is not yet an answer, and the two buttons are what
// end it.
//
// Nothing new is stored. §6.1: all four units are `offsetMinutes`, and the
// hour is the `allDayTime` the model already has (`customReminderSpec`).
import { useMemo, useState } from "react";
import {
  customReminderSpec,
  reminderMoment,
  unitNeedsTime,
  unitsFor,
  type ReminderUnit,
  type Schedule,
  type ReminderSpec,
  type LocalTime,
} from "../../domain/schedule";
import { formatClock } from "../../utils/clock";
import { useTimeFormat } from "../../utils/appPrefs";
import { useT } from "../../i18n";
import { TimeField } from "./TimeField";

export interface ReminderCustomProps {
  draft: Schedule;
  locale: string;
  onAdd: (reminder: ReminderSpec) => void;
  onCancel: () => void;
}

/** §6.2's default, and the same 09:00 every preset all-day reminder uses. */
const DEFAULT_AT: LocalTime = "09:00";

export function ReminderCustom({ draft, locale, onAdd, onCancel }: ReminderCustomProps) {
  const { t } = useT();
  const timeFormat = useTimeFormat();
  // §6.11's rule, applied to the units: an all-day Task has no moment for
  // 분 and 시간 to count back from, and `reconcileReminders` would drop such a
  // reminder on the next edit — so the form would accept a choice, preview it,
  // and then lose it without saying anything.
  const units = useMemo(() => unitsFor(draft), [draft]);
  const [unit, setUnit] = useState<ReminderUnit>(() => units[0]);
  // A string, not a number: an emptied field is a real state while someone is
  // retyping, and a `0` put there by the input would be a count they did not
  // choose. §11.6 leaves the upper bound open — nothing caps it yet.
  const [count, setCount] = useState(() => (unitsFor(draft)[0] === "minute" ? "30" : "1"));
  const [at, setAt] = useState<LocalTime>(DEFAULT_AT);

  const n = Number(count);
  const valid = Number.isInteger(n) && n >= 1;
  const spec = valid ? customReminderSpec(unit, n, at) : null;
  const moment = spec === null ? null : reminderMoment(spec, draft);

  return (
    <div className="sched-reminder-builder">
      <div className="sched-reminder-amount">
        <input
          type="number"
          min={1}
          step={1}
          autoFocus
          className="sched-reminder-count"
          aria-label={t("schedule.reminder.count")}
          value={count}
          onChange={(event) => setCount(event.target.value)}
        />
        <select
          className="sched-reminder-unit"
          aria-label={t("schedule.reminder.unit")}
          value={unit}
          onChange={(event) => setUnit(event.target.value as ReminderUnit)}
        >
          {units.map((option) => (
            <option key={option} value={option}>
              {t(`schedule.unit.${option}`)}
            </option>
          ))}
        </select>
      </div>

      {/* §6.2: asked only where the answer is not already fixed. Minutes and
          hours count backwards from the Task's own moment; a day or a week
          lands on a date and nothing in it says where in the day. */}
      {unitNeedsTime(unit) ? (
        <label className="sched-reminder-at">
          <span>{t("schedule.reminder.remindAt")}</span>
          <TimeField
            value={at}
            onChange={(time) => setAt(time ?? DEFAULT_AT)}
            label={t("schedule.reminder.remindAt")}
            locale={locale}
            timeFormat={timeFormat}
          />
        </label>
      ) : null}

      {/* §6.4: the same `reminderMoment` the list's brackets use. A form doing
          its own arithmetic is how one reminder comes to be described two
          different ways on two adjacent lines. */}
      <p className="sched-reminder-preview">
        {!valid
          ? t("schedule.reminder.previewInvalid")
          : moment === null
            ? // What the disabled row USED to only imply. §6.4 says it out
              // loud rather than leaving a dead control to be puzzled over.
              t("schedule.reminder.previewNoDate")
            : t("schedule.reminder.previewAt", {
                label: offsetLabel(t, unit, n),
                date: formatDate(moment.date, locale),
                time: formatClock(moment.time, timeFormat, locale),
              })}
      </p>

      <div className="sched-reminder-builder-actions">
        <button type="button" className="sched-cancel" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="sched-confirm"
          disabled={spec === null}
          onClick={() => {
            if (spec !== null) onAdd(spec);
          }}
        >
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}

/**
 * "30분 전" / "2 days early".
 *
 * Two keys per unit rather than one, because English has two forms of it and a
 * single string would put "1 days before" in front of a reader every time they
 * chose the most common count there is.
 */
function offsetLabel(
  t: (key: string, vars?: Record<string, string | number>) => string,
  unit: ReminderUnit,
  n: number,
): string {
  return t(`schedule.reminder.before.${unit}.${n === 1 ? "one" : "other"}`, { n });
}

/** The same UTC-pinned formatting `scheduleFormatting` uses — never a local `Date`. */
function formatDate(date: string, locale: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
