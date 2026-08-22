// The half of a Task row that is the same wherever the Task is drawn.
//
// The List drew a checkbox, a title, a priority flag and a due date. The Board
// drew a title and a due date and nothing else, so a Task could not be finished
// from a card and a High card looked like every other card — the two most
// common things anyone does to a Task were missing from one of the two places
// a Task is shown. They were two components doing one job.
//
// TICKTICK_COMPONENT_13 §3 measured the reference doing this with one component
// and changing only the surface under it: same markup, same checkbox, the
// background layer opaque and inset differently. §9.1 of that document is the
// note that our five row implementations came from not having this seam.
//
// What stays outside this component is what genuinely differs between the two
// views — the List's drag handle and its ⋯ menu, the Board's move-to-column
// select. Those are not a row; they are what the view does with a row.
import type { Task } from "../../types";
import { isCompleted } from "../../domain/tasks/taskState";
import { useT } from "../../i18n";

interface TaskRowContentProps {
  task: Task;
  onOpen: (taskId: string) => void;
  onToggleDone: (task: Task) => void;
}

export function TaskRowContent({ task, onOpen, onToggleDone }: TaskRowContentProps) {
  const { t } = useT();
  const done = isCompleted(task);
  return (
    <>
      {/* A 17px box with the row's full height as its hit area. That is the
          reference's own design (audit §3.1), and the reason this is a label
          around the input rather than a bare input. */}
      <label className="tm-task-check">
        <input
          type="checkbox"
          checked={done}
          aria-label={t(done ? "tasks.reopenTask" : "tasks.completeTask", { title: task.title })}
          onChange={() => onToggleDone(task)}
        />
      </label>
      <button
        type="button"
        className="tm-task-open"
        // §16.34: a row opens a Task, and a screen reader should say so rather
        // than reading the title as if it were a heading.
        aria-label={t("tasks.openTask", { title: task.title })}
        onClick={() => onOpen(task.id)}
      >
        <span className={`tm-task-title${done ? " is-done" : ""}`}>{task.title}</span>
        {/* Priority was stored and never drawn (audit §3.1): a Task could be
            High and look like every other row. The reference puts it in the
            checkbox's colour instead, which is one signal doing two jobs and
            unreadable to anyone who cannot separate the two colours
            (TICKTICK_COMPONENT_06 §6.1), so the flag stays. */}
        {task.priority !== "none" ? (
          <span
            className={`tm-task-priority is-${task.priority}`}
            aria-label={t(`priority.${task.priority}`)}
            title={t(`priority.${task.priority}`)}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path d="M6 21V4h11l-2.2 4L17 12H6" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </span>
        ) : null}
        {task.dueDate ? <span className="tm-task-due">{task.dueDate}</span> : null}
      </button>
    </>
  );
}
