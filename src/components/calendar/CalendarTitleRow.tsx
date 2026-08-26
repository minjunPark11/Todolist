import { useT } from "../../i18n";

interface CalendarTitleRowProps {
  rangeLabel: string;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * The range, on its own line above the grid.
 *
 * CALENDAR_GEOMETRY_DESIGN.md R2: this was a 15px heading inside the toolbar,
 * which made the largest glyph on the calendar a date cell rather than the
 * period being read. Calendar.app spends 26pt here — measured at twice the cap
 * height of the day numbers — and keeps the date navigation on the same line.
 *
 * It sits inside the main column rather than the toolbar so it starts where the
 * grid starts, the way it does beside Calendar.app's sidebar.
 */
export function CalendarTitleRow({ rangeLabel, onToday, onPrev, onNext }: CalendarTitleRowProps) {
  const { t } = useT();
  return (
    <div className="gcal-title-row">
      <h2 className="gcal-range-label">{rangeLabel}</h2>
      <div className="gcal-nav">
        <button type="button" aria-label={t("calendar.previous")} onClick={onPrev}>
          ‹
        </button>
        <button type="button" className="gcal-today-btn" onClick={onToday}>
          {t("calendar.today")}
        </button>
        <button type="button" aria-label={t("calendar.next")} onClick={onNext}>
          ›
        </button>
      </div>
    </div>
  );
}
