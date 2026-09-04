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
import { useMemo, useRef, useState, type CSSProperties } from "react";
import type { Project, Task } from "../types";
import { timelineLinks, type TimelineBadge } from "../domain/view/connectors";
import { TimelineConnectors } from "./TimelineConnectors";
import type { Item } from "../domain/view/item";
import { applyView, type GroupContext, type ViewSpec } from "../domain/view/viewSpec";
import { spanForItem } from "../domain/view/span";
import {
  barText,
  barTextShort,
  columnOf,
  columnUnitOf,
  dateAtColumnOffset,
  instantAtColumnOffset,
  type Instant,
  placeBar,
  todayColumn,
  windowFraction,
  ZOOM_COLUMNS,
  type TimelineWindow,
} from "../domain/view/timeline";
import type { SpanDrag } from "../domain/view/board";
import { useT } from "../i18n";
import type { Rect } from "../domain/floating";
import { tintForDarkInk } from "../domain/calendar/readableInk";

/** The floating layer's shape, from whatever was clicked. */
function rectOf(element: Element | null): Rect | undefined {
  if (!element) return undefined;
  const box = element.getBoundingClientRect();
  return { x: box.left, y: box.top, width: box.width, height: box.height };
}
/** Two instants apart, in minutes. Midnight stands in for "no clock". */
function minutesBetween(from: Instant, to: Instant): number {
  const at = (i: Instant) => new Date(`${i.date}T${i.time || "00:00"}:00`).getTime();
  return Math.round((at(to) - at(from)) / 60000);
}

/**
 * What the pointer picked up. Column-level drops rather than pixel dragging:
 * a column IS the unit the window is drawn in, so the drop is unambiguous and
 * the same interaction works at every zoom. The cost is no live preview while
 * dragging, which P2 accepts.
 */
type DragKind = "move" | "start" | "end";
const DRAG_MIME = "text/timeline";
/**
 * A chip from `Arrange tasks`, as distinct from a bar
 * (TIMELINE_ARRANGE_TASKS_DESIGN.md §4, phase 3).
 *
 * Its own MIME rather than a value inside `DRAG_MIME`, so the two kinds of
 * drag cannot be confused by a drop target that only understands one of
 * them: a bar's cells read `DRAG_MIME` and find nothing on a chip drag,
 * and the lanes read this one and find nothing on a bar drag. The payload
 * is the Item's `sourceId`.
 */
export const TRAY_DRAG_MIME = "text/timeline-tray";

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
  /**
   * Opens the Task, and says where from
   * (TIMELINE_V2_DESIGN.md §2).
   *
   * The rect is the bar's or the label's, and it is what turns the Detail
   * into a popover beside what was clicked instead of a column taken off the
   * right. On a timeline that column is not free: D3/D11 fixed the number of
   * date columns and refused horizontal scrolling, so every pixel the Detail
   * takes is a narrower day.
   */
  onOpenItem: (item: Item, anchor?: Rect) => void;
  /**
   * What colour this row belongs to — its List's
   * (TIMELINE_V2_DESIGN.md §1, §5).
   *
   * A function rather than a field on `Item`: `Item` is the projection every
   * view shares, and which colour to paint a bar is this view's question, not
   * the projection's. The caller has the Lists; this file does not want them.
   *
   * Absent leaves every bar on the accent, which is what the whole screen did
   * before — `--bar-color` was read by the stylesheet and set by nobody.
   */
  barColorOf?: (item: Item) => string;
  /** Absent makes the timeline read-only, which is what P1 shipped. */
  onDragItem?: (item: Item, drag: SpanDrag) => void;
  /**
   * A chip is being dragged right now, so the date lanes are live (§4).
   *
   * They are drawn ONLY then. A lane spans the full height of the grid and
   * would otherwise sit over every bar, swallowing the clicks and the
   * drags that belong to them.
   */
  trayDragging?: boolean;
  /** Given the Item's id and the day the pointer was over (§13). */
  onDropTray?: (sourceId: string, date: string) => void;
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
  barColorOf,
  onDragItem,
  trayDragging = false,
  onDropTray,
}: TimelineViewProps) {
  const { t } = useT();
  const columns = ZOOM_COLUMNS[window.zoom];
  /**
   * Which column carries today's marks — none, at the hour zoom.
   *
   * `columnOf` compares dates, and the 24 columns of a day window all share
   * one: today lands in column 0 and the band and the pill go on `00:00`,
   * whatever the time is. Marking midnight as "today" on a window that IS
   * today says nothing and points at the wrong hour; the line (§6) is what
   * carries the moment on that zoom, and it is placed from a clock.
   */
  const nowColumn = columnUnitOf(window.zoom) === "hour" ? null : todayColumn(window, today);
  /**
   * Where the line goes (§6, I3).
   *
   * Read at render rather than kept on a timer: this is a planning grid, not a
   * clock, and the nearest thing it draws is a bar a day wide. A ticking
   * interval would re-render every row of the timeline to move a line by a
   * pixel an hour.
   */
  const nowAt = windowFraction(window, Date.now());
  const [dragKey, setDragKey] = useState("");
  // Which lane the pointer is over, so the reader can see the day before
  // letting go. A drop with no aim is a date chosen by accident.
  const [overLane, setOverLane] = useState<number | null>(null);
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

  /**
   * The day a chip was let go over (§13).
   *
   * A lane IS one column, so the ratio is measured against the lane itself
   * rather than the whole track. Same reading as the row's gestures: the day
   * under the pointer, not the first day of the column it fell in.
   */
  function dateInLane(event: { clientX: number; currentTarget: Element }, index: number): string {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width <= 0) return "";
    const across = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 0.999999);
    // The DATE only: a chip carries no schedule yet, and §3.2 has it declaring
    // one day rather than an hour of one.
    return dateAtColumnOffset(window, index, across);
  }

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
      {/* The one thing this design had to build: a drop target that belongs
          to a COLUMN and not to a row. Every existing target is a cell in
          some Item's own row, and a chip has no row — what it needs to say
          is a DATE. */}
      {onDropTray && trayDragging ? (
        <div className="ff-timeline-lanes">
          {Array.from({ length: columns }, (_, index) => (
            <div
              key={index}
              className={`ff-timeline-lane${overLane === index ? " is-over" : ""}`}
              onDragOver={(event) => {
                // Without this the browser refuses the drop and the chip
                // springs back with no explanation.
                event.preventDefault();
                setOverLane(index);
              }}
              onDragLeave={() => setOverLane((current) => (current === index ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                setOverLane(null);
                const sourceId = event.dataTransfer.getData(TRAY_DRAG_MIME);
                // The same reading every other gesture uses: the day under the
                // pointer, not the first day of the column it fell in (§13).
                if (sourceId) onDropTray(sourceId, dateInLane(event, index));
              }}
            />
          ))}
        </div>
      ) : null}

      {/* §6, the third of the three: the heading's pill says which column is
          today and the column's band says it again, but only a line crossing
          the grid answers the question this screen is for — whether a bar has
          been passed. It is `aria-hidden` and takes no pointer: everything it
          says, the bars' own dates say to a reader who cannot see it. */}
      {nowAt === null ? null : (
        <div className="ff-timeline-now" aria-hidden="true">
          <span className="ff-timeline-now-line" style={{ left: `${nowAt * 100}%` }} />
        </div>
      )}

      <header className="ff-timeline-head">
        <div className="ff-timeline-rowhead" />
        <div className="ff-timeline-columns">
          {columnLabels.map((label, index) => (
            <span
              key={`${label}-${index}`}
              className={`ff-timeline-col${nowColumn === index + 1 ? " is-today" : ""}`}
            >
              {/* The label in its own box, because §6's pill is drawn around
                  the DATE and the cell is a whole column wide. */}
              <span className="ff-timeline-col-mark">{label}</span>
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
              onOpen={(anchor) => onOpenItem(item, anchor)}
              barColor={barColorOf?.(item) ?? ""}
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
  barColor,
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
  onOpen: (anchor?: Rect) => void;
  barColor: string;
  draggable: boolean;
  badges: TimelineBadge["kind"][];
  isDragging: boolean;
  onDragStateChange: (active: boolean) => void;
  onDrag: (drag: SpanDrag) => void;
}) {
  const { t } = useT();
  /**
   * The day the pointer was over when this drag began (§13).
   *
   * A move is the distance the POINTER travelled, so the grab has to be
   * remembered — otherwise a bar taken hold of in its middle would jump
   * backwards by however far along that was.
   */
  const grabbedOn = useRef<Instant>({ date: "", time: "" });
  const trackRef = useRef<HTMLDivElement>(null);
  const span = spanForItem(item);
  const placement = span ? placeBar(span, window) : null;
  // D4: an item the window does not reach is not drawn at all. The caller
  // filters, so reaching here means the two disagreed — drop the row rather
  // than paint an empty one that reads as "this has no dates".
  if (!placement || !span) return null;

  /**
   * The day under the pointer, from anywhere on this row's track (§13).
   *
   * Every gesture on the row goes through this, so all three land on the day
   * that was aimed at. Before, each read the column a different way: a chip
   * took its first day, a resize-end took its last, and a move took neither —
   * so the same target gave three answers and only one matched the label
   * written on it [실측].
   */
  function instantUnderPointer(event: { clientX: number }, track: Element | null): Instant {
    if (!track) return { date: "", time: "" };
    const box = track.getBoundingClientRect();
    if (box.width <= 0) return { date: "", time: "" };
    // Clamped just inside, so the far edge is the last column and not one past
    // the end of the window.
    const across = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 0.999999);
    const columnFloat = across * columns;
    const index = Math.floor(columnFloat);
    return instantAtColumnOffset(window, index, columnFloat - index);
  }

  function handleDropAt(at: Instant, kind: DragKind) {
    if (!at.date) return;
    if (kind === "start") {
      onDrag({ kind: "resizeStart", date: at.date, time: at.time });
      return;
    }
    if (kind === "end") {
      onDrag({ kind: "resizeEnd", date: at.date, time: at.time });
      return;
    }
    // Minutes, measured from where the pointer picked the bar up — NOT from
    // where the bar starts. A reader grabs a bar in the middle as often as at
    // its edge, and moving it "to" an instant would jump it by however far
    // along they happened to take hold of it.
    if (!grabbedOn.current.date) return;
    onDrag({ kind: "move", minutes: minutesBetween(grabbedOn.current, at) });
  }

  return (
    <div
      className={`ff-timeline-row${selected ? " is-selected" : ""}`}
      /* One declaration for the whole row: the dot beside the name and the bar
         out on the track are the same List saying so twice.

         Two values because the row paints the colour two ways (§5, I2-C). The
         bar is a PALE tint under dark text — one bar to a row, so it does not
         have to shout the way a calendar block stacked among others does — and
         the dot and the inferred bar's dashed outline are the colour at full
         strength, because an 8px dot at 90% lightness is not a colour, it is a
         smudge. */
      style={
        barColor
          ? ({ ["--bar-color"]: barColor, ["--bar-tint"]: tintForDarkInk(barColor) } as CSSProperties)
          : undefined
      }
    >
      <button
        type="button"
        className={`ff-timeline-label${indented ? " is-child" : ""}`}
        onClick={(event) => onOpen(rectOf(event.currentTarget))}
        title={item.title}
      >
        {indented ? <span className="ff-timeline-child-mark" aria-hidden="true">↳</span> : null}
        {/* I6: which List, before the name — the Tasks sidebar marks a List
            with the same dot, so the two screens agree on what a colour is. */}
        {barColor ? <span className="ff-timeline-dot" aria-hidden="true" /> : null}
        <span className="ff-timeline-label-text">{item.title}</span>
      </button>

      <div className="ff-timeline-track" ref={trackRef}>
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
                    if (kind) handleDropAt(instantUnderPointer(event, trackRef.current), kind);
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
            // §14: a fraction of the track, so the bar is as long as its dates
            // are. `minWidth` keeps a one-day task from vanishing at the coarse
            // zooms, where a day can be three pixels.
            left: `${placement.left * 100}%`,
            width: `${placement.width * 100}%`,
            minWidth: "6px",
          }}
          // How TimelineConnectors finds this bar to measure it.
          data-bar-key={item.key}
          // The name first: a bar too narrow for its text (§11) has nothing
          // else to say what it is, and the dates alone do not name it.
          title={`${item.title} · ${span.start} → ${span.end}`}
          draggable={draggable}
          onDragStart={(event) => {
            event.dataTransfer.setData(DRAG_MIME, "move");
            grabbedOn.current = instantUnderPointer(event, trackRef.current);
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

          <button
            type="button"
            className="ff-timeline-bar-text"
            /* The name, which the bar stopped saying out loud (§4). Sighted
               readers have it one column to the left; a screen reader walking
               the bars would otherwise hear four dates and no work. */
            aria-label={`${item.title} · ${barText(span, window.zoom, t("calendar.allDay"))}`}
            /* The BAR's rect, not the text's: the text is an inset label and a
               popover hung off it would sit inside the bar it belongs to. */
            onClick={(event) => onOpen(rectOf(event.currentTarget.closest(".ff-timeline-bar")))}
          >
            {item.done ? "✓ " : ""}
            {/* WHEN, not what (§4 — I1-B). The name is in the label column on
                every row, so a title here was the same word twice, and it was
                the copy that broke first: under 80px the text is dropped and
                what the reader loses is the name. The dates are the fact only
                this side of the row holds.

                Both forms are rendered and the container query shows one of
                them (12-timeline.css). Which one to draw is a question about
                the BAR's width in pixels, and this component knows the bar as
                a fraction of a track it never measures — CSS is where that
                number exists. */}
            <span className="ff-timeline-bar-long">
              {barText(span, window.zoom, t("calendar.allDay"))}
            </span>
            <span className="ff-timeline-bar-short" aria-hidden="true">
              {barTextShort(span, window.zoom, t("calendar.allDay"))}
            </span>
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
