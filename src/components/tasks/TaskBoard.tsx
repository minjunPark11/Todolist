// One Board component for both Boards (TickTick plan §16.30, §7.21, §7.34).
//
// §16.30 permits sharing the columns and then insists the DOMAIN semantics
// stay apart. This file is the shared half: it knows about columns, cards,
// dragging and dropping, and nothing whatever about dates or Sections. What a
// drop MEANS is decided by the caller through `onDrop`, which is why the same
// gesture can be two different canonical commands (Gate 7).
//
// Dragging is not the only way to move a card. §16.30 asks for a non-drag
// alternative, and it is not a courtesy: a drag needs a fine pointer, a
// steady hand and sight of both ends of the gesture at once. Every card
// therefore carries a plain "move to" selector that does the same thing,
// reachable by keyboard and by touch.
import { useRef, useState } from "react";
import type { Task } from "../../types";
import type { BoardColumn } from "../../domain/tasks/board";
import { useT } from "../../i18n";

interface TaskBoardProps {
  columns: BoardColumn[];
  /** The Tasks of one column, already in the order they should be shown. */
  tasksIn: (columnId: string) => Task[];
  /** Which column a Task is in now — so a drop inside it can be a reorder. */
  columnOf: (task: Task) => string;
  openTaskId: string;
  onOpen: (taskId: string) => void;
  /**
   * A card was dropped. `index` is its place among the column's other cards.
   *
   * `date` is only ever supplied for a column that asked for one (§6.25); the
   * caller decides what, if anything, that means.
   */
  onDrop: (taskId: string, columnId: string, index: number, date?: string) => void;
  /** §12.4: false where the Scope's sort is derived, and the drop only moves columns. */
  canReorder: boolean;
}

export function TaskBoard({ columns, tasksIn, columnOf, openTaskId, onOpen, onDrop, canReorder }: TaskBoardProps) {
  const { t } = useT();
  // Which card is being dragged, in a ref as well as in state. The state is
  // what dims the card; the ref is what the drop reads, because a handler
  // closes over the render it was created in and a drop that arrives before
  // React has re-rendered would otherwise see no card at all.
  const dragged = useRef("");
  const [dragging, setDragging] = useState("");
  function startDrag(taskId: string) {
    dragged.current = taskId;
    setDragging(taskId);
  }
  function endDrag() {
    dragged.current = "";
    setDragging("");
  }
  const [over, setOver] = useState("");
  // A drop that cannot be committed until the user says which day (§6.25).
  const [pending, setPending] = useState<{ taskId: string; columnId: string; index: number } | null>(null);

  function label(column: BoardColumn): string {
    return column.name ?? t(column.labelKey ?? "tasks.sectionDefault");
  }

  function drop(column: BoardColumn, index: number) {
    const taskId = dragged.current;
    endDrag();
    setOver("");
    if (!taskId) return;
    // The date is asked for before anything is written, not after: §6.25 says
    // the column IS a date, so a task moved there without one would be sitting
    // in a column whose rule it does not satisfy.
    if (column.requiresDate) {
      setPending({ taskId, columnId: column.id, index });
      return;
    }
    onDrop(taskId, column.id, index);
  }

  return (
    <div className="tm-board">
      {columns.map((column) => {
        const cards = tasksIn(column.id);
        return (
          <section
            key={column.id || "default"}
            className={`tm-column${over === column.id ? " is-over" : ""}`}
            aria-label={label(column)}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(column.id);
            }}
            onDragLeave={() => setOver((current) => (current === column.id ? "" : current))}
            onDrop={(event) => {
              event.preventDefault();
              drop(column, cards.length);
            }}
          >
            <header className="tm-column-head">
              <h3>{label(column)}</h3>
              {cards.length > 0 ? <span className="tm-count">{cards.length}</span> : null}
            </header>

            {pending?.columnId === column.id ? (
              <label className="tm-column-date">
                <span>{t("tasks.needDate")}</span>
                <input
                  type="date"
                  autoFocus
                  onChange={(event) => {
                    if (!event.target.value) return;
                    onDrop(pending.taskId, pending.columnId, pending.index, event.target.value);
                    setPending(null);
                  }}
                />
                <button type="button" onClick={() => setPending(null)}>
                  {t("common.cancel")}
                </button>
              </label>
            ) : null}

            <ul className="tm-column-cards" aria-label={label(column)}>
              {cards.map((task, index) => (
                <li
                  key={task.id}
                  className={`tm-card${task.id === openTaskId ? " is-open" : ""}${dragging === task.id ? " is-dragging" : ""}`}
                  draggable
                  onDragStart={() => startDrag(task.id)}
                  onDragEnd={endDrag}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    // Dropping ON a card means "before this one". Within the
                    // same column that is a reorder, and where the Scope's
                    // sort is derived there is no order to change — so the
                    // card is left where the column's own rule puts it.
                    event.stopPropagation();
                    event.preventDefault();
                    drop(column, canReorder ? index : cards.length);
                  }}
                >
                  <button type="button" className="tm-card-open" onClick={() => onOpen(task.id)}>
                    <span className={`tm-task-title${task.status === "done" ? " is-done" : ""}`}>{task.title}</span>
                    {task.dueDate ? <span className="tm-task-due">{task.dueDate}</span> : null}
                  </button>

                  {/* The non-drag path (§16.30). Same command, no gesture. */}
                  <label className="tm-card-move">
                    <span className="tm-visually-hidden">{t("tasks.moveTo")}</span>
                    <select
                      aria-label={t("tasks.moveToColumn", { title: task.title })}
                      value={columnOf(task)}
                      onChange={(event) => {
                        const target = columns.find((candidate) => candidate.id === event.target.value);
                        if (!target || target.id === columnOf(task)) return;
                        if (target.requiresDate) {
                          setPending({ taskId: task.id, columnId: target.id, index: tasksIn(target.id).length });
                          return;
                        }
                        onDrop(task.id, target.id, tasksIn(target.id).length);
                      }}
                    >
                      {columns.map((candidate) => (
                        <option key={candidate.id || "default"} value={candidate.id}>
                          {label(candidate)}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
