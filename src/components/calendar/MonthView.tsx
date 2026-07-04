import { DragEvent } from "react";
import type { CalendarItem } from "../../utils/calendarItems";
import { getDayNumber, getMonthGrid, todayValue, type CalendarCell } from "../../utils/date";
import { anchorFromRect, type PopoverAnchor } from "./EventPopover";
import { useT } from "../../i18n";

// Sunday-first order preserved to match the date grid logic (getMonthGrid).
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];
// Spec §5.5: 128px cells fit at most 5 compact 18px chips before "+N".
const CHIP_CAP = 5;

function layerPrefix(layer: CalendarItem["layer"]) {
  if (layer === "deadline") return "⚠ ";
  if (layer === "study-review") return "↻ ";
  if (layer === "project-deadline") return "◆ ";
  if (layer === "external") return "• ";
  if (layer === "focus-actual") return "⏱ ";
  return "";
}

interface MonthViewProps {
  anchor: string;
  items: CalendarItem[];
  dragOverId: string;
  onDragStart: (event: DragEvent, itemKey: string) => void;
  onOverCell: (id: string) => (event: DragEvent) => void;
  onLeaveCell: (id: string) => () => void;
  onDropCell: (event: DragEvent, date: string) => void;
  onClickItem: (item: CalendarItem, anchor: PopoverAnchor) => void;
  onClickCell: (date: string) => void;
  onOpenDay: (date: string) => void;
  onShowAgenda: (date: string, anchor: PopoverAnchor) => void;
}

export function MonthView({
  anchor,
  items,
  dragOverId,
  onDragStart,
  onOverCell,
  onLeaveCell,
  onDropCell,
  onClickItem,
  onClickCell,
  onOpenDay,
  onShowAgenda,
}: MonthViewProps) {
  const { t, lang } = useT();
  const weekdays = lang === "ko" ? WEEKDAYS_KO : WEEKDAYS_EN;
  const today = todayValue();
  const anchorDate = new Date(`${anchor}T00:00:00`);
  const cells = getMonthGrid(anchorDate.getFullYear(), anchorDate.getMonth());

  function renderCell(cell: CalendarCell) {
    const dayItems = items.filter((item) => item.date === cell.date);
    const classes = ["gcal-month-cell"];
    if (!cell.inMonth) classes.push("is-outside");
    if (cell.date === today) classes.push("is-today");
    else if (cell.date === anchor) classes.push("is-selected");
    if (cell.date === dragOverId) classes.push("is-drop");
    const visible = dayItems.slice(0, CHIP_CAP);

    return (
      <div
        key={cell.date}
        className={classes.join(" ")}
        onDragOver={onOverCell(cell.date)}
        onDragLeave={onLeaveCell(cell.date)}
        onDrop={(event) => onDropCell(event, cell.date)}
        onClick={(event) => {
          // Spec §5.6: click selects the date, double-click opens the day view.
          if (event.target === event.currentTarget) onClickCell(cell.date);
        }}
        onDoubleClick={(event) => {
          if (event.target === event.currentTarget) onOpenDay(cell.date);
        }}
      >
        <span className="gcal-month-date">{getDayNumber(cell.date)}</span>
        <div className="gcal-month-chip-list">
          {visible.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`gcal-chip gcal-chip-${item.layer}${item.repeating ? " is-repeating" : ""}`}
              draggable={item.draggable}
              onDragStart={item.draggable ? (event) => onDragStart(event, item.sourceId) : undefined}
              onClick={(event) => {
                event.stopPropagation();
                onClickItem(item, anchorFromRect(event.currentTarget.getBoundingClientRect()));
              }}
              style={
                item.layer === "task" || item.layer === "external" || item.layer === "focus-actual"
                  ? { borderLeftColor: item.color }
                  : undefined
              }
            >
              {layerPrefix(item.layer)}
              {item.repeating ? "↺ " : null}
              {item.title}
            </button>
          ))}
          {dayItems.length > CHIP_CAP ? (
            <button
              type="button"
              className="gcal-month-more"
              onClick={(event) => {
                event.stopPropagation();
                onShowAgenda(cell.date, anchorFromRect(event.currentTarget.getBoundingClientRect()));
              }}
            >
              {t("calendar.moreCount", { n: dayItems.length - CHIP_CAP })}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="gcal-month-weekdays">
        {weekdays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="gcal-month-grid">{cells.map(renderCell)}</div>
    </>
  );
}
