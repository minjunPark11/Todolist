// The half of a Task row that is the same wherever the Task is drawn.
//
// The List drew a checkbox, a title, a priority flag and a due date. The Board
// drew a title and a due date and nothing else, so a Task could not be finished
// from a card and a High card looked like every other card — the two most
// common things anyone does to a Task were missing from one of the two places
// a Task is shown. They were two components doing one job.
//
// TICKTICK_COMPONENT_13 §3 measured the reference doing this with one component
// and changing only the surface under it: same markup, same checkbox, the
// background layer opaque and inset differently. §9.1 of that document is the
// note that our five row implementations came from not having this seam.
//
// The matrix's card was the last one outside. TICKTICK_MATRIX_DESIGN §15 Q4
// held it open, and Phase 4 made it dearer by giving the card its own tick, its
// own icons and its own date (§19.7) — a third implementation of the two things
// this file exists to have one of. It is here now, and what it brought with it
// belongs to every row: TICKTICK_COMPONENT_06 measured the reference's row as a
// checkbox, a title, and a group of tips at the right edge — date, note and
// repeat, three of them on one row and the row still 40 high (§2.3, §7). The
// List had one of the three. The List's NAME is ours and not the reference's:
// the matrix gathers four Lists into one grid, and there it is the fact a card
// cannot get from where it sits.
//
// What stays outside this component is what genuinely differs between the two
// views — the List's drag handle and its ⋯ menu, the Board's move-to-column
// select, the matrix card's drag-to-a-day. Those are not a row; they are what
// the view does with a row.
import type { Task } from "../../types";
import { isCompleted } from "../../domain/tasks/taskState";
import { useT } from "../../i18n";
import { countdownLabel } from "../../domain/view/countdown";
import type { ScopeDateBy } from "../../domain/view/scopeViewOptions";
import { formatDate, todayValue } from "../../utils/date";

interface TaskRowContentProps {
  task: Task;
  onOpen: (taskId: string) => void;
  onToggleDone: (task: Task) => void;
  /**
   * The List's name, where the row sits somewhere its List does not.
   *
   * A List's own rows do not need it; the matrix's boxes gather four Lists into
   * one grid, and there the name is the fact a card cannot get from its place.
   */
  listName?: string;
  /**
   * How this row says its deadline (SCOPE_VIEW_OPTIONS_DESIGN.md §3.5).
   *
   * Optional and `taskTime` by default: it is a SCOPE's setting, and the
   * Matrix draws this row without being one. The Scopes that have the setting
   * pass it; everything else keeps the date it has always drawn.
   */
  dateBy?: ScopeDateBy;
  /**
   * False where the row's PLACE already is the priority — the matrix's boxes
   * after D1. A flag there would repeat the box's header once per card.
   */
  showPriority?: boolean;
  /**
   * Today, as `YYYY-MM-DD`. A caller that has grouped by date passes the value
   * it grouped with, so a card cannot be drawn late inside a group that says it
   * is not; anyone else gets today.
   */
  today?: string;
}

export function TaskRowContent({
  task,
  onOpen,
  onToggleDone,
  listName,
  dateBy = "taskTime",
  showPriority = true,
  today,
}: TaskRowContentProps) {
  const { t, lang } = useT();
  const done = isCompleted(task);
  // The date itself, written the way the reader's language writes a date
  // ("8월 20일", "Aug 20") rather than as the stored `2026-08-20`, which is a
  // date only once you have worked out which half is the month.
  // The same date either way (§3.5) — one is the day it falls on, the other is
  // what is left of it. Replaced rather than joined: a row that said both
  // would be answering one question twice, and the reference app swaps them in
  // the same slot.
  const countdown = dateBy === "countdown" ? countdownLabel(task.dueDate, today ?? todayValue()) : null;
  const dueLabel = countdown
    ? t(countdown.key, { days: countdown.days })
    : task.dueDate
      ? formatDate(task.dueDate, lang)
      : "";
  // Not on finished work (§19.5). "Overdue" is a thing to go and do, and a row
  // that has been ticked has had it done — a red date under a strike-through is
  // an alarm about a job that is already over.
  const overdue = !done && Boolean(task.dueDate) && task.dueDate < (today ?? todayValue());
  const repeats = task.repeatType !== undefined && task.repeatType !== "none";
  // Either body counts: `contentMode` decides which one a Task is using, and a
  // row only reports that there IS more behind the title.
  const hasBody = Boolean(task.notes?.trim() || task.description?.trim());
  const hasTips = Boolean(listName) || repeats || hasBody || Boolean(dueLabel);
  return (
    <>
      {/* A 17px box with the row's full height as its hit area. That is the
          reference's own design (audit §3.1), and the reason this is a label
          around the input rather than a bare input. */}
      <label className="tm-task-check">
        <input
          type="checkbox"
          checked={done}
          aria-label={t(done ? "tasks.reopenTask" : "tasks.completeTask", { title: task.title })}
          onChange={() => onToggleDone(task)}
        />
      </label>
      <button
        type="button"
        className="tm-task-open"
        // §16.34: a row opens a Task, and a screen reader should say so rather
        // than reading the title as if it were a heading.
        aria-label={t("tasks.openTask", { title: task.title })}
        onClick={() => onOpen(task.id)}
      >
        <span className={`tm-task-title${done ? " is-done" : ""}`}>{task.title}</span>
        {/* Priority was stored and never drawn (audit §3.1): a Task could be
            High and look like every other row. The reference puts it in the
            checkbox's colour instead, which is one signal doing two jobs and
            unreadable to anyone who cannot separate the two colours
            (TICKTICK_COMPONENT_06 §6.1), so the flag stays. */}
        {showPriority && task.priority !== "none" ? (
          <span
            className={`tm-task-priority is-${task.priority}`}
            aria-label={t(`priority.${task.priority}`)}
            title={t(`priority.${task.priority}`)}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path d="M6 21V4h11l-2.2 4L17 12H6" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </span>
        ) : null}
        {/* One group at the right edge rather than four things loose in the
            row: the tips are what the row says about itself after the title,
            and they have to stay together when the title takes the width. */}
        {hasTips ? (
          <span className="tm-task-tips">
            {/* The List as a name and nothing else. A coloured dot beside it
                would be a second way of saying one word. */}
            {listName ? <span className="tm-task-list">{listName}</span> : null}
            {repeats ? (
              <span className="tm-task-tip" role="img" aria-label={t("tasks.card.repeats")} title={t("tasks.card.repeats")}>
                <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                  <path d="M4.5 12A7.5 7.5 0 0 1 17.3 6.7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                  <path d="M17.3 3.2v3.5h-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                  <path d="M6.7 20.8v-3.5h3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ) : null}
            {hasBody ? (
              <span className="tm-task-tip" role="img" aria-label={t("tasks.card.hasNotes")} title={t("tasks.card.hasNotes")}>
                <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                  <path d="M5 4.5h9L19 9v10.5H5z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
                  <path d="M8.5 12.5h7M8.5 16h4.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              </span>
            ) : null}
            {dueLabel ? (
              <span className={`tm-task-due${overdue ? " is-overdue" : ""}`}>{dueLabel}</span>
            ) : null}
          </span>
        ) : null}
      </button>
    </>
  );
}
