import { CSSProperties, DragEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CalendarItem } from "../../utils/calendarItems";
import {
  clickDefaultRange,
  clampMinutes,
  minutesFromPointerY,
  minutesToTime,
  shouldStartTimeSelection,
  snapDownToStep,
  snapUpToStep,
  snappedDragRange,
  DAY_END,
  DAY_START,
  SLOT_HEIGHT,
  TIME_SNAP_MINUTES,
  type CalendarDraftBlock,
} from "../../utils/calendarTime";
import { getDayNumber, todayValue } from "../../utils/date";
import { anchorFromRect, type PopoverAnchor } from "./EventPopover";
import { OverlayScrollbar } from "../common/OverlayScrollbar";
import { useT } from "../../i18n";
import { MotionDropZone } from "../motion/MotionDropZone";
import { reducedTransition, transitions } from "../../motion/transitions";
import { calendarBlockVariants } from "../../motion/variants";
import { useMotionEnabled } from "../../motion/reducedMotion";

export { DAY_END, DAY_START, SLOT_HEIGHT };

// Overlapping blocks split the column side-by-side (Google Calendar style):
// greedy column assignment inside each overlap cluster; every block in a
// cluster shares the cluster's column count so widths line up.
function computeOverlapLayout(entries: { key: string; start: number; end: number }[]) {
  const sorted = [...entries].sort((a, b) => a.start - b.start || b.end - a.end);
  const layout = new Map<string, { col: number; cols: number }>();
  let cluster: { key: string; col: number }[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;

  function flush() {
    for (const entry of cluster) layout.set(entry.key, { col: entry.col, cols: colEnds.length });
    cluster = [];
    colEnds = [];
    clusterEnd = -1;
  }

  for (const entry of sorted) {
    if (cluster.length > 0 && entry.start >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= entry.start);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(entry.end);
    } else {
      colEnds[col] = entry.end;
    }
    cluster.push({ key: entry.key, col });
    clusterEnd = Math.max(clusterEnd, entry.end);
  }
  flush();
  return layout;
}
const timeLabelFormatter = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hour12: false });

// V3 §2.1: only the live drag preview lives here; the confirmed draft is
// owned by CalendarView (it must survive across pointer gestures / re-renders).
interface LiveSelection {
  day: string;
  pointerId: number;
  startClientY: number;
  startMinutes: number;
  currentMinutes: number;
}

// Spec §6.9: resize an event block from its top/bottom edge, 15-minute snap.
interface LiveResize {
  key: string;
  sourceId: string;
  day: string;
  edge: "start" | "end";
  startMin: number;
  endMin: number;
}

// Pointer-based block move (no HTML5 drag ghost): the block itself follows
// the cursor with a 15-minute snap; horizontal movement switches the day.
// While a move is live the original block is hidden and a single overlay
// block is drawn in the target column — no duplicate visuals.
interface LiveMove {
  key: string;
  sourceId: string;
  title: string;
  color: string;
  repeating: boolean;
  day: string;
  startMin: number;
  endMin: number;
  // Becomes true after the pointer travels past the click threshold; until
  // then nothing is drawn and pointerup falls through to a normal click.
  moved: boolean;
  // True while the pointer hovers the all-day band: dropping there converts
  // the block to an all-day item (the date kept, times cleared).
  allDay: boolean;
}

const ALLDAY_MIN_HEIGHT = 32;
const ALLDAY_MAX_HEIGHT = 320;
const ALLDAY_HEIGHT_STORAGE_KEY = "focusflow.calendar.alldayHeight";

function loadAlldayHeight(): number | null {
  try {
    const raw = window.localStorage.getItem(ALLDAY_HEIGHT_STORAGE_KEY);
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    return Math.min(ALLDAY_MAX_HEIGHT, Math.max(ALLDAY_MIN_HEIGHT, Math.round(value)));
  } catch {
    return null;
  }
}

function asDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function timeToMinutesOrNull(value: string): number | null {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function heightFor(startMin: number, endMin: number) {
  return Math.max(((endMin - startMin) / 60) * SLOT_HEIGHT, 24);
}

interface WeekViewProps {
  days: string[];
  anchor: string;
  items: CalendarItem[];
  /** Key of the item carrying the selection ring; "" when nothing is picked. */
  selectedKey: string;
  dragOverId: string;
  onOverSlot: (id: string) => (event: DragEvent) => void;
  onLeaveSlot: (id: string) => () => void;
  onDragHover: (day: string, startTime: string) => void;
  onDropTime: (event: DragEvent, day: string, startTime: string) => void;
  onDropAllDay: (event: DragEvent, day: string) => void;
  onClickItem: (item: CalendarItem, anchor: PopoverAnchor) => void;
  onClickAllDaySlot: (day: string) => void;
  onResizeItem: (sourceId: string, day: string, startTime: string, endTime: string) => void;
  onMoveItem: (sourceId: string, day: string, startTime: string, endTime: string) => void;
  onMoveItemToAllDay: (sourceId: string, day: string) => void;
  durationForSource: (sourceId: string) => number;
  draft: CalendarDraftBlock | null;
  dragPreview: {
    taskId: string;
    day: string;
    startTime: string;
    endTime: string;
    isValid: boolean;
  } | null;
  draggingTaskTitle: string;
  aiPlacements: Array<{
    taskId: string;
    day: string;
    startTime: string;
    endTime: string;
    title: string;
  }>;
  onSelectionStart: () => void;
  onDraftCreate: (day: string, startTime: string, endTime: string, anchor: PopoverAnchor) => void;
}

export function WeekView({
  days,
  anchor,
  items,
  selectedKey,
  dragOverId,
  onOverSlot,
  onLeaveSlot,
  onDragHover,
  onDropTime,
  onDropAllDay,
  onClickItem,
  onClickAllDaySlot,
  onResizeItem,
  onMoveItem,
  onMoveItemToAllDay,
  durationForSource,
  draft,
  dragPreview,
  draggingTaskTitle,
  aiPlacements,
  onSelectionStart,
  onDraftCreate,
}: WeekViewProps) {
  const { t, lang } = useT();
  const motionEnabled = useMotionEnabled();
  const weekdayFormatter = useMemo(
    () => new Intl.DateTimeFormat(lang === "ko" ? "ko" : "en", { weekday: "short" }),
    [lang],
  );
  const longWeekdayFormatter = useMemo(
    () => new Intl.DateTimeFormat(lang === "ko" ? "ko" : "en", { weekday: "long" }),
    [lang],
  );
  const dayTitleFormatter = useMemo(
    () => new Intl.DateTimeFormat(lang === "ko" ? "ko" : "en", { year: "numeric", month: "long", day: "numeric" }),
    [lang],
  );
  const [selection, setSelection] = useState<LiveSelection | null>(null);
  const [resize, setResize] = useState<LiveResize | null>(null);
  // Mirrors `resize` so the pointerup listener can read the final range
  // without doing side effects inside a setState updater.
  const resizeRef = useRef<LiveResize | null>(null);
  const [move, setMove] = useState<LiveMove | null>(null);
  const moveRef = useRef<LiveMove | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const alldayRowRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  // User-resizable all-day band height (null = automatic sizing).
  const [alldayHeight, setAlldayHeight] = useState<number | null>(loadAlldayHeight);
  const isDay = days.length === 1;

  // The grid normally starts at DAY_START, but an item that ends before that
  // has nowhere to render — it used to be dropped from the view with no trace,
  // so an early-morning block simply looked deleted. Growing the window down
  // to the earliest item on screen keeps the compact 06:00 start for ordinary
  // weeks while making sure nothing is ever silently unrenderable.
  const dayKey = days.join(",");
  const gridStartHour = useMemo(() => {
    let earliestMin = DAY_START * 60;
    for (const item of items) {
      if (!days.includes(item.date)) continue;
      const startMin = timeToMinutesOrNull(item.startTime ?? "");
      if (startMin === null) continue;
      if (startMin < earliestMin) earliestMin = startMin;
    }
    return Math.max(0, Math.floor(earliestMin / 60));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, dayKey]);
  const gridStartMin = gridStartHour * 60;
  const hours = useMemo(
    () => Array.from({ length: DAY_END - gridStartHour }, (_, index) => gridStartHour + index),
    [gridStartHour],
  );

  function topFor(minutes: number) {
    return ((minutes - gridStartMin) / 60) * SLOT_HEIGHT;
  }

  const today = todayValue();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNowLine = days.includes(today) && nowMinutes >= gridStartMin && nowMinutes <= DAY_END * 60;
  const nowTop = topFor(nowMinutes);
  const nowLabel = timeLabelFormatter.format(now);

  // Spec §6.4: rows are never compressed — the body scrolls instead, opening
  // near the current time (or 08:00 when the view has no "today").
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = days.includes(today) ? Math.max(gridStartMin, nowMinutes - 60) : 8 * 60;
    el.scrollTop = Math.max(0, topFor(target));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey, gridStartMin]);

  const hasAnyItemInView = items.some((item) => days.includes(item.date));
  const showEmptyHint = !hasAnyItemInView && !draft && !selection;

  // The grid renders inside the app shell's `zoom: 0.9` density scaling, so
  // one layout pixel is NOT one screen pixel — and engines disagree on how
  // zoomed coordinates are reported (WebView2/WKWebView vs. browser versions).
  // Deriving the effective scale from the measured height is correct under
  // any zoom/transform, so pointer math never assumes a fixed ratio.
  function timeGridScaleFromRect(rect: DOMRect): number {
    const layoutHeight = (DAY_END - gridStartHour) * SLOT_HEIGHT;
    return rect.height > 0 ? rect.height / layoutHeight : 1;
  }

  function timeGridBodyRect(): DOMRect | null {
    const body = scrollRef.current?.querySelector<HTMLElement>(".gcal-timegrid-body");
    return body ? body.getBoundingClientRect() : null;
  }

  function minutesFromTimeGridPointerY(clientY: number): number {
    // Measure against the body's live on-screen rect: getBoundingClientRect
    // already reflects the current scroll position, so we don't juggle
    // scrollTop/offsetTop (which broke when the scroller isn't the body's
    // offsetParent — the sticky header's height then leaked in as an offset).
    const rect = timeGridBodyRect();
    if (rect) {
      const offsetY = clientY - rect.top;
      const scale = timeGridScaleFromRect(rect);
      return clampMinutes(gridStartMin + (offsetY / (SLOT_HEIGHT * scale)) * 60, gridStartMin, DAY_END * 60);
    }
    return minutesFromPointerY(clientY, 0);
  }

  // Now-indicator geometry: one grid-wide overlay (badge in the time gutter,
  // muted line across all days, solid segment + dot over today's column).
  const todayIndex = days.indexOf(today);
  const nowTodayLeft = `calc(56px + (100% - 56px) * ${todayIndex} / ${days.length})`;
  const nowTodayWidth = `calc((100% - 56px) / ${days.length})`;

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>, day: string) {
    if (event.button !== 0) return;
    if (resize || move) return;
    if (!shouldStartTimeSelection(event.target)) return;
    const startMinutes = minutesFromTimeGridPointerY(event.clientY);
    // §9.7: capture so a drag ending outside the grid still reaches pointerup.
    // Defensive — some browsers reject capture for edge-case pointer sessions;
    // the selection still works via direct pointermove/up listeners either way.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore — capture is a best-effort enhancement, not a requirement.
    }
    setSelection({
      day,
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startMinutes,
      currentMinutes: startMinutes,
    });
    onSelectionStart();
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!selection || event.pointerId !== selection.pointerId) return;
    const currentMinutes = minutesFromTimeGridPointerY(event.clientY);
    setSelection((current) => (current ? { ...current, currentMinutes } : current));
  }

  function finalizeSelection(sel: LiveSelection, movedPixels: number, columnRect: DOMRect) {
    let startMin: number;
    let endMin: number;
    if (movedPixels <= 4) {
      ({ startMin, endMin } = clickDefaultRange(sel.startMinutes));
    } else {
      ({ startMin, endMin } = snappedDragRange(sel.startMinutes, sel.currentMinutes));
    }
    if (endMin - startMin < TIME_SNAP_MINUTES) return;
    // columnRect is in screen px while topFor/heightFor are layout px —
    // convert with the measured scale so the popover anchors to the block.
    const bodyRect = timeGridBodyRect();
    const scale = bodyRect ? timeGridScaleFromRect(bodyRect) : 1;
    const top = columnRect.top + topFor(startMin) * scale;
    onDraftCreate(sel.day, minutesToTime(startMin), minutesToTime(endMin), {
      left: columnRect.left,
      right: columnRect.right,
      top,
      bottom: top + heightFor(startMin, endMin) * scale,
    });
  }

  function releaseCaptureSafely(target: HTMLDivElement, pointerId: number) {
    try {
      target.releasePointerCapture(pointerId);
    } catch {
      // ignore — nothing to release if capture was never established.
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!selection || event.pointerId !== selection.pointerId) return;
    releaseCaptureSafely(event.currentTarget, event.pointerId);
    finalizeSelection(selection, Math.abs(event.clientY - selection.startClientY), event.currentTarget.getBoundingClientRect());
    setSelection(null);
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (!selection || event.pointerId !== selection.pointerId) return;
    releaseCaptureSafely(event.currentTarget, event.pointerId);
    setSelection(null);
  }

  function startResize(
    event: ReactPointerEvent<HTMLElement>,
    item: CalendarItem,
    edge: "start" | "end",
    startMin: number,
    endMin: number,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const column = (event.currentTarget as HTMLElement).closest(".gcal-time-col");
    if (!column) return;
    const state: LiveResize = { key: item.key, sourceId: item.sourceId, day: item.date, edge, startMin, endMin };
    resizeRef.current = state;
    setResize(state);

    function onMove(move: PointerEvent) {
      const minutes = minutesFromTimeGridPointerY(move.clientY);
      const current = resizeRef.current;
      if (!current) return;
      let next: LiveResize;
      if (current.edge === "start") {
        const value = Math.min(snapDownToStep(minutes), current.endMin - TIME_SNAP_MINUTES);
        next = { ...current, startMin: Math.max(gridStartMin, value) };
      } else {
        const value = Math.max(snapUpToStep(minutes), current.startMin + TIME_SNAP_MINUTES);
        next = { ...current, endMin: Math.min(DAY_END * 60, value) };
      }
      resizeRef.current = next;
      setResize(next);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      const current = resizeRef.current;
      resizeRef.current = null;
      setResize(null);
      if (current) {
        onResizeItem(current.sourceId, current.day, minutesToTime(current.startMin), minutesToTime(current.endMin));
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  // fromAllDay: the gesture started on an all-day chip, which has no
  // existing time-slot position — the block's duration (and grab offset)
  // fall back to the source task's usual estimate instead of the block's
  // current start/end.
  function startMove(
    event: ReactPointerEvent<HTMLElement>,
    item: CalendarItem,
    startMin: number,
    endMin: number,
    fromAllDay = false,
  ) {
    if (event.button !== 0) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    event.preventDefault();
    const duration = fromAllDay ? Math.max(TIME_SNAP_MINUTES, durationForSource(item.sourceId)) : endMin - startMin;
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    // Keep the grab point stable: the block moves relative to where it was
    // grabbed instead of snapping its top edge to the cursor. An all-day
    // origin has no meaningful grab point yet, so it snaps from the top.
    const grabOffsetMin = fromAllDay ? 0 : minutesFromTimeGridPointerY(event.clientY) - startMin;

    const state: LiveMove = {
      key: item.key,
      sourceId: item.sourceId,
      title: item.title,
      color: item.color,
      repeating: Boolean(item.repeating),
      day: item.date,
      startMin,
      endMin,
      moved: false,
      allDay: fromAllDay,
    };
    moveRef.current = state;
    setMove(state);

    function targetDayFromX(clientX: number): { day: string; columnEl: Element | null } {
      const cols = [...(scroller!.querySelectorAll(".gcal-time-col"))];
      if (cols.length === 0) return { day: item.date, columnEl: null };
      let index = cols.findIndex((col) => {
        const rect = col.getBoundingClientRect();
        return clientX >= rect.left && clientX < rect.right;
      });
      if (index === -1) {
        index = clientX < cols[0].getBoundingClientRect().left ? 0 : cols.length - 1;
      }
      return { day: days[index] ?? days[0], columnEl: cols[index] };
    }

    function onPointerMove(moveEvent: PointerEvent) {
      const current = moveRef.current;
      if (!current) return;
      if (!current.moved) {
        const distance = Math.hypot(moveEvent.clientX - startClientX, moveEvent.clientY - startClientY);
        if (distance <= 4) return;
      }
      const target = targetDayFromX(moveEvent.clientX);
      // Hovering the all-day band (or the header above it) targets an
      // all-day drop instead of a time slot — no auto-scroll in that case.
      const alldayRect = alldayRowRef.current?.getBoundingClientRect();
      if (alldayRect && moveEvent.clientY <= alldayRect.bottom) {
        const next: LiveMove = { ...current, moved: true, allDay: true, day: target.day };
        moveRef.current = next;
        setMove(next);
        return;
      }
      // Auto-scroll when dragging near the scroller's edges so times outside
      // the viewport stay reachable.
      const scroller = scrollRef.current;
      if (scroller) {
        const scrollRect = scroller.getBoundingClientRect();
        if (moveEvent.clientY < scrollRect.top + 110) scroller.scrollTop -= 14;
        else if (moveEvent.clientY > scrollRect.bottom - 48) scroller.scrollTop += 14;
      }
      const pointerMin = minutesFromTimeGridPointerY(moveEvent.clientY);
      const nextStart = clampMinutes(
        snapDownToStep(pointerMin - grabOffsetMin),
        gridStartMin,
        DAY_END * 60 - duration,
      );
      const next: LiveMove = { ...current, moved: true, allDay: false, day: target.day, startMin: nextStart, endMin: nextStart + duration };
      moveRef.current = next;
      setMove(next);
    }

    function finishMove(commit: boolean) {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown, true);
      const current = moveRef.current;
      moveRef.current = null;
      setMove(null);
      if (!current?.moved) return;
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      if (commit) {
        if (current.allDay) {
          onMoveItemToAllDay(current.sourceId, current.day);
        } else {
          onMoveItem(current.sourceId, current.day, minutesToTime(current.startMin), minutesToTime(current.endMin));
        }
      }
    }

    function onPointerUp() {
      finishMove(true);
    }

    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key !== "Escape") return;
      keyEvent.stopPropagation();
      finishMove(false);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown, true);
  }

  // Drag the bar under the all-day band to change its height (persisted).
  function startAlldayResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const row = alldayRowRef.current;
    if (!row) return;
    const startY = event.clientY;
    const startHeight = row.getBoundingClientRect().height;

    function heightFromPointer(clientY: number) {
      return Math.min(ALLDAY_MAX_HEIGHT, Math.max(ALLDAY_MIN_HEIGHT, Math.round(startHeight + clientY - startY)));
    }

    function onPointerMove(moveEvent: PointerEvent) {
      setAlldayHeight(heightFromPointer(moveEvent.clientY));
    }
    function onPointerUp(upEvent: PointerEvent) {
      window.removeEventListener("pointermove", onPointerMove);
      const next = heightFromPointer(upEvent.clientY);
      setAlldayHeight(next);
      try {
        window.localStorage.setItem(ALLDAY_HEIGHT_STORAGE_KEY, String(next));
      } catch {
        // Keep the in-memory height when storage is unavailable.
      }
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  function dragStartTimeFromEvent(event: DragEvent<HTMLDivElement>) {
    const minutes = minutesFromTimeGridPointerY(event.clientY);
    const snapped = clampMinutes(
      Math.floor(minutes / TIME_SNAP_MINUTES) * TIME_SNAP_MINUTES,
      gridStartMin,
      DAY_END * 60 - TIME_SNAP_MINUTES,
    );
    return minutesToTime(snapped);
  }

  return (
    <div className={isDay ? "gcal-timegrid is-day" : "gcal-timegrid"}>
      <div className="gcal-time-scroll" ref={scrollRef}>
      <div className="gcal-timegrid-sticky">
        {isDay ? (
          <div className="gcal-day-title">
            <strong>{dayTitleFormatter.format(asDate(days[0]))}</strong>
            <span>{longWeekdayFormatter.format(asDate(days[0]))}</span>
          </div>
        ) : (
          <div className="gcal-timegrid-head">
            <div className="gcal-time-corner" />
            {days.map((day) => {
              const headClasses = ["gcal-col-head"];
              if (day === today) headClasses.push("is-today");
              else if (day === anchor) headClasses.push("is-selected");
              return (
                <div key={day} className={headClasses.join(" ")}>
                  <span className="gcal-col-weekday">{weekdayFormatter.format(asDate(day))}</span>
                  <span className="gcal-col-date">{getDayNumber(day)}</span>
                </div>
              );
            })}
          </div>
        )}

        <div
          className="gcal-allday-row"
          ref={alldayRowRef}
          style={alldayHeight ? { height: alldayHeight, maxHeight: alldayHeight } : undefined}
        >
          <div className="gcal-time-corner small">{t("calendar.allDay")}</div>
          {days.map((day) => {
            const allDayItems = items.filter(
              (item) => item.date === day && item.allDay && !(move?.moved && move.key === item.key),
            );
            const id = `allday:${day}`;
            const isMoveTarget = Boolean(move?.moved && move.allDay && move.day === day);
            return (
              <MotionDropZone
                as="div"
                key={day}
                isOver={dragOverId === id || isMoveTarget}
                className={
                  dragOverId === id || isMoveTarget ? "gcal-allday-cell is-drop" : "gcal-allday-cell"
                }
                onDragOver={onOverSlot(id)}
                onDragLeave={onLeaveSlot(id)}
                onDrop={(event) => onDropAllDay(event, day)}
                onClick={(event) => {
                  if (event.target === event.currentTarget) onClickAllDaySlot(day);
                }}
              >
                {isMoveTarget && move ? (
                  <span
                    className="gcal-chip gcal-chip-task is-move-preview"
                    style={{ ["--ev-color"]: move.color } as CSSProperties}
                  >
                    <span className="gcal-chip-label">
                      {move.repeating ? "↺ " : null}
                      {move.title}
                    </span>
                  </span>
                ) : null}
                <AnimatePresence initial={false}>
                {allDayItems.map((item) => (
                  <motion.button
                    key={item.key}
                    type="button"
                    data-calendar-interactive="true"
                    variants={motionEnabled ? calendarBlockVariants : undefined}
                    initial={motionEnabled ? "initial" : false}
                    animate={motionEnabled ? "animate" : undefined}
                    exit={motionEnabled ? "exit" : undefined}
                    transition={motionEnabled ? transitions.soft : reducedTransition}
                    className={[
                      "gcal-chip",
                      `gcal-chip-${item.layer}`,
                      item.key === selectedKey ? "is-picked" : "",
                      item.repeating ? "is-repeating" : "",
                      item.status === "done" ? "is-done" : "",
                    ].filter(Boolean).join(" ")}
                    onPointerDown={
                      item.draggable ? (event) => startMove(event, item, 0, 0, true) : undefined
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      if (suppressClickRef.current) return;
                      onClickItem(item, anchorFromRect(event.currentTarget.getBoundingClientRect()));
                    }}
                    style={{ ["--ev-color"]: item.color } as CSSProperties}
                  >
                    <span className="gcal-chip-label">
                      {item.layer === "external" ? "• " : null}
                      {item.repeating ? "↺ " : null}
                      {item.title}
                    </span>
                  </motion.button>
                ))}
                </AnimatePresence>
              </MotionDropZone>
            );
          })}
        </div>
        <div
          className="gcal-allday-resizer"
          role="separator"
          aria-orientation="horizontal"
          aria-label={t("calendar.allDayResize")}
          title={t("calendar.allDayResize")}
          onPointerDown={startAlldayResize}
        >
          <span />
        </div>
      </div>

        <div className="gcal-timegrid-body" style={{ height: hours.length * SLOT_HEIGHT }}>
          <div className="gcal-time-gutter">
            {hours.map((hour) => (
              <div key={hour} className="gcal-time-label" style={{ height: SLOT_HEIGHT }}>
                {/* The now badge replaces the nearest hour label instead of overlapping it. */}
                {showNowLine && Math.abs(nowMinutes - hour * 60) < 15 ? "" : `${String(hour).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>
          {showNowLine ? (
            <div className="gcal-now-indicator" style={{ top: nowTop }}>
              <span className="gcal-now-badge">
                <span>{nowLabel}</span>
              </span>
              <span className="gcal-now-track" />
              <span className="gcal-now-today-line" style={{ left: nowTodayLeft, width: nowTodayWidth }} />
            </div>
          ) : null}
          {showEmptyHint ? (
            <div className="gcal-empty-hint">{t("calendar.dragToCreate")}</div>
          ) : null}
          {days.map((day) => {
            const timedItems = items.filter((item) => item.date === day && !item.allDay);
            const id = `col:${day}`;
            const liveRange =
              selection && selection.day === day
                ? snappedDragRange(selection.startMinutes, selection.currentMinutes)
                : null;
            const draftHere = draft && draft.date === day ? draft : null;
            const weekend = asDate(day).getDay() === 0 || asDate(day).getDay() === 6;

            return (
              <MotionDropZone
                as="div"
                key={day}
                isOver={dragOverId === id}
                animateTransform={false}
                className={[
                  "gcal-time-col",
                  dragOverId === id ? "is-drop" : "",
                  weekend && !isDay ? "is-weekend" : "",
                  day === today && !isDay ? "is-today" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onDragOver={(event) => {
                  onOverSlot(id)(event);
                  onDragHover(day, dragStartTimeFromEvent(event as DragEvent<HTMLDivElement>));
                }}
                onDragLeave={onLeaveSlot(id)}
                onDrop={(event) =>
                  onDropTime(event, day, dragStartTimeFromEvent(event as DragEvent<HTMLDivElement>))
                }
                onPointerDown={(event) => handlePointerDown(event as ReactPointerEvent<HTMLDivElement>, day)}
                onPointerMove={(event) => handlePointerMove(event as ReactPointerEvent<HTMLDivElement>)}
                onPointerUp={(event) => handlePointerUp(event as ReactPointerEvent<HTMLDivElement>)}
                onPointerCancel={(event) => handlePointerCancel(event as ReactPointerEvent<HTMLDivElement>)}
              >
                {hours.map((hour) => (
                  <div key={hour} className="gcal-time-slot" style={{ height: SLOT_HEIGHT }}>
                    <div className="gcal-time-slot-half" />
                  </div>
                ))}
                {liveRange ? (
                  <div
                    className="gcal-selection-block"
                    style={{ top: topFor(liveRange.startMin), height: heightFor(liveRange.startMin, liveRange.endMin) }}
                  >
                    {minutesToTime(liveRange.startMin)}–{minutesToTime(liveRange.endMin)}
                  </div>
                ) : null}
                {draftHere ? (
                  <div
                    data-calendar-interactive="true"
                    className="gcal-draft-block"
                    style={{
                      top: topFor(timeToMinutesOrNull(draftHere.startTime) ?? 0),
                      height: heightFor(
                        timeToMinutesOrNull(draftHere.startTime) ?? 0,
                        timeToMinutesOrNull(draftHere.endTime) ?? 0,
                      ),
                    }}
                  >
                    <span className="gcal-draft-label">{t("calendar.newTask")}</span>
                    <span className="gcal-draft-time">
                      {draftHere.startTime}–{draftHere.endTime}
                    </span>
                  </div>
                ) : null}
                {dragPreview && dragPreview.day === day ? (
                  <div
                    className={dragPreview.isValid ? "gcal-drop-preview" : "gcal-drop-preview is-invalid"}
                    style={{
                      top: topFor(timeToMinutesOrNull(dragPreview.startTime) ?? gridStartMin),
                      height: heightFor(
                        timeToMinutesOrNull(dragPreview.startTime) ?? gridStartMin,
                        timeToMinutesOrNull(dragPreview.endTime) ?? (gridStartMin + 30),
                      ),
                    }}
                  >
                    <span>{draggingTaskTitle || "Task"}</span>
                    <small>
                      {dragPreview.startTime}-{dragPreview.endTime}
                    </small>
                  </div>
                ) : null}
                {aiPlacements
                  .filter((placement) => placement.day === day)
                  .map((placement) => (
                    <div
                      key={placement.taskId}
                      className="gcal-ai-preview-block"
                      style={{
                        top: topFor(timeToMinutesOrNull(placement.startTime) ?? gridStartMin),
                        height: heightFor(
                          timeToMinutesOrNull(placement.startTime) ?? gridStartMin,
                          timeToMinutesOrNull(placement.endTime) ?? (gridStartMin + 30),
                        ),
                      }}
                    >
                      <span>AI</span>
                      <strong>{placement.title}</strong>
                    </div>
                  ))}
                {/* Live pointer-move overlay: the single visual for a block being moved. */}
                {move?.moved && !move.allDay && move.day === day ? (
                  <div
                    className="gcal-move-block"
                    style={{
                      top: topFor(move.startMin),
                      height: heightFor(move.startMin, move.endMin),
                      ["--ev-color"]: move.color,
                    } as CSSProperties}
                  >
                    <span className="gcal-tb-title">
                      {move.repeating ? "↺ " : null}
                      {move.title}
                    </span>
                    <span className="gcal-tb-time">
                      {minutesToTime(move.startMin)} – {minutesToTime(move.endMin)}
                    </span>
                  </div>
                ) : null}
                {/* Overlapping blocks split the column side-by-side instead of stacking. */}
                <AnimatePresence initial={false}>
                {(() => {
                  const entries = timedItems.flatMap((item) => {
                    // While a pointer move is live the original block disappears;
                    // only the overlay above represents it.
                    if (move?.moved && move.key === item.key) return [];
                    let startMin = timeToMinutesOrNull(item.startTime ?? "");
                    if (startMin === null) return [];
                    let endMin = timeToMinutesOrNull(item.endTime ?? "") ?? startMin + 60;
                    // gridStartHour already grew to cover the earliest item, so
                    // this only catches genuinely inverted data (end before start).
                    if (endMin <= gridStartMin) return [];
                    if (resize && resize.key === item.key) {
                      startMin = resize.startMin;
                      endMin = resize.endMin;
                    }
                    const clampedStart = Math.max(startMin, gridStartMin);
                    return [{ item, startMin, endMin, clampedStart, clampedEnd: Math.max(endMin, clampedStart + 1) }];
                  });
                  const overlapLayout = computeOverlapLayout(
                    entries.map((entry) => ({ key: entry.item.key, start: entry.clampedStart, end: entry.clampedEnd })),
                  );
                  return entries.map(({ item, startMin, endMin, clampedStart }) => {
                  const top = topFor(clampedStart);
                  const height = heightFor(clampedStart, endMin);
                  const { col, cols } = overlapLayout.get(item.key) ?? { col: 0, cols: 1 };
                  const widthPct = 100 / cols;
                  return (
                    <motion.button
                      key={item.key}
                      type="button"
                      data-calendar-interactive="true"
                      variants={motionEnabled ? calendarBlockVariants : undefined}
                      initial={motionEnabled ? "initial" : false}
                      animate={motionEnabled ? "animate" : undefined}
                      exit={motionEnabled ? "exit" : undefined}
                      transition={motionEnabled ? transitions.soft : reducedTransition}
                      className={[
                        "gcal-time-block",
                        item.key === selectedKey ? "is-picked" : "",
                        resize?.key === item.key ? "is-resizing" : "",
                        item.layer === "external" ? "is-external" : "",
                        item.layer === "focus-actual" ? "is-focus-actual" : "",
                        item.status === "done" ? "is-done" : "",
                      ].filter(Boolean).join(" ")}
                      onPointerDown={item.draggable ? (event) => startMove(event, item, startMin, endMin) : undefined}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (suppressClickRef.current) return;
                        onClickItem(item, anchorFromRect(event.currentTarget.getBoundingClientRect()));
                      }}
                      // The category colour is handed to CSS as a variable and
                      // every derived colour — tint, left bar, title and time —
                      // is mixed there. A hard-coded `${color}22` could not vary
                      // by theme, and 13% over the dark canvas is invisible.
                      // The focus-actual hatching moved to CSS for the same
                      // reason (`.is-focus-actual`).
                      style={{
                        top,
                        height,
                        left: `${col * widthPct}%`,
                        width: cols > 1 ? `calc(${widthPct}% - 2px)` : "100%",
                        zIndex: 10 + col,
                        ["--ev-color"]: item.color,
                      } as CSSProperties}
                    >
                      <span className="gcal-tb-title">
                        {item.repeating ? "↺ " : null}
                        {item.title}
                      </span>
                      <span className="gcal-tb-time">
                        {resize?.key === item.key
                          ? `${minutesToTime(startMin)} – ${minutesToTime(endMin)}`
                          : `${item.startTime}${item.endTime ? ` – ${item.endTime}` : ""}`}
                      </span>
                      {item.draggable ? (
                        <>
                          <span
                            role="presentation"
                            className="gcal-resize-handle is-start"
                            data-calendar-interactive="true"
                            onPointerDown={(event) => startResize(event, item, "start", startMin, endMin)}
                            onDragStart={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                          />
                          <span
                            role="presentation"
                            className="gcal-resize-handle is-end"
                            data-calendar-interactive="true"
                            onPointerDown={(event) => startResize(event, item, "end", startMin, endMin)}
                            onDragStart={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                          />
                        </>
                      ) : null}
                    </motion.button>
                  );
                  });
                })()}
                </AnimatePresence>
              </MotionDropZone>
            );
          })}
        </div>
      </div>

      {/* The time grid scrolls inside itself, so the app-wide bar in AppShell
          reports the page and not this. Positioned against `.gcal-timegrid`,
          which the scroller fills. */}
      <OverlayScrollbar scrollerRef={scrollRef} />
    </div>
  );
}
