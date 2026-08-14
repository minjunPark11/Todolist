import { CSSProperties, DragEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CalendarItem } from "../../utils/calendarItems";
import { getDayNumber, getMonthGrid, todayValue, type CalendarCell } from "../../utils/date";
import { anchorFromRect, type PopoverAnchor } from "./EventPopover";
import { useT } from "../../i18n";
import { MotionDropZone } from "../motion/MotionDropZone";
import { reducedTransition, transitions } from "../../motion/transitions";
import { calendarBlockVariants } from "../../motion/variants";
import { useMotionEnabled } from "../../motion/reducedMotion";

// Sunday-first order preserved to match the date grid logic (getMonthGrid).
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];
// Spec §5.5: 128px cells fit at most 5 compact 18px chips before "+N".
const CHIP_CAP = 5;

function layerPrefix(layer: CalendarItem["layer"]) {
  if (layer === "deadline") return "⚠ ";
  if (layer === "project-deadline") return "◆ ";
  if (layer === "external") return "• ";
  if (layer === "focus-actual") return "⏱ ";
  return "";
}

interface MonthViewProps {
  anchor: string;
  items: CalendarItem[];
  /** Key of the item carrying the selection ring; "" when nothing is picked. */
  selectedKey: string;
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
  selectedKey,
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
  const motionEnabled = useMotionEnabled();
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
      <MotionDropZone
        as="div"
        key={cell.date}
        isOver={cell.date === dragOverId}
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
          <AnimatePresence initial={false}>
          {visible.map((item) => (
            <motion.button
              key={item.key}
              type="button"
              variants={motionEnabled ? calendarBlockVariants : undefined}
              initial={motionEnabled ? "initial" : false}
              animate={motionEnabled ? "animate" : undefined}
              exit={motionEnabled ? "exit" : undefined}
              transition={motionEnabled ? transitions.soft : reducedTransition}
              className={[
                "gcal-chip",
                `gcal-chip-${item.layer}`,
                // A timed item is not an occupation of the whole day, so it is
                // not drawn as a filled pill: `is-timed` turns it into a dot +
                // title + start time. Filled pills stay for all-day items, and
                // a month cell with three of each stops being a block of
                // colour (CALENDAR_APPLE_DESIGN.md D4).
                item.allDay ? "" : "is-timed",
                item.key === selectedKey ? "is-picked" : "",
                item.repeating ? "is-repeating" : "",
                item.status === "done" ? "is-done" : "",
              ].filter(Boolean).join(" ")}
              draggable={item.draggable}
              onDragStartCapture={
                item.draggable ? (event) => onDragStart(event, item.sourceId) : undefined
              }
              onClick={(event) => {
                event.stopPropagation();
                onClickItem(item, anchorFromRect(event.currentTarget.getBoundingClientRect()));
              }}
              // Hue now comes from the category for every layer, so the colour
              // is handed to CSS the same way for all of them.
              style={{ ["--ev-color"]: item.color } as CSSProperties}
            >
              <span className="gcal-chip-label">
                {layerPrefix(item.layer)}
                {item.repeating ? "↺ " : null}
                {item.title}
              </span>
              {!item.allDay && item.startTime ? (
                <span className="gcal-chip-time">{item.startTime}</span>
              ) : null}
            </motion.button>
          ))}
          </AnimatePresence>
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
      </MotionDropZone>
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
