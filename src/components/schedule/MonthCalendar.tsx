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
import { monthGrid, type CalendarCell } from "../../domain/schedule/calendarCells";
import type { LocalDate, ScheduleDraft } from "../../domain/schedule";
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
}

const MONTH_LABEL: Record<string, Intl.DateTimeFormatOptions> = {
  long: { year: "numeric", month: "long" },
};

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

export function MonthCalendar({
  visibleMonth,
  draft,
  hoverDate,
  today,
  onSelect,
  onHover,
  onStepMonth,
}: MonthCalendarProps) {
  const { t, lang } = useT();
  const locale = lang === "ko" ? "ko-KR" : "en-US";
  const rows = monthGrid(visibleMonth, draft, hoverDate, today);
  const heading = new Date(`${visibleMonth}T00:00:00Z`).toLocaleDateString(locale, {
    ...MONTH_LABEL.long,
    timeZone: "UTC",
  });

  // Sunday-first, taken from a real week so the names follow the locale rather
  // than a hardcoded list.
  const weekdays = rows[0].map((cell) =>
    new Date(`${cell.date}T00:00:00Z`).toLocaleDateString(locale, { weekday: "narrow", timeZone: "UTC" }),
  );

  return (
    <div className="sched-cal">
      <div className="sched-cal-head">
        <button type="button" onClick={() => onStepMonth(-1)} aria-label={t("schedule.prevMonth")}>
          ‹
        </button>
        <span aria-live="polite">{heading}</span>
        <button type="button" onClick={() => onStepMonth(1)} aria-label={t("schedule.nextMonth")}>
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
      <div className="sched-cal-grid" role="grid" onMouseLeave={() => onHover(null)}>
        {rows.map((row, rowIndex) => (
          <div className="sched-cal-row" role="row" key={rowIndex}>
            {row.map((cell) => (
              <button
                type="button"
                role="gridcell"
                key={cell.date}
                className={cellClass(cell)}
                aria-label={cell.date}
                aria-selected={cell.selection !== "none"}
                onClick={() => onSelect(cell.date)}
                onMouseEnter={() => onHover(cell.date)}
                onFocus={() => onHover(cell.date)}
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
