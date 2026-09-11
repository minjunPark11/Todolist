import { CSSProperties, DragEvent, memo, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CalendarItem } from "../../utils/calendarItems";
import { getDayNumber, getMonthGrid, rotateWeekdays, todayValue, type CalendarCell } from "../../utils/date";
import { formatClock } from "../../utils/clock";
import { useTimeFormat, useWeekStart } from "../../utils/appPrefs";
import { chipCapFor, MONTH_CELL_MIN_HEIGHT } from "../../utils/monthCell";
import { anchorFromRect, type PopoverAnchor } from "./EventPopover";
import { eventColorVars } from "./eventColorVars";
import { activateOnKey } from "./blockActivation";
import { CalendarItemCheck } from "./CalendarItemCheck";
import { useT } from "../../i18n";
import type { TimeFormat } from "../../types";
import { useStableCallback } from "../../hooks/useStableCallback";
import { MotionDropZone } from "../motion/MotionDropZone";
import { reducedTransition, transitions } from "../../motion/transitions";
import { calendarBlockVariants } from "../../motion/variants";
import { useMotionEnabled } from "../../motion/reducedMotion";

// Written Sunday-first; `rotateWeekdays` turns them to match the grid when the
// week starts on Monday (SETTINGS_REVIEW.md 4.3).
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

// One array for every empty day, so an empty cell is not handed a new one.
const NO_ITEMS: CalendarItem[] = [];


function layerPrefix(layer: CalendarItem["layer"]) {
  if (layer === "external") return "• ";
  if (layer === "focus-actual") return "⏱ ";
  return "";
}

/**
 * One day of the month.
 *
 * Memoized, because the grid redraws for reasons that concern one cell or
 * none. Dragging an event over the month sets `dragOverId` on every dragover
 * event, and that used to rebuild all six weeks — forty-two cells and every
 * chip in them — to move one highlight. Picking a chip and scrolling did the
 * same.
 *
 * `dayItems` is the cell's own slice, handed in already made: filtering the
 * week's items per cell was also a full pass over every event, once per cell.
 * The handlers come from the grid and are stable for as long as it is mounted,
 * so the shallow compare comes down to this cell's own items and its own two
 * booleans.
 */
interface MonthCellProps {
  cell: CalendarCell;
  dayItems: CalendarItem[];
  cellHeight: number;
  /**
   * This cell's own answers, not the grid's state.
   *
   * These were `dragOverId` and the whole `selectedKey`, which every cell
   * compared against its own date. That is a changed prop on all forty-two
   * cells every time either one moves — so dragging across the month redrew
   * the month, to move one outline. Narrowed to the question each cell
   * actually asks, only the two cells that change answer re-render.
   */
  isOver: boolean;
  /** The picked key when it belongs to a chip in THIS cell, else "". */
  selectedKey: string;
  today: string;
  anchor: string;
  motionEnabled: boolean;
  timeFormat: TimeFormat;
  clockLocale: "ko" | "en";
  t: (key: string, vars?: Record<string, string | number>) => string;
  onDragStart: (event: DragEvent, itemKey: string) => void;
  onOverCell: (id: string) => (event: DragEvent) => void;
  onLeaveCell: (id: string) => () => void;
  onDropCell: (event: DragEvent, date: string) => void;
  onClickItem: (item: CalendarItem, anchor: PopoverAnchor) => void;
  onToggleDone?: (taskId: string) => void;
  onClickCell: (date: string) => void;
  onOpenDay: (date: string) => void;
  onShowAgenda: (date: string, anchor: PopoverAnchor) => void;
}

const MonthCell = memo(function MonthCell({
  cell,
  dayItems,
  cellHeight,
  isOver,
  selectedKey,
  today,
  anchor,
  motionEnabled,
  timeFormat,
  clockLocale,
  t,
  onDragStart,
  onOverCell,
  onLeaveCell,
  onDropCell,
  onClickItem,
  onToggleDone,
  onClickCell,
  onOpenDay,
  onShowAgenda,
}: MonthCellProps) {
  const classes = ["gcal-month-cell"];
  if (!cell.inMonth) classes.push("is-outside");
  if (cell.date === today) classes.push("is-today");
  else if (cell.date === anchor) classes.push("is-selected");
  if (isOver) classes.push("is-drop");
  const cap = chipCapFor(cellHeight, dayItems.length);
  const visible = dayItems.slice(0, cap);

  return (
    <MotionDropZone
      as="div"
      isOver={isOver}
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
          <motion.div
            key={item.key}
            // §2.1/D2-A — see WeekView: a chip holds a checkbox now.
            role="button"
            tabIndex={0}
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
            onKeyDown={activateOnKey<HTMLDivElement>((event) => {
              onClickItem(item, anchorFromRect(event.currentTarget.getBoundingClientRect()));
            })}
            // Hue now comes from the category for every layer, so the colour
            // is handed to CSS the same way for all of them.
            style={eventColorVars(item.color)}
          >
            {/* §8: the same box at the month's smaller size. A timed chip
                is a dot + title on the cell's own ground (D4/B2), and the
                box sits before the dot the way it sits before a pill. */}
            <CalendarItemCheck item={item} onToggleDone={onToggleDone} size="month" />
            <span className="gcal-chip-label">
              {layerPrefix(item.layer)}
              {item.repeating ? "↺ " : null}
              {item.title}
            </span>
            {!item.allDay && item.startTime ? (
              <span className="gcal-chip-time">{formatClock(item.startTime ?? "", timeFormat, clockLocale)}</span>
            ) : null}
          </motion.div>
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
});

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
  /**
   * Finish a task from the grid (CALENDAR_TASK_CHECKBOX_DESIGN.md §7).
   *
   * `planner.toggleTaskDone`, not a `status` patch: it writes `completedAt`
   * alongside the status, rolls a repeating task to its next occurrence, and
   * arrives through `setData` so Ctrl+Z picks it up. A shortcut through
   * `onUpdateTask` would silently drop all three.
   */
  onToggleDone?: (taskId: string) => void;
  onClickCell: (date: string) => void;
  onOpenDay: (date: string) => void;
  onShowAgenda: (date: string, anchor: PopoverAnchor) => void;
}

export function MonthView({
  anchor,
  items,
  selectedKey,
  dragOverId,
  onDragStart: onDragStartProp,
  onOverCell: onOverCellProp,
  onLeaveCell: onLeaveCellProp,
  onDropCell: onDropCellProp,
  onClickItem: onClickItemProp,
  onToggleDone: onToggleDoneProp,
  onClickCell: onClickCellProp,
  onOpenDay: onOpenDayProp,
  onShowAgenda: onShowAgendaProp,
}: MonthViewProps) {
  /**
   * Every handler the cells hold, fixed for as long as the grid is mounted.
   *
   * `CalendarView` writes all of them inline, so each is a new function on
   * every render of the page — and every cell holds every one. Left alone they
   * are nine changed props on all forty-two cells, and `MonthCell`'s memo
   * never gets to answer "no" about anything.
   *
   * `t` is not among them: the i18n provider already memoizes it.
   */
  const onDragStart = useStableCallback(onDragStartProp);
  const onOverCell = useStableCallback(onOverCellProp);
  const onLeaveCell = useStableCallback(onLeaveCellProp);
  const onDropCell = useStableCallback(onDropCellProp);
  const onClickItem = useStableCallback(onClickItemProp);
  // Stable, but still absent when the caller gave nothing: `CalendarItemCheck`
  // draws no box without a handler, so a wrapper that is always a function
  // would put a dead checkbox on every item the caller meant to leave alone.
  const onToggleDoneStable = useStableCallback((taskId: string) => onToggleDoneProp?.(taskId));
  const onToggleDone = onToggleDoneProp ? onToggleDoneStable : undefined;
  const onClickCell = useStableCallback(onClickCellProp);
  const onOpenDay = useStableCallback(onOpenDayProp);
  const onShowAgenda = useStableCallback(onShowAgendaProp);
  const { t, lang } = useT();
  const motionEnabled = useMotionEnabled();
  const weekStart = useWeekStart();
  const timeFormat = useTimeFormat();
  const clockLocale = lang === "ko" ? "ko" : "en";
  const weekdays = rotateWeekdays(lang === "ko" ? WEEKDAYS_KO : WEEKDAYS_EN, weekStart);
  const today = todayValue();
  // Memoized because each cell is a prop of a memoized `MonthCell`, and
  // `getMonthGrid` builds fresh objects every time it is asked: rebuilt each
  // render it would be a changed prop on all forty-two of them, which is the
  // one thing that would make the memo below pointless.
  const cells = useMemo(() => {
    const anchorDate = new Date(`${anchor}T00:00:00`);
    return getMonthGrid(anchorDate.getFullYear(), anchorDate.getMonth(), weekStart);
  }, [anchor, weekStart]);

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

  // Indexed once rather than filtered per cell: the grid asks this question
  // for every day it draws, and `items.filter` per cell is a full pass over
  // the month's events forty-two times over.
  const itemsByDate = useMemo(() => {
    const out = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const day = out.get(item.date);
      if (day) day.push(item);
      else out.set(item.date, [item]);
    }
    return out;
  }, [items]);

  // The picked key belongs to one day. Handing the raw `selectedKey` to every
  // cell would make picking a chip a changed prop on all of them.
  const selectedKeyByDate = useMemo(() => {
    const out = new Map<string, string>();
    const picked = items.find((item) => item.key === selectedKey);
    if (picked) out.set(picked.date, selectedKey);
    return out;
  }, [items, selectedKey]);


  return (
    <>
      <div className="gcal-month-weekdays">
        {weekdays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="gcal-month-grid" ref={gridRef}>
        {cells.map((cell) => (
          <MonthCell
            key={cell.date}
            cell={cell}
            dayItems={itemsByDate.get(cell.date) ?? NO_ITEMS}
            cellHeight={cellHeight}
            isOver={cell.date === dragOverId}
            selectedKey={selectedKeyByDate.get(cell.date) ?? ""}
            today={today}
            anchor={anchor}
            motionEnabled={motionEnabled}
            timeFormat={timeFormat}
            clockLocale={clockLocale}
            t={t}
            onDragStart={onDragStart}
            onOverCell={onOverCell}
            onLeaveCell={onLeaveCell}
            onDropCell={onDropCell}
            onClickItem={onClickItem}
            onToggleDone={onToggleDone}
            onClickCell={onClickCell}
            onOpenDay={onOpenDay}
            onShowAgenda={onShowAgenda}
          />
        ))}
      </div>
    </>
  );
}
