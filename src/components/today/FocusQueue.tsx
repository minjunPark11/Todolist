import { AnimatePresence } from "framer-motion";
import type { Project } from "../../types";
import type { TodayEntry } from "../../utils/todayView";
import { useT } from "../../i18n";
import { MotionTaskRow } from "../motion/MotionTaskRow";

interface FocusQueueProps {
  entries: TodayEntry[];
  projects: Project[];
  hasQuery: boolean;
  query: string;
  onToggleDone: (taskId: string) => void;
  onAddTask: () => void;
  onOpenSpaces: () => void;
}

export function FocusQueue({
  entries,
  projects,
  hasQuery,
  query,
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
          <AnimatePresence initial={false}>
            {sorted.map((entry) => (
              <FocusQueueRow
                key={entry.task.id}
                entry={entry}
                projects={projects}
                onToggleDone={onToggleDone}
              />
            ))}
          </AnimatePresence>
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
  onToggleDone,
}: {
  entry: TodayEntry;
  projects: Project[];
  onToggleDone: (taskId: string) => void;
}) {
  const { t } = useT();
  const { task, completed } = entry;
  const project = projects.find((candidate) => candidate.id === task.projectId);
  const pill = hexToSoft(project?.color);

  // MotionTaskRow animates inline opacity, so the `.is-done` dim must stay on
  // the inner row element rather than the motion wrapper.
  return (
    <MotionTaskRow taskId={task.id}>
      <div className={`tdy-row${completed ? " is-done" : ""}`}>
        <button
          type="button"
          className={`tdy-check${completed ? " checked" : ""}`}
          aria-label={t("todayv.checkAria", { title: task.title })}
          onClick={() => onToggleDone(task.id)}
        >
          {completed ? "✓" : ""}
        </button>
        <span className="tdy-row-title">{task.title}</span>
        {project ? (
          <span
            className="tdy-space-pill"
            style={pill ? { background: pill.bg, color: pill.fg } : undefined}
          >
            {project.name}
          </span>
        ) : null}
      </div>
    </MotionTaskRow>
  );
}
