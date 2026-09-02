// The Gantt view (SPACES_REDESIGN_II §50C), scope-free.
//
// Everything the timeline needs that is NOT "which Items" lives here: the
// zoom, the window and its navigation, the split into what the window can
// draw and what has no dates to draw with, and the drag that writes a span
// back. Every scope that offers a Gantt mounts this one component, which is
// the point — a second timeline implementation is exactly what §50C.29 and
// this repository's own rule against parallel renderers forbid. The global
// `TimelinePage` was the other mount until the sidebar stopped offering a
// top-level Timeline; the renderer is unchanged by its going.
//
// Date semantics are NOT decided here. `spanForItem` already owns them
// (G-GANTT-01, §0.3.5): any one date produces a bar, only an Item with none
// stays off the grid, and an inferred start is marked rather than stored. This
// component asks that module and draws the answer.
import { useMemo, useState } from "react";
import type { Project, Task } from "../types";
import type { TaskMutation } from "../domain/tasks/mutations";
import type { Item } from "../domain/view/item";
import type { GroupContext, ViewSpec } from "../domain/view/viewSpec";
import { dateMutation, patchForSpanDrag, patchForTrayDrop, type SpanDrag } from "../domain/view/board";
import { spanForItem, spanIntersects } from "../domain/view/span";
import {
  columnUnitOf,
  shiftWindow,
  timelineWindow,
  ZOOM_COLUMNS,
  type TimelineZoom,
} from "../domain/view/timeline";
import { TimelineView, TRAY_DRAG_MIME } from "./TimelineView";
import { EmptyState } from "./kit";
import { useT } from "../i18n";

const ZOOMS: TimelineZoom[] = ["week", "month", "halfYear", "year"];

interface TaskGanttViewProps {
  /** Already scoped by the caller; this narrows only by date. */
  items: Item[];
  spec: ViewSpec;
  context: GroupContext;
  today: string;
  /** Every task, so a dependency leaving the window can still be reported. */
  tasks: Task[];
  groupLabel: (groupId: string) => string;
  selectedTaskId?: string;
  onOpenItem: (item: Item) => void;
  /**
   * Omit to leave the timeline read-only.
   *
   * A MUTATION, not a patch (§3.4). It used to be `planner.updateTask`
   * straight through, which is why nothing done on this screen could be
   * taken back — the row menu one screen over has said of itself since it
   * was written that everything on it can be.
   */
  onMutateTask?: (task: Task, mutation: TaskMutation) => void;
}

export function TaskGanttView({
  items,
  spec,
  context,
  today,
  tasks,
  groupLabel,
  selectedTaskId = "",
  onOpenItem,
  onMutateTask,
}: TaskGanttViewProps) {
  const { t, lang } = useT();
  // Five weeks: long enough to hold a piece of work end to end, short
  // enough that a column is ~114px and a one-column bar carries its name.
  const [zoom, setZoom] = useState<TimelineZoom>("month");
  const [anchor, setAnchor] = useState<string>(today);
  // Whether a chip is in the air. The lanes only exist while it is (§4):
  // they cover the grid, so leaving them up would put a sheet of drop
  // targets over every bar.
  const [draggingChip, setDraggingChip] = useState(false);
  // D12: shown by default, and one click from gone.
  const [showDone, setShowDone] = useState(true);

  const window = useMemo(() => timelineWindow(zoom, anchor), [zoom, anchor]);
  const visible = useMemo(
    () => (showDone ? items : items.filter((item) => !item.done)),
    [items, showDone],
  );

  // Split once: what the window can draw, and what has no dates to draw with.
  // D4 keeps off-window items out of the grid entirely rather than as blanks.
  const { onWindow, undated } = useMemo(() => {
    const drawn: Item[] = [];
    const tray: Item[] = [];
    for (const item of visible) {
      const span = spanForItem(item);
      if (!span) tray.push(item);
      else if (spanIntersects(span, window.from, window.to)) drawn.push(item);
    }
    return { onWindow: drawn, undated: tray };
  }, [visible, window]);

  const columnLabels = useMemo(
    () => window.edges.slice(0, ZOOM_COLUMNS[zoom]).map((edge) => columnLabel(edge, zoom, lang)),
    [window, zoom, lang],
  );

  const isCurrentWindow = today >= window.from && today <= window.to;

  function handleDrag(item: Item, drag: SpanDrag) {
    if (!onMutateTask) return;
    const task = context.taskById.get(item.sourceId);
    if (!task) return;
    // Null means the drag landed where the bar already was; writing it
    // would touch `updatedAt`, put a no-op row on the wire, and raise a
    // toast offering to undo nothing.
    const mutation = dateMutation(task, patchForSpanDrag(task, drag));
    if (mutation) onMutateTask(task, mutation);
  }

  /** A chip let go over a column (§3.2, §3.3). */
  function handleTrayDrop(sourceId: string, columnIndex: number) {
    // Here and not only in the chip's `onDragEnd`. A successful drop takes the
    // Task out of the panel, so the chip unmounts and its handler goes with it
    // — `dragend` then reaches nothing and the lanes stay up as a sheet over
    // the whole grid [실측]. `onDragEnd` still covers the cancelled drag,
    // where the chip is still there and no drop ever happens.
    setDraggingChip(false);
    if (!onMutateTask) return;
    const task = context.taskById.get(sourceId);
    if (!task) return;
    // The domain already refuses a column off the end and a drop where the
    // Task already is; a null here is one of those.
    const mutation = dateMutation(task, patchForTrayDrop(task, window, columnIndex));
    if (mutation) onMutateTask(task, mutation);
  }

  return (
    <div className="tgv">
      <div className="ff-timeline-bar-controls">
        <div className="ff-timeline-nav">
          <button type="button" className="ff-btn ff-btn-sm" onClick={() => setAnchor(shiftWindow(window, -1))}>
            ‹ {t("timeline.prev")}
          </button>
          {/* The cost of dropping horizontal scrolling: there is no scrollbar
              to say where you are, so the way back has to be one click (D3). */}
          <button
            type="button"
            className="ff-btn ff-btn-sm"
            onClick={() => setAnchor(today)}
            disabled={isCurrentWindow}
          >
            {t("timeline.today")}
          </button>
          <button type="button" className="ff-btn ff-btn-sm" onClick={() => setAnchor(shiftWindow(window, 1))}>
            {t("timeline.next")} ›
          </button>
          <span className="ff-timeline-range">
            {window.from} – {window.to}
          </span>
        </div>
        <label className="ff-board-control">
          <span>{t("timeline.zoom")}</span>
          <select value={zoom} onChange={(event) => setZoom(event.target.value as TimelineZoom)}>
            {ZOOMS.map((option) => (
              <option key={option} value={option}>
                {t(`timeline.zoom.${option}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="ff-timeline-toggle">
          <input type="checkbox" checked={showDone} onChange={(event) => setShowDone(event.target.checked)} />
          <span>{t("timeline.showDone")}</span>
        </label>
      </div>

      {/* §3.1: the panel takes a COLUMN beside the grid rather than lying
          over it, which is what the reference does. It scrolls sideways and
          we deliberately do not (D3) — the `Today` button is the only way
          back precisely because there is no scrollbar — so a column hidden
          under a panel here would be unreachable rather than scrolled past.
          Copying the picture would have cost the days it covers. */}
      <div className="tgv-body">
      {onWindow.length === 0 && undated.length === 0 ? (
        <EmptyState icon="📆" title={t("timeline.empty")} text={t("timeline.emptyHint")} />
      ) : (
        <TimelineView
          items={onWindow}
          spec={spec}
          context={context}
          window={window}
          today={today}
          tasks={tasks}
          groupLabel={groupLabel}
          columnLabels={columnLabels}
          selectedTaskId={selectedTaskId}
          onOpenItem={onOpenItem}
          onDragItem={onMutateTask ? handleDrag : undefined}
          trayDragging={draggingChip}
          onDropTray={onMutateTask ? handleTrayDrop : undefined}
        />
      )}

      {/* T-GV06: an Item with no dates is not given invented ones. It stays
          in the scope and is listed here, where it can be opened and given
          real ones.

          `Arrange tasks` is the reference app's name for this, and it is a
          better one than ours was (`No dates (3)`): the panel is not a
          report of what is missing, it is the pile you work through. The
          count stays, beside the name rather than inside it — §13.6.4's
          rule from the Board's columns, where `Overdue 1` reads as two
          words and a count in its own column did not. */}
      {undated.length > 0 ? (
        <aside className="tgv-arrange" aria-label={t("timeline.arrangeTitle")}>
          <header className="tgv-arrange-head">
            <h3>{t("timeline.arrangeTitle")}</h3>
            <span className="tm-count">{undated.length}</span>
          </header>
          {/* Two ways in, and the hint names the one this timeline has.

              Opening the Task is the KEYBOARD's way and never goes (§3.5) —
              a panel that can only be dragged from is a panel some readers
              cannot use at all — but where the drag exists it is the
              shorter sentence, so it is the one worth spending a line on.
              A read-only timeline gets the other. */}
          <p className="tgv-arrange-hint">
            {t(onMutateTask ? "timeline.arrangeHint" : "timeline.trayHint")}
          </p>
          <ul>
            {undated.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  className="tgv-chip"
                  title={item.title}
                  // Only where a drop could be written. Read-only timelines
                  // keep the chip as a way to OPEN the Task and nothing more.
                  draggable={Boolean(onMutateTask)}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(TRAY_DRAG_MIME, item.sourceId);
                    event.dataTransfer.effectAllowed = "move";
                    setDraggingChip(true);
                  }}
                  // Fires on a cancelled drag too, which is the case that
                  // would otherwise leave the lanes up over the whole grid.
                  onDragEnd={() => setDraggingChip(false)}
                  onClick={() => onOpenItem(item)}
                >
                  {item.title}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
      </div>
    </div>
  );
}

/** Narrow screens get a shorter label, never a shorter window (D11). */
function columnLabel(edge: string, zoom: TimelineZoom, lang: string): string {
  // The UNIT, not the id (§12): `6개월` and `1년` are both months and label the
  // same way, and neither is a year-wide column any more.
  if (columnUnitOf(zoom) === "month") {
    return lang === "ko" ? `${Number(edge.slice(5, 7))}월` : edge.slice(0, 7);
  }
  // Day and week columns are both identified by their first day.
  return `${edge.slice(5, 7)}.${edge.slice(8, 10)}`;
}
