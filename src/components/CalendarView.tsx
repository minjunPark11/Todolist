import { DragEvent, useState } from "react";
import type { Task } from "../types";
import {
  addDays,
  addMonths,
  getDayLabel,
  getDayNumber,
  getMonthGrid,
  getMonthLabel,
  getWeekDays,
  getWeekLabel,
  todayValue,
  type CalendarCell,
} from "../utils/date";

interface CalendarViewProps {
  tasks: Task[];
  onSelectTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
}

type CalendarMode = "month" | "week" | "day";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const modes: Array<{ id: CalendarMode; label: string }> = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
];

export function CalendarView({ tasks, onSelectTask, onUpdateTask }: CalendarViewProps) {
  const [mode, setMode] = useState<CalendarMode>("month");
  const [anchor, setAnchor] = useState(todayValue());
  const [dragOver, setDragOver] = useState("");

  const today = todayValue();
  const anchorDate = new Date(`${anchor}T00:00:00`);
  const unscheduled = tasks.filter((task) => !task.dueDate && task.status !== "done");

  let cells: CalendarCell[];
  let label: string;
  if (mode === "month") {
    cells = getMonthGrid(anchorDate.getFullYear(), anchorDate.getMonth());
    label = getMonthLabel(anchorDate.getFullYear(), anchorDate.getMonth());
  } else if (mode === "week") {
    cells = getWeekDays(anchor).map((date) => ({ date, inMonth: true }));
    label = getWeekLabel(anchor);
  } else {
    cells = [{ date: anchor, inMonth: true }];
    label = getDayLabel(anchor);
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

  function handleDragStart(event: DragEvent, taskId: string) {
    event.dataTransfer.setData("text/plain", taskId);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDrop(event: DragEvent, dueDate: string) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain");
    if (taskId) {
      onUpdateTask(taskId, { dueDate });
    }
    setDragOver("");
  }

  function renderCell(cell: CalendarCell, cap: number) {
    const dayTasks = tasks.filter((task) => task.dueDate === cell.date);
    const classes = ["calendar-cell"];
    if (!cell.inMonth) classes.push("is-outside");
    if (cell.date === today) classes.push("is-today");
    if (cell.date === dragOver) classes.push("is-drop");
    const visible = cap > 0 ? dayTasks.slice(0, cap) : dayTasks;

    return (
      <div
        key={cell.date}
        className={classes.join(" ")}
        onDragOver={(event) => {
          event.preventDefault();
          if (dragOver !== cell.date) setDragOver(cell.date);
        }}
        onDragLeave={() => setDragOver((current) => (current === cell.date ? "" : current))}
        onDrop={(event) => handleDrop(event, cell.date)}
      >
        <span className="calendar-date">{getDayNumber(cell.date)}</span>
        <div className="calendar-chip-list">
          {visible.length === 0 && mode === "day" ? (
            <p className="empty-state">No tasks due.</p>
          ) : null}
          {visible.map((task) => (
            <button
              key={task.id}
              className={`calendar-chip priority-${task.priority}`}
              draggable
              onDragStart={(event) => handleDragStart(event, task.id)}
              onClick={() => onSelectTask(task.id)}
            >
              {task.title}
            </button>
          ))}
          {cap > 0 && dayTasks.length > cap ? (
            <span className="calendar-more">+{dayTasks.length - cap} more</span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="calendar-layout">
      <section className="calendar-main">
        <div className="calendar-toolbar">
          <div className="calendar-modes">
            {modes.map((option) => (
              <button
                key={option.id}
                className={mode === option.id ? "active" : ""}
                onClick={() => setMode(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <h2>{label}</h2>
          <div className="calendar-nav">
            <button onClick={() => shift(-1)} aria-label="Previous">
              ‹
            </button>
            <button onClick={() => setAnchor(today)}>Today</button>
            <button onClick={() => shift(1)} aria-label="Next">
              ›
            </button>
          </div>
        </div>

        {mode !== "day" ? (
          <div className="calendar-weekdays">
            {weekdays.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
        ) : null}

        <div className={`calendar-grid mode-${mode}`}>
          {cells.map((cell) => renderCell(cell, mode === "month" ? 3 : 0))}
        </div>
      </section>

      <aside
        className={dragOver === "unscheduled" ? "calendar-backlog is-drop" : "calendar-backlog"}
        onDragOver={(event) => {
          event.preventDefault();
          if (dragOver !== "unscheduled") setDragOver("unscheduled");
        }}
        onDragLeave={() => setDragOver((current) => (current === "unscheduled" ? "" : current))}
        onDrop={(event) => handleDrop(event, "")}
      >
        <div className="calendar-backlog-header">
          <h2>Unscheduled</h2>
          <span>{unscheduled.length}</span>
        </div>
        <p className="calendar-hint">Drag a task onto a day to set its due date.</p>
        <div className="calendar-backlog-list">
          {unscheduled.length === 0 ? <p className="empty-state">Nothing to schedule.</p> : null}
          {unscheduled.map((task) => (
            <button
              key={task.id}
              className={`calendar-backlog-item priority-${task.priority}`}
              draggable
              onDragStart={(event) => handleDragStart(event, task.id)}
              onClick={() => onSelectTask(task.id)}
            >
              {task.title}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
