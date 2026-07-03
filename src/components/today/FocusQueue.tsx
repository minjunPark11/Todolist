import type { Project, Task } from "../../types";
import type { TodayBucketId, TodayEntry } from "../../utils/todayView";
import { MoreMenu, type MoreMenuItem } from "../kit";
import { useT } from "../../i18n";

const BUCKETS: TodayBucketId[] = ["now", "next", "later"];

interface FocusQueueProps {
  entries: TodayEntry[];
  projects: Project[];
  selectedTaskId: string;
  hideCompleted: boolean;
  hasQuery: boolean;
  query: string;
  onToggleHideCompleted: () => void;
  onMoveAllLater: () => void;
  onClearPlan: () => void;
  onOpenTask: (taskId: string) => void;
  onToggleDone: (taskId: string) => void;
  onMoveBucket: (taskId: string, bucket: TodayBucketId) => void;
  onArchiveTask: (taskId: string) => void;
  onAddTask: () => void;
  onOpenSpaces: () => void;
}

export function FocusQueue({
  entries,
  projects,
  selectedTaskId,
  hideCompleted,
  hasQuery,
  query,
  onToggleHideCompleted,
  onMoveAllLater,
  onClearPlan,
  onOpenTask,
  onToggleDone,
  onMoveBucket,
  onArchiveTask,
  onAddTask,
  onOpenSpaces,
}: FocusQueueProps) {
  const { t } = useT();
  const visible = hideCompleted ? entries.filter((entry) => !entry.completed) : entries;
  // Completed rows stay visible as history (spec §8) — the big empty state only
  // shows when there is nothing at all for today.
  const isEmpty = visible.length === 0;

  const cardMenu: MoreMenuItem[] = [
    {
      label: hideCompleted ? t("todayv.showCompleted") : t("todayv.hideCompleted"),
      onClick: onToggleHideCompleted,
    },
    { label: t("todayv.moveAllLater"), onClick: onMoveAllLater },
    { separator: true },
    { label: t("todayv.clearPlan"), onClick: onClearPlan },
  ];

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
        <MoreMenu items={cardMenu} label={t("todayv.queueMenuAria")} />
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
      ) : hasQuery && visible.length === 0 ? (
        <div className="tdy-queue-empty">
          <p>{t("todayv.searchNoResults", { query })}</p>
        </div>
      ) : (
        BUCKETS.map((bucket) => {
          const bucketEntries = visible.filter((entry) => entry.bucket === bucket);
          // Completed rows sink to the bottom of their bucket (spec §28).
          const sorted = [
            ...bucketEntries.filter((entry) => !entry.completed),
            ...bucketEntries.filter((entry) => entry.completed),
          ];
          const openInBucket = bucketEntries.filter((entry) => !entry.completed).length;
          return (
            <div key={bucket} className="tdy-bucket">
              <div className="tdy-bucket-head">
                <span className={`tdy-bucket-dot tdy-bucket-dot-${bucket}`} aria-hidden="true" />
                <strong>{t(`todayv.bucket.${bucket}`)}</strong>
                <span className="tdy-bucket-count">{openInBucket}</span>
              </div>
              {sorted.length === 0 ? (
                hasQuery ? null : (
                  <p className="tdy-bucket-empty">{t(`todayv.bucketEmpty.${bucket}`)}</p>
                )
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
                      onMoveBucket={onMoveBucket}
                      onArchiveTask={onArchiveTask}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })
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
  onMoveBucket,
  onArchiveTask,
}: {
  entry: TodayEntry;
  projects: Project[];
  selected: boolean;
  onOpenTask: (taskId: string) => void;
  onToggleDone: (taskId: string) => void;
  onMoveBucket: (taskId: string, bucket: TodayBucketId) => void;
  onArchiveTask: (taskId: string) => void;
}) {
  const { t } = useT();
  const { task, reason, completed, bucket } = entry;
  const project = projects.find((candidate) => candidate.id === task.projectId);
  const pill = hexToSoft(project?.color);

  const rowMenu: MoreMenuItem[] = [
    { label: t("todayv.openDetails"), onClick: () => onOpenTask(task.id) },
    { separator: true },
    ...BUCKETS.filter((candidate) => candidate !== bucket).map((candidate) => ({
      label: t(`todayv.moveTo.${candidate}`),
      onClick: () => onMoveBucket(task.id, candidate),
    })),
    { separator: true },
    {
      label: completed ? t("todayv.markTodo") : t("todayv.markComplete"),
      onClick: () => onToggleDone(task.id),
    },
    { label: t("common.archive"), onClick: () => onArchiveTask(task.id) },
  ];

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
      <span
        className={`tdy-status-dot${bucket === "now" && !completed ? " is-now" : ""}${completed ? " is-done" : ""}`}
        aria-hidden="true"
      />
      <MoreMenu items={rowMenu} label={t("todayv.rowMenuAria")} />
    </div>
  );
}
