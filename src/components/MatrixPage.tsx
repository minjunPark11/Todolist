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
import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { List, Task, TaskPriority } from "../types";
import {
  MATRIX_QUADRANTS,
  draftForQuadrant,
  patchForQuadrant,
  quadrantOf,
  type MatrixQuadrant,
} from "../utils/eisenhower";
import { groupMatrixTasks, type MatrixGroup } from "../domain/view/matrixGroups";
import { listIdFor } from "../domain/spaces/membership";
import { LIFECYCLE } from "../domain/tasks/taskState";
import { listColorHex } from "../domain/tasks/listColor";
import { todayValue } from "../utils/date";
import { ExpandableAdd } from "./motion/ExpandableAdd";
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
}

export function MatrixPage({
  tasks,
  lists,
  selectedTaskId,
  onOpenTask,
  onUpdateTask,
  onCreateTask,
  onToggleDone,
}: MatrixPageProps) {
  const { t } = useT();
  const today = todayValue();
  const [listId, setListId] = useState<string>(ALL_LISTS);
  const [draggingId, setDraggingId] = useState("");

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

  function handleDrop(taskId: string, quadrant: MatrixQuadrant) {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) return;
    const patch = patchForQuadrant(task, quadrant);
    // An empty patch means the drop would change nothing; writing it anyway
    // would touch `updatedAt` and put a no-op row on the wire.
    if (Object.keys(patch).length > 0) onUpdateTask(task.id, patch);
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
            tasks={byQuadrant.get(quadrant) ?? []}
            lists={lists}
            today={today}
            selectedTaskId={selectedTaskId}
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
    </div>
  );
}

/**
 * Card order inside a box: the nearest deadline first, undated last, ties
 * broken by priority.
 *
 * Undated work sinks rather than sorting as an empty string, which would
 * float it above everything dated — inside Q2, where most work has no date at
 * all, that reads as random.
 */
const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2, none: 3 };

function compareCards(a: Task, b: Task): number {
  const dueA = a.dueDate || "9999-12-31";
  const dueB = b.dueDate || "9999-12-31";
  if (dueA !== dueB) return dueA < dueB ? -1 : 1;
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}

function QuadrantCell({
  quadrant,
  tasks,
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
}: {
  quadrant: MatrixQuadrant;
  tasks: Task[];
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
}) {
  const { t } = useT();
  const [over, setOver] = useState(false);
  const groups = useMemo(() => groupMatrixTasks(tasks, today, compareCards), [tasks, today]);

  return (
    <MotionDropZone
      as="section"
      isOver={over}
      className={`ff-matrix-cell ff-matrix-cell-${quadrant}`}
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
          <strong className="ff-matrix-cell-title">{t(`matrix.q${quadrant}`)}</strong>
          <span className="ff-matrix-cell-hint">{t(`matrix.q${quadrant}Hint`)}</span>
        </div>
        {/* No count on the box. Each group inside carries its own, which is
            the number that answers something — "기한 초과 3" is a fact about
            the day, and "17" over a box is a number to divide up by eye. */}
      </header>

      <div className="ff-matrix-cell-body">
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

      {/* Adding here is the fastest way to classify: the box IS the two
          judgements, so a task typed into it needs no follow-up edit. */}
      <ExpandableAdd
        className="ff-matrix-add"
        label={t("matrix.add")}
        placeholder={t("matrix.addPlaceholder")}
        submitLabel={t("common.add")}
        keepOpenAfterSubmit
        onSubmit={onAdd}
      />
    </MotionDropZone>
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
  const { t } = useT();
  const list = lists.find((candidate) => candidate.id === listIdFor(task, lists));
  // The date itself, not a word for where it falls. "기한 지남" on every card
  // under a header that already says "기한 초과" is the same fact twice, and
  // the half it replaced — WHICH day — is the half the reader cannot get
  // anywhere else on this screen.
  const dateLabel = task.dueDate ? task.dueDate.slice(5).replace("-", ".") : "";

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
      <button
        type="button"
        className="ff-check"
        aria-label={t("kit.markDone")}
        onClick={(event) => {
          event.stopPropagation();
          onToggleDone();
        }}
      />
      <div className="ff-matrix-card-main">
        <span className="ff-matrix-card-title">{task.title}</span>
        <div className="ff-matrix-card-meta">
          {list ? (
            <span className="ff-projbadge">
              <span className="ff-dot" style={{ background: listColorHex(list.color) || "var(--tm-tag-dot)" }} />
              {list.name}
            </span>
          ) : null}
          {dateLabel ? (
            <span className={`ff-board-chip${task.dueDate && task.dueDate < today ? " is-warn" : ""}`}>
              {dateLabel}
            </span>
          ) : null}
        </div>
      </div>
    </MotionTaskRow>
  );
}
