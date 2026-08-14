// Year view (FOCUSFLOW_CALENDAR_FINAL_IMPLEMENTATION_SPEC §8):
// 12 months in a 4x3 grid, date numbers only — no event chips, no detail
// panel. Month title → month view, date → day view.
//
// Each date is shaded by how much sits on it (CALENDAR_APPLE_DESIGN.md C2), so
// the busy stretches of a year are visible without opening a single month.
import { CSSProperties, useMemo } from "react";
import { getDayNumber, getMonthGrid, todayValue } from "../../utils/date";
import { useT } from "../../i18n";

const WEEKDAYS_EN = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

// Saturates at 5 items: past that the exact count stops mattering, and a
// deeper tint would start competing with the today marker.
const DENSITY_CAP = 5;

interface YearViewProps {
  anchor: string;
  countsByDate: Map<string, number>;
  onOpenMonth: (date: string) => void;
  onOpenDay: (date: string) => void;
}

export function YearView({ anchor, countsByDate, onOpenMonth, onOpenDay }: YearViewProps) {
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
              {cells.map((cell) => {
                if (!cell.inMonth) return <span key={cell.date} className="gcal-year-date is-empty" />;
                const count = Math.min(countsByDate.get(cell.date) ?? 0, DENSITY_CAP);
                return (
                  <button
                    key={cell.date}
                    type="button"
                    className={cell.date === today ? "gcal-year-date is-today" : "gcal-year-date"}
                    // Today keeps its own marker; density would only muddy it.
                    style={
                      count > 0 && cell.date !== today
                        ? ({ "--density": `${count * 6}%` } as CSSProperties)
                        : undefined
                    }
                    title={count > 0 ? String(countsByDate.get(cell.date)) : undefined}
                    onClick={() => onOpenDay(cell.date)}
                  >
                    {getDayNumber(cell.date)}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
