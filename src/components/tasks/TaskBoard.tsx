// One Board component for both Boards (TickTick plan §16.30, §7.21, §7.34).
//
// §16.30 permits sharing the columns and then insists the DOMAIN semantics
// stay apart. This file is the shared half: it knows about columns, cards,
// dragging and dropping, and nothing whatever about dates or Sections. What a
// drop MEANS is decided by the caller through `onDrop`, which is why the same
// gesture can be two different canonical commands (Gate 7).
//
// Dragging is not the only way to move a card. §16.30 asks for a non-drag
// alternative, and it is not a courtesy: a drag needs a fine pointer, a
// steady hand and sight of both ends of the gesture at once. Every card
// therefore carries a plain "move to" selector that does the same thing,
// reachable by keyboard and by touch.
import { useRef, useState } from "react";
import type { Task } from "../../types";
import { COLUMN_NAME_MAX, type BoardColumn } from "../../domain/tasks/board";
import { Caret } from "../common/Caret";
import { useT } from "../../i18n";
import { COMPLETED_PAGE } from "../../domain/view/viewGroups";
import { TaskRowContent } from "./TaskRowContent";
import type { ScopeDateBy, ScopeKanbanSize } from "../../domain/view/scopeViewOptions";

interface TaskBoardProps {
  columns: BoardColumn[];
  /** The Tasks of one column, already in the order they should be shown. */
  tasksIn: (columnId: string) => Task[];
  /** Which column a Task is in now — so a drop inside it can be a reorder. */
  columnOf: (task: Task) => string;
  openTaskId: string;
  onOpen: (taskId: string) => void;
  /** The Board finishes a Task the same way the List does (TICKTICK_COMPONENT_13 §3). */
  onToggleDone: (task: Task) => void;
  /**
   * A card was dropped. `index` is its place among the column's other cards.
   *
   * `date` is only ever supplied for a column that asked for one (§6.25); the
   * caller decides what, if anything, that means.
   */
  onDrop: (taskId: string, columnId: string, index: number, date?: string) => void;
  /** §12.4: false where the Scope's sort is derived, and the drop only moves columns. */
  canReorder: boolean;
  /**
   * A card was right-clicked. The Module answers with the menu, because the
   * menu is a Task's and not a Board's — the same one a row opens.
   */
  onContextMenu?: (task: Task, x: number, y: number) => void;
  /**
   * A task was typed into a column's `+` (INBOX_COLUMNS design §6, phase 1).
   *
   * The Board does not know what being in a column means, here any more than
   * at a drop — it hands over the column and the words, and the Module turns
   * that into the create the Scope allows. Absent where the Scope cannot
   * create at all, and then no `+` is drawn: a control that could only fail
   * is not a control (MATRIX §27.3).
   */
  onCreate?: (columnId: string, title: string, date: string) => void;
  /**
   * Whether each column carries a way in (SCOPE_VIEW_OPTIONS_DESIGN.md §3.4).
   *
   * On: an `Add Task` row at the top of the column, which becomes the form.
   * Off: no way in at all — the header `+` that used to be the other answer is
   * gone, because two entry points to one column is what this toggle exists to
   * settle. The reader who turned it off asked for the column to be a list of
   * what is there.
   */
  showInputBox?: boolean;
  /** §3.5's reading, passed down to every card the Board draws. */
  dateBy?: ScopeDateBy;
  /** §3.6: how wide a column is, and so how many of them fit on screen. */
  kanbanSize?: ScopeKanbanSize;
  /** §3.8: whether a card draws a line of its body or only reports one. */
  showDetails?: boolean;
  /** Today, for the countdown to measure from. */
  today?: string;
  /**
   * The column's finished work, newest first, already grouped by the domain.
   *
   * Separate from `tasksIn` rather than mixed into it: §12.4 keeps finished
   * work out of a Scope's rows, and the column shows it as its own group
   * instead of quietly restoring it to the pile. Absent means the Board draws
   * no "완료" group at all.
   */
  finishedIn?: (columnId: string) => Task[];
  /**
   * The column was given a new name, or "" to take its built-in one back.
   *
   * Renaming is the one item on the reference app's column menu that can be
   * answered while a column's rule is still a constant: a name says nothing
   * about membership, so nothing moves and nothing can end up in no column at
   * all. The other four wait for the rules (INBOX_COLUMNS design §3).
   *
   * Absent means this Board's columns are not the user's to name — a List's
   * Sections are records, and renaming one is a different command.
   */
  onRename?: (columnId: string, name: string) => void;
  /**
   * The tasks no column takes (design §3, phase 4).
   *
   * Drawn under the board rather than hidden, because a task in the account
   * and on no screen is the worst bug a to-do app has — and once a column's
   * conditions can be edited or deleted, that state is one click away. Empty
   * while nobody has edited anything, which is the whole point of building it
   * before the controls that make it reachable.
   */
  unmatched?: Task[];
  /**
   * Why this column would refuse this card, or null if it would take it.
   *
   * Asked while the card is still in the air, so a column cannot light up and
   * then quietly do nothing (§23.5). The Board does not know what the reasons
   * mean — it names them to the reader and lets the caller decide them.
   */
  dropRefusal?: (taskId: string, columnId: string) => string | null;
  /**
   * The column's ⋯ was pressed.
   *
   * The Board hands over which column and where, and the caller answers with
   * the menu — the same split the card's context menu uses, and for the same
   * reason: what a column can be told to do is the Scope's business (a List's
   * columns are Sections and cannot be reordered by this menu at all), while
   * where the menu opens is the Board's.
   */
  onColumnMenu?: (columnId: string, x: number, y: number) => void;
  /** The board's own "새로운 열". Absent where columns are not the user's. */
  onAddColumn?: () => void;
}

export function TaskBoard({
  columns,
  tasksIn,
  columnOf,
  openTaskId,
  onOpen,
  onToggleDone,
  onDrop,
  canReorder,
  onContextMenu,
  onCreate,
  showInputBox = true,
  dateBy,
  kanbanSize = "medium",
  showDetails,
  today,
  finishedIn,
  onRename,
  unmatched = [],
  dropRefusal,
  onColumnMenu,
  onAddColumn,
}: TaskBoardProps) {
  const { t } = useT();
  // Which card is being dragged, in a ref as well as in state. The state is
  // what dims the card; the ref is what the drop reads, because a handler
  // closes over the render it was created in and a drop that arrives before
  // React has re-rendered would otherwise see no card at all.
  const dragged = useRef("");
  const [dragging, setDragging] = useState("");
  function startDrag(taskId: string) {
    dragged.current = taskId;
    setDragging(taskId);
  }
  function endDrag() {
    dragged.current = "";
    setDragging("");
  }
  const [over, setOver] = useState("");
  // A drop that cannot be committed until the user says which day (§6.25).
  const [pending, setPending] = useState<{ taskId: string; columnId: string; index: number } | null>(null);
  // Which column is being typed into, and what has been typed. One at a time:
  // two open inputs would be two carets on one screen with nothing saying
  // which one Enter belongs to.
  //
  // `null` is "nothing open", not `""`. A List with no sections has ONE column
  // whose id IS `""` (the no-section bucket), so an empty-string sentinel read
  // as "that column is being typed into" — its form stood open from the first
  // paint and its `+` reported itself expanded forever. Found when the `+`
  // became a row (SCOPE_VIEW_OPTIONS_DESIGN.md §3.4): the row is drawn while
  // nothing is open, so on that List it was never drawn at all.
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftDate, setDraftDate] = useState("");
  // Which column's name is being edited, and the words so far. The words are
  // held here rather than written per keystroke: a name that syncs on every
  // letter is a name every other device watches being typed.
  const [renaming, setRenaming] = useState("");
  const [nameDraft, setNameDraft] = useState("");

  function closeAdd() {
    setAdding(null);
    setDraft("");
    setDraftDate("");
  }

  function label(column: BoardColumn): string {
    return column.name ?? t(column.labelKey ?? "tasks.sectionDefault");
  }

  /** Why the card in the air would be turned away here, if it would be. */
  function refusalFor(column: BoardColumn): string | null {
    if (!dropRefusal || !dragging) return null;
    return dropRefusal(dragging, column.id);
  }

  function drop(column: BoardColumn, index: number) {
    const taskId = dragged.current;
    endDrag();
    setOver("");
    if (!taskId) return;
    // Refused before anything is written, and the column said so on the way in
    // — a drop that lands and does nothing is indistinguishable from a bug.
    if (dropRefusal && dropRefusal(taskId, column.id)) return;
    // The date is asked for before anything is written, not after: §6.25 says
    // the column IS a date, so a task moved there without one would be sitting
    // in a column whose rule it does not satisfy.
    if (column.requiresDate) {
      setPending({ taskId, columnId: column.id, index });
      return;
    }
    onDrop(taskId, column.id, index);
  }

  return (
    <div className={`tm-board is-${kanbanSize}`}>
      {columns.map((column) => {
        const cards = tasksIn(column.id);
        const refusal = refusalFor(column);
        return (
          <section
            key={column.id || "default"}
            className={`tm-column${over === column.id ? " is-over" : ""}${refusal ? " is-refusing" : ""}`}
            aria-label={label(column)}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(column.id);
            }}
            onDragLeave={() => setOver((current) => (current === column.id ? "" : current))}
            onDrop={(event) => {
              event.preventDefault();
              drop(column, cards.length);
            }}
          >
            <header className="tm-column-head">
              {/* The header IS the rename control, which is where the reference
                  app puts it too — Component 13 §2 measured an invisible
                  overlay over the title, revealed on hover. The ⋯ menu's
                  "이름 바꾸기" will be a second door to this same input. */}
              {onRename && renaming === column.id ? (
                <input
                  className="tm-column-name"
                  autoFocus
                  value={nameDraft}
                  maxLength={COLUMN_NAME_MAX}
                  aria-label={t("tasks.renameColumn", { column: label(column) })}
                  onChange={(event) => setNameDraft(event.target.value)}
                  onBlur={() => {
                    // Committing on blur rather than discarding: clicking away
                    // from a name you have just typed reads as "done", and a
                    // rename is undone by typing the old one back.
                    onRename(column.id, nameDraft.trim());
                    setRenaming("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onRename(column.id, nameDraft.trim());
                      setRenaming("");
                    }
                    // Escape puts back what was there, so the input has to stop
                    // being a rename before it loses focus.
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setRenaming("");
                    }
                  }}
                />
              ) : onRename ? (
                <h3>
                  <button
                    type="button"
                    className="tm-column-rename"
                    aria-label={t("tasks.renameColumn", { column: label(column) })}
                    onClick={() => {
                      // Seeded with the CURRENT name, built-in ones included:
                      // an empty box would ask the user to remember what the
                      // column was called before they can adjust it.
                      setNameDraft(label(column));
                      setRenaming(column.id);
                    }}
                  >
                    {label(column)}
                  </button>
                </h3>
              ) : (
                <h3>{label(column)}</h3>
              )}
              {cards.length > 0 ? <span className="tm-count">{cards.length}</span> : null}
              {/* The other half of §3.4's door (Q1).

                  `Show Input Box` moves the way in; it does not take it
                  away. On, the door is a row at the top of the column; off,
                  it is this — the reference app draws exactly one of the two
                  at a time, in the header when the row is gone.

                  Without it, turning the setting off left the column with no
                  way to be added to. The Scope's own quick-add is still
                  above the board, but what it cannot do is put the task in
                  THIS column, and a column on a board IS the statement being
                  made about the work.

                  Hidden while its own form is open, for the same reason the
                  row hides: one door at a time, and the form is already the
                  answer to having opened it. */}
              {onCreate && !showInputBox && adding !== column.id ? (
                <button
                  type="button"
                  className="tm-column-add-head"
                  aria-label={t("tasks.addToColumn", { column: label(column) })}
                  onClick={() => (closeAdd(), setAdding(column.id))}
                >
                  +
                </button>
              ) : null}
              {/* Anchored to the BUTTON rather than to the pointer, so the menu
                  opens in the same place however it was triggered — including
                  from the keyboard, where there is no pointer to anchor to. */}
              {onColumnMenu ? (
                <button
                  type="button"
                  className="tm-column-menu"
                  aria-label={t("tasks.columnMenu", { column: label(column) })}
                  aria-haspopup="menu"
                  onClick={(event) => {
                    const box = event.currentTarget.getBoundingClientRect();
                    onColumnMenu(column.id, box.left, box.bottom + 4);
                  }}
                >
                  ⋯
                </button>
              ) : null}
            </header>

            {/* The input opens ABOVE and the card appears below it, so the
                thing just typed is not what moves (MATRIX §19.2). */}
            {/* Said while the card is over the column, not after it lands.
                Naming the reason is the point — "it just would not drop" is
                the bug report a silent refusal produces. */}
            {refusal ? (
              <p className="tm-column-refusal" role="status">
                {t(`tasks.refuse.${refusal}`)}
              </p>
            ) : null}

            {/* The way in, at the top of the column (§3.4). It was a `+` in the
                header; it is a row now, which is where the reference app puts
                it and also where the thing being typed belongs — the column is
                a statement about the work, and typing into the column that
                already says it is the fastest way to make one (MATRIX §19).
                The card still appears BELOW, so what was just typed is not
                what moves (§19.2). */}
            {onCreate && showInputBox && adding !== column.id ? (
              <button
                type="button"
                className="tm-column-add-row"
                aria-label={t("tasks.addToColumn", { column: label(column) })}
                onClick={() => (closeAdd(), setAdding(column.id))}
              >
                <span aria-hidden="true">+</span>
                {t("tasks.addPlaceholder")}
              </button>
            ) : null}

            {/* Not gated on `showInputBox`: the setting chooses WHICH door
                is drawn, and both open this. Gating it here made the header
                `+` a button that did nothing. */}
            {onCreate && adding === column.id ? (
              <form
                className="tm-column-add-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const title = draft.trim();
                  // The same refusal the drop makes: this column IS a date, so
                  // there is nothing to commit until one is given (§6.25).
                  if (!title || (column.requiresDate && !draftDate)) return;
                  onCreate(column.id, title, draftDate);
                  // The date stays and the title clears: filing several tasks
                  // under one day is the common case, and re-answering per row
                  // is a tax (TaskQuickAdd makes the same trade).
                  setDraft("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") closeAdd();
                }}
              >
                <input
                  className="tm-column-add-title"
                  autoFocus
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={t("tasks.addPlaceholder")}
                  aria-label={t("tasks.addToColumn", { column: label(column) })}
                />
                {column.requiresDate ? (
                  <input
                    className="tm-column-add-date"
                    type="date"
                    value={draftDate}
                    onChange={(event) => setDraftDate(event.target.value)}
                    aria-label={t("tasks.addDate")}
                  />
                ) : null}
                <button
                  type="submit"
                  className="tm-column-add-submit"
                  disabled={!draft.trim() || (column.requiresDate && !draftDate)}
                >
                  {t("common.add")}
                </button>
              </form>
            ) : null}

            {pending?.columnId === column.id ? (
              <label className="tm-column-date">
                <span>{t("tasks.needDate")}</span>
                <input
                  type="date"
                  autoFocus
                  onChange={(event) => {
                    if (!event.target.value) return;
                    onDrop(pending.taskId, pending.columnId, pending.index, event.target.value);
                    setPending(null);
                  }}
                />
                <button type="button" onClick={() => setPending(null)}>
                  {t("common.cancel")}
                </button>
              </label>
            ) : null}

            <ul className="tm-column-cards" aria-label={label(column)}>
              {cards.map((task, index) => (
                <li
                  key={task.id}
                  className={`tm-task is-card${task.id === openTaskId ? " is-open" : ""}${dragging === task.id ? " is-dragging" : ""}`}
                  draggable
                  onDragStart={() => startDrag(task.id)}
                  onDragEnd={endDrag}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    // Dropping ON a card means "before this one". Within the
                    // same column that is a reorder, and where the Scope's
                    // sort is derived there is no order to change — so the
                    // card is left where the column's own rule puts it.
                    event.stopPropagation();
                    event.preventDefault();
                    drop(column, canReorder ? index : cards.length);
                  }}
                  onContextMenu={(event) => {
                    if (!onContextMenu) return;
                    event.preventDefault();
                    onContextMenu(task, event.clientX, event.clientY);
                  }}
                >
                  <TaskRowContent task={task} today={today} dateBy={dateBy} showDetails={showDetails} onOpen={onOpen} onToggleDone={onToggleDone} />

                  {/* The non-drag path (§16.30). Same command, no gesture. */}
                  <label className="tm-card-move">
                    <span className="tm-visually-hidden">{t("tasks.moveTo")}</span>
                    <select
                      aria-label={t("tasks.moveToColumn", { title: task.title })}
                      value={columnOf(task)}
                      onChange={(event) => {
                        const target = columns.find((candidate) => candidate.id === event.target.value);
                        if (!target || target.id === columnOf(task)) return;
                        if (target.requiresDate) {
                          setPending({ taskId: task.id, columnId: target.id, index: tasksIn(target.id).length });
                          return;
                        }
                        onDrop(task.id, target.id, tasksIn(target.id).length);
                      }}
                    >
                      {columns.map((candidate) => (
                        <option key={candidate.id || "default"} value={candidate.id}>
                          {label(candidate)}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
            </ul>

            {finishedIn ? (
              <BoardColumnFinished
                tasks={finishedIn(column.id)}
                dateBy={dateBy}
                showDetails={showDetails}
                today={today}
                onOpen={onOpen}
                onToggleDone={onToggleDone}
                openTaskId={openTaskId}
              />
            ) : null}
          </section>
        );
      })}

      {/* Beside the last column rather than inside the ⋯ of one, because it
          belongs to the board and not to any column — and because a control
          that adds a column should be where a new column would appear. */}
      {onAddColumn ? (
        <button type="button" className="tm-board-add-column" onClick={onAddColumn}>
          + {t("tasks.addColumn")}
        </button>
      ) : null}

      {/* The tasks the columns between them do not take.

          Not a column: it is not somewhere work belongs, it is the report that
          some work belongs nowhere. Drawn at all because the alternative is a
          task that is in the account and on no screen — and once a column can
          be edited or deleted, that is one click away. */}
      {unmatched.length > 0 ? (
        <section className="tm-column tm-column-unmatched" aria-label={t("tasks.unmatched", { count: unmatched.length })}>
          <header className="tm-column-head">
            <h3>{t("tasks.unmatched", { count: unmatched.length })}</h3>
          </header>
          {/* Draggable, because dragging is the way OUT. A card here is one no
              column claims, and the columns that would take it light up the
              moment it is picked up — a strip that could only be read would
              leave the task where it is. */}
          <ul className="tm-column-cards">
            {unmatched.map((task) => (
              <li
                key={task.id}
                className={`tm-task is-card${task.id === openTaskId ? " is-open" : ""}${
                  dragging === task.id ? " is-dragging" : ""
                }`}
                draggable
                onDragStart={() => startDrag(task.id)}
                onDragEnd={endDrag}
              >
                <TaskRowContent task={task} today={today} dateBy={dateBy} showDetails={showDetails} onOpen={onOpen} onToggleDone={onToggleDone} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * A column's "완료" group — collapsed to a count, capped, then a link.
 *
 * Below the open cards and never above them: a column is read for what is
 * left to do, and finished work that pushed that down would be answering a
 * question with last week's answers. It is drawn at all because the tick has
 * to land somewhere the eye can find it — a card that vanishes on being
 * checked leaves the reader wondering whether it was the right one.
 *
 * The header is a button because it collapses, and the count is on the header
 * rather than beside the column's name: the number in the column head is how
 * much work is left, and adding finished work to it would make the two
 * numbers on this screen mean different things.
 */
function BoardColumnFinished({
  tasks,
  openTaskId,
  dateBy,
  showDetails,
  today,
  onOpen,
  onToggleDone,
}: {
  tasks: Task[];
  openTaskId: string;
  // Carried down rather than defaulted here: the finished cards are the same
  // rows as the ones above them, and a group that read its dates differently
  // from the column it sits in would be one screen speaking two ways.
  dateBy?: ScopeDateBy;
  showDetails?: boolean;
  today?: string;
  onOpen: (taskId: string) => void;
  onToggleDone: (task: Task) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(COMPLETED_PAGE);

  if (tasks.length === 0) return null;
  const visible = tasks.slice(0, shown);
  const hidden = tasks.length - visible.length;

  return (
    <section className="tm-column-done">
      <button
        type="button"
        className="tm-column-done-head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Caret open={open} />
        <span className="tm-column-done-name">{t("tasks.completed")}</span>
        <span className="tm-column-done-count">{tasks.length}</span>
      </button>

      {open ? (
        <ul className="tm-column-cards" aria-label={t("tasks.completed")}>
          {visible.map((task) => (
            <li key={task.id} className={`tm-task is-card is-done${task.id === openTaskId ? " is-open" : ""}`}>
              <TaskRowContent task={task} today={today} dateBy={dateBy} showDetails={showDetails} onOpen={onOpen} onToggleDone={onToggleDone} />
            </li>
          ))}
          {hidden > 0 ? (
            <li>
              <button
                type="button"
                className="tm-column-done-more"
                onClick={() => setShown((value) => value + COMPLETED_PAGE)}
              >
                {t("tasks.showMore")}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}
