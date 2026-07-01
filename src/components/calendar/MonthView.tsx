import { DragEvent } from "react";
import type { CalendarItem } from "../../utils/calendarItems";
import { getDayNumber, getMonthGrid, todayValue, type CalendarCell } from "../../utils/date";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CHIP_CAP = 3;

function layerPrefix(layer: CalendarItem["layer"]) {
  if (layer === "deadline") return "⚠ ";
  if (layer === "study-review") return "↻ ";
  if (layer === "project-deadline") return "◆ ";
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
  onClickItem: (item: CalendarItem) => void;
  onClickCell: (date: string) => void;
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
}: MonthViewProps) {
  const today = todayValue();
  const anchorDate = new Date(`${anchor}T00:00:00`);
  const cells = getMonthGrid(anchorDate.getFullYear(), anchorDate.getMonth());

  function renderCell(cell: CalendarCell) {
    const dayItems = items.filter((item) => item.date === cell.date);
    const classes = ["gcal-month-cell"];
    if (!cell.inMonth) classes.push("is-outside");
    if (cell.date === today) classes.push("is-today");
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
          if (event.target === event.currentTarget) onClickCell(cell.date);
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
                onClickItem(item);
              }}
              style={item.layer === "task" ? { borderLeftColor: item.color } : undefined}
            >
              {layerPrefix(item.layer)}
              {item.repeating ? "↺ " : null}
              {item.title}
            </button>
          ))}
          {dayItems.length > CHIP_CAP ? (
            <span className="gcal-month-more">+{dayItems.length - CHIP_CAP} more</span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="gcal-month-weekdays">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="gcal-month-grid">{cells.map(renderCell)}</div>
    </>
  );
}
