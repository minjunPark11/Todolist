// A board, driven by a ViewSpec rather than by an axis of its own.
//
// It knows nothing about statuses or quadrants: it is handed the columns to
// draw and the axis they came from, groups the items with `applyView`, and
// asks `patchForColumn` what a drop means. That is what makes the same
// component able to render "group by status" and "group by quadrant" — the
// second being the Planning matrix laid out as four columns.
//
// Columns are drawn in the order given, empty or not. An empty column is
// information ("nothing is in review"); a missing one reads as a lost column.
import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { Project } from "../types";
import type { Item } from "../domain/view/item";
import { applyView, type GroupContext, type ViewSpec } from "../domain/view/viewSpec";
import { isDroppableAxis } from "../domain/view/board";
import { MotionDropZone } from "./motion/MotionDropZone";
import { MotionTaskRow } from "./motion/MotionTaskRow";
import { useT } from "../i18n";

export interface BoardColumn {
  id: string;
  label: string;
  /** Drawn as the column's dot. Absent for axes with no colour of their own. */
  color?: string;
}

interface BoardViewProps {
  items: Item[];
  spec: ViewSpec;
  context: GroupContext;
  columns: BoardColumn[];
  projects: Project[];
  today: string;
  selectedTaskId?: string;
  /** Label for items whose group is not among the columns. */
  otherLabel: string;
  onOpenItem: (item: Item) => void;
  onDropItem: (item: Item, columnId: string) => void;
}

export function BoardView({
  items,
  spec,
  context,
  columns,
  projects,
  today,
  selectedTaskId = "",
  otherLabel,
  onOpenItem,
  onDropItem,
}: BoardViewProps) {
  const [draggingKey, setDraggingKey] = useState("");
  const itemByKey = useMemo(() => new Map(items.map((item) => [item.key, item])), [items]);

  const { byColumn, orphans } = useMemo(() => {
    const groups = applyView(items, spec, context);
    const known = new Set(columns.map((column) => column.id));
    const map = new Map<string, Item[]>();
    const rest: Item[] = [];
    for (const group of groups) {
      if (known.has(group.id)) map.set(group.id, group.items);
      // Never silently dropped: a card that vanished is worse than a card in
      // the wrong place, and the caller names this column.
      else rest.push(...group.items);
    }
    return { byColumn: map, orphans: rest };
  }, [items, spec, context, columns]);

  const droppable = isDroppableAxis(spec.groupBy);

  const rendered: BoardColumn[] =
    orphans.length > 0 ? [...columns, { id: "", label: otherLabel }] : columns;

  return (
    <div className="ff-board">
      {rendered.map((column) => (
        <BoardColumnCell
          key={column.id || "ff-board-other"}
          column={column}
          items={column.id ? (byColumn.get(column.id) ?? []) : orphans}
          projects={projects}
          today={today}
          selectedTaskId={selectedTaskId}
          draggingKey={draggingKey}
          // The catch-all is a symptom, not a destination.
          droppable={droppable && Boolean(column.id)}
          onOpenItem={onOpenItem}
          onDragStart={setDraggingKey}
          onDragEnd={() => setDraggingKey("")}
          onDropKey={(key) => {
            const item = itemByKey.get(key);
            if (item) onDropItem(item, column.id);
          }}
        />
      ))}
    </div>
  );
}

function BoardColumnCell({
  column,
  items,
  projects,
  today,
  selectedTaskId,
  draggingKey,
  droppable,
  onOpenItem,
  onDragStart,
  onDragEnd,
  onDropKey,
}: {
  column: BoardColumn;
  items: Item[];
  projects: Project[];
  today: string;
  selectedTaskId: string;
  draggingKey: string;
  droppable: boolean;
  onOpenItem: (item: Item) => void;
  onDragStart: (key: string) => void;
  onDragEnd: () => void;
  onDropKey: (key: string) => void;
}) {
  const [over, setOver] = useState(false);

  return (
    <MotionDropZone
      as="section"
      isOver={over}
      className={`ff-board-col${over ? " is-over" : ""}`}
      onDragOver={
        droppable
          ? (event) => {
              event.preventDefault();
              setOver(true);
            }
          : undefined
      }
      onDragLeave={droppable ? () => setOver(false) : undefined}
      onDrop={
        droppable
          ? (event) => {
              event.preventDefault();
              setOver(false);
              const key = event.dataTransfer.getData("text/item");
              if (key) onDropKey(key);
            }
          : undefined
      }
    >
      <header className="ff-board-col-head">
        <strong>
          {column.color ? <span className="ff-dot" style={{ background: column.color }} /> : null}
          {column.label}
        </strong>
        <span className="ff-board-count">{items.length}</span>
      </header>
      <div className="ff-board-col-body">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <BoardCard
              key={item.key}
              item={item}
              projects={projects}
              today={today}
              selected={item.source === "task" && item.sourceId === selectedTaskId}
              isDragging={item.key === draggingKey}
              onOpen={() => onOpenItem(item)}
              onDragStart={() => onDragStart(item.key)}
              onDragEnd={onDragEnd}
            />
          ))}
        </AnimatePresence>
      </div>
    </MotionDropZone>
  );
}

function BoardCard({
  item,
  projects,
  today,
  selected,
  isDragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  item: Item;
  projects: Project[];
  today: string;
  selected: boolean;
  isDragging: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const { t } = useT();
  const project = projects.find((candidate) => candidate.id === item.spaceId);
  // Same reading as the Planning card: the deadline speaks first, the planned
  // day answers when there is no deadline.
  const date = item.dueDate;
  const dateLabel = !date
    ? ""
    : item.dueDate && item.dueDate < today
      ? t("eis.overdue")
      : date === today
        ? t("eis.today")
        : date.slice(5).replace("-", ".");

  return (
    <MotionTaskRow
      taskId={item.sourceId}
      isDragging={isDragging}
      className={`ff-board-card${selected ? " is-selected" : ""}${item.done ? " is-done" : ""}`}
      draggable
      onNativeDragStart={(event) => {
        event.dataTransfer.setData("text/item", item.key);
        // Kept so a card dragged out of the board still lands on the calendar
        // and the matrix, which both listen for "text/task".
        if (item.source === "task") event.dataTransfer.setData("text/task", item.sourceId);
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
      <div className="ff-board-card-top">
        <span className="ff-board-card-title">{item.title}</span>
        {item.blocked ? <span className="ff-board-chip is-warn">{t("board.blocked")}</span> : null}
      </div>
      <div className="ff-board-card-meta">
        {project ? (
          <span className="ff-projbadge">
            <span className="ff-dot" style={{ background: project.color }} />
            {project.name}
          </span>
        ) : null}
        {dateLabel ? <span className="ff-board-chip">{dateLabel}</span> : null}
        {item.source !== "task" ? (
          <span className="ff-board-chip">{t(`board.source.${item.source}`)}</span>
        ) : null}
      </div>
    </MotionTaskRow>
  );
}
