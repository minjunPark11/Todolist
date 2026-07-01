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
import { DAY_END, type CalendarDraftBlock } from "../utils/calendarTime";
import type { ToastState } from "./kit";
import { CalendarToolbar } from "./calendar/CalendarToolbar";
import { CalendarLeftSidebar } from "./calendar/CalendarLeftSidebar";
import { WeekView } from "./calendar/WeekView";
import { MonthView } from "./calendar/MonthView";
import { CalendarRightPanel } from "./calendar/CalendarRightPanel";
import type { NewTaskFormResult } from "./calendar/NewTaskForm";
import { QuickCreatePopover, type QuickCreateDefaults, type QuickCreateResult } from "./calendar/QuickCreatePopover";

type CalendarMode = "month" | "week" | "day";

interface CalendarViewProps {
  tasks: Task[];
  projects: Project[];
  conceptNotes: ConceptNote[];
  onSelectTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
  onCreateTask: (draft: TaskDraft) => string;
  onOpenProject?: (projectId: string) => void;
  onOpenStudyReview?: (noteId: string) => void;
  taskDetail?: ReactNode;
  showToast?: (toast: ToastState) => void;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function CalendarView({
  tasks,
  projects,
  conceptNotes,
  onSelectTask,
  onUpdateTask,
  onCreateTask,
  onOpenProject,
  onOpenStudyReview,
  taskDetail,
  showToast,
}: CalendarViewProps) {
  const [mode, setMode] = useState<CalendarMode>("week");
  const [anchor, setAnchor] = useState(todayValue());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [layers, setLayers] = useState<CalendarLayerToggles>(defaultCalendarLayers);
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>("all");
  const [dragOverId, setDragOverId] = useState("");
  const [quickCreate, setQuickCreate] = useState<QuickCreateDefaults | null>(null);
  // V3 §7/§8: the confirmed draft block. Never written to localStorage/task
  // list — only createTask() (via handleCreateFromDraft) touches real data.
  const [draft, setDraft] = useState<CalendarDraftBlock | null>(null);

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

  const unscheduled = tasks.filter(
    (task) => !task.scheduledDate && task.status !== "done" && task.status !== "archived",
  );

  const todaySummary = useMemo(() => {
    const todays = items.filter((item) => item.date === today);
    return {
      scheduled: todays.filter((item) => item.layer === "task").length,
      deadlines: todays.filter((item) => item.layer === "deadline").length,
      reviews: todays.filter((item) => item.layer === "study-review").length,
    };
  }, [items, today]);

  let rangeLabel: string;
  if (mode === "month") {
    rangeLabel = getMonthLabel(anchorDate.getFullYear(), anchorDate.getMonth());
  } else if (mode === "week") {
    rangeLabel = getWeekLabel(anchor);
  } else {
    rangeLabel = getDayLabel(anchor);
  }

  function shift(delta: number) {
    if (mode === "month") {
      setAnchor(addMonths(anchor, delta));
    } else if (mode === "week") {
      setAnchor(addDays(anchor, delta * 7));
    } else {
      setAnchor(addDays(anchor, delta));
    }
  }

  function toggleLayer(key: keyof CalendarLayerToggles) {
    setLayers((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleProjectFilter(projectId: string) {
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
  }

  function over(id: string) {
    return (event: DragEvent) => {
      event.preventDefault();
      if (dragOverId !== id) setDragOverId(id);
    };
  }

  function leave(id: string) {
    return () => setDragOverId((current) => (current === id ? "" : current));
  }

  // §4.2/D2: drag & drop only ever changes scheduledDate — dueDate (deadline)
  // markers are non-draggable (WeekView/MonthView never call onDragStart for them).
  function dropTime(event: DragEvent, day: string, hour: number) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain");
    if (taskId) {
      onUpdateTask(taskId, {
        scheduledDate: day,
        startTime: `${pad(hour)}:00`,
        endTime: `${pad(Math.min(hour + 1, DAY_END))}:00`,
      });
    }
    setDragOverId("");
  }

  function dropAllDay(event: DragEvent, day: string) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain");
    if (taskId) {
      onUpdateTask(taskId, { scheduledDate: day, startTime: "", endTime: "" });
    }
    setDragOverId("");
  }

  function dropCell(event: DragEvent, day: string) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain");
    if (taskId) {
      onUpdateTask(taskId, { scheduledDate: day });
    }
    setDragOverId("");
  }

  function dropUnschedule(event: DragEvent) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain");
    if (taskId) {
      onUpdateTask(taskId, { scheduledDate: "", startTime: "", endTime: "" });
    }
    setDragOverId("");
  }

  // §12.4: opening any existing item drops a pending draft — the user's
  // attention has moved on, so the unsaved "new task" attempt is discarded.
  function selectTaskAndClearDraft(taskId: string) {
    setDraft(null);
    onSelectTask(taskId);
  }

  function handleClickItem(item: CalendarItem) {
    setDraft(null);
    if (item.sourceType === "task") {
      onSelectTask(item.sourceId);
    } else if (item.sourceType === "project") {
      onOpenProject?.(item.sourceId);
    } else if (item.sourceType === "note") {
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
  }

  function handleDraftCreate(day: string, startTime: string, endTime: string) {
    setDraft({ date: day, startTime, endTime });
  }

  function handleCancelDraft() {
    setDraft(null);
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
    onSelectTask(taskId);
    showToast?.({ message: `Created "${result.title}"` });
  }

  const days = mode === "day" ? [anchor] : getWeekDays(anchor);

  return (
    <div className="gcal-shell">
      <CalendarToolbar
        mode={mode}
        rangeLabel={rangeLabel}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
        onModeChange={setMode}
        onToday={() => setAnchor(today)}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
      />

      <div className="gcal-body">
        {!sidebarCollapsed ? (
          <CalendarLeftSidebar
            anchor={anchor}
            datesWithItems={datesWithItems}
            onSelectDate={setAnchor}
            layers={layers}
            onToggleLayer={toggleLayer}
            projects={projects}
            projectFilter={projectFilter}
            onToggleProject={toggleProjectFilter}
            onSelectAllProjects={() => setProjectFilter("all")}
            onCreateClick={() =>
              setQuickCreate({ date: anchor, startTime: "09:00", endTime: "10:00", allDay: false })
            }
          />
        ) : null}

        <div className="gcal-main-column">
          <section className="gcal-main">
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
                onClickCell={(date) => setQuickCreate({ date, allDay: true })}
              />
            ) : (
              <WeekView
                days={days}
                items={items}
                dragOverId={dragOverId}
                onDragStart={handleDragStart}
                onOverSlot={over}
                onLeaveSlot={leave}
                onDropTime={dropTime}
                onDropAllDay={dropAllDay}
                onClickItem={handleClickItem}
                onClickAllDaySlot={(day) => setQuickCreate({ date: day, allDay: true })}
                draft={draft}
                onSelectionStart={handleSelectionStart}
                onDraftCreate={handleDraftCreate}
              />
            )}
          </section>

          <CalendarRightPanel
            draft={draft}
            taskDetail={taskDetail}
            unscheduled={unscheduled}
            todaySummary={todaySummary}
            projects={projects}
            dragOverUnscheduled={dragOverId === "unscheduled"}
            onDragOverUnscheduled={over("unscheduled")}
            onDragLeaveUnscheduled={leave("unscheduled")}
            onDropUnscheduled={dropUnschedule}
            onCancelDraft={handleCancelDraft}
            onCreateFromDraft={handleCreateFromDraft}
            onSelectTask={selectTaskAndClearDraft}
            onDragStartTask={handleDragStart}
          />
        </div>
      </div>

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
