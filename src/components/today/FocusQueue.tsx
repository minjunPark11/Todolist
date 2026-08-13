import { AnimatePresence } from "framer-motion";
import type { Project } from "../../types";
import {
  formatMinuteOfDay,
  parseTimeToMinutes,
  type TodayBucketId,
  type TodayEntry,
} from "../../utils/todayView";
import { useT } from "../../i18n";
import { MoreMenu, type MoreMenuItem } from "../kit";
import { MotionTaskRow } from "../motion/MotionTaskRow";

const BUCKETS: TodayBucketId[] = ["now", "next", "later"];

interface FocusQueueProps {
  entries: TodayEntry[];
  projects: Project[];
  hasQuery: boolean;
  query: string;
  showCompleted: boolean;
  onToggleShowCompleted: () => void;
  onToggleDone: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  onMoveBucket: (taskId: string, bucket: TodayBucketId) => void;
  onMoveAllLater: () => void;
  onClearPlan: () => void;
  onAddTask: () => void;
  onOpenSpaces: () => void;
}

export function FocusQueue({
  entries,
  projects,
  hasQuery,
  query,
  showCompleted,
  onToggleShowCompleted,
  onToggleDone,
  onOpenTask,
  onMoveBucket,
  onMoveAllLater,
  onClearPlan,
  onAddTask,
  onOpenSpaces,
}: FocusQueueProps) {
  const { t } = useT();
  const open = entries.filter((entry) => !entry.completed);
  const completed = entries.filter((entry) => entry.completed);
  const isEmpty = entries.length === 0;

  // Grouped by the bucket the user (or "Plan Today") put the task in, so
  // applying a plan visibly reorders the queue instead of only toasting.
  const byBucket = (bucket: TodayBucketId) => open.filter((entry) => entry.bucket === bucket);

  const menuItems: MoreMenuItem[] = [
    {
      label: showCompleted ? t("todayv.hideCompleted") : t("todayv.showCompleted"),
      onClick: onToggleShowCompleted,
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
        {!isEmpty ? <MoreMenu items={menuItems} label={t("todayv.queueMenuAria")} /> : null}
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
        <>
          {BUCKETS.map((bucket) => {
            const bucketEntries = byBucket(bucket);
            return (
              <section className="tdy-bucket" key={bucket}>
                <header className="tdy-bucket-head">
                  <span className={`tdy-bucket-dot tdy-bucket-dot-${bucket}`} aria-hidden="true" />
                  <strong>{t(`todayv.bucket.${bucket}`)}</strong>
                  {bucketEntries.length > 0 ? (
                    <span className="tdy-bucket-count">{bucketEntries.length}</span>
                  ) : null}
                </header>
                {bucketEntries.length === 0 ? (
                  <p className="tdy-bucket-empty">{t(`todayv.bucketEmpty.${bucket}`)}</p>
                ) : (
                  <div className="tdy-rows">
                    <AnimatePresence initial={false}>
                      {bucketEntries.map((entry) => (
                        <FocusQueueRow
                          key={entry.task.id}
                          entry={entry}
                          projects={projects}
                          onToggleDone={onToggleDone}
                          onOpenTask={onOpenTask}
                          onMoveBucket={onMoveBucket}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </section>
            );
          })}

          {showCompleted && completed.length > 0 ? (
            <section className="tdy-bucket">
              <header className="tdy-bucket-head">
                <span className="tdy-bucket-dot tdy-bucket-dot-done" aria-hidden="true" />
                <strong>{t("today.doneToday")}</strong>
                <span className="tdy-bucket-count">{completed.length}</span>
              </header>
              <div className="tdy-rows">
                <AnimatePresence initial={false}>
                  {completed.map((entry) => (
                    <FocusQueueRow
                      key={entry.task.id}
                      entry={entry}
                      projects={projects}
                      onToggleDone={onToggleDone}
                      onOpenTask={onOpenTask}
                      onMoveBucket={onMoveBucket}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          ) : null}
        </>
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
  onOpenTask,
  onMoveBucket,
}: {
  entry: TodayEntry;
  projects: Project[];
  onToggleDone: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  onMoveBucket: (taskId: string, bucket: TodayBucketId) => void;
}) {
  const { t, lang } = useT();
  const { task, bucket, reason, completed } = entry;
  const project = projects.find((candidate) => candidate.id === task.projectId);
  const pill = hexToSoft(project?.color);
  const startMin = parseTimeToMinutes(task.startTime);

  const menuItems: MoreMenuItem[] = [
    ...BUCKETS.filter((candidate) => candidate !== bucket).map((candidate) => ({
      label: t(`todayv.moveTo.${candidate}`),
      onClick: () => onMoveBucket(task.id, candidate),
    })),
    { separator: true },
    {
      label: completed ? t("todayv.markTodo") : t("todayv.markComplete"),
      onClick: () => onToggleDone(task.id),
    },
    { label: t("todayv.openDetails"), onClick: () => onOpenTask(task.id) },
  ];

  // 1/2/3 move the focused row between buckets. The handler sits on the row so
  // it catches the keys while focus is on the title button inside it.
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = ["1", "2", "3"].indexOf(event.key);
    if (index === -1) return;
    event.preventDefault();
    onMoveBucket(task.id, BUCKETS[index]);
  }

  // MotionTaskRow animates inline opacity, so the `.is-done` dim must stay on
  // the inner row element rather than the motion wrapper.
  return (
    <MotionTaskRow taskId={task.id}>
      <div
        className={`tdy-row${completed ? " is-done" : ""}`}
        onClick={() => onOpenTask(task.id)}
        onKeyDown={handleKeyDown}
      >
        <button
          type="button"
          className={`tdy-check${completed ? " checked" : ""}`}
          aria-label={t("todayv.checkAria", { title: task.title })}
          onClick={(event) => {
            event.stopPropagation();
            onToggleDone(task.id);
          }}
        >
          {completed ? "✓" : ""}
        </button>
        <button
          type="button"
          className="tdy-row-title"
          onClick={(event) => {
            event.stopPropagation();
            onOpenTask(task.id);
          }}
        >
          {task.title}
        </button>
        <span className={`tdy-reason tdy-reason-${reason}`}>{t(`todayv.reason.${reason}`)}</span>
        {task.estimatedMinutes > 0 ? (
          <span className="tdy-estimate">{t("todayv.estimate", { n: task.estimatedMinutes })}</span>
        ) : null}
        {startMin !== undefined ? (
          <span className="tdy-row-time">{formatMinuteOfDay(startMin, lang)}</span>
        ) : null}
        {project ? (
          <span
            className="tdy-space-pill"
            style={pill ? { background: pill.bg, color: pill.fg } : undefined}
          >
            {project.name}
          </span>
        ) : null}
        <MoreMenu items={menuItems} label={t("todayv.rowMenuAria")} />
      </div>
    </MotionTaskRow>
  );
}
