import { DragEvent, PointerEvent as ReactPointerEvent, useMemo, useState } from "react";
import type { CalendarItem } from "../../utils/calendarItems";
import {
  clickDefaultRange,
  clampMinutes,
  minutesFromPointerY,
  minutesToTime,
  shouldStartTimeSelection,
  snappedDragRange,
  DAY_END,
  DAY_START,
  SLOT_HEIGHT,
  TIME_SNAP_MINUTES,
  type CalendarDraftBlock,
} from "../../utils/calendarTime";
import { getDayNumber, todayValue } from "../../utils/date";
import { useT } from "../../i18n";

export { DAY_END, DAY_START, SLOT_HEIGHT };

const hours = Array.from({ length: DAY_END - DAY_START }, (_, index) => DAY_START + index);
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

function asDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function timeToMinutesOrNull(value: string): number | null {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function topFor(minutes: number) {
  return ((minutes - DAY_START * 60) / 60) * SLOT_HEIGHT;
}

function heightFor(startMin: number, endMin: number) {
  return Math.max(((endMin - startMin) / 60) * SLOT_HEIGHT, 24);
}

interface WeekViewProps {
  days: string[];
  anchor: string;
  items: CalendarItem[];
  dragOverId: string;
  onDragStart: (event: DragEvent, itemKey: string) => void;
  onDragEnd: () => void;
  onOverSlot: (id: string) => (event: DragEvent) => void;
  onLeaveSlot: (id: string) => () => void;
  onDragHover: (day: string, startTime: string) => void;
  onDropTime: (event: DragEvent, day: string, startTime: string) => void;
  onDropAllDay: (event: DragEvent, day: string) => void;
  onClickItem: (item: CalendarItem) => void;
  onClickAllDaySlot: (day: string) => void;
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
  onDraftCreate: (day: string, startTime: string, endTime: string) => void;
}

export function WeekView({
  days,
  anchor,
  items,
  dragOverId,
  onDragStart,
  onDragEnd,
  onOverSlot,
  onLeaveSlot,
  onDragHover,
  onDropTime,
  onDropAllDay,
  onClickItem,
  onClickAllDaySlot,
  draft,
  dragPreview,
  draggingTaskTitle,
  aiPlacements,
  onSelectionStart,
  onDraftCreate,
}: WeekViewProps) {
  const { t, lang } = useT();
  const weekdayFormatter = useMemo(
    () => new Intl.DateTimeFormat(lang === "ko" ? "ko" : "en", { weekday: "short" }),
    [lang],
  );
  const [selection, setSelection] = useState<LiveSelection | null>(null);

  const today = todayValue();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNowLine = days.includes(today) && nowMinutes >= DAY_START * 60 && nowMinutes <= DAY_END * 60;
  const nowTop = topFor(nowMinutes);
  const nowLabel = timeLabelFormatter.format(now);

  const hasAnyItemInView = items.some((item) => days.includes(item.date));
  const showEmptyHint = !hasAnyItemInView && !draft && !selection;

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>, day: string) {
    if (event.button !== 0) return;
    if (!shouldStartTimeSelection(event.target)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const startMinutes = minutesFromPointerY(event.clientY, rect.top);
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
    const rect = event.currentTarget.getBoundingClientRect();
    const currentMinutes = minutesFromPointerY(event.clientY, rect.top);
    setSelection((current) => (current ? { ...current, currentMinutes } : current));
  }

  function finalizeSelection(sel: LiveSelection, movedPixels: number) {
    let startMin: number;
    let endMin: number;
    if (movedPixels <= 4) {
      ({ startMin, endMin } = clickDefaultRange(sel.startMinutes));
    } else {
      ({ startMin, endMin } = snappedDragRange(sel.startMinutes, sel.currentMinutes));
    }
    if (endMin - startMin < TIME_SNAP_MINUTES) return;
    onDraftCreate(sel.day, minutesToTime(startMin), minutesToTime(endMin));
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
    finalizeSelection(selection, Math.abs(event.clientY - selection.startClientY));
    setSelection(null);
  }

  function handlePointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (!selection || event.pointerId !== selection.pointerId) return;
    releaseCaptureSafely(event.currentTarget, event.pointerId);
    setSelection(null);
  }

  function dragStartTimeFromEvent(event: DragEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const minutes = minutesFromPointerY(event.clientY, rect.top);
    const snapped = clampMinutes(
      Math.floor(minutes / TIME_SNAP_MINUTES) * TIME_SNAP_MINUTES,
      DAY_START * 60,
      DAY_END * 60 - TIME_SNAP_MINUTES,
    );
    return minutesToTime(snapped);
  }

  return (
    <div className={days.length === 1 ? "gcal-timegrid is-day" : "gcal-timegrid"}>
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

      <div className="gcal-allday-row">
        <div className="gcal-time-corner small">{t("calendar.allDay")}</div>
        {days.map((day) => {
          const allDayItems = items.filter((item) => item.date === day && item.allDay);
          const id = `allday:${day}`;
          return (
            <div
              key={day}
              className={dragOverId === id ? "gcal-allday-cell is-drop" : "gcal-allday-cell"}
              onDragOver={onOverSlot(id)}
              onDragLeave={onLeaveSlot(id)}
              onDrop={(event) => onDropAllDay(event, day)}
              onClick={(event) => {
                if (event.target === event.currentTarget) onClickAllDaySlot(day);
              }}
            >
              {allDayItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  data-calendar-interactive="true"
                  className={`gcal-chip gcal-chip-${item.layer}${item.repeating ? " is-repeating" : ""}`}
                  draggable={item.draggable}
                  onDragStart={item.draggable ? (event) => onDragStart(event, item.sourceId) : undefined}
                  onDragEnd={item.draggable ? onDragEnd : undefined}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClickItem(item);
                  }}
                  style={item.layer === "task" ? { borderLeftColor: item.color } : undefined}
                >
                  {item.layer === "deadline" ? "⚠ " : null}
                  {item.layer === "study-review" ? "↻ " : null}
                  {item.layer === "project-deadline" ? "◆ " : null}
                  {item.repeating ? "↺ " : null}
                  {item.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <div className="gcal-timegrid-body" style={{ height: hours.length * SLOT_HEIGHT }}>
        <div className="gcal-time-gutter">
          {hours.map((hour) => (
            <div key={hour} className="gcal-time-label" style={{ height: SLOT_HEIGHT }}>
              {hour}:00
            </div>
          ))}
        </div>
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

          return (
            <div
              key={day}
              className={dragOverId === id ? "gcal-time-col is-drop" : "gcal-time-col"}
              onDragOver={(event) => {
                onOverSlot(id)(event);
                onDragHover(day, dragStartTimeFromEvent(event));
              }}
              onDragLeave={onLeaveSlot(id)}
              onDrop={(event) => onDropTime(event, day, dragStartTimeFromEvent(event))}
              onPointerDown={(event) => handlePointerDown(event, day)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
            >
              {hours.map((hour) => (
                <div key={hour} className="gcal-time-slot" style={{ height: SLOT_HEIGHT }} />
              ))}
              {day === today && showNowLine ? (
                <div className="gcal-now-line" style={{ top: nowTop }}>
                  <span className="gcal-now-time">{nowLabel}</span>
                  <span className="gcal-now-dot" />
                </div>
              ) : null}
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
                    top: topFor(timeToMinutesOrNull(dragPreview.startTime) ?? DAY_START * 60),
                    height: heightFor(
                      timeToMinutesOrNull(dragPreview.startTime) ?? DAY_START * 60,
                      timeToMinutesOrNull(dragPreview.endTime) ?? (DAY_START * 60 + 30),
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
                      top: topFor(timeToMinutesOrNull(placement.startTime) ?? DAY_START * 60),
                      height: heightFor(
                        timeToMinutesOrNull(placement.startTime) ?? DAY_START * 60,
                        timeToMinutesOrNull(placement.endTime) ?? (DAY_START * 60 + 30),
                      ),
                    }}
                  >
                    <span>AI</span>
                    <strong>{placement.title}</strong>
                  </div>
                ))}
              {/* §9.1 (D8): overlapping blocks simply stack with a small offset + border, no collision layout. */}
              {timedItems.map((item, index) => {
                const startMin = timeToMinutesOrNull(item.startTime ?? "");
                if (startMin === null) return null;
                const endMin = timeToMinutesOrNull(item.endTime ?? "") ?? startMin + 60;
                const top = topFor(startMin);
                const height = heightFor(startMin, endMin);
                const offset = Math.min(index, 4) * 10;
                return (
                  <button
                    key={item.key}
                    type="button"
                    data-calendar-interactive="true"
                    className="gcal-time-block"
                    draggable={item.draggable}
                    onDragStart={item.draggable ? (event) => onDragStart(event, item.sourceId) : undefined}
                    onDragEnd={item.draggable ? onDragEnd : undefined}
                    onClick={(event) => {
                      event.stopPropagation();
                      onClickItem(item);
                    }}
                    style={{
                      top,
                      height,
                      left: `${offset}%`,
                      width: `${100 - offset}%`,
                      zIndex: 10 + index,
                      borderLeft: `3px solid ${item.color}`,
                      background: `${item.color}22`,
                    }}
                  >
                    <span className="gcal-tb-time">{item.startTime}</span>
                    <span className="gcal-tb-title">
                      {item.repeating ? "↺ " : null}
                      {item.title}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
