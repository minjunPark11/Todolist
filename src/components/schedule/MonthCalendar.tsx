// The date picker's grid (design §6, audit §7 Phase 6).
//
// Fully controlled: it owns no date, no month and no hover. Every one of those
// lives in the editor's reducer, because a grid that kept its own copy would
// be a second answer to "what is selected" — and §2.31 puts date selection in
// the domain precisely so the calendar, the keyboard and the quick actions
// cannot each decide differently.
//
// It is also not `calendar/MonthView`. That renders a month of events; this
// picks a date, and the two share nothing but a shape.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { monthGrid, type CalendarCell } from "../../domain/schedule/calendarCells";
import { addDays, type LocalDate, type ScheduleDraft } from "../../domain/schedule";
import { useT } from "../../i18n";

interface MonthCalendarProps {
  /** First of the month on show. */
  visibleMonth: LocalDate;
  draft: ScheduleDraft;
  hoverDate: LocalDate | null;
  today: LocalDate;
  onSelect: (date: LocalDate) => void;
  onHover: (date: LocalDate | null) => void;
  onStepMonth: (delta: number) => void;
  /** Jump the grid to the month containing `date`, without selecting it. */
  onShowMonth: (date: LocalDate) => void;
}

function cellClass(cell: CalendarCell): string {
  return [
    "sched-cell",
    cell.outsideMonth ? "is-outside" : "",
    cell.isToday ? "is-today" : "",
    cell.selection !== "none" ? `is-${cell.selection}` : "",
    // A preview must never look like a commitment (§4.22), so it is a separate
    // class rather than a weaker value of the same one.
    cell.preview ? "is-preview" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

const KEY_STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

export function MonthCalendar({
  visibleMonth,
  draft,
  hoverDate,
  today,
  onSelect,
  onHover,
  onStepMonth,
  onShowMonth,
}: MonthCalendarProps) {
  const { t, lang } = useT();
  const locale = lang === "ko" ? "ko-KR" : "en-US";
  const rows = monthGrid(visibleMonth, draft, hoverDate, today);
  const heading = new Date(`${visibleMonth}T00:00:00Z`).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  // Monday-first, taken from a real week so the names follow the locale rather
  // than a hardcoded list.
  const weekdays = rows[0].map((cell) =>
    new Date(`${cell.date}T00:00:00Z`).toLocaleDateString(locale, { weekday: "narrow", timeZone: "UTC" }),
  );

  // Which cell the arrow keys move. Kept here rather than in the reducer
  // because it is focus, not data (§2.33): moving across days must not change
  // the draft, and a draft that followed the cursor would make browsing to a
  // date indistinguishable from choosing it.
  const [focusDate, setFocusDate] = useState<LocalDate>(draft.dueDate ?? draft.startDate ?? today);
  const gridRef = useRef<HTMLDivElement>(null);
  const shouldFocus = useRef(false);

  // Follow the month the parent is showing. Without this, paging to March and
  // then pressing an arrow would snap back to the day February had focused.
  useEffect(() => {
    setFocusDate((current) =>
      current.slice(0, 7) === visibleMonth.slice(0, 7) ? current : sameDayIn(visibleMonth, current),
    );
  }, [visibleMonth]);

  // Only ever move focus in response to a key. Focusing on every render would
  // steal it from the time field the moment a date changed underneath.
  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]`)?.focus();
  }, [focusDate]);

  function moveFocus(next: LocalDate) {
    shouldFocus.current = true;
    setFocusDate(next);
    if (next.slice(0, 7) !== visibleMonth.slice(0, 7)) onShowMonth(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = KEY_STEPS[event.key];
    if (step !== undefined) {
      event.preventDefault();
      moveFocus(addDays(focusDate, step));
      return;
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      moveFocus(shiftMonthKeepingDay(focusDate, event.key === "PageUp" ? -1 : 1));
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      // The focused week's ends, not the month's — Home on a grid row means
      // the start of that row.
      const weekday = (new Date(`${focusDate}T00:00:00Z`).getUTCDay() + 6) % 7;
      moveFocus(addDays(focusDate, event.key === "Home" ? -weekday : 6 - weekday));
    }
  }

  return (
    <div className="sched-cal">
      <div className="sched-cal-head">
        <span className="sched-cal-title">{heading}</span>
        <button type="button" className="sched-cal-current" onClick={() => onShowMonth(today)}>
          {t("schedule.currentMonth")}
        </button>
        <button
          type="button"
          className="sched-cal-step"
          onClick={() => onStepMonth(-1)}
          aria-label={t("schedule.prevMonth")}
        >
          ‹
        </button>
        <button
          type="button"
          className="sched-cal-step"
          onClick={() => onStepMonth(1)}
          aria-label={t("schedule.nextMonth")}
        >
          ›
        </button>
      </div>

      <div className="sched-cal-weekdays" aria-hidden="true">
        {weekdays.map((name, index) => (
          <span key={index}>{name}</span>
        ))}
      </div>

      {/* `onMouseLeave` on the grid rather than each cell: leaving one cell for
          its neighbour would otherwise clear the hover the neighbour just set,
          and the preview would flicker across a drag. */}
      <div
        className="sched-cal-grid"
        role="grid"
        aria-label={heading}
        ref={gridRef}
        onKeyDown={handleKeyDown}
        onMouseLeave={() => onHover(null)}
      >
        {rows.map((row, rowIndex) => (
          <div className="sched-cal-row" role="row" key={rowIndex}>
            {row.map((cell) => (
              <button
                type="button"
                role="gridcell"
                key={cell.date}
                data-date={cell.date}
                className={cellClass(cell)}
                // Roving tabindex: one stop for the whole grid, so Tab leaves
                // the calendar instead of walking 42 buttons (§6.46).
                tabIndex={cell.date === focusDate ? 0 : -1}
                aria-label={longLabel(cell.date, locale)}
                aria-current={cell.isToday ? "date" : undefined}
                aria-selected={cell.selection !== "none"}
                onClick={() => onSelect(cell.date)}
                onMouseEnter={() => onHover(cell.date)}
                onFocus={() => {
                  setFocusDate(cell.date);
                  onHover(cell.date);
                }}
              >
                {Number(cell.date.slice(8, 10))}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function longLabel(date: LocalDate, locale: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "UTC",
  });
}

/** The same day-of-month one month away, clamped where the month is shorter (§6.51). */
function shiftMonthKeepingDay(date: LocalDate, delta: number): LocalDate {
  const monthAnchor = `${date.slice(0, 7)}-01`;
  const year = Number(monthAnchor.slice(0, 4));
  const month = Number(monthAnchor.slice(5, 7)) - 1 + delta;
  return clampDay(year, month, Number(date.slice(8, 10)));
}

/** The nearest day inside `month` to the one currently focused. */
function sameDayIn(month: LocalDate, focused: LocalDate): LocalDate {
  return clampDay(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, Number(focused.slice(8, 10)));
}

function clampDay(year: number, month: number, day: number): LocalDate {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
}
