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
import type { Language, Task } from "../../types";
import { isCompleted, isNote } from "../../domain/tasks/taskState";
import { useT } from "../../i18n";
import { countdownLabel } from "../../domain/view/countdown";
import { taskTimeLabel, type TaskTimeLabel } from "../../domain/view/taskTime";
import type { ScopeDateBy } from "../../domain/view/scopeViewOptions";
import { formatDate, formatWeekday, todayValue } from "../../utils/date";
import { getWeekStartPref } from "../../utils/appPrefs";
import { TaskCheck } from "./TaskCheck";
import { rectOfElement } from "../floating";
import type { Rect } from "../../domain/floating";

interface TaskRowContentProps {
  task: Task;
  /**
   * Opens the Task — and says where the row is, for the surfaces that draw
   * the Detail as a popup beside it
   * (CALENDAR_CREATE_AND_TASK_POPUP_DESIGN.md §3.4).
   *
   * The rect is the row's own, measured at the click. A caller that draws the
   * Detail as a column ignores it.
   */
  onOpen: (taskId: string, anchor?: Rect) => void;
  onToggleDone: (task: Task) => void;
  /**
   * The List's name, where the row sits somewhere its List does not.
   *
   * A List's own rows do not need it; the matrix's boxes gather four Lists into
   * one grid, and there the name is the fact a card cannot get from its place.
   */
  listName?: string;
  /**
   * The parent's title, where the row is a child (Trash §13).
   *
   * A child is a row in exactly one Scope — the Trash — and there it looks
   * like any top-level task. Without this, restoring one puts it back
   * somewhere the reader was not looking and it reads as having vanished.
   * `listName`'s reason exactly: the fact a row cannot get from where it
   * sits.
   */
  parentTitle?: string;
  /**
   * How this row says its deadline (SCOPE_VIEW_OPTIONS_DESIGN.md §3.5).
   *
   * Optional and `taskTime` by default: it is a SCOPE's setting, and the
   * Matrix draws this row without being one. The Scopes that have the setting
   * pass it; everything else keeps the date it has always drawn.
   */
  dateBy?: ScopeDateBy;
  /**
   * Whether the body is drawn or only reported (§3.8).
   *
   * Off (the default, and what every row did before) the row says a body
   * EXISTS with a 12px mark. On, it says the first line of it instead — the
   * mark and the line are the same fact, so only one of them is drawn.
   */
  showDetails?: boolean;
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

/**
 * The descriptor as the words a row draws.
 *
 * A function rather than the ternary it replaced, which had grown five deep:
 * the shape of a `TaskTimeLabel` is a union with three arms and a `switch`
 * is what reads one. It also makes the compiler check that all three are
 * answered.
 */
function writeTaskTime(
  label: TaskTimeLabel | null,
  t: (key: string, vars?: Record<string, string | number>) => string,
  lang: Language,
): string {
  if (label === null) return "";
  switch (label.kind) {
    case "word":
      return t(label.key);
    case "weekday":
      return label.nextWeek
        ? t("view.nextWeekday", { day: formatWeekday(label.date, lang) })
        : formatWeekday(label.date, lang);
    case "date":
      return formatDate(label.date, lang);
  }
}

/** A body is drawn one line deep, so this is what a row reads of it. */
function firstLine(text: string): string {
  const cut = text.indexOf(String.fromCharCode(10));
  return (cut === -1 ? text : text.slice(0, cut)).trim();
}
export function TaskRowContent({
  task,
  onOpen,
  onToggleDone,
  listName,
  parentTitle,
  dateBy = "taskTime",
  showDetails = false,
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
  const day = today ?? todayValue();
  const countdown = dateBy === "countdown" ? countdownLabel(task.dueDate, day) : null;
  // §13.7: `Task Time` is not the raw date either. The reference app names
  // the days a reader already has a word for — `Today`, `Tomorrow`, `Next
  // Mon` — and falls back to `Aug 20` only when there is no name to use. It
  // was `formatDate` unconditionally, which wrote `Sep 7` where the reference
  // writes `Next Mon`.
  const taskTime = countdown ? null : taskTimeLabel(task.dueDate, day, getWeekStartPref());
  const dueLabel = countdown
    ? t(countdown.key, { days: countdown.days })
    : writeTaskTime(taskTime, t, lang);
  // Not on finished work (§19.5). "Overdue" is a thing to go and do, and a row
  // that has been ticked has had it done — a red date under a strike-through is
  // an alarm about a job that is already over.
  const overdue = !done && Boolean(task.dueDate) && task.dueDate < (today ?? todayValue());
  const repeats = task.repeatType !== undefined && task.repeatType !== "none";
  // Either body counts: `contentMode` decides which one a Task is using, and a
  // row only reports that there IS more behind the title.
  // The first line only. A body's later lines are the Detail's to draw; a row
  // that grew with them would turn a column of three cards into a column of
  // one, which is the question Kanban Size answers and not the card's.
  const body = firstLine(task.notes?.trim() || task.description?.trim() || "");
  const hasBody = Boolean(body);
  // Q3: a card with no body draws nothing extra. An empty line kept for the
  // sake of even card heights would be a row of blank spent saying that this
  // task has nothing to say — and the mark it replaces was absent in that case
  // too, so nothing about the quiet card changes.
  const bodyLine = showDetails ? body : "";
  const hasTips =
    Boolean(listName) || Boolean(parentTitle) || repeats || hasBody || Boolean(dueLabel);
  // The level this row is allowed to say — the matrix's cards say `none`
  // because their box already is the priority.
  const level = showPriority ? task.priority : "none";
  // The box's name carries the level now the flag is gone
  // (TASK_ROW_TWO_LINES_DESIGN.md §2.2). The flag was the only thing on the
  // row that said the priority in something other than colour, and it said it
  // to screen readers and in forced-colours mode, where the border colour is
  // thrown away entirely. A name costs no width, which is what the flag cost.
  //
  // Not on a finished task: a ticked box is grey whatever the level was, and a
  // name that still announced `High` would be describing a colour that is not
  // on screen.
  const checkLabel =
    !done && level !== "none"
      ? t("tasks.completeTaskPriority", { title: task.title, priority: t(`priority.${level}`) })
      : t(done ? "tasks.reopenTask" : "tasks.completeTask", { title: task.title });
  return (
    <>
      {/* A 17px box with the row's full height as its hit area. That is the
          reference's own design (audit §3.1), and the reason this is a label
          around the input rather than a bare input. */}
      {/* A note has nothing to tick (QUICK_ADD_INPUT_BOX_DESIGN.md §7.1), and
          the slot stays anyway: an icon where the box would be keeps every
          title on the same left edge, and says what kind of item this is in
          the one place the eye is already going. */}
      {isNote(task) ? (
        <span className="tm-task-check is-note" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" focusable="false">
            <rect x="4.5" y="4" width="15" height="16" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.9" />
            <path d="M8 9h8M8 12.5h8M8 16h5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
        </span>
      ) : (
      <label className="tm-task-check">
        {/* The box is where the priority is said now — as its colour, and as
            part of its name (§4.1, and TASK_ROW_TWO_LINES_DESIGN.md §2.2).
            `showPriority` gates both together, so a view that has already said
            the level another way — the matrix's quadrants — is not made to say
            it twice more. */}
        <TaskCheck
          priority={level}
          checked={done}
          label={checkLabel}
          onToggle={() => onToggleDone(task)}
        />
      </label>
      )}
      <button
        type="button"
        // `has-body` where a second line is drawn, and only there
        // (TASK_ROW_TWO_LINES_DESIGN.md §3.3). The row is one flex line that
        // does not wrap; a body asking for 100% of it left the title at its
        // own basis of 0 and the row read as a body with no title. The
        // component that decides there IS a second line is the one that says
        // so — a stylesheet would have to ask.
        className={`tm-task-open${bodyLine ? " has-body" : ""}`}
        // §16.34: a row opens a Task, and a screen reader should say so rather
        // than reading the title as if it were a heading.
        aria-label={t("tasks.openTask", { title: task.title })}
        onClick={(event) => onOpen(task.id, rectOfElement(event.currentTarget) ?? undefined)}
      >
        <span className={`tm-task-title${done ? " is-done" : ""}`}>{task.title}</span>
        {/* The flag that was here is gone (TASK_ROW_TWO_LINES_DESIGN.md §2).
            It was the second channel the priority colour needed — shape as
            well as hue — and TASK_PRIORITY_CHECKBOX_DESIGN.md Q1 kept it for
            exactly that reason. The reference app draws no flag; the ask was
            for its picture, and the level is now in the checkbox's colour and
            in its accessible NAME, which costs no width. */}
        {/* §1.5: under the title, quiet, one line. Cut to one because a card
            that grows with its body turns a column of three into a column of
            one, which is the question `Kanban Size` is for — the card does not
            get to answer it. */}
        {bodyLine ? <span className="tm-task-body">{bodyLine}</span> : null}
        {/* One group at the right edge rather than four things loose in the
            row: the tips are what the row says about itself after the title,
            and they have to stay together when the title takes the width. */}
        {hasTips ? (
          <span className="tm-task-tips">
            {/* The List as a name and nothing else. A coloured dot beside it
                would be a second way of saying one word. */}
            {listName ? <span className="tm-task-list">{listName}</span> : null}
            {/* `↳` and the parent's name, quiet, in the same cluster as the
                List's. The arrow is what makes it a relationship rather
                than a second list name. */}
            {parentTitle ? (
              <span className="tm-task-parent" title={t("tasks.childOf", { title: parentTitle })}>
                <span aria-hidden="true">↳ </span>
                {parentTitle}
              </span>
            ) : null}
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
            {hasBody && !showDetails ? (
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
