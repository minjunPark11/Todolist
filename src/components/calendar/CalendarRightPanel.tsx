import { DragEvent, ReactNode } from "react";
import type { Project, Task } from "../../types";
import type { CalendarDraftBlock } from "../../utils/calendarTime";
import { formatDate } from "../../utils/date";
import { NewTaskForm, type NewTaskFormResult } from "./NewTaskForm";

export interface TodaySummary {
  scheduled: number;
  deadlines: number;
  reviews: number;
}

interface CalendarRightPanelProps {
  draft: CalendarDraftBlock | null;
  taskDetail: ReactNode;
  unscheduled: Task[];
  todaySummary: TodaySummary;
  projects: Project[];
  dragOverUnscheduled: boolean;
  onDragOverUnscheduled: (event: DragEvent) => void;
  onDragLeaveUnscheduled: () => void;
  onDropUnscheduled: (event: DragEvent) => void;
  onCancelDraft: () => void;
  onCreateFromDraft: (result: NewTaskFormResult) => void;
  onSelectTask: (taskId: string) => void;
  onDragStartTask: (event: DragEvent, taskId: string) => void;
}

// CALENDAR_V3_DESIGN.md §1: the old 5-column layout (backlog aside + global
// TaskDetail) collapses into one contextual panel: draft form takes priority
// over a selected task, which takes priority over the idle summary view.
export function CalendarRightPanel({
  draft,
  taskDetail,
  unscheduled,
  todaySummary,
  projects,
  dragOverUnscheduled,
  onDragOverUnscheduled,
  onDragLeaveUnscheduled,
  onDropUnscheduled,
  onCancelDraft,
  onCreateFromDraft,
  onSelectTask,
  onDragStartTask,
}: CalendarRightPanelProps) {
  if (draft) {
    return (
      <aside className="gcal-panel" data-calendar-interactive="true">
        <NewTaskForm
          key={`${draft.date}-${draft.startTime}-${draft.endTime}`}
          draft={draft}
          projects={projects}
          onCancel={onCancelDraft}
          onCreate={onCreateFromDraft}
        />
      </aside>
    );
  }

  if (taskDetail) {
    return (
      <aside className="gcal-panel" data-calendar-interactive="true">
        {taskDetail}
      </aside>
    );
  }

  return (
    <aside className="gcal-panel gcal-panel-summary" data-calendar-interactive="true">
      <div className="gcal-panel-summary-header">
        <h2>Today</h2>
        <div className="gcal-summary-stats">
          <span>{todaySummary.scheduled} scheduled</span>
          <span>{todaySummary.deadlines} deadlines</span>
          <span>{todaySummary.reviews} reviews</span>
        </div>
      </div>

      <div
        className={dragOverUnscheduled ? "gcal-backlog is-drop" : "gcal-backlog"}
        onDragOver={onDragOverUnscheduled}
        onDragLeave={onDragLeaveUnscheduled}
        onDrop={onDropUnscheduled}
      >
        <div className="gcal-backlog-header">
          <h2>Unscheduled</h2>
          <span>{unscheduled.length}</span>
        </div>
        {unscheduled.length === 0 ? (
          <p className="gcal-hint">All clear.</p>
        ) : (
          <div className="gcal-backlog-list">
            {unscheduled.map((task) => (
              <button
                key={task.id}
                type="button"
                className={`gcal-backlog-item priority-${task.priority}`}
                draggable
                onDragStart={(event) => onDragStartTask(event, task.id)}
                onClick={() => onSelectTask(task.id)}
              >
                {task.title}
                <span className="gcal-backlog-due">
                  {task.dueDate
                    ? `Due ${formatDate(task.dueDate)} · Not scheduled yet`
                    : "No deadline · Not scheduled yet"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
