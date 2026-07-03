import { DragEvent, ReactNode, useMemo, useState } from "react";
import type { ConceptNote, Project, Task, TaskDraft } from "../types";
import {
  addDays,
  addMonths,
  getDayLabel,
  getWeekDays,
  getWeekLabel,
  getMonthLabel,
  todayValue,
} from "../utils/date";
import {
  buildCalendarItems,
  defaultCalendarLayers,
  type CalendarItem,
  type CalendarLayerToggles,
  type ProjectFilter,
} from "../utils/calendarItems";
import {
  DAY_END,
  TIME_SNAP_MINUTES,
  minutesToTime,
  timeToMinutes,
  type CalendarDraftBlock,
} from "../utils/calendarTime";
import type { ToastState } from "./kit";
import { CalendarToolbar } from "./calendar/CalendarToolbar";
import { CalendarLeftSidebar } from "./calendar/CalendarLeftSidebar";
import { WeekView } from "./calendar/WeekView";
import { MonthView } from "./calendar/MonthView";
import { YearView } from "./calendar/YearView";
import { DayDetailPanel } from "./calendar/CalendarRightPanel";
import { CalendarPopover, DayAgendaPopover, EventPopover, type PopoverAnchor } from "./calendar/EventPopover";
import { NewTaskForm, type NewTaskFormResult } from "./calendar/NewTaskForm";
import { QuickCreatePopover, type QuickCreateDefaults, type QuickCreateResult } from "./calendar/QuickCreatePopover";
import { useT } from "../i18n";

type CalendarMode = "month" | "week" | "day" | "year";

type DragPreview = {
  taskId: string;
  day: string;
  startTime: string;
  endTime: string;
  isValid: boolean;
};

type AiPlacement = {
  taskId: string;
  day: string;
  startTime: string;
  endTime: string;
  reason: string;
};

// Spec §5.7/§6.8: small popovers replace the fixed right panel outside day view.
type PopoverState =
  | { kind: "event"; item: CalendarItem; anchor: PopoverAnchor }
  | { kind: "agenda"; date: string; anchor: PopoverAnchor }
  | null;

interface CalendarViewProps {
  tasks: Task[];
  projects: Project[];
  conceptNotes: ConceptNote[];
  // When set, the calendar mounts with only this project's items visible
  // (space detail "Open Calendar" hand-off). The user can widen it any time.
  initialProjectId?: string;
  onSelectTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
  onCreateTask: (draft: TaskDraft) => string;
  onOpenProject?: (projectId: string) => void;
  onOpenStudyReview?: (noteId: string) => void;
  taskDetail?: ReactNode;
  onClearTaskSelection?: () => void;
  showToast?: (toast: ToastState) => void;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function CalendarView({
  tasks,
  projects,
  conceptNotes,
  initialProjectId,
  onSelectTask,
  onUpdateTask,
  onCreateTask,
  onOpenProject,
  onOpenStudyReview,
  taskDetail,
  onClearTaskSelection,
  showToast,
}: CalendarViewProps) {
  const { t, lang } = useT();
  const [mode, setMode] = useState<CalendarMode>("week");
  const [anchor, setAnchor] = useState(todayValue());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [layers, setLayers] = useState<CalendarLayerToggles>(defaultCalendarLayers);
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>(() =>
    initialProjectId ? new Set([initialProjectId]) : "all",
  );
  const [dragOverId, setDragOverId] = useState("");
  const [draggingTaskId, setDraggingTaskId] = useState("");
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [quickCreate, setQuickCreate] = useState<QuickCreateDefaults | null>(null);
  const [popover, setPopover] = useState<PopoverState>(null);
  const [aiStatus, setAiStatus] = useState<"idle" | "loading" | "preview" | "error">("idle");
  const [aiPlacements, setAiPlacements] = useState<AiPlacement[]>([]);
  // V3 §7/§8: the confirmed draft block. Never written to localStorage/task
  // list — only createTask() (via handleCreateFromDraft) touches real data.
  const [draft, setDraft] = useState<CalendarDraftBlock | null>(null);
  // Where the week view's draft popover should open (day view uses the panel).
  const [draftAnchor, setDraftAnchor] = useState<PopoverAnchor | null>(null);

  const today = todayValue();
  const anchorDate = new Date(`${anchor}T00:00:00`);

  const items = useMemo(
    () => buildCalendarItems({ tasks, projects, conceptNotes, layers, projectFilter }),
    [tasks, projects, conceptNotes, layers, projectFilter],
  );

  const monthPrefix = `${anchorDate.getFullYear()}-${pad(anchorDate.getMonth() + 1)}`;
  const datesWithItems = useMemo(
    () => new Set(items.filter((item) => item.date.startsWith(monthPrefix)).map((item) => item.date)),
    [items, monthPrefix],
  );

  const unscheduled = useMemo(
    () =>
      tasks.filter((task) => {
        if (task.scheduledDate || task.status === "done" || task.status === "archived") return false;
        if (!layers.task) return false;
        if (projectFilter !== "all" && task.projectId && !projectFilter.has(task.projectId)) return false;
        return true;
      }),
    [layers.task, projectFilter, tasks],
  );

  let rangeLabel: string;
  if (mode === "month") {
    rangeLabel = getMonthLabel(anchorDate.getFullYear(), anchorDate.getMonth(), lang);
  } else if (mode === "week") {
    rangeLabel = getWeekLabel(anchor, lang);
  } else if (mode === "year") {
    rangeLabel = t("calendar.yearTitle", { year: anchorDate.getFullYear() });
  } else {
    rangeLabel = getDayLabel(anchor, lang);
  }

  function clearTransient() {
    setDraft(null);
    setDraftAnchor(null);
    setPopover(null);
    onClearTaskSelection?.();
  }

  function shift(delta: number) {
    clearTransient();
    if (mode === "month") {
      setAnchor(addMonths(anchor, delta));
    } else if (mode === "year") {
      setAnchor(addMonths(anchor, delta * 12));
    } else if (mode === "week") {
      setAnchor(addDays(anchor, delta * 7));
    } else {
      setAnchor(addDays(anchor, delta));
    }
  }

  function switchMode(next: CalendarMode) {
    clearTransient();
    setMode(next);
  }

  function toggleLayer(key: keyof CalendarLayerToggles) {
    onClearTaskSelection?.();
    setLayers((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleProjectFilter(projectId: string) {
    onClearTaskSelection?.();
    setProjectFilter((current) => {
      if (current === "all") {
        const next = new Set(projects.map((project) => project.id));
        next.delete(projectId);
        return next;
      }
      const next = new Set(current);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next.size === projects.length ? "all" : next;
    });
  }

  function handleDragStart(event: DragEvent, taskId: string) {
    event.dataTransfer.setData("text/plain", taskId);
    event.dataTransfer.effectAllowed = "move";
    setDraggingTaskId(taskId);
    setPopover(null);
  }

  function over(id: string) {
    return (event: DragEvent) => {
      event.preventDefault();
      if (dragOverId !== id) setDragOverId(id);
    };
  }

  function leave(id: string) {
    return () => {
      setDragOverId((current) => (current === id ? "" : current));
      setDragPreview((current) => (current && id.startsWith("col:") ? null : current));
    };
  }

  function getTaskDuration(task: Task | undefined) {
    if (!task) return 30;
    if (task.startTime && task.endTime) {
      const duration = timeToMinutes(task.endTime) - timeToMinutes(task.startTime);
      if (duration > 0) {
        return Math.max(TIME_SNAP_MINUTES, Math.round(duration / TIME_SNAP_MINUTES) * TIME_SNAP_MINUTES);
      }
    }
    if (task.priority === "high") return 60;
    if (task.priority === "medium") return 40;
    return 30;
  }

  function hasConflict(day: string, startTime: string, endTime: string, ignoreTaskId?: string) {
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    return items.some((item) => {
      if (item.sourceId === ignoreTaskId) return false;
      if (item.date !== day || item.allDay || !item.startTime || !item.endTime) return false;
      const itemStart = timeToMinutes(item.startTime);
      const itemEnd = timeToMinutes(item.endTime);
      return start < itemEnd && end > itemStart;
    });
  }

  function handleDragHover(day: string, startTime: string) {
    if (!draggingTaskId) return;
    const task = tasks.find((item) => item.id === draggingTaskId);
    const duration = getTaskDuration(task);
    const start = timeToMinutes(startTime);
    const end = Math.min(DAY_END * 60, start + duration);
    const endTime = minutesToTime(end);
    const isValid = end > start && !hasConflict(day, startTime, endTime, draggingTaskId);
    setDragPreview({ taskId: draggingTaskId, day, startTime, endTime, isValid });
  }

  function handleDragEnd() {
    setDraggingTaskId("");
    setDragOverId("");
    setDragPreview(null);
  }

  // §4.2/D2: drag & drop only ever changes scheduledDate — dueDate (deadline)
  // markers are non-draggable (WeekView/MonthView never call onDragStart for them).
  function dropTime(event: DragEvent, day: string, startTime: string) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain");
    if (taskId) {
      const task = tasks.find((item) => item.id === taskId);
      const duration = getTaskDuration(task);
      const start = timeToMinutes(startTime);
      const end = Math.min(DAY_END * 60, start + duration);
      const endTime = minutesToTime(end);
      if (end <= start || hasConflict(day, startTime, endTime, taskId)) {
        showToast?.({ message: "This time is not available. Choose another slot." });
        handleDragEnd();
        return;
      }
      onUpdateTask(taskId, {
        scheduledDate: day,
        startTime,
        endTime,
      });
      showToast?.({ message: `${task?.title ?? "Task"} scheduled at ${startTime}.` });
    }
    handleDragEnd();
  }

  function dropAllDay(event: DragEvent, day: string) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain");
    if (taskId) {
      onUpdateTask(taskId, { scheduledDate: day, startTime: "", endTime: "" });
    }
    handleDragEnd();
  }

  function dropCell(event: DragEvent, day: string) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain");
    if (taskId) {
      onUpdateTask(taskId, { scheduledDate: day });
    }
    handleDragEnd();
  }

  // Spec §6.9: resize handles commit through here with a conflict check.
  function handleResizeItem(taskId: string, day: string, startTime: string, endTime: string) {
    if (timeToMinutes(endTime) - timeToMinutes(startTime) < TIME_SNAP_MINUTES) return;
    if (hasConflict(day, startTime, endTime, taskId)) {
      showToast?.({ message: "This time is not available. Choose another slot." });
      return;
    }
    onUpdateTask(taskId, { scheduledDate: day, startTime, endTime });
  }

  function suggestSchedule() {
    if (unscheduled.length === 0) {
      showToast?.({ message: t("calendar.noUnscheduled") });
      return;
    }
    setAiStatus("loading");
    window.setTimeout(() => {
      const weekDays = getWeekDays(anchor);
      const placements: AiPlacement[] = [];
      let slot = 9 * 60;
      for (const task of unscheduled.slice(0, 4)) {
        const day = weekDays[placements.length % weekDays.length];
        const duration = getTaskDuration(task);
        let start = slot;
        let startTime = minutesToTime(start);
        let endTime = minutesToTime(Math.min(DAY_END * 60, start + duration));
        while (hasConflict(day, startTime, endTime, task.id) && start < 17 * 60) {
          start += 60;
          startTime = minutesToTime(start);
          endTime = minutesToTime(Math.min(DAY_END * 60, start + duration));
        }
        if (!hasConflict(day, startTime, endTime, task.id)) {
          placements.push({ taskId: task.id, day, startTime, endTime, reason: "Open slot with nearby priority fit" });
        }
        slot += 60;
      }
      if (placements.length === 0) {
        setAiStatus("error");
        return;
      }
      setAiPlacements(placements);
      setAiStatus("preview");
    }, 650);
  }

  function applyAiPlacements() {
    for (const placement of aiPlacements) {
      onUpdateTask(placement.taskId, {
        scheduledDate: placement.day,
        startTime: placement.startTime,
        endTime: placement.endTime,
      });
    }
    showToast?.({ message: `${aiPlacements.length} suggested task(s) scheduled.` });
    setAiPlacements([]);
    setAiStatus("idle");
  }

  function cancelAiPlacements() {
    setAiPlacements([]);
    setAiStatus("idle");
  }

  // Spec §2/§12: week & month show a small popover on event click; only the
  // day view routes the click into the fixed right detail panel.
  function handleClickItem(item: CalendarItem, anchor: PopoverAnchor) {
    setDraft(null);
    setDraftAnchor(null);
    if (mode === "day") {
      if (item.sourceType === "task") onSelectTask(item.sourceId);
      else if (item.sourceType === "project") onOpenProject?.(item.sourceId);
      else onOpenStudyReview?.(item.sourceId);
      return;
    }
    setPopover({ kind: "event", item, anchor });
  }

  function openDetailFromPopover(item: CalendarItem) {
    setPopover(null);
    if (item.sourceType === "task") {
      setMode("day");
      setAnchor(item.date);
      onSelectTask(item.sourceId);
    } else if (item.sourceType === "project") {
      onOpenProject?.(item.sourceId);
    } else {
      onOpenStudyReview?.(item.sourceId);
    }
  }

  function handleQuickCreateSave(result: QuickCreateResult) {
    if (result.type === "deadline") {
      onCreateTask({
        title: result.title,
        status: "todo",
        dueDate: result.date,
        projectId: result.projectId || undefined,
      });
    } else {
      onCreateTask({
        title: result.title,
        status: "todo",
        scheduledDate: result.date,
        startTime: result.startTime || undefined,
        endTime: result.endTime || undefined,
        projectId: result.projectId || undefined,
      });
    }
    setQuickCreate(null);
  }

  // §2.3/§12.3: any new empty-grid selection replaces a pending draft.
  function handleSelectionStart() {
    setDraft(null);
    setDraftAnchor(null);
    setPopover(null);
    onClearTaskSelection?.();
  }

  function handleDraftCreate(day: string, startTime: string, endTime: string, anchor: PopoverAnchor) {
    setDraft({ date: day, startTime, endTime });
    setDraftAnchor(anchor);
  }

  function handleCancelDraft() {
    setDraft(null);
    setDraftAnchor(null);
  }

  // §8/§13.5: the only place a real task gets created from a draft.
  function handleCreateFromDraft(result: NewTaskFormResult) {
    if (!draft) return;
    const taskId = onCreateTask({
      title: result.title,
      status: "todo",
      scheduledDate: draft.date,
      startTime: draft.startTime,
      endTime: draft.endTime,
      dueDate: result.dueDate || undefined,
      projectId: result.projectId || undefined,
    });
    setDraft(null);
    setDraftAnchor(null);
    if (mode === "day") onSelectTask(taskId);
    showToast?.({ message: t("calendar.createdToast", { title: result.title }) });
  }

  function openDay(date: string) {
    clearTransient();
    setAnchor(date);
    setMode("day");
  }

  function openMonth(date: string) {
    clearTransient();
    setAnchor(date);
    setMode("month");
  }

  const days = mode === "day" ? [anchor] : getWeekDays(anchor);
  const isTimeGrid = mode === "week" || mode === "day";

  return (
    <div className="gcal-shell">
      <CalendarToolbar
        mode={mode}
        rangeLabel={rangeLabel}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
        onModeChange={switchMode}
        onToday={() => {
          clearTransient();
          setAnchor(today);
        }}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        aiDisabled={aiStatus === "loading"}
        onAiClick={suggestSchedule}
      />

      <div className={sidebarCollapsed ? "gcal-body is-sidebar-rail" : "gcal-body"}>
        <CalendarLeftSidebar
          anchor={anchor}
          datesWithItems={datesWithItems}
          onSelectDate={(date) => {
            clearTransient();
            setAnchor(date);
          }}
          layers={layers}
          onToggleLayer={toggleLayer}
          projects={projects}
          projectFilter={projectFilter}
          onToggleProject={toggleProjectFilter}
          onSelectAllProjects={() => {
            onClearTaskSelection?.();
            setProjectFilter("all");
          }}
          onCreateClick={() =>
            setQuickCreate({ date: anchor, startTime: "09:00", endTime: "10:00", allDay: false })
          }
          collapsed={sidebarCollapsed}
          onExpand={() => setSidebarCollapsed(false)}
        />

        <div className={mode === "day" ? "gcal-main-column has-detail" : "gcal-main-column"}>
          <section className={isTimeGrid ? "gcal-main is-timegrid" : "gcal-main"}>
            {aiStatus === "preview" ? (
              <div className="gcal-suggestion-bar">
                <div>
                  <strong>{t("calendar.suggestionCount", { n: aiPlacements.length })}</strong>
                  <span>{t("calendar.suggestionPreview")}</span>
                </div>
                <button type="button" onClick={applyAiPlacements}>
                  {t("calendar.apply")}
                </button>
                <button type="button" onClick={cancelAiPlacements}>
                  {t("common.cancel")}
                </button>
              </div>
            ) : null}
            {aiStatus === "error" ? <p className="gcal-alert">{t("calendar.noOpenSlots")}</p> : null}

            {mode === "month" ? (
              <MonthView
                anchor={anchor}
                items={items}
                dragOverId={dragOverId}
                onDragStart={handleDragStart}
                onOverCell={over}
                onLeaveCell={leave}
                onDropCell={dropCell}
                onClickItem={handleClickItem}
                onClickCell={(date) => {
                  setPopover(null);
                  setAnchor(date);
                }}
                onOpenDay={openDay}
                onShowAgenda={(date, anchor) => setPopover({ kind: "agenda", date, anchor })}
              />
            ) : mode === "year" ? (
              <YearView anchor={anchor} onOpenMonth={openMonth} onOpenDay={openDay} />
            ) : (
              <WeekView
                days={days}
                anchor={anchor}
                items={items}
                dragOverId={dragOverId}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onOverSlot={over}
                onLeaveSlot={leave}
                onDragHover={handleDragHover}
                onDropTime={dropTime}
                onDropAllDay={dropAllDay}
                onClickItem={handleClickItem}
                onClickAllDaySlot={(day) => setQuickCreate({ date: day, allDay: true })}
                onResizeItem={handleResizeItem}
                draft={draft}
                dragPreview={dragPreview}
                draggingTaskTitle={tasks.find((task) => task.id === draggingTaskId)?.title ?? ""}
                aiPlacements={aiPlacements.map((placement) => ({
                  ...placement,
                  title: tasks.find((task) => task.id === placement.taskId)?.title ?? "Suggested task",
                }))}
                onSelectionStart={handleSelectionStart}
                onDraftCreate={handleDraftCreate}
              />
            )}
          </section>

          {mode === "day" ? (
            <DayDetailPanel
              draft={draft}
              taskDetail={taskDetail}
              projects={projects}
              onCancelDraft={handleCancelDraft}
              onCreateFromDraft={handleCreateFromDraft}
            />
          ) : null}
        </div>
      </div>

      {popover?.kind === "event" ? (
        <EventPopover
          item={popover.item}
          anchor={popover.anchor}
          onClose={() => setPopover(null)}
          onOpenDetail={openDetailFromPopover}
        />
      ) : null}
      {popover?.kind === "agenda" ? (
        <DayAgendaPopover
          date={popover.date}
          items={items.filter((item) => item.date === popover.date)}
          anchor={popover.anchor}
          onClose={() => setPopover(null)}
          onClickItem={(item, anchor) => setPopover({ kind: "event", item, anchor })}
        />
      ) : null}
      {mode === "week" && draft && draftAnchor ? (
        <CalendarPopover anchor={draftAnchor} onClose={handleCancelDraft} label={t("calendar.newTask")}>
          <NewTaskForm
            key={`${draft.date}-${draft.startTime}-${draft.endTime}`}
            draft={draft}
            projects={projects}
            onCancel={handleCancelDraft}
            onCreate={handleCreateFromDraft}
          />
        </CalendarPopover>
      ) : null}

      {quickCreate ? (
        <QuickCreatePopover
          defaults={quickCreate}
          projects={projects}
          onClose={() => setQuickCreate(null)}
          onSave={handleQuickCreateSave}
        />
      ) : null}
    </div>
  );
}
