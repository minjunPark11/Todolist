import { DragEvent, ReactNode, useEffect, useMemo, useState } from "react";
import type { ConceptNote, ExternalCalendar, ExternalCalendarEvent, FocusSession, Project, StudyTopic, Task, TaskDraft } from "../types";
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
} from "../utils/calendarItems";
import {
  buildCalendarCategories,
  ensureCategoryVisible,
  flattenCategories,
  isCategoryVisible,
  projectCategoryId,
  setActiveCategory,
  toggleCategoryVisibility,
  useCalendarCategoryState,
  type CalendarCategory,
} from "../lib/calendarCategories";
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
import { CalendarRightTaskPanel } from "./calendar/CalendarRightTaskPanel";
import { WeekView } from "./calendar/WeekView";
import { MonthView } from "./calendar/MonthView";
import { YearView } from "./calendar/YearView";
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
  studyTopics: StudyTopic[];
  externalCalendars: ExternalCalendar[];
  externalCalendarEvents: ExternalCalendarEvent[];
  focusSessions: FocusSession[];
  onUpdateExternalCalendar: (calendarId: string, patch: Partial<ExternalCalendar>) => void;
  // When set, the calendar mounts with this project's category selected
  // (space detail "Open Calendar" hand-off).
  initialProjectId?: string;
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
  onCreateTask: (draft: TaskDraft) => string;
  onDeleteTask?: (taskId: string) => void;
  onOpenProject?: (projectId: string) => void;
  onOpenStudyReview?: (noteId: string) => void;
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
  studyTopics,
  externalCalendars,
  externalCalendarEvents,
  focusSessions,
  onUpdateExternalCalendar,
  initialProjectId,
  onUpdateTask,
  onCreateTask,
  onDeleteTask,
  onOpenProject,
  onOpenStudyReview,
  onClearTaskSelection,
  showToast,
}: CalendarViewProps) {
  const { t, lang } = useT();
  const [mode, setMode] = useState<CalendarMode>("week");
  const [anchor, setAnchor] = useState(todayValue());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [taskPanelCollapsed, setTaskPanelCollapsed] = useState(false);
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

  // Category spec §15: groups/categories derived from stored personal
  // categories + study topics + projects + external calendars.
  const categoryState = useCalendarCategoryState();
  const categoryGroups = useMemo(
    () =>
      buildCalendarCategories({
        state: categoryState,
        projects,
        studyTopics,
        externalCalendars,
        focusCategoryName: t("calendar.focusActualCategory"),
      }),
    [categoryState, projects, studyTopics, externalCalendars, t],
  );
  const categoriesById = useMemo(() => flattenCategories(categoryGroups), [categoryGroups]);
  const defaultCategoryId = categoryState.defaultCategoryId;
  // Invalid persisted ids fall back to the default category (§15.6).
  const activeCategoryId = categoriesById.has(categoryState.activeCategoryId)
    ? categoryState.activeCategoryId
    : defaultCategoryId;
  const visibleCategoryIds = useMemo(
    () =>
      new Set(
        [...categoriesById.keys()].filter((id) =>
          isCategoryVisible(id, categoryState.hiddenCategoryIds, externalCalendars),
        ),
      ),
    [categoriesById, categoryState.hiddenCategoryIds, externalCalendars],
  );

  // Space detail hand-off: select the project's category on mount.
  useEffect(() => {
    if (!initialProjectId) return;
    const categoryId = projectCategoryId(initialProjectId);
    if (categoriesById.has(categoryId)) {
      setActiveCategory(categoryId);
      ensureCategoryVisible(categoryId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProjectId]);

  const items = useMemo(
    () =>
      buildCalendarItems({
        tasks,
        projects,
        conceptNotes,
        focusSessions,
        externalCalendars,
        externalCalendarEvents,
        layers: defaultCalendarLayers,
        projectFilter: "all",
        categories: categoriesById,
        defaultCategoryId,
        visibleCategoryIds,
      }),
    [tasks, projects, conceptNotes, focusSessions, externalCalendars, externalCalendarEvents, categoriesById, defaultCategoryId, visibleCategoryIds],
  );

  const monthPrefix = `${anchorDate.getFullYear()}-${pad(anchorDate.getMonth() + 1)}`;
  const datesWithItems = useMemo(
    () => new Set(items.filter((item) => item.date.startsWith(monthPrefix)).map((item) => item.date)),
    [items, monthPrefix],
  );

  const unscheduled = useMemo(
    () => tasks.filter((task) => !(task.scheduledDate || task.status === "done" || task.status === "archived")),
    [tasks],
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

  // §16.1: row click picks the category new events go into. readOnly
  // (external) categories cannot become the active category; hidden ones are
  // re-shown so the next created event is not invisible.
  function handleSelectCategory(category: CalendarCategory) {
    onClearTaskSelection?.();
    if (category.isReadOnly) {
      showToast?.({ message: t("calendar.readOnlyCategoryToast") });
      return;
    }
    ensureCategoryVisible(category.id);
    setActiveCategory(category.id);
  }

  // §16.2: checkbox only flips visibility — never the active category.
  // External categories keep their visibility on the calendar record itself.
  function handleToggleCategory(category: CalendarCategory) {
    onClearTaskSelection?.();
    if (category.group === "external" && category.sourceId) {
      const calendar = externalCalendars.find((item) => item.id === category.sourceId);
      if (calendar) onUpdateExternalCalendar(calendar.id, { visible: !calendar.visible });
      return;
    }
    toggleCategoryVisibility(category.id);
  }

  // Category → task field mapping: picking a project category also links the
  // task to that project; other categories leave projectId alone.
  function projectIdForCategory(categoryId: string): string | undefined {
    const category = categoriesById.get(categoryId);
    return category?.group === "project" ? category.sourceId : undefined;
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
    if (!task) return 60;
    // Spec §8.3: the estimate drives the block length; fall back to the
    // existing block's duration, then to a 60-minute default.
    if (task.estimatedMinutes > 0) return task.estimatedMinutes;
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
    // Overlap no longer blocks the drop, so the preview only rejects
    // zero-length targets (e.g. dropping at the grid's very end).
    const isValid = end > start;
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
      if (end <= start) {
        showToast?.({ message: t("calendar.dropInvalid") });
        handleDragEnd();
        return;
      }
      // Overlaps are allowed (spec §10.5 option A) — the grid renders
      // overlapping blocks side by side; the toast just calls it out.
      const overlaps = hasConflict(day, startTime, endTime, taskId);
      onUpdateTask(taskId, {
        scheduledDate: day,
        startTime,
        endTime,
      });
      showToast?.({
        message: overlaps
          ? t("calendar.dropScheduledOverlap", { title: task?.title ?? "", time: startTime })
          : t("calendar.dropScheduled", { title: task?.title ?? "", time: startTime }),
      });
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

  // Resize commits keep the estimate in sync (spec §8.4): the block length
  // IS the new expected effort. Overlaps are allowed, same as drops.
  function handleResizeItem(taskId: string, day: string, startTime: string, endTime: string) {
    const duration = timeToMinutes(endTime) - timeToMinutes(startTime);
    if (duration < TIME_SNAP_MINUTES) return;
    onUpdateTask(taskId, { scheduledDate: day, startTime, endTime, estimatedMinutes: duration });
  }

  // Pointer-based block move: silently committed (the moving block itself
  // already previews the exact target slot). Overlaps are allowed.
  function handleMoveItem(taskId: string, day: string, startTime: string, endTime: string) {
    onUpdateTask(taskId, { scheduledDate: day, startTime, endTime });
  }

  // Dropping a time block on the all-day band keeps the date but clears the
  // times, turning it into an all-day item.
  function handleMoveItemToAllDay(taskId: string, day: string) {
    onUpdateTask(taskId, { scheduledDate: day, startTime: "", endTime: "" });
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
    // §16.5: clicking an event highlights its category in the sidebar and
    // makes it the default for the next new event (readOnly ones excluded).
    const itemCategory = item.categoryId ? categoriesById.get(item.categoryId) : undefined;
    if (itemCategory && !itemCategory.isReadOnly) {
      setActiveCategory(itemCategory.id);
      ensureCategoryVisible(itemCategory.id);
    }
    if (mode === "day" && item.sourceType === "project") {
      onOpenProject?.(item.sourceId);
      return;
    }
    if (mode === "day" && item.sourceType === "note") {
      onOpenStudyReview?.(item.sourceId);
      return;
    }
    // Task/external events open the same popover in every view; the quick-edit
    // form inside it replaces the old jump into the day-view detail panel.
    setPopover({ kind: "event", item, anchor });
  }

  // Quick edit from the popover: start/end time + memo only (§ user request);
  // anything deeper still goes through the task detail drawer.
  function handleQuickEditSave(item: CalendarItem, input: { startTime: string; endTime: string; memo: string }) {
    if (item.sourceType !== "task") return;
    onUpdateTask(item.sourceId, { startTime: input.startTime, endTime: input.endTime, notes: input.memo });
    setPopover(null);
  }

  // Delete flows through the app-level requestDeleteTask, so the global
  // confirm-before-delete setting and toast apply here too.
  function handleDeleteFromPopover(item: CalendarItem) {
    if (item.sourceType !== "task") return;
    setPopover(null);
    onClearTaskSelection?.();
    onDeleteTask?.(item.sourceId);
  }

  // Project/review markers only — task events edit inline in the popover.
  function openDetailFromPopover(item: CalendarItem) {
    setPopover(null);
    if (item.sourceType === "project") {
      onOpenProject?.(item.sourceId);
    } else if (item.sourceType === "note") {
      onOpenStudyReview?.(item.sourceId);
    }
  }

  function handleQuickCreateSave(result: QuickCreateResult) {
    const category = categoriesById.get(result.categoryId);
    if (category?.isReadOnly) {
      showToast?.({ message: t("calendar.readOnlyCategoryToast") });
      return;
    }
    if (result.type === "deadline") {
      onCreateTask({
        title: result.title,
        status: "todo",
        dueDate: result.date,
        categoryId: result.categoryId,
        projectId: projectIdForCategory(result.categoryId),
      });
    } else {
      onCreateTask({
        title: result.title,
        status: "todo",
        scheduledDate: result.date,
        startTime: result.startTime || undefined,
        endTime: result.endTime || undefined,
        categoryId: result.categoryId,
        projectId: projectIdForCategory(result.categoryId),
      });
    }
    // §16.4: creating in a category re-shows it and keeps it active.
    ensureCategoryVisible(result.categoryId);
    setActiveCategory(result.categoryId);
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
    const category = categoriesById.get(result.categoryId);
    if (category?.isReadOnly) {
      showToast?.({ message: t("calendar.readOnlyCategoryToast") });
      return;
    }
    const taskId = onCreateTask({
      title: result.title,
      status: "todo",
      scheduledDate: draft.date,
      startTime: draft.startTime,
      endTime: draft.endTime,
      dueDate: result.dueDate || undefined,
      categoryId: result.categoryId,
      projectId: projectIdForCategory(result.categoryId),
    });
    ensureCategoryVisible(result.categoryId);
    setActiveCategory(result.categoryId);
    setDraft(null);
    setDraftAnchor(null);
    showToast?.({ message: t("calendar.createdToast", { title: result.title }) });
  }

  // §13.3: changing an event's category from the popover updates the task,
  // recolors the block, and moves the sidebar highlight.
  function handleChangeItemCategory(item: CalendarItem, categoryId: string) {
    const category = categoriesById.get(categoryId);
    if (!category || category.isReadOnly) {
      showToast?.({ message: t("calendar.readOnlyCategoryToast") });
      return;
    }
    const projectId = projectIdForCategory(categoryId);
    onUpdateTask(item.sourceId, projectId ? { categoryId, projectId } : { categoryId });
    setActiveCategory(categoryId);
    ensureCategoryVisible(categoryId);
    setPopover(null);
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
      />

      <div className={sidebarCollapsed ? "gcal-body is-sidebar-rail" : "gcal-body"}>
        <CalendarLeftSidebar
          anchor={anchor}
          datesWithItems={datesWithItems}
          onSelectDate={(date) => {
            clearTransient();
            setAnchor(date);
          }}
          groups={categoryGroups}
          activeCategoryId={activeCategoryId}
          isCategoryVisible={(categoryId) => visibleCategoryIds.has(categoryId)}
          onToggleCategory={handleToggleCategory}
          onSelectCategory={handleSelectCategory}
          onCreateClick={() =>
            setQuickCreate({ date: anchor, startTime: "09:00", endTime: "10:00", allDay: false })
          }
          collapsed={sidebarCollapsed}
          onExpand={() => setSidebarCollapsed(false)}
        />

        <div className="gcal-main-column">
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
                onMoveItem={handleMoveItem}
                onMoveItemToAllDay={handleMoveItemToAllDay}
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
        </div>

        {mode !== "year" ? (
          <CalendarRightTaskPanel
            tasks={tasks}
            projects={projects}
            today={today}
            collapsed={taskPanelCollapsed}
            onToggleCollapsed={() => setTaskPanelCollapsed((value) => !value)}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        ) : null}
      </div>

      {popover?.kind === "event" ? (
        <EventPopover
          item={popover.item}
          anchor={popover.anchor}
          categoryGroups={categoryGroups}
          onChangeCategory={handleChangeItemCategory}
          onClose={() => setPopover(null)}
          onOpenDetail={openDetailFromPopover}
          onDelete={onDeleteTask ? handleDeleteFromPopover : undefined}
          initialMemo={
            popover.item.sourceType === "task"
              ? tasks.find((task) => task.id === popover.item.sourceId)?.notes ?? ""
              : ""
          }
          onSaveQuickEdit={handleQuickEditSave}
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
      {isTimeGrid && draft && draftAnchor ? (
        <CalendarPopover anchor={draftAnchor} onClose={handleCancelDraft} label={t("calendar.newTask")}>
          <NewTaskForm
            key={`${draft.date}-${draft.startTime}-${draft.endTime}`}
            draft={draft}
            categoryGroups={categoryGroups}
            initialCategoryId={activeCategoryId}
            onCancel={handleCancelDraft}
            onCreate={handleCreateFromDraft}
          />
        </CalendarPopover>
      ) : null}

      {quickCreate ? (
        <QuickCreatePopover
          defaults={quickCreate}
          categoryGroups={categoryGroups}
          initialCategoryId={activeCategoryId}
          onClose={() => setQuickCreate(null)}
          onSave={handleQuickCreateSave}
        />
      ) : null}
    </div>
  );
}
