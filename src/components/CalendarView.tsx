import { DragEvent, useState } from "react";
import type { Project, Task } from "../types";
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
  projects: Project[];
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

const DAY_START = 8;
const DAY_END = 20;
const SLOT_HEIGHT = 44;
const hours = Array.from({ length: DAY_END - DAY_START }, (_, index) => DAY_START + index);
const weekdayShortFormatter = new Intl.DateTimeFormat("en", { weekday: "short" });

function asDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function timeToMinutes(value: string): number | null {
  if (!value) {
    return null;
  }
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function CalendarView({ tasks, projects, onSelectTask, onUpdateTask }: CalendarViewProps) {
  const [mode, setMode] = useState<CalendarMode>("month");
  const [anchor, setAnchor] = useState(todayValue());
  const [dragOver, setDragOver] = useState("");

  const today = todayValue();
  const anchorDate = asDate(anchor);
  const projectColor = new Map(projects.map((project) => [project.id, project.color]));
  const unscheduled = tasks.filter((task) => !task.dueDate && task.status !== "done");

  let label: string;
  if (mode === "month") {
    label = getMonthLabel(anchorDate.getFullYear(), anchorDate.getMonth());
  } else if (mode === "week") {
    label = getWeekLabel(anchor);
  } else {
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

  function over(id: string) {
    return (event: DragEvent) => {
      event.preventDefault();
      if (dragOver !== id) setDragOver(id);
    };
  }

  function leave(id: string) {
    return () => setDragOver((current) => (current === id ? "" : current));
  }

  function dropDate(event: DragEvent, dueDate: string) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain");
    if (taskId) {
      onUpdateTask(taskId, { dueDate });
    }
    setDragOver("");
  }

  function dropAllDay(event: DragEvent, dueDate: string) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain");
    if (taskId) {
      onUpdateTask(taskId, { dueDate, startTime: "", endTime: "" });
    }
    setDragOver("");
  }

  function dropTime(event: DragEvent, dueDate: string) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain");
    if (taskId) {
      const rect = event.currentTarget.getBoundingClientRect();
      const offset = event.clientY - rect.top;
      const hour = Math.min(DAY_END - 1, Math.max(DAY_START, DAY_START + Math.floor(offset / SLOT_HEIGHT)));
      onUpdateTask(taskId, {
        dueDate,
        startTime: `${pad(hour)}:00`,
        endTime: `${pad(Math.min(hour + 1, DAY_END))}:00`,
      });
    }
    setDragOver("");
  }

  function dropUnschedule(event: DragEvent) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain");
    if (taskId) {
      onUpdateTask(taskId, { dueDate: "", startTime: "", endTime: "" });
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
        onDragOver={over(cell.date)}
        onDragLeave={leave(cell.date)}
        onDrop={(event) => dropDate(event, cell.date)}
      >
        <span className="calendar-date">{getDayNumber(cell.date)}</span>
        <div className="calendar-chip-list">
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

  function renderTimeGrid(days: string[]) {
    return (
      <div className={mode === "day" ? "time-grid is-day" : "time-grid"}>
        <div className="time-grid-head">
          <div className="time-corner" />
          {days.map((day) => (
            <div key={day} className={day === today ? "time-col-head is-today" : "time-col-head"}>
              <span className="tch-weekday">{weekdayShortFormatter.format(asDate(day))}</span>
              <span className="tch-date">{getDayNumber(day)}</span>
            </div>
          ))}
        </div>

        <div className="time-allday-row">
          <div className="time-corner small">All day</div>
          {days.map((day) => {
            const allDay = tasks.filter((task) => task.dueDate === day && !task.startTime);
            const id = `allday:${day}`;
            return (
              <div
                key={day}
                className={dragOver === id ? "time-allday-cell is-drop" : "time-allday-cell"}
                onDragOver={over(id)}
                onDragLeave={leave(id)}
                onDrop={(event) => dropAllDay(event, day)}
              >
                {allDay.map((task) => (
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
              </div>
            );
          })}
        </div>

        <div className="time-grid-body" style={{ height: hours.length * SLOT_HEIGHT }}>
          <div className="time-gutter">
            {hours.map((hour) => (
              <div key={hour} className="time-label" style={{ height: SLOT_HEIGHT }}>
                {hour}:00
              </div>
            ))}
          </div>
          {days.map((day) => {
            const timed = tasks.filter((task) => task.dueDate === day && task.startTime);
            const id = `col:${day}`;
            return (
              <div
                key={day}
                className={dragOver === id ? "time-col is-drop" : "time-col"}
                onDragOver={over(id)}
                onDragLeave={leave(id)}
                onDrop={(event) => dropTime(event, day)}
              >
                {hours.map((hour) => (
                  <div key={hour} className="time-slot" style={{ height: SLOT_HEIGHT }} />
                ))}
                {timed.map((task) => {
                  const startMin = timeToMinutes(task.startTime);
                  if (startMin === null) {
                    return null;
                  }
                  const endMin = timeToMinutes(task.endTime) ?? startMin + 60;
                  const top = ((startMin - DAY_START * 60) / 60) * SLOT_HEIGHT;
                  const height = Math.max(((endMin - startMin) / 60) * SLOT_HEIGHT, 24);
                  const color = projectColor.get(task.projectId) ?? "#0066cc";
                  return (
                    <button
                      key={task.id}
                      className="time-block"
                      draggable
                      onDragStart={(event) => handleDragStart(event, task.id)}
                      onClick={() => onSelectTask(task.id)}
                      style={{
                        top,
                        height,
                        borderLeft: `3px solid ${color}`,
                        background: `${color}22`,
                      }}
                    >
                      <span className="tb-time">{task.startTime}</span>
                      <span className="tb-title">{task.title}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
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

        {mode === "month" ? (
          <>
            <div className="calendar-weekdays">
              {weekdays.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="calendar-grid mode-month">
              {getMonthGrid(anchorDate.getFullYear(), anchorDate.getMonth()).map((cell) =>
                renderCell(cell, 3),
              )}
            </div>
          </>
        ) : (
          renderTimeGrid(mode === "week" ? getWeekDays(anchor) : [anchor])
        )}
      </section>

      <aside
        className={dragOver === "unscheduled" ? "calendar-backlog is-drop" : "calendar-backlog"}
        onDragOver={over("unscheduled")}
        onDragLeave={leave("unscheduled")}
        onDrop={dropUnschedule}
      >
        <div className="calendar-backlog-header">
          <h2>Unscheduled</h2>
          <span>{unscheduled.length}</span>
        </div>
        <p className="calendar-hint">Drag a task onto a day or time slot to schedule it.</p>
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
