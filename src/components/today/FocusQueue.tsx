import type { Project } from "../../types";
import { formatMinuteOfDay, parseTimeToMinutes, type TodayEntry } from "../../utils/todayView";
import { useT } from "../../i18n";

interface FocusQueueProps {
  entries: TodayEntry[];
  projects: Project[];
  selectedTaskId: string;
  hasQuery: boolean;
  query: string;
  onOpenTask: (taskId: string) => void;
  onToggleDone: (taskId: string) => void;
  onAddTask: () => void;
  onOpenSpaces: () => void;
}

export function FocusQueue({
  entries,
  projects,
  selectedTaskId,
  hasQuery,
  query,
  onOpenTask,
  onToggleDone,
  onAddTask,
  onOpenSpaces,
}: FocusQueueProps) {
  const { t } = useT();
  // One flat list: open tasks keep their order, completed rows sink to the bottom.
  const sorted = [
    ...entries.filter((entry) => !entry.completed),
    ...entries.filter((entry) => entry.completed),
  ];
  const isEmpty = sorted.length === 0;

  return (
    <section className="tdy-card tdy-queue">
      <header className="tdy-card-head">
        <span className="tdy-card-head-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M8 6h13M8 12h13M8 18h13" />
            <path d="M3 6h.01M3 12h.01M3 18h.01" strokeWidth="2.6" />
          </svg>
        </span>
        <h2>{t("todayv.focusQueue")}</h2>
      </header>

      {isEmpty && !hasQuery ? (
        <div className="tdy-queue-empty">
          <strong>{t("todayv.queueEmptyTitle")}</strong>
          <p>{t("todayv.queueEmptyText")}</p>
          <div className="tdy-brief-actions">
            <button type="button" className="tdy-btn tdy-btn-navy" onClick={onAddTask}>
              + {t("todayv.addTask")}
            </button>
            <button type="button" className="tdy-btn tdy-btn-light" onClick={onOpenSpaces}>
              {t("todayv.openSpaces")}
            </button>
          </div>
        </div>
      ) : hasQuery && isEmpty ? (
        <div className="tdy-queue-empty">
          <p>{t("todayv.searchNoResults", { query })}</p>
        </div>
      ) : (
        <div className="tdy-rows">
          {sorted.map((entry) => (
            <FocusQueueRow
              key={entry.task.id}
              entry={entry}
              projects={projects}
              selected={entry.task.id === selectedTaskId}
              onOpenTask={onOpenTask}
              onToggleDone={onToggleDone}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function hexToSoft(color: string | undefined): { bg: string; fg: string } | undefined {
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return undefined;
  return { bg: `${color}1c`, fg: color };
}

function FocusQueueRow({
  entry,
  projects,
  selected,
  onOpenTask,
  onToggleDone,
}: {
  entry: TodayEntry;
  projects: Project[];
  selected: boolean;
  onOpenTask: (taskId: string) => void;
  onToggleDone: (taskId: string) => void;
}) {
  const { t, lang } = useT();
  const { task, reason, completed } = entry;
  const project = projects.find((candidate) => candidate.id === task.projectId);
  const pill = hexToSoft(project?.color);

  const startMin = task.startTime ? parseTimeToMinutes(task.startTime) : undefined;
  const endMin = task.endTime ? parseTimeToMinutes(task.endTime) : undefined;
  const timeLabel =
    startMin !== undefined
      ? endMin !== undefined && endMin > startMin
        ? `${formatMinuteOfDay(startMin, lang)} – ${formatMinuteOfDay(endMin, lang)}`
        : formatMinuteOfDay(startMin, lang)
      : "";

  return (
    <div
      className={`tdy-row${completed ? " is-done" : ""}${selected ? " is-selected" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpenTask(task.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenTask(task.id);
        }
      }}
    >
      <button
        type="button"
        className={`tdy-check${completed ? " checked" : ""}`}
        aria-label={t("todayv.checkAria", { title: task.title })}
        onClick={(event) => {
          // Checkbox must never open the task drawer (spec §28).
          event.stopPropagation();
          onToggleDone(task.id);
        }}
      >
        {completed ? "✓" : ""}
      </button>
      <span className="tdy-row-title">{task.title}</span>
      {timeLabel ? <span className="tdy-row-time">{timeLabel}</span> : null}
      {project ? (
        <span
          className="tdy-space-pill"
          style={pill ? { background: pill.bg, color: pill.fg } : undefined}
        >
          {project.name}
        </span>
      ) : null}
      <span className={`tdy-reason tdy-reason-${reason}`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M5 21V4" />
          <path d="M5 4h13l-2.5 4L18 12H5" />
        </svg>
        {t(`todayv.reason.${reason}`)}
      </span>
    </div>
  );
}
