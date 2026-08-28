// The Eisenhower matrix, drawn as a matrix.
//
// This screen used to be the generic board: `groupBy` was a select, it opened
// on the status axis, and the quadrant axis was one of the options — four
// columns side by side. Four columns are not a matrix. The whole point of
// Eisenhower is that the two questions are AXES: important runs down, urgent
// runs across, and a task's box is the answer to both at once. Laid out as a
// row of columns, the reader has to remember which column meant what, and the
// tool stops doing the only thing it exists to do.
//
// So the axis selector is gone and the layout is a 2x2 grid. The status board
// it could also draw is not lost: SpaceDetailView still renders `BoardView`
// for a Project's own statuses, and the Tasks Module has its own Kanban per
// List.
//
// What the quadrant MEANS lives in `utils/eisenhower` and has changed: it is
// the task's PRIORITY, one field, not priority crossed with the due date
// (TICKTICK_MATRIX_DESIGN.md D1). Still derived rather than stored, so
// dragging a card writes the one field the box is read from and the two
// cannot disagree — and, unlike before, a drag can no longer erase a deadline
// on its way past.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence } from "framer-motion";
import type { List, Task, TaskPriority } from "../types";
import {
  MATRIX_QUADRANTS,
  draftForQuadrant,
  patchForQuadrant,
  quadrantOf,
  type MatrixQuadrant,
} from "../utils/eisenhower";
import {
  DEFAULT_MATRIX_VIEW,
  MATRIX_GROUP_AXES,
  MATRIX_SORT_KEYS,
  MATRIX_SORT_ORDERS,
  groupMatrixTasks,
  matrixQuadrantLabels,
  type MatrixGroup,
  type MatrixQuadrantView,
} from "../domain/view/matrixGroups";
import { MatrixQuadrantEditor } from "./MatrixQuadrantEditor";
import { listColorHex } from "../domain/tasks/listColor";
import { ContextMenu, type ContextMenuItem, type ContextMenuState } from "./common/ContextMenu";
import { listIdFor } from "../domain/spaces/membership";
import { LIFECYCLE, isCompleted } from "../domain/tasks/taskState";
import { formatDate, todayValue } from "../utils/date";
import { MotionDropZone } from "./motion/MotionDropZone";
import { MotionTaskRow } from "./motion/MotionTaskRow";
import { useT } from "../i18n";

const ALL_LISTS = "";

/** How much of a "완료" group is drawn before the reader has to ask for more. */
const COMPLETED_PAGE = 5;

interface MatrixPageProps {
  /** Already narrowed to live tasks in live Lists (App.tsx `visibleTasks`). */
  tasks: Task[];
  lists: List[];
  selectedTaskId: string;
  onOpenTask: (id: string) => void;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onCreateTask: (draft: { title: string; listId?: string; priority?: TaskPriority; dueDate?: string; status?: Task["status"] }) => string;
  onToggleDone: (id: string) => void;
  /** How each box is grouped and ordered. Absent boxes read as the default. */
  quadrantViews?: Partial<Record<MatrixQuadrant, MatrixQuadrantView>>;
  onChangeQuadrantView?: (quadrant: MatrixQuadrant, view: MatrixQuadrantView) => void;
}

export function MatrixPage({
  tasks,
  lists,
  selectedTaskId,
  onOpenTask,
  onUpdateTask,
  onCreateTask,
  onToggleDone,
  quadrantViews,
  onChangeQuadrantView,
}: MatrixPageProps) {
  const { t } = useT();
  const today = todayValue();
  const [listId, setListId] = useState<string>(ALL_LISTS);
  const [draggingId, setDraggingId] = useState("");
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [editing, setEditing] = useState<MatrixQuadrant | "">("");

  const pickableLists = useMemo(
    () => lists.filter((list) => !list.archivedAt && !list.deletedAt),
    [lists],
  );

  // A List archived while it was selected would otherwise leave the matrix
  // scoped to something the picker no longer offers — and looking empty for a
  // reason nothing on screen explains.
  const scope = pickableLists.some((list) => list.id === listId) ? listId : ALL_LISTS;

  const byQuadrant = useMemo(() => {
    const groups = new Map<MatrixQuadrant, Task[]>(
      MATRIX_QUADRANTS.map((quadrant) => [quadrant, [] as Task[]]),
    );
    for (const task of tasks) {
      // A subtask is shown inside its parent, never as a card of its own —
      // the same rule the Tasks Module's Scopes follow.
      if (task.parentTaskId) continue;
      // Finished work is NOT held back any more. It keeps the box its priority
      // names (D2) and lands in that box's "완료" group — because a card that
      // vanishes the instant it is ticked takes with it the only evidence of
      // what was just ticked, and the way back is another screen.
      if (scope && listIdFor(task, lists) !== scope) continue;
      groups.get(quadrantOf(task))?.push(task);
    }
    // Not sorted here: the order is per GROUP now, and each box does its own
    // grouping-and-sorting in one pass (`groupMatrixTasks`).
    return groups;
  }, [tasks, lists, scope]);

  /** The box's words: the user's if they wrote any, the built-in ones if not. */
  function labelsFor(quadrant: MatrixQuadrant) {
    return matrixQuadrantLabels(
      quadrantViews?.[quadrant],
      t(`matrix.q${quadrant}`),
      t(`matrix.q${quadrant}Hint`),
    );
  }

  function handleDrop(taskId: string, quadrant: MatrixQuadrant) {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) return;
    const patch = patchForQuadrant(task, quadrant);
    // An empty patch means the drop would change nothing; writing it anyway
    // would touch `updatedAt` and put a no-op row on the wire.
    if (Object.keys(patch).length > 0) onUpdateTask(task.id, patch);
  }

  /**
   * The box's own settings, as a menu.
   *
   * Three rows, each a current answer and a list of the others. "편집" — the
   * reference app's fourth row — is not here: it rewrites what a box MEANS,
   * and a box means one priority (D1), so there is nothing in it to edit until
   * that decision is revisited (TICKTICK_MATRIX_DESIGN.md §13 Phase 5).
   */
  function viewMenuAt(quadrant: MatrixQuadrant, x: number, y: number): ContextMenuState {
    const view = quadrantViews?.[quadrant] ?? DEFAULT_MATRIX_VIEW;
    const set = (patch: Partial<MatrixQuadrantView>) => onChangeQuadrantView?.(quadrant, { ...view, ...patch });

    const choices = <K extends keyof MatrixQuadrantView>(
      field: K,
      values: readonly MatrixQuadrantView[K][],
      labelKey: (value: MatrixQuadrantView[K]) => string,
    ): ContextMenuItem[] =>
      values.map((value) => ({
        id: `${field}-${String(value)}`,
        label: t(labelKey(value)),
        selected: view[field] === value,
        run: () => set({ [field]: value } as Partial<MatrixQuadrantView>),
      }));

    return {
      x,
      y,
      label: t("matrix.menuAria", { quadrant: labelsFor(quadrant).name }),
      sections: [
        {
          id: "view",
          items: [
            {
              // No chevron and no current value — it is not a set of choices,
              // it opens a surface. §8's reading of the reference's own menu,
              // where this is the one row without a "›".
              id: "edit",
              label: t("matrix.menu.edit"),
              run: () => setEditing(quadrant),
            },
            {
              id: "groupBy",
              label: t("matrix.menu.groupBy"),
              value: t(`matrix.axis.${view.groupBy}`),
              submenu: choices("groupBy", MATRIX_GROUP_AXES, (value) => `matrix.axis.${value}`),
              run: () => {},
            },
            {
              id: "sortBy",
              label: t("matrix.menu.sortBy"),
              value: t(`matrix.sort.${view.sortKey}`),
              submenu: choices("sortKey", MATRIX_SORT_KEYS, (value) => `matrix.sort.${value}`),
              run: () => {},
            },
            {
              id: "sortOrder",
              label: t("matrix.menu.sortOrder"),
              value: t(`matrix.order.${view.sortOrder}`),
              submenu: choices("sortOrder", MATRIX_SORT_ORDERS, (value) => `matrix.order.${value}`),
              run: () => {},
            },
          ],
        },
      ],
    };
  }

  function handleAdd(quadrant: MatrixQuadrant, title: string) {
    // Typed into a box, so it is born in that box (`draftForQuadrant`), and
    // into the List currently in scope — otherwise a task typed while reading
    // one List would be filtered straight back out of the screen it was
    // typed on.
    onCreateTask({
      title,
      status: LIFECYCLE.open,
      ...(scope ? { listId: scope } : {}),
      ...draftForQuadrant(quadrant),
    });
  }

  return (
    <div className="ff-page ff-matrix-page">
      <header className="ff-page-head">
        <div>
          <h1 className="ff-page-title">{t("matrix.title")}</h1>
          <p className="ff-page-sub">{t("matrix.subtitle")}</p>
        </div>
        <div className="ff-board-controls">
          <label className="ff-board-control">
            <span>{t("matrix.list")}</span>
            <select value={scope} onChange={(event) => setListId(event.target.value)}>
              <option value={ALL_LISTS}>{t("matrix.allLists")}</option>
              {pickableLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="ff-matrix">
        {/* No axis labels. They named the two questions the box used to be
            derived from, and the box is one field now (D1) — words claiming a
            derivation that no longer happens are worse than no words. Each
            box's own header says which it is. */}
        {MATRIX_QUADRANTS.map((quadrant) => (
          <QuadrantCell
            key={quadrant}
            quadrant={quadrant}
            labels={labelsFor(quadrant)}
            tasks={byQuadrant.get(quadrant) ?? []}
            view={quadrantViews?.[quadrant] ?? DEFAULT_MATRIX_VIEW}
            lists={lists}
            today={today}
            selectedTaskId={selectedTaskId}
            onOpenMenu={(x, y) => setMenu(viewMenuAt(quadrant, x, y))}
            draggingId={draggingId}
            onOpenTask={onOpenTask}
            onToggleDone={onToggleDone}
            onDragStart={setDraggingId}
            onDragEnd={() => setDraggingId("")}
            onDropTask={(taskId) => handleDrop(taskId, quadrant)}
            onAdd={(title) => handleAdd(quadrant, title)}
          />
        ))}
      </div>
      {/* No page-level empty state: four boxes, each with its own "add a task"
          line, already say what an empty matrix means and what to do about
          it. A banner under them would be a second answer to the same
          question. */}
      {menu ? <ContextMenu state={menu} onClose={() => setMenu(null)} /> : null}
      {editing ? (
        <MatrixQuadrantEditor
          defaultName={t(`matrix.q${editing}`)}
          defaultHint={t(`matrix.q${editing}Hint`)}
          view={quadrantViews?.[editing] ?? DEFAULT_MATRIX_VIEW}
          onSave={(view) => onChangeQuadrantView?.(editing, view)}
          onClose={() => setEditing("")}
        />
      ) : null}
    </div>
  );
}

function QuadrantCell({
  quadrant,
  labels,
  tasks,
  view,
  lists,
  today,
  selectedTaskId,
  draggingId,
  onOpenTask,
  onToggleDone,
  onDragStart,
  onDragEnd,
  onDropTask,
  onAdd,
  onOpenMenu,
}: {
  quadrant: MatrixQuadrant;
  labels: { name: string; hint: string };
  tasks: Task[];
  view: MatrixQuadrantView;
  lists: List[];
  today: string;
  selectedTaskId: string;
  draggingId: string;
  onOpenTask: (id: string) => void;
  onToggleDone: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropTask: (id: string) => void;
  onAdd: (title: string) => void;
  onOpenMenu: (x: number, y: number) => void;
}) {
  const { t } = useT();
  const [over, setOver] = useState(false);
  const [adding, setAdding] = useState(false);
  const groups = useMemo(() => groupMatrixTasks(tasks, today, view), [tasks, today, view]);
  // Phase 4 hung the checkbox border and the quick-add outline on `--q-color`
  // (§19.3), so overriding the one variable moves all three together.
  const chosen = listColorHex(view.color);

  return (
    <MotionDropZone
      as="section"
      isOver={over}
      className={`ff-matrix-cell ff-matrix-cell-${quadrant}`}
      style={chosen ? ({ "--q-color": chosen } as CSSProperties) : undefined}
      animateTransform={false}
      onDragOver={(event) => {
        // Only a task drag is a drop here. Anything else keeps the browser's
        // default so the cursor says "no".
        if (!event.dataTransfer.types.includes("text/task")) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const id = event.dataTransfer.getData("text/task");
        if (id) onDropTask(id);
      }}
    >
      <header className="ff-matrix-cell-head">
        <span className="ff-matrix-roman" aria-hidden>
          {quadrant}
        </span>
        <div className="ff-matrix-cell-titles">
          <strong className="ff-matrix-cell-title">{labels.name}</strong>
          <span className="ff-matrix-cell-hint">{labels.hint}</span>
        </div>
        {/* No count on the box. Each group inside carries its own, which is
            the number that answers something — "기한 초과 3" is a fact about
            the day, and "17" over a box is a number to divide up by eye. */}
        {/* Adding from the HEADER, next to the box's other control, rather
            than from a line under the cards. The box is a judgement — "this is
            important and urgent" — and the fastest way to make one is to type
            into the box that already says it, with no follow-up edit. */}
        <button
          type="button"
          className="ff-matrix-cell-add"
          aria-label={t("matrix.addAria", { quadrant: labels.name })}
          aria-expanded={adding}
          onClick={() => setAdding((value) => !value)}
        >
          +
        </button>
        <button
          type="button"
          className="ff-matrix-cell-menu"
          aria-label={t("matrix.menuAria", { quadrant: labels.name })}
          aria-haspopup="menu"
          onClick={(event) => {
            // Anchored to the BUTTON rather than to the pointer, so the menu
            // opens in the same place however it was triggered — including
            // from a keyboard, where there is no pointer to anchor to.
            const box = event.currentTarget.getBoundingClientRect();
            onOpenMenu(box.left, box.bottom);
          }}
        >
          ⋯
        </button>
      </header>

      <div className="ff-matrix-cell-body">
        {/* At the TOP, under the `+` that opened it — the input belongs beside
            the control, not at the far end of a box that scrolls. Where the
            card LANDS is a separate question the box's own grouping answers,
            and for a task with no date yet that is the last group, not here. */}
        {adding ? (
          <QuadrantQuickAdd onSubmit={onAdd} onClose={() => setAdding(false)} />
        ) : null}
        {groups.map((group) => (
          <MatrixGroupSection
            key={group.id}
            group={group}
            lists={lists}
            today={today}
            selectedTaskId={selectedTaskId}
            draggingId={draggingId}
            onOpenTask={onOpenTask}
            onToggleDone={onToggleDone}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </MotionDropZone>
  );
}

/**
 * The box's own input.
 *
 * It stays open after a save. Classifying is a batch job — a box is what a
 * head is emptied into — and closing after each task would make four tasks
 * four trips to the `+`. It closes on Escape, and on losing focus while
 * empty: an input holding nothing is not worth the row it sits on.
 */
function QuadrantQuickAdd({
  onSubmit,
  onClose,
}: {
  onSubmit: (title: string) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Opened by a click on `+`, so the caret has to arrive without a second one.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <form
      className="ff-matrix-quick-add"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = title.trim();
        if (!trimmed) return;
        onSubmit(trimmed);
        setTitle("");
        inputRef.current?.focus();
      }}
    >
      <input
        ref={inputRef}
        value={title}
        placeholder={t("matrix.addPlaceholder")}
        aria-label={t("matrix.addPlaceholder")}
        onChange={(event) => setTitle(event.target.value)}
        // Typed-in text is not thrown away by a stray click elsewhere; only
        // an empty field closes itself.
        onBlur={() => {
          if (!title.trim()) onClose();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      />
      <button type="submit" disabled={!title.trim()}>
        {t("common.add")}
      </button>
    </form>
  );
}

/**
 * One collapsible group inside a box: "기한 초과 3", and the cards under it.
 *
 * The cap is on "완료" alone. Every other group is work still to be done and
 * hiding any of it would be hiding the answer; finished work is the opposite —
 * it accumulates forever, and a box whose bottom half is last month's
 * successes has stopped being useful. Five, then a link.
 */
function MatrixGroupSection({
  group,
  lists,
  today,
  selectedTaskId,
  draggingId,
  onOpenTask,
  onToggleDone,
  onDragStart,
  onDragEnd,
}: {
  group: MatrixGroup;
  lists: List[];
  today: string;
  selectedTaskId: string;
  draggingId: string;
  onOpenTask: (id: string) => void;
  onToggleDone: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  const [shown, setShown] = useState(COMPLETED_PAGE);

  const capped = group.id === "completed";
  const visible = capped ? group.tasks.slice(0, shown) : group.tasks;
  const hidden = group.tasks.length - visible.length;

  return (
    <section className={`ff-matrix-group is-${group.id}`}>
      {/* Grouping turned off leaves one group holding everything unfinished,
          and it gets no header: a heading that says "all of it" over the whole
          box is a line spent saying nothing. "완료" keeps its own, because that
          one is still a division. */}
      {group.id === "all" ? null : (
        <button
          type="button"
          className="ff-matrix-group-head"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="ff-matrix-group-caret" aria-hidden>
            {open ? "⌄" : "›"}
          </span>
          <span className="ff-matrix-group-name">{t(`matrix.group.${group.id}`)}</span>
          <span className="ff-matrix-group-count">{group.tasks.length}</span>
        </button>
      )}

      {open ? (
        <div className="ff-matrix-group-body">
          {/* One presence per GROUP, not per box. A card that is ticked leaves
              this group and arrives in "완료", which is an unmount and a mount
              rather than a reorder — the enter animation is what carries it. */}
          <AnimatePresence initial={false}>
            {visible.map((task) => (
              <MatrixCard
                key={task.id}
                task={task}
                lists={lists}
                today={today}
                selected={task.id === selectedTaskId}
                isDragging={task.id === draggingId}
                onOpen={() => onOpenTask(task.id)}
                onToggleDone={() => onToggleDone(task.id)}
                onDragStart={() => onDragStart(task.id)}
                onDragEnd={onDragEnd}
              />
            ))}
          </AnimatePresence>
          {hidden > 0 ? (
            <button
              type="button"
              className="ff-matrix-group-more"
              onClick={() => setShown((value) => value + COMPLETED_PAGE)}
            >
              {t("matrix.showMore")}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * One task, as the box draws it.
 *
 * Everything on the right of the title is what the card cannot say by sitting
 * where it sits: which List it came from, whether it repeats, whether there is
 * more of it behind the title, and when it is due. The one thing NOT here is
 * the priority — the box already is it (D1), so a flag on every card would
 * repeat the header once per row.
 */
function MatrixCard({
  task,
  lists,
  today,
  selected,
  isDragging,
  onOpen,
  onToggleDone,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  lists: List[];
  today: string;
  selected: boolean;
  isDragging: boolean;
  onOpen: () => void;
  onToggleDone: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const { t, lang } = useT();
  const list = lists.find((candidate) => candidate.id === listIdFor(task, lists));
  const done = isCompleted(task);
  // The date itself, not a word for where it falls. "기한 지남" on every card
  // under a header that already says "기한 초과" is the same fact twice, and
  // the half it replaced — WHICH day — is the half the reader cannot get
  // anywhere else on this screen. Written the way the reader's language writes
  // a date ("8월 20일", "Aug 20") rather than as "08.20", which is a date only
  // once you have worked out which half is the month.
  const dateLabel = task.dueDate ? formatDate(task.dueDate, lang) : "";
  // Not on finished work. "Overdue" is a thing to go and do, and a card that
  // has been ticked has had it done — a red date under a strike-through is an
  // alarm about a job that is already over. The reference goes further and
  // drops the date from a completed row entirely (§2.4); this keeps it,
  // because WHICH day is the one fact the row is read for afterwards.
  const overdue = !done && Boolean(task.dueDate) && task.dueDate < today;
  const repeats = task.repeatType !== undefined && task.repeatType !== "none";
  // Either body counts: `contentMode` decides which one a Task is using, and a
  // card only reports that there IS more behind the title.
  const hasBody = Boolean(task.notes?.trim() || task.description?.trim());

  return (
    <MotionTaskRow
      taskId={task.id}
      isDragging={isDragging}
      className={`ff-matrix-card${selected ? " is-selected" : ""}`}
      draggable
      onNativeDragStart={(event) => {
        // "text/task" is the app's task drag: the calendar already listens for
        // it, so a card can be dragged from here onto a day to schedule it.
        event.dataTransfer.setData("text/task", task.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onNativeDragEnd={onDragEnd}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
      }}
    >
      {/* Ticked cards were drawing an EMPTY circle: the row was struck through
          and dimmed while the control that did it still looked untouched, so
          the one thing on the card that could be acted on said the opposite of
          the rest. The box's colour rides on it — `--q-color` comes from the
          cell — which is the priority, but as the box's colour rather than as
          a claim only a colour makes: the header next to it says the same
          thing in words. */}
      <button
        type="button"
        className={`ff-check${done ? " checked" : ""}`}
        aria-label={t(done ? "tasks.reopenTask" : "tasks.completeTask", { title: task.title })}
        onClick={(event) => {
          event.stopPropagation();
          onToggleDone();
        }}
      >
        {done ? "✓" : ""}
      </button>
      <div className="ff-matrix-card-main">
        <span className="ff-matrix-card-title">{task.title}</span>
        {/* Wraps under the title only when the row runs out of width — a
            quadrant is half a page, and a long title must not push the date
            off the end of it. */}
        <span className="ff-matrix-card-meta">
          {list ? <span className="ff-matrix-card-list">{list.name}</span> : null}
          {repeats ? (
            <span className="ff-matrix-card-icon" role="img" aria-label={t("matrix.card.repeats")} title={t("matrix.card.repeats")}>
              <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                <path d="M4.5 12A7.5 7.5 0 0 1 17.3 6.7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                <path d="M17.3 3.2v3.5h-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                <path d="M6.7 20.8v-3.5h3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          ) : null}
          {hasBody ? (
            <span className="ff-matrix-card-icon" role="img" aria-label={t("matrix.card.hasNotes")} title={t("matrix.card.hasNotes")}>
              <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                <path d="M5 4.5h9L19 9v10.5H5z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
                <path d="M8.5 12.5h7M8.5 16h4.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
            </span>
          ) : null}
          {dateLabel ? (
            <span className={`ff-matrix-card-due${overdue ? " is-overdue" : ""}`}>{dateLabel}</span>
          ) : null}
        </span>
      </div>
    </MotionTaskRow>
  );
}
