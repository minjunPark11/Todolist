import { CSSProperties, DragEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CalendarItem } from "../../utils/calendarItems";
import { getDayNumber, getMonthGrid, rotateWeekdays, todayValue, type CalendarCell } from "../../utils/date";
import { formatClock } from "../../utils/clock";
import { useTimeFormat, useWeekStart } from "../../utils/appPrefs";
import { chipCapFor, MONTH_CELL_MIN_HEIGHT } from "../../utils/monthCell";
import { anchorFromRect, type PopoverAnchor } from "./EventPopover";
import { useT } from "../../i18n";
import { MotionDropZone } from "../motion/MotionDropZone";
import { reducedTransition, transitions } from "../../motion/transitions";
import { calendarBlockVariants } from "../../motion/variants";
import { useMotionEnabled } from "../../motion/reducedMotion";

// Written Sunday-first; `rotateWeekdays` turns them to match the grid when the
// week starts on Monday (SETTINGS_REVIEW.md 4.3).
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];


function layerPrefix(layer: CalendarItem["layer"]) {
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
  const weekStart = useWeekStart();
  const timeFormat = useTimeFormat();
  const clockLocale = lang === "ko" ? "ko" : "en";
  const weekdays = rotateWeekdays(lang === "ko" ? WEEKDAYS_KO : WEEKDAYS_EN, weekStart);
  const today = todayValue();
  const anchorDate = new Date(`${anchor}T00:00:00`);
  const cells = getMonthGrid(anchorDate.getFullYear(), anchorDate.getMonth(), weekStart);

  // The cell height is what decides how many chips fit, and D8 made it follow
  // the window — so it is measured rather than assumed. One measurement covers
  // every cell: the six rows are `1fr` and therefore equal.
  const gridRef = useRef<HTMLDivElement>(null);
  const [cellHeight, setCellHeight] = useState(MONTH_CELL_MIN_HEIGHT);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const rows = getComputedStyle(el).gridTemplateRows.split(" ").filter(Boolean).length || 6;
      setCellHeight(el.getBoundingClientRect().height / rows);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function renderCell(cell: CalendarCell) {
    const dayItems = items.filter((item) => item.date === cell.date);
    const classes = ["gcal-month-cell"];
    if (!cell.inMonth) classes.push("is-outside");
    if (cell.date === today) classes.push("is-today");
    else if (cell.date === anchor) classes.push("is-selected");
    if (cell.date === dragOverId) classes.push("is-drop");
    const cap = chipCapFor(cellHeight, dayItems.length);
    const visible = dayItems.slice(0, cap);

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
                item.done ? "is-done" : "",
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
                <span className="gcal-chip-time">{formatClock(item.startTime ?? "", timeFormat, clockLocale)}</span>
              ) : null}
            </motion.button>
          ))}
          </AnimatePresence>
          {dayItems.length > cap ? (
            <button
              type="button"
              className="gcal-month-more"
              onClick={(event) => {
                event.stopPropagation();
                onShowAgenda(cell.date, anchorFromRect(event.currentTarget.getBoundingClientRect()));
              }}
            >
              {t("calendar.moreCount", { n: dayItems.length - cap })}
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
      <div className="gcal-month-grid" ref={gridRef}>
        {cells.map(renderCell)}
      </div>
    </>
  );
}
