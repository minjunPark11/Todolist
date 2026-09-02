import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { COMPLETED_PAGE } from "../../domain/view/viewGroups";
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
import { formatDate } from "../../utils/date";
import { listDisplayName } from "../../domain/spaces/hierarchy";
import type { List } from "../../types";
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
  /** For the list name on a row — the same one the Module's rows carry. */
  lists: List[];
  /**
   * Moves everything in the `기한 지남` group onto today (§3.5).
   *
   * A group's own action, drawn on that group's header and on no other —
   * which is why it is a prop of the list rather than a row in the page's ⋯:
   * the ⋯ acts on the whole day, and this acts on one group of it.
   */
  onPostponeOverdue: () => void;
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
  lists,
  onPostponeOverdue,
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
            <TodayGroup
              key={group.id}
              group={group}
              lists={lists}
              today={today}
              hideOverdueReason={groupAxis === "date"}
              openedTaskId={openedTaskId}
              onPostponeOverdue={onPostponeOverdue}
              onToggleDone={onToggleDone}
              onOpenTask={onOpenTask}
              onMoveBucket={onMoveBucket}
            />
          ))}

        </>
      )}
    </section>
  );
}

/**
 * One group: a header that collapses, and the rows under it (§1.3).
 *
 * Local state, not a stored setting — which is the Matrix's answer for the
 * same control (`MatrixPage`'s group head). Whether a heading is folded right
 * now is a moment's reading, not a preference worth carrying to another
 * device.
 *
 * "완료" starts folded and the rest start open. That is the Inbox board's
 * split rather than the Matrix's, and for the board's reason: this is a
 * WORKING surface, and remaining work sliding down under finished work is the
 * worst thing that can happen on a screen whose whole question is what is
 * left.
 */
function TodayGroup({
  group,
  lists,
  today,
  hideOverdueReason,
  openedTaskId,
  onPostponeOverdue,
  onToggleDone,
  onOpenTask,
  onMoveBucket,
}: {
  group: { id: TodayGroupId; rows: TodayEntry[] };
  lists: List[];
  today: string;
  hideOverdueReason: boolean;
  openedTaskId: string;
  onPostponeOverdue: () => void;
  onToggleDone: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  onMoveBucket: (taskId: string, bucket: TodayBucketId) => void;
}) {
  const { t } = useT();
  const finished = group.id === "completed";
  const [open, setOpen] = useState(!finished);
  const [shown, setShown] = useState(COMPLETED_PAGE);

  // The cap is on finished work alone, and it is `COMPLETED_PAGE` rather than
  // a number of this screen's own: the Matrix's boxes and the Board's columns
  // already answer "how much of 완료 before the reader has to ask", and two
  // constants that mean one rule are one rule that can drift.
  const visible = finished ? group.rows.slice(0, shown) : group.rows;
  const hidden = group.rows.length - visible.length;

  return (
    <section className={`tdy-bucket is-${group.id}`}>
      <header className="tdy-bucket-head">
        <button
          type="button"
          className="tdy-bucket-toggle"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="tdy-bucket-caret" aria-hidden="true">{open ? "⌄" : "›"}</span>
          <span className={`tdy-bucket-dot tdy-bucket-dot-${group.id}`} aria-hidden="true" />
          <strong>{t(todayGroupLabelKey(group.id))}</strong>
          <span className="tdy-bucket-count">{group.rows.length}</span>
        </button>
        {/* Only here. Every other group is work whose date is already what the
            reader meant; this is the one that is a backlog, and the reference
            app puts the way out of it on this header (§1.3). */}
        {group.id === "overdue" ? (
          <button type="button" className="tdy-bucket-action" onClick={onPostponeOverdue}>
            {t("todayv.postponeOverdue")}
          </button>
        ) : null}
      </header>

      {open ? (
        <div className="tdy-rows">
          <AnimatePresence initial={false}>
            {visible.map((entry) => (
              <FocusQueueRow
                key={entry.task.id}
                entry={entry}
                lists={lists}
                today={today}
                // §3.6: the group already says it. A row inside "기한 지남"
                // that also says "기한 지남" is the screen making the same
                // statement twice, and the group is the one that can say it
                // once for everything under it.
                hideOverdueReason={hideOverdueReason}
                isOpen={entry.task.id === openedTaskId}
                onToggleDone={onToggleDone}
                onOpenTask={onOpenTask}
                onMoveBucket={onMoveBucket}
              />
            ))}
          </AnimatePresence>
          {hidden > 0 ? (
            <button
              type="button"
              className="tdy-bucket-more"
              onClick={() => setShown((value) => value + COMPLETED_PAGE)}
            >
              {t("tasks.showMore")}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function FocusQueueRow({
  entry,
  lists,
  today,
  hideOverdueReason,
  isOpen,
  onToggleDone,
  onOpenTask,
  onMoveBucket,
}: {
  entry: TodayEntry;
  lists: List[];
  today: string;
  hideOverdueReason: boolean;
  isOpen: boolean;
  onToggleDone: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  onMoveBucket: (taskId: string, bucket: TodayBucketId) => void;
}) {
  const { t, lang } = useT();
  const { task, bucket, reason, completed } = entry;
  const startMin = parseTimeToMinutes(task.startTime);

  // The same four the Module's rows carry, read the same way — which list, is
  // there more behind the title, when is it due, and is that date late. A
  // second answer to any of them is a second thing to keep in step.
  const listName = listDisplayName(
    lists.find((list) => list.id === task.listId),
    t("common.list"),
    t("status.inbox"),
  );
  const hasBody = Boolean(task.notes?.trim() || task.description?.trim());
  const dueLabel = task.dueDate ? formatDate(task.dueDate, lang) : "";
  // Not on finished work (§19.5): a red date under a strike-through is an
  // alarm about a job that is already over.
  const overdue = !completed && Boolean(task.dueDate) && task.dueDate < today;
  const showReason = reason !== "none" && !(hideOverdueReason && reason === "overdue");

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
        {/* §3.6: everything that is not the title, in one cluster at the far
            end. The title is what is read first, and a badge between it and
            the row's edge is a word the eye has to step over to get to the
            date it was looking for. */}
        <span className="tdy-row-meta">
          {showReason ? (
            <span className={`tdy-reason tdy-reason-${reason}`}>{t(`todayv.reason.${reason}`)}</span>
          ) : null}
          {task.estimatedMinutes > 0 ? (
            <span className="tdy-estimate">{t("todayv.estimate", { n: task.estimatedMinutes })}</span>
          ) : null}
          {listName ? <span className="tdy-row-list">{listName}</span> : null}
          {hasBody ? (
            <span className="tdy-row-tip" role="img" aria-label={t("tasks.card.hasNotes")}>
              <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                <path d="M5 4.5h9L19 9v10.5H5z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
                <path d="M8.5 12.5h7M8.5 16h4.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
            </span>
          ) : null}
          {startMin !== undefined ? (
            <span className="tdy-row-time">{formatMinuteOfDay(startMin, lang)}</span>
          ) : null}
          {dueLabel ? (
            <span className={`tdy-row-due${overdue ? " is-overdue" : ""}`}>{dueLabel}</span>
          ) : null}
        </span>
        <MoreMenu items={menuItems} label={t("todayv.rowMenuAria")} />
      </div>
    </MotionTaskRow>
  );
}
