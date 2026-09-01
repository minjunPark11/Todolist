import { useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { GROUP_ORDER, groupIdOf, type GroupId } from "../../domain/view/viewGroups";
import {
  formatMinuteOfDay,
  parseTimeToMinutes,
  type TodayBucketId,
  type TodayEntry,
} from "../../utils/todayView";
import { useT } from "../../i18n";
import { MoreMenu, type MoreMenuItem } from "../kit";
import { MotionTaskRow } from "../motion/MotionTaskRow";

/**
 * Today's groups say WHY the work is on today's list
 * (TODAY_TICKTICK_REDESIGN.md §3.4, plan §7.5).
 *
 * They used to be `지금 / 다음 / 나중` — the box the user (or "Plan Today") put
 * the task in. That is a real thing to want, and §3.4 keeps it as the other
 * axis; it just is not the question this screen opens with. `scopeQuery`
 * already gathers three different populations into one list — overdue, due
 * today, planned for today (§12.5.1) — and the screen was not saying which
 * was which.
 *
 * `viewGroups` is the same rule the Matrix and the Inbox board group by. This
 * is its third caller, not a fourth vocabulary.
 */

/**
 * The plan's three boxes, which are still STORED and still moved.
 *
 * §3.4 keeps them as the other grouping axis and §5 of the redesign is where
 * the reader gets to choose. Until then the row's menu and the 1/2/3 keys go
 * on writing them, because taking away the writer of a field the store still
 * holds is how a value becomes unreachable rather than gone.
 */
const BUCKETS: TodayBucketId[] = ["now", "next", "later"];

/**
 * The plan's three groups, and only three (§7.5).
 *
 * `groupIdOf` answers for a task in general: no deadline is `날짜 없음`, a
 * deadline next week is `이후`. On a board that is the right answer. Here it is
 * the wrong question — every task on this screen is on it for one of three
 * reasons (§12.5.1), and two of those reasons produce those very labels:
 *
 *   - planned for today with no deadline  → `groupIdOf` says `날짜 없음`
 *   - planned for today, due next week    → `groupIdOf` says `이후`
 *
 * Both are on today's list because the reader PUT them there, and a group
 * called "No date" tells them the opposite — that the app does not know when
 * this is for. So everything that is neither late nor finished is `오늘`.
 *
 * Local to this screen on purpose: the reason it holds is that Today's
 * membership includes a plan, which is not true of a Matrix box or an Inbox
 * column, and `viewGroups` is those two boards' rule as much as it is this
 * screen's.
 */
function todayGroupOf(entry: TodayEntry, today: string): GroupId {
  const id = groupIdOf(entry.task, today);
  return id === "overdue" || id === "completed" ? id : "today";
}

interface FocusQueueProps {
  entries: TodayEntry[];
  hasQuery: boolean;
  query: string;
  showCompleted: boolean;
  onToggleShowCompleted: () => void;
  onToggleDone: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  onMoveBucket: (taskId: string, bucket: TodayBucketId) => void;
  /** Today as `YYYY-MM-DD` — which date the groups are measured against. */
  today: string;
  /**
   * "Plan today" — the rule-based sort into now/next/later.
   *
   * It was a button on the Today brief card, which is gone. The queue is what
   * it rearranges, so its own menu is where it belongs: the action and the
   * thing it acts on are one control apart, and "계획 지우기" — its inverse —
   * was already here.
   */
  onPlanToday: () => void;
  onMoveAllLater: () => void;
  onClearPlan: () => void;
  onAddTask: () => void;
}

export function FocusQueue({
  entries,
  hasQuery,
  query,
  showCompleted,
  onToggleShowCompleted,
  onToggleDone,
  onOpenTask,
  onMoveBucket,
  today,
  onPlanToday,
  onMoveAllLater,
  onClearPlan,
  onAddTask,
}: FocusQueueProps) {
  const { t } = useT();
  const isEmpty = entries.length === 0;

  /**
   * The groups, in `GROUP_ORDER` and with the empty ones dropped.
   *
   * Written here rather than through `groupTasks` because that one sorts as
   * well, and Today's order is not the boxes' — it is the plan's `sortKey`,
   * then the time of day (§7.6), which `collectTodayEntries` already applied
   * before these entries arrived. Grouping is what this screen was missing;
   * re-sorting on top of an order somebody else decided would be a second
   * answer to a question already answered.
   */
  const groups = useMemo(() => {
    const byGroup = new Map<GroupId, TodayEntry[]>();
    for (const entry of entries) {
      // `completed` wins over every date, which is `groupIdOf`'s rule and the
      // reason finished work is not reported as overdue.
      const id = todayGroupOf(entry, today);
      const bucket = byGroup.get(id);
      if (bucket) bucket.push(entry);
      else byGroup.set(id, [entry]);
    }
    return GROUP_ORDER.flatMap((id) => {
      const rows = byGroup.get(id);
      if (!rows || rows.length === 0) return [];
      // The one group the reader can switch off. It is a group like any other
      // here — the toggle decides whether it is drawn, not what it holds.
      if (id === "completed" && !showCompleted) return [];
      return [{ id, rows }];
    });
  }, [entries, today, showCompleted]);

  const menuItems: MoreMenuItem[] = [
    { label: t("todayv.planToday"), onClick: onPlanToday },
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
          {/* The capture bar sits directly above this card, so the empty state
              points at the one action that starts the day rather than routing
              the user off to another page. */}
          <div className="tdy-brief-actions">
            <button type="button" className="tdy-btn tdy-btn-navy" onClick={onAddTask}>
              + {t("todayv.addTask")}
            </button>
          </div>
        </div>
      ) : hasQuery && isEmpty ? (
        <div className="tdy-queue-empty">
          <p>{t("todayv.searchNoResults", { query })}</p>
        </div>
      ) : (
        <>
          {groups.map((group) => (
            <section className={`tdy-bucket is-${group.id}`} key={group.id}>
              <header className="tdy-bucket-head">
                <span className={`tdy-bucket-dot tdy-bucket-dot-${group.id}`} aria-hidden="true" />
                <strong>{t(`view.group.${group.id}`)}</strong>
                <span className="tdy-bucket-count">{group.rows.length}</span>
              </header>
              <div className="tdy-rows">
                <AnimatePresence initial={false}>
                  {group.rows.map((entry) => (
                    <FocusQueueRow
                      key={entry.task.id}
                      entry={entry}
                      onToggleDone={onToggleDone}
                      onOpenTask={onOpenTask}
                      onMoveBucket={onMoveBucket}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          ))}

        </>
      )}
    </section>
  );
}

function FocusQueueRow({
  entry,
  onToggleDone,
  onOpenTask,
  onMoveBucket,
}: {
  entry: TodayEntry;
  onToggleDone: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  onMoveBucket: (taskId: string, bucket: TodayBucketId) => void;
}) {
  const { t, lang } = useT();
  const { task, bucket, reason, completed } = entry;
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
        {reason !== "none" ? (
          <span className={`tdy-reason tdy-reason-${reason}`}>{t(`todayv.reason.${reason}`)}</span>
        ) : null}
        {task.estimatedMinutes > 0 ? (
          <span className="tdy-estimate">{t("todayv.estimate", { n: task.estimatedMinutes })}</span>
        ) : null}
        {startMin !== undefined ? (
          <span className="tdy-row-time">{formatMinuteOfDay(startMin, lang)}</span>
        ) : null}
        <MoreMenu items={menuItems} label={t("todayv.rowMenuAria")} />
      </div>
    </MotionTaskRow>
  );
}
