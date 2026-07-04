// Calendar right-side Eisenhower task panel (spec §7): the classified,
// not-yet-time-blocked tasks, ready to drag onto the time grid. Not a 2x2
// matrix — collapsible priority sections, I/II expanded by default.
import { DragEvent, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { Project, Task } from "../../types";
import { getMatrixPosition, type MatrixQuadrant } from "../../utils/eisenhower";
import { useT } from "../../i18n";
import { MotionTaskRow } from "../motion/MotionTaskRow";

const SECTIONS: Array<{ quadrant: MatrixQuadrant; defaultOpen: boolean }> = [
  { quadrant: "I", defaultOpen: true },
  { quadrant: "II", defaultOpen: true },
  { quadrant: "III", defaultOpen: true },
  { quadrant: "IV", defaultOpen: false },
];

interface CalendarRightTaskPanelProps {
  tasks: Task[];
  projects: Project[];
  today: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  // Same contract as the calendar's internal block drag: text/plain taskId.
  onDragStart: (event: DragEvent, taskId: string) => void;
  onDragEnd: () => void;
}

export function CalendarRightTaskPanel({
  tasks,
  projects,
  today,
  collapsed,
  onToggleCollapsed,
  onDragStart,
  onDragEnd,
}: CalendarRightTaskPanelProps) {
  const { t } = useT();
  const [draggingTaskId, setDraggingTaskId] = useState("");

  if (collapsed) {
    return (
      <aside className="gcal-taskpanel is-rail">
        <button
          type="button"
          className="gcal-icon-btn"
          aria-label={t("caltasks.expand")}
          title={t("caltasks.expand")}
          onClick={onToggleCollapsed}
        >
          «
        </button>
      </aside>
    );
  }

  // Only unblocked work that still needs a time slot: no start time yet,
  // and not finished/parked. Quadrant IV shows just the unsorted group.
  const candidates = tasks.filter(
    (task) =>
      !task.deletedAt &&
      task.status !== "archived" &&
      task.status !== "done" &&
      task.status !== "waiting" &&
      !task.startTime,
  );

  return (
    <aside className="gcal-taskpanel">
      <header className="gcal-taskpanel-head">
        <strong>{t("caltasks.title")}</strong>
        <button
          type="button"
          className="gcal-icon-btn"
          aria-label={t("caltasks.collapse")}
          title={t("caltasks.collapse")}
          onClick={onToggleCollapsed}
        >
          »
        </button>
      </header>
      <p className="gcal-taskpanel-hint">{t("caltasks.hint")}</p>

      {SECTIONS.map(({ quadrant, defaultOpen }) => (
        <PanelSection
          key={quadrant}
          quadrant={quadrant}
          defaultOpen={defaultOpen}
          tasks={candidates.filter((task) => getMatrixPosition(task, today).quadrant === quadrant)}
          projects={projects}
          today={today}
          draggingTaskId={draggingTaskId}
          onDragStart={onDragStart}
          onDragStartState={setDraggingTaskId}
          onDragEnd={() => {
            setDraggingTaskId("");
            onDragEnd();
          }}
        />
      ))}
    </aside>
  );
}

function PanelSection({
  quadrant,
  defaultOpen,
  tasks,
  projects,
  today,
  draggingTaskId,
  onDragStart,
  onDragStartState,
  onDragEnd,
}: {
  quadrant: MatrixQuadrant;
  defaultOpen: boolean;
  tasks: Task[];
  projects: Project[];
  today: string;
  draggingTaskId: string;
  onDragStart: (event: DragEvent, taskId: string) => void;
  onDragStartState: (taskId: string) => void;
  onDragEnd: () => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="gcal-taskpanel-section">
      <button type="button" className="gcal-taskpanel-section-head" onClick={() => setOpen((value) => !value)}>
        <span className="eis-group-caret">{open ? "⌄" : "›"}</span>
        <span className={`eis-cell-roman eis-q-${quadrant}`}>{quadrant}</span>
        <span className="gcal-taskpanel-section-name">{t(`caltasks.q${quadrant}`)}</span>
        <span className="ff-board-count">{tasks.length}</span>
      </button>
      {open ? (
        tasks.length === 0 ? (
          <p className="gcal-taskpanel-empty">{t("caltasks.empty")}</p>
        ) : (
          <AnimatePresence initial={false}>
          {tasks.map((task) => {
            const project = projects.find((item) => item.id === task.projectId);
            const dateLabel = task.scheduledDate
              ? task.scheduledDate === today
                ? t("eis.today")
                : task.scheduledDate.slice(5).replace("-", ".")
              : task.dueDate
                ? task.dueDate === today
                  ? t("eis.today")
                  : task.dueDate.slice(5).replace("-", ".")
                : "";
            return (
              <MotionTaskRow
                key={task.id}
                taskId={task.id}
                isDragging={task.id === draggingTaskId}
                className="gcal-taskpanel-row"
                draggable
                onNativeDragStart={(event) => {
                  onDragStartState(task.id);
                  onDragStart(event, task.id);
                }}
                onNativeDragEnd={onDragEnd}
                title={t("caltasks.dragHint")}
              >
                <span className="gcal-taskpanel-row-title">{task.title}</span>
                <span className="gcal-taskpanel-row-meta">
                  {project ? (
                    <span className="ff-dot" style={{ background: project.color }} aria-hidden="true" />
                  ) : null}
                  {dateLabel}
                  {dateLabel && task.estimatedMinutes > 0 ? " · " : ""}
                  {task.estimatedMinutes > 0 ? t("eis.minutes", { n: task.estimatedMinutes }) : ""}
                </span>
              </MotionTaskRow>
            );
          })}
          </AnimatePresence>
        )
      ) : null}
    </section>
  );
}
