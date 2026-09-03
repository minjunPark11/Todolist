// The quick add's date chip (QUICK_ADD_INPUT_BOX_DESIGN.md §3.1, §6.4).
//
// It says the day the task is already going to get — Upcoming writes
// `dueDate: today` and Today plans the day, both without ever showing it — and
// pressing it opens the app's OWN schedule editor, the same one the Task
// Detail opens. Not a smaller stand-in: a second date UI would be a second
// answer to what picking a day means, and the two would drift the first time
// either changed.
//
// Two things differ, and both come from there being no Task yet:
//
//   - The footer's left button is 취소, not 일정 지우기. There is no stored
//     schedule to empty; what is needed in that corner is the way out without
//     choosing.
//   - The draft is held HERE until the task is created. `onCommit` writes to
//     the caller's state instead of the store, and returns no issues because
//     the editor has already validated everything it hands over.
import { useState } from "react";
import type { Language } from "../../types";
import { EMPTY_SCHEDULE, type Schedule } from "../../domain/schedule";
import { ScheduleEditor } from "../schedule/ScheduleEditor";
import { Popover, PopoverContent, PopoverTrigger, usePopoverSurface } from "../floating";
import { formatDate } from "../../utils/date";
import { useT } from "../../i18n";

export interface QuickAddDateProps {
  /** The draft's schedule, or null while the Scope's answer still stands. */
  schedule: Schedule | null;
  /** The day as resolved — the Scope's answer, or the draft's override. */
  value: string;
  today: string;
  lang: Language;
  onChange: (next: Schedule) => void;
}

export function QuickAddDate({ schedule, value, today, lang, onChange }: QuickAddDateProps) {
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

      <PopoverContent label={t("taskDetail.schedule")} className="sched-surface">
        <QuickAddScheduleSurface
          schedule={schedule}
          value={value}
          today={today}
          lang={lang}
          onChange={onChange}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Separated so 확인 and 취소 can close the surface they are inside (§19.90). */
function QuickAddScheduleSurface({
  schedule,
  value,
  today,
  lang,
  onChange,
}: {
  schedule: Schedule | null;
  value: string;
  today: string;
  lang: Language;
  onChange: (next: Schedule) => void;
}) {
  const { close } = usePopoverSurface();
  /* Seeded ONCE, from whatever the chip is currently saying (§3.1). Without
     the seed the calendar would open on an empty schedule while the chip said
     "Today", and 확인 would then be disabled until the reader picked the day
     that was already showing — the editor's `dirty` check comparing a draft
     against a schedule the chip never had. */
  const [seed] = useState<Schedule>(
    () => schedule ?? (value ? { ...EMPTY_SCHEDULE, dueDate: value } : EMPTY_SCHEDULE),
  );

  return (
    <ScheduleEditor
      // No Task, and the editor only ever hands this back to `onCommit`.
      taskId=""
      locale={lang}
      schedule={seed}
      today={today}
      onCommit={(_taskId, next) => {
        onChange(next);
        // Nothing to report: the editor validated before calling, and there is
        // no store here to refuse the write (§5.51's issues are the store's).
        return [];
      }}
      onClose={() => close("selection")}
      // §6.4: 취소 where the Detail has 일정 지우기.
      onCancel={() => close("escape")}
    />
  );
}
