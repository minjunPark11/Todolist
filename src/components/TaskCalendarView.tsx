// The Calendar view at a Space/Project/Folder/List scope (§50D).
//
// The month grid is NOT rebuilt: `calendar/MonthView` already draws a 7-column
// month with compact chips and a `+N` overflow, and `buildCalendarItems`
// already expands a Task into the chips its dates earn. This mounts both at a
// scope, which is the difference between this and the Calendar page.
//
// What it deliberately leaves out is everything on that page that is not a
// Task: external calendars, focus segments, category management, sharing.
// Those are the page's subject, not this scope's — and none of them is an
// Item, so a scope has nothing to say about them.
//
// Dates: the fields merged (SCHEDULE_EDITOR_PHASE0_AUDIT.md §6). A drop writes
// the whole schedule rather than one field of it, because a reader that
// consolidates would read a half-write as a range — the same rule the Calendar
// page's own drop follows.
import { DragEvent, useMemo, useState } from "react";
import type { Project, Task } from "../types";
import { buildCalendarItems, type CalendarItem, type CalendarLayerToggles } from "../utils/calendarItems";
import { addMonths, todayValue } from "../utils/date";
import { MonthView } from "./calendar/MonthView";
import { scheduleFromTask, type Schedule, type ScheduleIssue } from "../domain/schedule";
import { useT } from "../i18n";

/**
 * Tasks only. `projectDeadline` would draw the Project's own due date, which
 * is the scope itself rather than work inside it; `focusActual` needs sessions
 * this view is not given. Completed work stays visible — a plan you finished
 * is still what the month looked like.
 */
const SCOPE_LAYERS: CalendarLayerToggles = {
  task: true,
  projectDeadline: false,
  completed: true,
  focusActual: false,
};

interface TaskCalendarViewProps {
  /** Already narrowed by the caller's scope. */
  tasks: Task[];
  projects: Project[];
  today: string;
  selectedTaskId?: string;
  onOpenTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
  /** The canonical schedule write (design §13). */
  onUpdateTaskSchedule: (taskId: string, next: Schedule) => ScheduleIssue[];
}

export function TaskCalendarView({
  tasks,
  projects,
  today,
  selectedTaskId = "",
  onOpenTask,
  onUpdateTask,
  onUpdateTaskSchedule,
}: TaskCalendarViewProps) {
  const { t, lang } = useT();
  const [anchor, setAnchor] = useState(today);
  const [dragOverId, setDragOverId] = useState("");

  const items = useMemo(
    () =>
      buildCalendarItems({
        tasks,
        projects,
        focusSessions: [],
        externalCalendars: [],
        externalCalendarEvents: [],
        layers: SCOPE_LAYERS,
        projectFilter: "all",
      }),
    [tasks, projects],
  );

  const monthLabel = useMemo(() => {
    const date = new Date(`${anchor}T00:00:00`);
    return lang === "ko"
      ? `${date.getFullYear()}년 ${date.getMonth() + 1}월`
      : date.toLocaleDateString("en-US", { year: "numeric", month: "long" });
  }, [anchor, lang]);

  const selectedKey = useMemo(() => {
    if (!selectedTaskId) return "";
    return items.find((item) => item.sourceType === "task" && item.sourceId === selectedTaskId)?.key ?? "";
  }, [items, selectedTaskId]);

  function handleDragStart(event: DragEvent, itemKey: string) {
    const item = items.find((entry) => entry.key === itemKey);
    // A deadline marker is not draggable: moving it would rewrite `dueDate`,
    // which answers "by when" and not "when am I doing this" (§27.2).
    if (!item || item.sourceType !== "task" || item.layer !== "task") {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData("text/plain", item.sourceId);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDropCell(event: DragEvent, date: string) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain");
    if (taskId) {
      const current = scheduleFromTask(tasks.find((item) => item.id === taskId) ?? {});
      onUpdateTaskSchedule(taskId, { ...current, startDate: null, dueDate: date });
    }
    setDragOverId("");
  }

  function openItem(item: CalendarItem) {
    if (item.sourceType === "task") onOpenTask(item.sourceId);
  }

  return (
    <div className="tcv">
      <div className="tcv-toolbar">
        <button type="button" className="ff-btn ff-btn-sm" onClick={() => setAnchor(addMonths(anchor, -1))}>
          ‹ {t("calendar.previous")}
        </button>
        <span className="tcv-range">{monthLabel}</span>
        <button type="button" className="ff-btn ff-btn-sm" onClick={() => setAnchor(addMonths(anchor, 1))}>
          {t("calendar.next")} ›
        </button>
        <button
          type="button"
          className="ff-btn ff-btn-sm tcv-today"
          onClick={() => setAnchor(today)}
          disabled={anchor.slice(0, 7) === today.slice(0, 7)}
        >
          {t("calendar.today")}
        </button>
      </div>

      <MonthView
        anchor={anchor}
        items={items}
        selectedKey={selectedKey}
        dragOverId={dragOverId}
        onDragStart={handleDragStart}
        onOverCell={(id) => (event) => {
          event.preventDefault();
          setDragOverId(id);
        }}
        onLeaveCell={() => () => setDragOverId("")}
        onDropCell={handleDropCell}
        onClickItem={(item) => openItem(item)}
        onClickCell={(date) => setAnchor(date)}
        onOpenDay={(date) => setAnchor(date)}
        // The page opens a popover here. This scope has no popover surface, so
        // the day becomes the anchor and its chips are read in the cell —
        // rather than wiring a second detail surface (§49A.4).
        onShowAgenda={(date) => setAnchor(date)}
      />
    </div>
  );
}
