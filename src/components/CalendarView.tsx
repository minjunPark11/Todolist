import { DragEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppSettings,
  CalendarViewOptions,
  ExternalCalendar,
  ExternalCalendarEvent,
  FocusSession,
  List,
  Task,
  TaskDraft,
} from "../types";
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
} from "../utils/calendarItems";
import { toDateInputValue } from "../utils/date";
import {
  buildCalendarCategories,
  ensureSourceVisible,
  flattenCategories,
  isSourceVisible,
  setActiveList,
  setFocusColor,
  toggleShowCompleted,
  toggleSourceVisibility,
  useCalendarCategoryState,
  type CalendarCategory,
} from "../lib/calendarCategories";
import { inboxListId } from "../domain/spaces/membership";
import { LIST_COLOR_PRESETS } from "../domain/tasks/listColor";
import { DEFAULT_CALENDAR_VIEW_OPTIONS } from "../domain/calendar/viewOptions";
import { CalendarViewOptionsMenu } from "./calendar/CalendarViewOptions";
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
import { useWeekStart } from "../utils/appPrefs";
import { MonthView } from "./calendar/MonthView";
import { YearView } from "./calendar/YearView";
import { CalendarPopover, DayAgendaPopover, EventPopover, type PopoverAnchor } from "./calendar/EventPopover";
import { NewTaskForm, type NewTaskFormResult } from "./calendar/NewTaskForm";
import { QuickCreatePopover, type QuickCreateDefaults, type QuickCreateResult } from "./calendar/QuickCreatePopover";
import {
  hasSchedule,
  scheduleFromTask,
  scheduleToTaskPatch,
  type Schedule,
  type ScheduleIssue,
} from "../domain/schedule";
import { useT } from "../i18n";
import type { Rect } from "../domain/floating";
import { isTaskOpen, LIFECYCLE } from "../domain/tasks/taskState";

type CalendarMode = "month" | "week" | "day" | "year";

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
  /**
   * What a task block is coloured by
   * (CALENDAR_COLOR_SOURCE_AND_VIEW_OPTIONS_DESIGN.md §3).
   *
   * The colour used to come from a calendar-only `categoryId` that only three
   * controls inside this screen could set, so every task made in the Tasks
   * module came out the same colour. It reads the List now, which is a
   * decision the user already makes.
   */
  lists: List[];
  externalCalendars: ExternalCalendar[];
  externalCalendarEvents: ExternalCalendarEvent[];
  focusSessions: FocusSession[];
  onUpdateExternalCalendar: (calendarId: string, patch: Partial<ExternalCalendar>) => void;
  // Sidebar recoloring writes back to the category's source entity.
  // (space detail "Open Calendar" hand-off).
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
  /** The canonical schedule write (design §13). Every drop goes through it. */
  onUpdateTaskSchedule: (taskId: string, next: Schedule) => ScheduleIssue[];
  onCreateTask: (draft: TaskDraft) => string;
  onDeleteTask?: (taskId: string) => void;
  /**
   * Opens a TASK — the app's own Detail, beside the block that was clicked
   * (CALENDAR_CREATE_AND_TASK_POPUP_DESIGN.md §5).
   *
   * The calendar used to answer that click with a card of its own: a title, a
   * date, and a two-field quick edit. Which meant the same Task showed
   * different fields depending on the screen it was opened from — the thing
   * TASK_DETAIL_PANEL_MERGE_DESIGN.md §2 exists to have removed.
   *
   * External events and focus sessions are NOT tasks and keep the card: there
   * is no Task Detail to open for them.
   */
  onOpenTask?: (taskId: string, anchor?: Rect) => void;
  /**
   * Finish a task from a block or a chip
   * (CALENDAR_TASK_CHECKBOX_DESIGN.md §7).
   *
   * This is `planner.toggleTaskDone` and deliberately not `onUpdateTask`
   * above. The shortcut would write `status` and leave `completedAt` behind
   * (§12.12 recorded what happens when those two disagree), and it knows
   * nothing about repeats — ticking a repeating task on the grid would finish
   * the series instead of rolling it to the next occurrence.
   */
  onToggleTaskDone?: (taskId: string) => void;
  /** Where the `⋯` panel's answers are kept (design §6.3). */
  appSettings: AppSettings;
  onUpdateAppSettings?: (patch: Partial<AppSettings>) => void;
  /** Recolouring a List from the calendar's left column (design §4). */
  onUpdateList?: (listId: string, patch: Partial<List>) => void;
  /** Changing a block's colour now means moving the task (design §5.1). */
  onMoveTaskToList?: (taskId: string, listId: string) => void;
  showToast?: (toast: ToastState) => void;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function CalendarView({
  tasks,
  lists,
  externalCalendars,
  externalCalendarEvents,
  focusSessions,
  onUpdateExternalCalendar,
  onUpdateTask,
  onUpdateTaskSchedule,
  onCreateTask,
  onDeleteTask,
  onOpenTask,
  onToggleTaskDone,
  appSettings,
  onUpdateAppSettings,
  onUpdateList,
  onMoveTaskToList,
  showToast,
}: CalendarViewProps) {
  const { t, lang } = useT();
  const weekStartPref = useWeekStart();
  const [mode, setMode] = useState<CalendarMode>("week");
  const [anchor, setAnchor] = useState(todayValue());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // When the calendar gets too narrow for a 7-day week grid (columns become
  // too thin to read event names), fall back to the single-day view. Measured
  // on the shell itself so it tracks the app sidebar, not just the viewport.
  const shellRef = useRef<HTMLDivElement>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const el = shellRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      setIsNarrow(entries[0].contentRect.width < 640);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    // One-way nudge: collapsing to narrow switches week→day, but growing back
    // leaves the choice to the user (they can re-pick "week" any time).
    if (isNarrow) setMode((current) => (current === "week" ? "day" : current));
  }, [isNarrow]);
  const [dragOverId, setDragOverId] = useState("");
  const [quickCreate, setQuickCreate] = useState<QuickCreateDefaults | null>(null);
  const [popover, setPopover] = useState<PopoverState>(null);
  // The keyboard Delete has to have a visible target: nothing may be deleted
  // by a keystroke unless the user can see what is about to go. The ring on
  // the selected block is that target (CALENDAR_APPLE_DESIGN.md C3).
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [aiStatus, setAiStatus] = useState<"idle" | "loading" | "preview" | "error">("idle");
  const [aiPlacements, setAiPlacements] = useState<AiPlacement[]>([]);
  // V3 §7/§8: the confirmed draft block. Never written to localStorage/task
  // list — only createTask() (via handleCreateFromDraft) touches real data.
  const [draft, setDraft] = useState<CalendarDraftBlock | null>(null);
  // Where the week view's draft popover should open (day view uses the panel).
  const [draftAnchor, setDraftAnchor] = useState<PopoverAnchor | null>(null);

  const today = todayValue();
  const anchorDate = new Date(`${anchor}T00:00:00`);

  // The left column's rows: the account's Lists, the subscribed calendars, and
  // the focus recording (COLOR_SOURCE design §4).
  const categoryState = useCalendarCategoryState();
  /**
   * The `⋯` panel's three answers (design §6).
   *
   * `showCompleted` used to live in the calendar's own localStorage blob
   * (CALENDAR_TASK_CHECKBOX_DESIGN.md D1-B). It is read from there once, for
   * an account that set it before this release — after which the account's
   * copy wins and the old one is never consulted again.
   */
  const viewOptions = useMemo<CalendarViewOptions>(
    () => ({
      ...DEFAULT_CALENDAR_VIEW_OPTIONS,
      showCompleted: categoryState.showCompleted,
      ...(appSettings.calendarViewOptions ?? {}),
    }),
    [appSettings.calendarViewOptions, categoryState.showCompleted],
  );
  const setViewOptions = (patch: Partial<CalendarViewOptions>) =>
    onUpdateAppSettings?.({ calendarViewOptions: { ...viewOptions, ...patch } });
  const categoryGroups = useMemo(
    () =>
      buildCalendarCategories({
        state: categoryState,
        lists,
        externalCalendars,
        focusCategoryName: t("calendar.focusActualCategory"),
      }),
    [categoryState, lists, externalCalendars, t],
  );
  const categoriesById = useMemo(() => flattenCategories(categoryGroups), [categoryGroups]);
  // Where a task made on the calendar goes when nothing else says. The Inbox is
  // where an unfiled task lands everywhere else in the app, so it is also the
  // answer for a stored List that has since been archived or deleted.
  const defaultCategoryId = useMemo(() => inboxListId(lists), [lists]);
  const activeCategoryId = categoriesById.has(categoryState.activeListId)
    ? categoryState.activeListId
    : defaultCategoryId;
  const visibleCategoryIds = useMemo(
    () =>
      new Set(
        [...categoriesById.keys()].filter((id) =>
          isSourceVisible(id, categoryState.hiddenSourceIds, externalCalendars),
        ),
      ),
    [categoriesById, categoryState.hiddenSourceIds, externalCalendars],
  );
  /**
   * What the grid draws (CALENDAR_TASK_CHECKBOX_DESIGN.md §1).
   *
   * This was `defaultCalendarLayers` written straight into the call below, so
   * `completed: false` was the whole app's answer and no screen could change
   * it. Only the completed layer is a setting; the other two stay at their
   * defaults until something asks otherwise.
   */
  const layers = useMemo<CalendarLayerToggles>(
    () => ({
      ...defaultCalendarLayers,
      completed: viewOptions.showCompleted,
      focusActual: viewOptions.showFocusRecords,
    }),
    [viewOptions.showCompleted, viewOptions.showFocusRecords],
  );

  /**
   * A month either side of the one on screen.
   *
   * Repeating events are expanded within this and nowhere else, so it has to
   * cover everything a view can reach without a re-render — the month grid,
   * its leading and trailing days, and the mini month beside it. Wider costs
   * only the occurrences nobody looks at; narrower leaves gaps in the grid.
   */
  const externalCalendarRange = useMemo(() => {
    const year = anchorDate.getFullYear();
    const month = anchorDate.getMonth();
    return {
      from: toDateInputValue(new Date(year, month - 1, 1)),
      to: toDateInputValue(new Date(year, month + 2, 0)),
    };
  }, [anchorDate]);

  const items = useMemo(
    () =>
      buildCalendarItems({
        tasks,
        lists,
        focusSessions,
        externalCalendars,
        externalCalendarEvents,
        externalCalendarRange,
        layers,
        colorBy: viewOptions.colorBy,
        categories: categoriesById,
        defaultCategoryId,
        visibleCategoryIds,
      }),
    [
      tasks,
      lists,
      focusSessions,
      externalCalendars,
      externalCalendarEvents,
      externalCalendarRange,
      layers,
      viewOptions.colorBy,
      categoriesById,
      defaultCategoryId,
      visibleCategoryIds,
    ],
  );

  const monthPrefix = `${anchorDate.getFullYear()}-${pad(anchorDate.getMonth() + 1)}`;
  const datesWithItems = useMemo(
    () => new Set(items.filter((item) => item.date.startsWith(monthPrefix)).map((item) => item.date)),
    [items, monthPrefix],
  );

  // A selected item that no longer exists (deleted, filtered out by a hidden
  // category, or moved off the visible range) must not keep a ring alive that
  // Delete would then aim at nothing.
  useEffect(() => {
    if (selected && !items.some((item) => item.key === selected.key)) setSelected(null);
  }, [items, selected]);

  // Year view shades each date by how much sits on it, so a year's worth of
  // load is readable at a glance (C2). Counted across the whole item set, not
  // just the anchored month, because the year view shows all twelve.
  const countsByDate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.date, (counts.get(item.date) ?? 0) + 1);
    return counts;
  }, [items]);

  const unscheduled = useMemo(
    // "Unscheduled" now means no date at all. A task with only a deadline is
    // on the calendar (the two dates merged), so listing it here as well would
    // show it in both places at once.
    () =>
      tasks.filter(
        (task) =>
          !hasSchedule(scheduleFromTask(task)) && isTaskOpen(task),
      ),
    [tasks],
  );

  let rangeLabel: string;
  if (mode === "month") {
    rangeLabel = getMonthLabel(anchorDate.getFullYear(), anchorDate.getMonth(), lang);
  } else if (mode === "week") {
    rangeLabel = getWeekLabel(anchor, lang, weekStartPref);
  } else if (mode === "year") {
    rangeLabel = t("calendar.yearTitle", { year: anchorDate.getFullYear() });
  } else {
    rangeLabel = getDayLabel(anchor, lang);
  }

  function clearTransient() {
    setDraft(null);
    setDraftAnchor(null);
    setPopover(null);
    setSelected(null);
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

  // Calendar shortcuts (CALENDAR_APPLE_DESIGN.md C1).
  //
  // Apple's own ⌘1–⌘4 / ⌘T could not be reused: Ctrl+digit and Ctrl+T are
  // claimed by the browser in the web build, and plain `t` is already the
  // app-wide "go to the Today page" (App.tsx). So the view keys are the
  // letters they stand for and Home means today, which collides with nothing.
  //
  // Modifier combos are skipped for the same reason App.tsx skips them: they
  // belong to the browser and the OS, not to single-key shortcuts.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      // A dialog owns the keyboard while it is open.
      if (quickCreate) return;

      if (event.key === "Escape") {
        clearTransient();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        // Only tasks can be deleted; an external event is a marker derived
        // from another record.
        if (!selected || selected.sourceType !== "task" || !onDeleteTask) return;
        event.preventDefault();
        handleDeleteFromPopover(selected);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        shift(-1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        shift(1);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        clearTransient();
        setAnchor(today);
        return;
      }

      const viewKey: Record<string, CalendarMode> = { d: "day", w: "week", m: "month", y: "year" };
      const next = viewKey[event.key.toLowerCase()];
      if (next) {
        event.preventDefault();
        switchMode(next);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // Deliberately no dependency array: the handler closes over `selected`,
    // `mode`, `anchor` and `quickCreate`, and re-binding one window listener
    // per render is far cheaper than the stale-closure bugs a partial dep list
    // would hide.
  });

  // §16.1: row click picks the category new events go into. readOnly
  // (external) categories cannot become the active category; hidden ones are
  // re-shown so the next created event is not invisible.
  function handleSelectCategory(category: CalendarCategory) {
    if (category.isReadOnly) {
      showToast?.({ message: t("calendar.readOnlyCategoryToast") });
      return;
    }
    ensureSourceVisible(category.id);
    setActiveList(category.id);
  }

  // §16.2: checkbox only flips visibility — never the active category.
  // External categories keep their visibility on the calendar record itself.
  function handleToggleCategory(category: CalendarCategory) {
    if (category.group === "external" && category.sourceId) {
      const calendar = externalCalendars.find((item) => item.id === category.sourceId);
      if (calendar) onUpdateExternalCalendar(calendar.id, { visible: !calendar.visible });
      return;
    }
    toggleSourceVisibility(category.id);
  }

  /**
   * Sidebar inline recolour. Every row writes back to whatever owns it, so the
   * colour here and the colour on that thing's own screen cannot drift.
   *
   * A List stores its colour as a preset KEY when the swatch is one of the
   * eight, and a hex otherwise (`domain/tasks/listColor`). Storing the hex for
   * a preset would work — `parseListColor` reads it — but it would come back
   * as a "custom" colour in the Tasks picker, with no swatch selected.
   */
  function handleRecolorCategory(category: CalendarCategory, color: string) {
    if (category.group === "personal") {
      const preset = LIST_COLOR_PRESETS.find((entry) => entry.hex === color.toLowerCase());
      onUpdateList?.(category.id, { color: preset ? preset.key : color });
    } else if (category.group === "external" && category.sourceId) {
      onUpdateExternalCalendar(category.sourceId, { color });
    } else if (category.group === "focus") {
      setFocusColor(color);
    }
  }

  /**
   * A month chip picked up to be dropped on another day.
   *
   * This was shared with the right-hand task panel, which is gone
   * (CALENDAR_LAYOUT_V4_DESIGN.md §1) — the `text/plain` contract stays because
   * the month view moves its own chips over it. The week grid never used HTML5
   * drag for anything of its own: a block there moves by pointer.
   */
  function handleDragStart(event: DragEvent, taskId: string) {
    event.dataTransfer.setData("text/plain", taskId);
    event.dataTransfer.effectAllowed = "move";
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

  function handleDragEnd() {
    setDragOverId("");
  }

  // Every calendar write goes through here (SCHEDULE_EDITOR_PHASE0_AUDIT.md §6).
  //
  // It used to set `scheduledDate` and deliberately leave `dueDate` alone,
  // because the two were different chips answering different questions. They
  // are one date now, so writing only the old field would leave the record
  // saying two things — and the reader, which consolidates, would turn a
  // deadline dragged by one day into a multi-day range.
  //
  // Dropping always produces a single-day schedule: the calendar has no
  // gesture that means "make this a range", and `buildCalendarItems` refuses
  // to drag one for the same reason.
  //
  // Built by spreading the task's CURRENT schedule rather than from nothing:
  // the write is a whole-schedule replacement, so a literal here would drop
  // the reminder and the repeat the task already had — dragging a daily task
  // to Thursday would quietly stop it repeating.
  function scheduleFor(taskId: string, day: string, startTime = "", endTime = ""): Schedule {
    return {
      ...scheduleFromTask(tasks.find((item) => item.id === taskId) ?? {}),
      startDate: null,
      dueDate: day,
      startTime: startTime || null,
      endTime: endTime || null,
      timezone: null,
    };
  }

  /** Drop a task onto `day` as a single-day schedule. */
  function placeOn(taskId: string, day: string, startTime = "", endTime = "") {
    onUpdateTaskSchedule(taskId, scheduleFor(taskId, day, startTime, endTime));
  }

  /** Move a task's existing schedule onto `day`, keeping whatever times it has. */
  function moveToDay(taskId: string, day: string) {
    const current = scheduleFromTask(tasks.find((item) => item.id === taskId) ?? {});
    onUpdateTaskSchedule(taskId, { ...current, startDate: null, dueDate: day });
  }

  function dropCell(event: DragEvent, day: string) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain");
    if (taskId) {
      moveToDay(taskId, day);
    }
    handleDragEnd();
  }

  // Resize commits keep the estimate in sync (spec §8.4): the block length
  // IS the new expected effort. Overlaps are allowed, same as drops.
  function handleResizeItem(taskId: string, day: string, startTime: string, endTime: string) {
    const duration = timeToMinutes(endTime) - timeToMinutes(startTime);
    if (duration < TIME_SNAP_MINUTES) return;
    placeOn(taskId, day, startTime, endTime);
    onUpdateTask(taskId, { estimatedMinutes: duration });
  }

  // Pointer-based block move: silently committed (the moving block itself
  // already previews the exact target slot). Overlaps are allowed.
  function handleMoveItem(taskId: string, day: string, startTime: string, endTime: string) {
    placeOn(taskId, day, startTime, endTime);
  }

  // Dropping a time block on the all-day band keeps the date but clears the
  // times, turning it into an all-day item.
  function handleMoveItemToAllDay(taskId: string, day: string) {
    placeOn(taskId, day);
  }

  function suggestSchedule() {
    if (unscheduled.length === 0) {
      showToast?.({ message: t("calendar.noUnscheduled") });
      return;
    }
    setAiStatus("loading");
    window.setTimeout(() => {
      const weekDays = getWeekDays(anchor, weekStartPref);
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
      placeOn(placement.taskId, placement.day, placement.startTime, placement.endTime);
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
    // §16.5: clicking an event highlights its row in the left column and makes
    // it the default for the next new one (read-only sources excluded).
    const itemCategory = item.categoryId ? categoriesById.get(item.categoryId) : undefined;
    if (itemCategory && !itemCategory.isReadOnly) {
      setActiveList(itemCategory.id);
      ensureSourceVisible(itemCategory.id);
    }
    setSelected(item);
    // A task opens the app's Detail beside the block (§5); everything else —
    // an external event, a focus session — keeps the calendar's own card,
    // because there is no Task behind it to open.
    if (item.sourceType === "task" && onOpenTask) {
      setPopover(null);
      onOpenTask(item.sourceId, { x: anchor.left, y: anchor.top, width: anchor.right - anchor.left, height: anchor.bottom - anchor.top });
      return;
    }
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
    // The ring deliberately stays put: onDeleteTask opens the app's confirm
    // dialog, and dropping the ring first would leave the user confirming a
    // deletion with nothing on screen to say which event it is. The effect
    // below clears it once the item is actually gone.
    onDeleteTask?.(item.sourceId);
  }

  function handleQuickCreateSave(result: QuickCreateResult) {
    const category = categoriesById.get(result.categoryId);
    if (category?.isReadOnly) {
      showToast?.({ message: t("calendar.readOnlyCategoryToast") });
      return;
    }
    // The popover used to ask "task or deadline". Those were two fields; they
    // are one now, so the question had two answers that looked identical on
    // the calendar (audit §6, 1-e).
    onCreateTask({
      title: result.title,
      status: LIFECYCLE.open,
      ...scheduleToTaskPatch(scheduleFor(result.date, result.startTime, result.endTime)),
      listId: result.categoryId,
    });
    // §16.4: creating in a category re-shows it and keeps it active.
    ensureSourceVisible(result.categoryId);
    setActiveList(result.categoryId);
    setQuickCreate(null);
  }

  // §2.3/§12.3: any new empty-grid selection replaces a pending draft.
  function handleSelectionStart() {
    setDraft(null);
    setDraftAnchor(null);
    setPopover(null);
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
    // The form can still name a later deadline. Dragged day plus deadline is
    // exactly the pair that becomes a range (audit 1-d), so build it as one
    // rather than writing two fields and letting the reader infer it.
    const taskId = onCreateTask({
      title: result.title,
      status: LIFECYCLE.open,
      ...scheduleToTaskPatch({
        startDate: result.dueDate && result.dueDate > draft.date ? draft.date : null,
        dueDate: result.dueDate && result.dueDate > draft.date ? result.dueDate : draft.date,
        startTime: draft.startTime || null,
        endTime: draft.endTime || null,
        timezone: null,
        reminders: [],
        repeat: "none",
      }),
      listId: result.categoryId,
    });
    ensureSourceVisible(result.categoryId);
    setActiveList(result.categoryId);
    setDraft(null);
    setDraftAnchor(null);
    showToast?.({ message: t("calendar.createdToast", { title: result.title }) });
  }

  // §13.3: changing an event's category from the popover updates the task,
  // recolors the block, and moves the sidebar highlight.
  /**
   * Moving a task to another List from the calendar (design §5.1).
   *
   * This wrote `task.categoryId` — a field only this screen could set, and
   * which nothing reads any more. Moving the task is what changing its colour
   * actually means now, and it is the same move the Tasks module makes.
   */
  function handleChangeItemCategory(item: CalendarItem, listId: string) {
    const category = categoriesById.get(listId);
    if (!category || category.isReadOnly) {
      showToast?.({ message: t("calendar.readOnlyCategoryToast") });
      return;
    }
    onMoveTaskToList?.(item.sourceId, listId);
    setActiveList(listId);
    ensureSourceVisible(listId);
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

  const days = mode === "day" ? [anchor] : getWeekDays(anchor, weekStartPref);
  const isTimeGrid = mode === "week" || mode === "day";

  return (
    <div className="gcal-shell" ref={shellRef}>
      <CalendarToolbar
        mode={mode}
        rangeLabel={rangeLabel}
        onToday={() => {
          clearTransient();
          setAnchor(today);
        }}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        onModeChange={switchMode}
        viewOptions={<CalendarViewOptionsMenu options={viewOptions} onChange={setViewOptions} />}
      />

      <div className="gcal-body-container">
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
          onRecolorCategory={handleRecolorCategory}
          onCreate={() =>
            setQuickCreate({ date: anchor, startTime: "09:00", endTime: "10:00", allDay: false })
          }
          collapsed={sidebarCollapsed}
          onCollapse={() => setSidebarCollapsed(true)}
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
                selectedKey={selected?.key ?? ""}
                dragOverId={dragOverId}
                onDragStart={handleDragStart}
                onOverCell={over}
                onLeaveCell={leave}
                onDropCell={dropCell}
                onClickItem={handleClickItem}
                onToggleDone={onToggleTaskDone}
                onClickCell={(date) => {
                  setPopover(null);
                  setAnchor(date);
                }}
                onOpenDay={openDay}
                onShowAgenda={(date, anchor) => setPopover({ kind: "agenda", date, anchor })}
              />
            ) : mode === "year" ? (
              <YearView
                anchor={anchor}
                countsByDate={countsByDate}
                onOpenMonth={openMonth}
                onOpenDay={openDay}
              />
            ) : (
              <WeekView
                days={days}
                anchor={anchor}
                items={items}
                selectedKey={selected?.key ?? ""}
                onClickItem={handleClickItem}
                onToggleDone={onToggleTaskDone}
                onClickAllDaySlot={(day) => setQuickCreate({ date: day, allDay: true })}
                onResizeItem={handleResizeItem}
                onMoveItem={handleMoveItem}
                onMoveItemToAllDay={handleMoveItemToAllDay}
                durationForSource={(sourceId) => getTaskDuration(tasks.find((task) => task.id === sourceId))}
                draft={draft}
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

      </div>
      </div>

      {popover?.kind === "event" ? (
        <EventPopover
          item={popover.item}
          anchor={popover.anchor}
          categoryGroups={categoryGroups}
          onChangeCategory={handleChangeItemCategory}
          onClose={() => setPopover(null)}
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
        <CalendarPopover anchor={draftAnchor} onClose={handleCancelDraft} label={t("calendar.newTask")} size="form">
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
