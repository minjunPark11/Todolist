import { useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import {
  todayGroupOf,
  todayGroupOrder,
  todayGroupLabelKey,
  type TodayGroupAxis,
  type TodayGroupId,
} from "../../domain/view/todayGroups";
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

interface FocusQueueProps {
  entries: TodayEntry[];
  hasQuery: boolean;
  query: string;
  showCompleted: boolean;
  /**
   * Whether the finished group is drawn.
   *
   * The value is still the page's — the ⋯ that flips it is the page's now
   * (§3.2) — but this component is what reads it, so it stays a prop rather
   * than becoming something the page filters before handing entries over.
   * Filtering there would take completion out of `groupIdOf`'s hands.
   */
  onToggleDone: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  onMoveBucket: (taskId: string, bucket: TodayBucketId) => void;
  /** Today as `YYYY-MM-DD` — which date the groups are measured against. */
  today: string;
  /** Which question the list is grouped by (§3.4). */
  groupAxis: TodayGroupAxis;
  /**
   * The Task the Detail has open, or "" (§1.4's observation, redesign Q6).
   *
   * The reference app paints that row and this list did not, which was
   * survivable while the Detail was an overlay of its own and is not now that
   * it is the column beside this one — a pane with no line back to the row it
   * came from. The Matrix and the Tasks module already draw it; this is the
   * same reading, third time.
   */
  openedTaskId: string;
  onAddTask: () => void;
}

export function FocusQueue({
  entries,
  hasQuery,
  query,
  showCompleted,
  onToggleDone,
  onOpenTask,
  onMoveBucket,
  today,
  groupAxis,
  openedTaskId,
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
    const byGroup = new Map<TodayGroupId, TodayEntry[]>();
    for (const entry of entries) {
      const id = todayGroupOf(entry.task, entry.bucket, today, groupAxis);
      const bucket = byGroup.get(id);
      if (bucket) bucket.push(entry);
      else byGroup.set(id, [entry]);
    }
    return todayGroupOrder(groupAxis).flatMap((id) => {
      const rows = byGroup.get(id);
      if (!rows || rows.length === 0) return [];
      // The one group the reader can switch off. It is a group like any other
      // here — the toggle decides whether it is drawn, not what it holds.
      if (id === "completed" && !showCompleted) return [];
      return [{ id, rows }];
    });
  }, [entries, today, groupAxis, showCompleted]);

  return (
    /* Not a card any more (§3.1), and no head of its own (§3.2). "오늘 할 일"
       under a page titled "오늘" was the same word twice, and the ⋯ it carried
       belongs to the page — one menu for one screen. `받은함 정리` keeps its
       card, because that one really is something else beside the day. */
    <section className="tdy-queue">
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
                <strong>{t(todayGroupLabelKey(group.id))}</strong>
                <span className="tdy-bucket-count">{group.rows.length}</span>
              </header>
              <div className="tdy-rows">
                <AnimatePresence initial={false}>
                  {group.rows.map((entry) => (
                    <FocusQueueRow
                      key={entry.task.id}
                      entry={entry}
                      isOpen={entry.task.id === openedTaskId}
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
  isOpen,
  onToggleDone,
  onOpenTask,
  onMoveBucket,
}: {
  entry: TodayEntry;
  isOpen: boolean;
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
        className={`tdy-row${completed ? " is-done" : ""}${isOpen ? " is-open" : ""}`}
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
