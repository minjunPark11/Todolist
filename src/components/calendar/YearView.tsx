// Year view (FOCUSFLOW_CALENDAR_FINAL_IMPLEMENTATION_SPEC §8):
// 12 months in a 4x3 grid, date numbers only — no event chips, no detail
// panel. Month title → month view, date → day view.
import { useMemo } from "react";
import { getDayNumber, getMonthGrid, todayValue } from "../../utils/date";
import { useT } from "../../i18n";

const WEEKDAYS_EN = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

interface YearViewProps {
  anchor: string;
  onOpenMonth: (date: string) => void;
  onOpenDay: (date: string) => void;
}

export function YearView({ anchor, onOpenMonth, onOpenDay }: YearViewProps) {
  const { lang } = useT();
  const weekdays = lang === "ko" ? WEEKDAYS_KO : WEEKDAYS_EN;
  const today = todayValue();
  const year = Number(anchor.slice(0, 4));

  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(lang === "ko" ? "ko" : "en", { month: "long" }),
    [lang],
  );

  return (
    <div className="gcal-year-grid">
      {Array.from({ length: 12 }, (_, month) => {
        const cells = getMonthGrid(year, month);
        const firstOfMonth = `${year}-${String(month + 1).padStart(2, "0")}-01`;
        return (
          <section key={month} className="gcal-year-month">
            <button type="button" className="gcal-year-month-title" onClick={() => onOpenMonth(firstOfMonth)}>
              {monthFormatter.format(new Date(year, month, 1))}
            </button>
            <div className="gcal-year-weekdays" aria-hidden="true">
              {weekdays.map((day, index) => (
                <span key={index}>{day}</span>
              ))}
            </div>
            <div className="gcal-year-dates">
              {cells.map((cell) =>
                cell.inMonth ? (
                  <button
                    key={cell.date}
                    type="button"
                    className={cell.date === today ? "gcal-year-date is-today" : "gcal-year-date"}
                    onClick={() => onOpenDay(cell.date)}
                  >
                    {getDayNumber(cell.date)}
                  </button>
                ) : (
                  <span key={cell.date} className="gcal-year-date is-empty" />
                ),
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
