// The quick add's date chip (QUICK_ADD_INPUT_BOX_DESIGN.md §3.1, §6.4).
//
// It says the day the task is already going to get — Upcoming writes
// `dueDate: today` and Today plans the day, both without ever showing it — and
// it offers the four shortcuts to change that.
//
// Four shortcuts and a Clear, and NOT the Task's schedule editor. That editor
// also holds reminders and a repeat rule, and both of those are records that
// hang off a Task id: offering them here would mean showing controls whose
// answers could not be kept, which is the shape §16.28 refuses. The Task's own
// schedule is edited in the Task, where all of it can be written.
//
// What IS shared is the arithmetic. `quickTargetDate` is the same function the
// editor's four buttons call, so "next month" means the same day in both
// places — including the clamp that keeps 1월 31일 from landing in March.
import type { Language } from "../../types";
import { QUICK_DATES, quickTargetDate } from "../../domain/schedule/quickDate";
import { Popover, PopoverContent, PopoverTrigger, usePopoverSurface } from "../floating";
import { formatDate } from "../../utils/date";
import { useT } from "../../i18n";

export interface QuickAddDateProps {
  /** The day as resolved — the Scope's answer, or the draft's override. */
  value: string;
  today: string;
  lang: Language;
  /** "" clears the override and hands the day back to the Scope. */
  onChange: (date: string) => void;
}

export function QuickAddDate({ value, today, lang, onChange }: QuickAddDateProps) {
  const { t } = useT();
  const label = value
    ? value === today
      ? t("common.today")
      : formatDate(value, lang)
    : t("tasks.quickAdd.noDate");

  return (
    <Popover placement="bottom-end">
      <PopoverTrigger className={`tm-quickadd-date${value ? " is-set" : ""}`} aria-label={label}>
        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false">
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.9" />
          <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
        {label}
      </PopoverTrigger>

      <PopoverContent label={t("tasks.quickAdd.noDate")} className="ff-context-menu tm-quickadd-dates">
        <DateChoices value={value} today={today} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}

/** Separate so a chosen day can close the surface it is inside (§19.90). */
function DateChoices({
  value,
  today,
  onChange,
}: {
  value: string;
  today: string;
  onChange: (date: string) => void;
}) {
  const { t } = useT();
  const { close } = usePopoverSurface();

  function pick(date: string) {
    close();
    onChange(date);
  }

  return (
    <>
      {QUICK_DATES.map((key) => {
        const date = quickTargetDate(key, today);
        return (
          <button
            key={key}
            type="button"
            role="menuitem"
            aria-current={date === value || undefined}
            className={`ff-context-menu-item${date === value ? " is-current" : ""}`}
            onClick={() => pick(date)}
          >
            <span className="ff-context-menu-label">{t(`schedule.quick.${key}`)}</span>
          </button>
        );
      })}

      {/* Clearing hands the day back to the Scope rather than writing an empty
          one — on Upcoming and Today that means the chip goes straight back to
          the date it had, which is correct: those Scopes ARE a day. */}
      <div className="ff-context-menu-divider" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="ff-context-menu-item"
        onClick={() => pick("")}
      >
        <span className="ff-context-menu-label">{t("schedule.clear")}</span>
      </button>
    </>
  );
}
