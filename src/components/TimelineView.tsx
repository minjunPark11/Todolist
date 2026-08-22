// The timeline grid (GANTT_TIMELINE_DESIGN P1) — read-only.
//
// Rows come from `applyView`, exactly as the board's columns do; only the
// placement differs. Every row is flat (D9): `parentId` buys an indented
// label and nothing else, so nothing here rolls a parent's dates up from its
// children or moves them together.
//
// There is no horizontal scrolling and no virtualisation, because the window
// is a fixed column count and `placeBar` returns grid lines. The whole layout
// is one CSS Grid per row.
import { useMemo, useRef, useState } from "react";
import type { Project, Task } from "../types";
import { timelineLinks, type TimelineBadge } from "../domain/view/connectors";
import { TimelineConnectors } from "./TimelineConnectors";
import type { Item } from "../domain/view/item";
import { applyView, type GroupContext, type ViewSpec } from "../domain/view/viewSpec";
import { spanForItem } from "../domain/view/span";
import {
  columnEndDate,
  columnOf,
  columnStartDate,
  placeBar,
  todayColumn,
  ZOOM_COLUMNS,
  type TimelineWindow,
} from "../domain/view/timeline";
import type { SpanDrag } from "../domain/view/board";
import { useT } from "../i18n";

/**
 * What the pointer picked up. Column-level drops rather than pixel dragging:
 * a column IS the unit the window is drawn in, so the drop is unambiguous and
 * the same interaction works at every zoom. The cost is no live preview while
 * dragging, which P2 accepts.
 */
type DragKind = "move" | "start" | "end";
const DRAG_MIME = "text/timeline";

export interface TimelineRow {
  item: Item;
  /** Indented one step when the parent is also on screen (D9). */
  indented: boolean;
}

interface TimelineViewProps {
  items: Item[];
  spec: ViewSpec;
  context: GroupContext;
  window: TimelineWindow;
  today: string;
  /** Every task, so a dependency leaving the window can still be reported. */
  tasks: Task[];
  /** Resolves a group id to its heading; "" is the ungrouped catch-all. */
  groupLabel: (groupId: string) => string;
  /** Column headings, already abbreviated for the viewport (D11). */
  columnLabels: string[];
  selectedTaskId?: string;
  onOpenItem: (item: Item) => void;
  /** Absent makes the timeline read-only, which is what P1 shipped. */
  onDragItem?: (item: Item, drag: SpanDrag) => void;
}

export function TimelineView({
  items,
  spec,
  context,
  window,
  today,
  tasks,
  groupLabel,
  columnLabels,
  selectedTaskId = "",
  onOpenItem,
  onDragItem,
}: TimelineViewProps) {
  const { t } = useT();
  const columns = ZOOM_COLUMNS[window.zoom];
  const nowColumn = todayColumn(window, today);
  const [dragKey, setDragKey] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => applyView(items, spec, context), [items, spec, context]);

  // Only bars the window actually drew can be joined by a line; the rest turn
  // into badges on the bar that stayed (D7).
  const { links, badges } = useMemo(() => timelineLinks(items, tasks), [items, tasks]);
  const badgeByKey = useMemo(() => {
    const map = new Map<string, TimelineBadge["kind"][]>();
    for (const badge of badges) {
      map.set(badge.itemKey, [...(map.get(badge.itemKey) ?? []), badge.kind]);
    }
    return map;
  }, [badges]);

  // A child is only indented when its parent is on screen too — indenting
  // under something invisible is whitespace that means nothing (D9).
  const visibleIds = useMemo(
    () => new Set(groups.flatMap((group) => group.items.map((item) => item.sourceId))),
    [groups],
  );

  const gridStyle = { "--timeline-columns": String(columns) } as React.CSSProperties;

  return (
    <div className="ff-timeline" style={gridStyle} ref={gridRef}>
      <TimelineConnectors
        links={links}
        // Anything that can move a bar: the data, the window, and the grouping
        // that decides which row a bar sits in.
        revision={`${items.length}:${window.anchor}:${window.zoom}:${spec.groupBy}`}
        containerRef={gridRef}
      />
      <header className="ff-timeline-head">
        <div className="ff-timeline-rowhead" />
        <div className="ff-timeline-columns">
          {columnLabels.map((label, index) => (
            <span
              key={`${label}-${index}`}
              className={`ff-timeline-col${nowColumn === index + 1 ? " is-today" : ""}`}
            >
              {label}
            </span>
          ))}
        </div>
      </header>

      {groups.map((group) => (
        <section key={group.id || "ungrouped"} className="ff-timeline-group">
          {spec.groupBy !== "none" ? (
            <h3 className="ff-timeline-group-head">{groupLabel(group.id)}</h3>
          ) : null}
          {group.items.map((item) => (
            <TimelineRowView
              key={item.key}
              item={item}
              indented={Boolean(item.parentId) && visibleIds.has(item.parentId)}
              window={window}
              columns={columns}
              nowColumn={nowColumn}
              selected={item.source === "task" && item.sourceId === selectedTaskId}
              onOpen={() => onOpenItem(item)}
              // Only tasks carry the date fields a drag writes; a goal's
              // schedule is edited where it lives.
              draggable={Boolean(onDragItem) && item.source === "task"}
              badges={badgeByKey.get(item.key) ?? []}
              isDragging={dragKey === item.key}
              onDragStateChange={(active) => setDragKey(active ? item.key : "")}
              onDrag={(drag) => onDragItem?.(item, drag)}
            />
          ))}
        </section>
      ))}

      {groups.length === 0 ? <p className="ff-timeline-empty">{t("timeline.noBars")}</p> : null}
    </div>
  );
}

function TimelineRowView({
  item,
  indented,
  window,
  columns,
  nowColumn,
  selected,
  onOpen,
  draggable,
  badges,
  isDragging,
  onDragStateChange,
  onDrag,
}: {
  item: Item;
  indented: boolean;
  window: TimelineWindow;
  columns: number;
  nowColumn: number | null;
  selected: boolean;
  onOpen: () => void;
  draggable: boolean;
  badges: TimelineBadge["kind"][];
  isDragging: boolean;
  onDragStateChange: (active: boolean) => void;
  onDrag: (drag: SpanDrag) => void;
}) {
  const { t } = useT();
  const span = spanForItem(item);
  const placement = span ? placeBar(span, window) : null;
  // D4: an item the window does not reach is not drawn at all. The caller
  // filters, so reaching here means the two disagreed — drop the row rather
  // than paint an empty one that reads as "this has no dates".
  if (!placement || !span) return null;

  function handleDropOnColumn(index: number, kind: DragKind) {
    if (kind === "start") {
      onDrag({ kind: "resizeStart", date: columnStartDate(window, index) });
      return;
    }
    if (kind === "end") {
      // Through the END of the column: dropping on a month means "to the end
      // of that month", not "to the 1st".
      onDrag({ kind: "resizeEnd", date: columnEndDate(window, index) });
      return;
    }
    // Move is a column delta measured from where the bar currently starts, so
    // it works the same whether that start was stored or derived.
    const from = placement!.clippedStart ? 0 : columnOf(span!.start, window);
    onDrag({ kind: "move", zoom: window.zoom, steps: index - from });
  }

  return (
    <div className={`ff-timeline-row${selected ? " is-selected" : ""}`}>
      <button
        type="button"
        className={`ff-timeline-label${indented ? " is-child" : ""}`}
        onClick={onOpen}
        title={item.title}
      >
        {indented ? <span className="ff-timeline-child-mark" aria-hidden="true">↳</span> : null}
        <span className="ff-timeline-label-text">{item.title}</span>
      </button>

      <div className="ff-timeline-track">
        {/* Column rules first, so a bar always paints over them. */}
        {Array.from({ length: columns }, (_, index) => (
          <span
            key={index}
            className={`ff-timeline-cell${nowColumn === index + 1 ? " is-today" : ""}`}
            style={{ gridColumn: index + 1 }}
            onDragOver={draggable ? (event) => event.preventDefault() : undefined}
            onDrop={
              draggable
                ? (event) => {
                    event.preventDefault();
                    const kind = event.dataTransfer.getData(DRAG_MIME) as DragKind;
                    if (kind) handleDropOnColumn(index, kind);
                  }
                : undefined
            }
          />
        ))}

        <div
          className={[
            "ff-timeline-bar",
            // The start was derived, not declared: draw it as a guess (D5).
            span.inferredStart ? "is-inferred" : "",
            item.done ? "is-done" : "",
            item.blocked ? "is-blocked" : "",
            placement.clippedStart ? "is-clipped-start" : "",
            placement.clippedEnd ? "is-clipped-end" : "",
            isDragging ? "is-dragging" : "",
            draggable ? "is-draggable" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{
            gridColumn: `${placement.columnStart} / ${placement.columnEnd}`,
          }}
          // How TimelineConnectors finds this bar to measure it.
          data-bar-key={item.key}
          title={`${span.start} → ${span.end}`}
          draggable={draggable}
          onDragStart={(event) => {
            event.dataTransfer.setData(DRAG_MIME, "move");
            onDragStateChange(true);
          }}
          onDragEnd={() => onDragStateChange(false)}
        >
          {/* Handles are separate drag sources so the same drop target can
              tell "move the bar" from "move this edge". Hidden on a clipped
              edge: that end is off-window, so there is nothing to grab. */}
          {draggable && !placement.clippedStart ? (
            <span
              className="ff-timeline-handle is-start"
              draggable
              role="separator"
              aria-label={`${item.title} — ${span.start}`}
              onDragStart={(event) => {
                event.stopPropagation();
                event.dataTransfer.setData(DRAG_MIME, "start");
                onDragStateChange(true);
              }}
              onDragEnd={() => onDragStateChange(false)}
            />
          ) : null}

          {placement.clippedStart ? <span className="ff-timeline-clip" aria-hidden="true">◀</span> : null}

          {/* A link whose other end left the window becomes a badge here: an
              arrow off the edge cannot say where it goes (D7). */}
          {badges.includes("blocker") ? (
            <span className="ff-timeline-badge is-blocker" title={t("timeline.blockerOffWindow")}>
              ⇤
            </span>
          ) : null}

          <button type="button" className="ff-timeline-bar-text" onClick={onOpen}>
            {item.done ? "✓ " : ""}
            {item.title}
          </button>

          {badges.includes("dependent") ? (
            <span className="ff-timeline-badge is-dependent" title={t("timeline.dependentOffWindow")}>
              ⇥
            </span>
          ) : null}

          {placement.clippedEnd ? <span className="ff-timeline-clip" aria-hidden="true">▶</span> : null}

          {draggable && !placement.clippedEnd ? (
            <span
              className="ff-timeline-handle is-end"
              draggable
              role="separator"
              aria-label={`${item.title} — ${span.end}`}
              onDragStart={(event) => {
                event.stopPropagation();
                event.dataTransfer.setData(DRAG_MIME, "end");
                onDragStateChange(true);
              }}
              onDragEnd={() => onDragStateChange(false)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
