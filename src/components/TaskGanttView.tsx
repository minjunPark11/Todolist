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
import { useMemo, useState, type ReactNode } from "react";
import type { FocusSession, Project, Task } from "../types";
import { completeTask, reopenTask, type TaskMutation } from "../domain/tasks/mutations";
import { isCompleted } from "../domain/tasks/taskState";
import type { Item } from "../domain/view/item";
import type { GroupContext, ViewSpec } from "../domain/view/viewSpec";
import { dateMutation, patchForSpanDrag, patchForTrayDrop, type SpanDrag } from "../domain/view/board";
import { spanForItem, spanIntersects } from "../domain/view/span";
import {
  columnUnitOf,
  rulerBands,
  shiftWindow,
  timelineWindow,
  ZOOM_COLUMNS,
  type RulerBand,
  type TimelineZoom,
} from "../domain/view/timeline";
import { TimelineView, TRAY_DRAG_MIME, type TimelineBand } from "./TimelineView";
import { EmptyState, MoreMenu } from "./kit";
import { Caret } from "./common/Caret";
import type { Rect } from "../domain/floating";
import { useT } from "../i18n";

const ZOOMS: TimelineZoom[] = ["day", "week", "month", "halfYear", "year"];

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
  /** The bar's rect rides along so the Detail can open beside it (§2). */
  onOpenItem: (item: Item, anchor?: Rect) => void;
  /** Passed straight through — the timeline paints, the caller knows Lists. */
  barColorOf?: (item: Item) => string;
  /**
   * Omit to leave the timeline read-only.
   *
   * A MUTATION, not a patch (§3.4). It used to be `planner.updateTask`
   * straight through, which is why nothing done on this screen could be
   * taken back — the row menu one screen over has said of itself since it
   * was written that everything on it can be.
   */
  onMutateTask?: (task: Task, mutation: TaskMutation) => void;
  /**
   * The Scope's name and count, for the head's left-hand utility row (§2.2).
   *
   * Passed in rather than built here: the Scope owns its own title, and this
   * component has been scope-free by construction since §50C.29. On desktop
   * the page header is folded away and this is the only place the name
   * appears; below 960 the header comes back and CSS hides this instead.
   */
  workspaceTitle?: ReactNode;
  /**
   * Every focus session, for the trace inside the bars (§7.1).
   *
   * Straight through, like `barColorOf`: the timeline paints, and which
   * sessions exist is the app's question rather than this component's.
   */
  focusSessions?: FocusSession[];
  timezone?: string;
  /** The quick-add, for the first row's place (§9.7). */
  createRow?: ReactNode;
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
  barColorOf,
  onMutateTask,
  workspaceTitle,
  focusSessions,
  timezone,
  createRow,
}: TaskGanttViewProps) {
  const { t, lang } = useT();
  // Five weeks: long enough to hold a piece of work end to end, short
  // enough that a column is ~114px and a one-column bar carries its name.
  //
  // It was briefly a WEEK, on the argument that a day is 12.97px here [실측]
  // and the standard record in this app is one day long — a bar taller than it
  // is wide, which reads as a tick and not as time occupied. The marker (D8)
  // is the answer to that: a day with no width is drawn as a point rather than
  // as a rectangle that failed to be one.
  //
  // And a week default would have cost more than it bought. `alignToZoom`
  // starts a day-cut window ON its anchor, so a week window is today and the
  // six days after it — no past at all, which puts every overdue task off the
  // default screen. A month window starts on its anchor's SUNDAY, so the days
  // just gone are on it. That is the property worth keeping; a week window
  // that showed the past would have to become the calendar week containing
  // today, which is a change to a domain rule with its own decision behind it
  // (`timelineWindow`, "starts a day-cut window on the date itself").
  const [zoom, setZoom] = useState<TimelineZoom>("month");
  const [anchor, setAnchor] = useState<string>(today);
  // Whether a chip is in the air. The lanes only exist while it is (§4):
  // they cover the grid, so leaving them up would put a sheet of drop
  // targets over every bar.
  const [draggingChip, setDraggingChip] = useState(false);
  // D12: shown by default, and one click from gone.
  const [showDone, setShowDone] = useState(true);
  /**
   * The reference's `마일스톤 표시` (§4.5, §12.5).
   *
   * On by default, and it is the switch worth watching: the reference has four
   * milestones among twelve tasks, while GANTT §14 records that the standard
   * record in THIS app is one day long — so turning this off may empty most of
   * the grid rather than tidying it. Shipped on, and re-read once there is
   * real data behind it.
   */
  const [showMilestones, setShowMilestones] = useState(true);
  /**
   * Whether the unscheduled tray is out (§4.3).
   *
   * Shut by default, which is the change from the column it replaces: that
   * one was on screen whenever anything was waiting in it, and on this app's
   * data something usually is. The count on the toggle says so without
   * spending 288px on saying it.
   */
  const [trayOpen, setTrayOpen] = useState(false);
  /**
   * Pressed `오늘`, so put today back on screen (§17).
   *
   * Counted rather than flagged: the window may already be the one today is
   * in — the button is no longer disabled then — and a boolean set to `true`
   * twice is one change React would not see. Every press is a new number.
   */
  const [recenterKey, setRecenterKey] = useState(0);

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

  /**
   * The ruler's upper tier, named here (§7.2).
   *
   * Beside `columnLabels` and for the same reason: `rulerBands` answers which
   * periods the columns fall into and how wide each is, and this file is where
   * the app knows that a month is `9월` in one language and `2026-09` in the
   * other.
   */
  const bands = useMemo<TimelineBand[]>(
    () =>
      rulerBands(window).map((band) => ({
        label: bandLabel(band, lang),
        columns: band.columns,
        hours: band.hours,
      })),
    [window, lang],
  );

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

  /**
   * The box in the task column (§2.3).
   *
   * `completeTask`/`reopenTask` rather than a patch, for the same reason
   * `onMutateTask` is a mutation at all (§3.4): everything done on this screen
   * has to be undoable by the route the rest of the app uses, and those two
   * carry the `completedAt` that §12.12 found stored twice.
   */
  function handleToggleDone(item: Item) {
    if (!onMutateTask) return;
    const task = context.taskById.get(item.sourceId);
    if (!task) return;
    const now = new Date().toISOString();
    onMutateTask(task, isCompleted(task) ? reopenTask(task) : completeTask(task, now));
  }

  /**
   * `일정 제거` from the row's menu (§9.8).
   *
   * A date change like every other one here, so it goes through `dateMutation`
   * and is taken back the same way. The Task does not leave the Scope — it
   * leaves the GRID, and lands in the tray, which is where something with no
   * dates belongs (T-GV06).
   */
  function handleClearDates(item: Item) {
    if (!onMutateTask) return;
    const task = context.taskById.get(item.sourceId);
    if (!task) return;
    // Only what is actually set: `dateMutation` refuses an empty patch, and a
    // Task holding one of the two fields must not have the other written as
    // `""` where it was already absent.
    const patch: Partial<Task> = {};
    if (task.startDate) patch.startDate = "";
    if (task.dueDate) patch.dueDate = "";
    const mutation = dateMutation(task, patch);
    if (!mutation) return;
    onMutateTask(task, mutation);
    // The Task has just left the grid; the tray is where it went. Opening it
    // is what makes that visible rather than leaving the row to vanish
    // (§9.8), and it is the same move `submitNewTask` makes in the reference.
    setTrayOpen(true);
  }

  /** A chip let go over a column (§3.2, §3.3). */
  function handleTrayDrop(sourceId: string, date: string) {
    // Here and not only in the chip's `onDragEnd`. A successful drop takes the
    // Task out of the panel, so the chip unmounts and its handler goes with it
    // — `dragend` then reaches nothing and the lanes stay up as a sheet over
    // the whole grid [실측]. `onDragEnd` still covers the cancelled drag,
    // where the chip is still there and no drop ever happens.
    setDraggingChip(false);
    if (!onMutateTask) return;
    const task = context.taskById.get(sourceId);
    if (!task) return;
    // The domain already refuses an empty date and a drop where the Task
    // already is; a null here is one of those.
    const mutation = dateMutation(task, patchForTrayDrop(task, date));
    if (mutation) onMutateTask(task, mutation);
  }

  /**
   * The 42px utility row, which lives in the timeline's own head now
   * (TIMELINE_REFERENCE_PARITY_DESIGN.md §2.2).
   *
   * It was a wrapped flex row of its own above the grid: two `ff-btn`s and a
   * `Today`, a `<select>` with a `Zoom` label beside it, and a checkbox
   * spelling out `Show completed`. Three different control languages in one
   * line, none of them the reference's.
   *
   * The reference puts one row inside the head — paging on the left, the
   * scale and what the grid SHOWS on the right — and makes every one of them
   * quiet: no borders, no fills, a tint on hover. The window's date range went
   * with the row; the ruler under it says the same thing and says it in the
   * place the reader is already looking.
   */
  const controls = (
    <>
      {/* Previous / Today / Next. Three independent quiet buttons rather than
          a bordered capsule — V15's last word on this control, and the reason
          is that a capsule reads as one thing with three parts while these are
          three separate moves. */}
      <div className="ff-timeline-nav" role="group" aria-label={t("timeline.navigate")}>
        <button
          type="button"
          className="ff-timeline-step"
          aria-label={t("timeline.prev")}
          title={t("timeline.prev")}
          onClick={() => setAnchor(shiftWindow(window, -1))}
        >
          <Chevron direction="left" />
        </button>
        {/* Two things at once since §17, and never disabled.
            It sets the window back to the one today is in — which is what it
            always did — and asks the grid to scroll to the moment, which is
            new and is why `isCurrentWindow` no longer switches it off: a
            `6개월` track is about two and a half screens wide, so "today is
            in this window" and "today is on this screen" stopped being the
            same sentence the moment the track outgrew the fold. */}
        <button
          type="button"
          className="ff-timeline-step is-today"
          onClick={() => {
            setAnchor(today);
            setRecenterKey((key) => key + 1);
          }}
        >
          {t("timeline.today")}
        </button>
        <button
          type="button"
          className="ff-timeline-step"
          aria-label={t("timeline.next")}
          title={t("timeline.next")}
          onClick={() => setAnchor(shiftWindow(window, 1))}
        >
          <Chevron direction="right" />
        </button>
      </div>

      <div className="ff-timeline-control-spacer" />

      {/* The scale, saying its own value. A `<select>` said `Zoom` beside a
          box; this says `1주`, which is the fact the reader wants back from
          it. `options` and not `choices` — a zoom is words, not shapes. */}
      <MoreMenu
        label={t("timeline.zoom")}
        triggerClassName="ff-timeline-control"
        icon={
          <>
            <span>{t(`timeline.zoom.${zoom}`)}</span>
            <Caret open={false} />
          </>
        }
        items={[
          {
            heading: t("timeline.zoom"),
            options: ZOOMS.map((option) => ({
              id: option,
              label: t(`timeline.zoom.${option}`),
              selected: option === zoom,
              onClick: () => setZoom(option),
            })),
          },
        ]}
      />

      {/* What the grid SHOWS. Two independent switches, so two
          `menuitemcheckbox` rows rather than one closed choice (§9.4). */}
      <MoreMenu
        label={t("timeline.display")}
        triggerClassName="ff-timeline-control"
        icon={
          <>
            <span>{t("timeline.display")}</span>
            <Caret open={false} />
          </>
        }
        items={[
          {
            label: t("timeline.showDone"),
            checked: showDone,
            onClick: () => setShowDone((on) => !on),
          },
          {
            label: t("timeline.showMilestones"),
            checked: showMilestones,
            onClick: () => setShowMilestones((on) => !on),
          },
        ]}
      />
    </>
  );

  /**
   * The tray's own affordance, in the task column's utility row (§2.2).
   *
   * Beside the Scope's name rather than out with the view controls: what is
   * waiting in it is TASKS, and the left-hand column is where this screen
   * keeps tasks.
   */
  const trayToggle =
    undated.length > 0 ? (
      <button
        type="button"
        className="ff-timeline-tray-toggle"
        aria-expanded={trayOpen}
        onClick={() => setTrayOpen((open) => !open)}
      >
        <span>{t("timeline.arrangeTitle")}</span>
        <strong>{undated.length}</strong>
        <Caret open={trayOpen} />
      </button>
    ) : null;

  return (
    /* The tray PUSHES the grid rather than covering it
       (TIMELINE_REFERENCE_PARITY_DESIGN.md §4.3).

       It was a column standing beside the grid at all times. §3.1 chose that
       over the reference's overlay, and the reason it gave was "a panel over
       the grid hides days that are on screen" — which the reference's own
       tray does not do: `margin-right` moves the card out from under it.
       So §3.1's objection is answered rather than overruled, and what is
       gained is the column back when nothing is waiting in it. */
    <div className={`tgv${trayOpen && undated.length > 0 ? " is-tray-open" : ""}`}>
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
          bands={bands}
          selectedTaskId={selectedTaskId}
          onOpenItem={onOpenItem}
          barColorOf={barColorOf}
          onDragItem={onMutateTask ? handleDrag : undefined}
          onToggleDone={onMutateTask ? handleToggleDone : undefined}
          onClearDates={onMutateTask ? handleClearDates : undefined}
          trayDragging={draggingChip}
          onDropTray={onMutateTask ? handleTrayDrop : undefined}
          recenterKey={recenterKey}
          controls={controls}
          workspaceTitle={workspaceTitle}
          trayToggle={trayToggle}
          showMilestones={showMilestones}
          focusSessions={focusSessions}
          timezone={timezone}
          createRow={createRow}
        />
      )}

      </div>

      {/* T-GV06: an Item with no dates is not given invented ones. It stays
          in the scope and is listed here, where it can be opened and given
          real ones.

          `Arrange tasks` is the reference app's name for this, and it is a
          better one than ours was (`No dates (3)`): the panel is not a
          report of what is missing, it is the pile you work through.

          Outside `.tgv-body` now: it is positioned against `.tgv`, which is
          what lets the card slide out from under it rather than be squeezed. */}
      {undated.length > 0 ? (
        <aside
          className={`ff-timeline-tray${trayOpen ? " is-open" : ""}`}
          aria-label={t("timeline.arrangeTitle")}
          aria-hidden={trayOpen ? undefined : true}
        >
          <header className="ff-timeline-tray-head">
            <h3>{t("timeline.arrangeTitle")}</h3>
            <span className="tm-count">{undated.length}</span>
            <button
              type="button"
              className="ff-timeline-tray-close ff-icon-btn"
              aria-label={t("timeline.closeTray")}
              onClick={() => setTrayOpen(false)}
            >
              ✕
            </button>
          </header>
          {/* Two ways in, and the hint names the one this timeline has.

              Opening the Task is the KEYBOARD's way and never goes (§3.5) —
              a panel that can only be dragged from is a panel some readers
              cannot use at all — but where the drag exists it is the
              shorter sentence, so it is the one worth spending a line on.
              A read-only timeline gets the other. */}
          <p className="ff-timeline-tray-hint">
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
                  // would otherwise leave the drop area up over the whole grid.
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
  );
}

/**
 * The paging arrows (§2.2).
 *
 * Drawn rather than typed. `‹` and `›` are punctuation from the text font —
 * a different weight and optical size from the app's icons — and the
 * reference's arrows are 14px strokes on the same 24 grid as everything else
 * in the rail and the menus.
 */
function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d={direction === "left" ? "M14 6l-6 6 6 6" : "M10 6l6 6-6 6"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * What the ruler's upper tier says (§7.2).
 *
 * One step coarser than `columnLabel`, and written in the same two forms: the
 * Korean side names the period (`9월`), the English side writes the ISO prefix
 * (`2026-09`) — which is what `columnLabel` already does for a month column,
 * so the two tiers of one ruler stay one notation.
 */
function bandLabel(band: RulerBand, lang: string): string {
  if (band.unit === "year") {
    const year = band.start.slice(0, 4);
    return lang === "ko" ? `${year}년` : year;
  }
  if (band.unit === "month") {
    return lang === "ko" ? `${Number(band.start.slice(5, 7))}월` : band.start.slice(0, 7);
  }
  // A day window: all 24 columns share one date, so the band is the date the
  // hour labels below it have no room to repeat.
  return lang === "ko"
    ? `${Number(band.start.slice(5, 7))}월 ${Number(band.start.slice(8, 10))}일`
    : band.start;
}

/** The same names the calendar's month grid uses, so a `일` is a `일`. */
const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Narrow screens get a shorter label, never a shorter window (D11). */
function columnLabel(edge: string, zoom: TimelineZoom, lang: string): string {
  // The UNIT, not the id (§12): `6개월` and `1년` are both months and label the
  // same way, and neither is a year-wide column any more.
  const unit = columnUnitOf(zoom);
  // The hour alone, where a column is an hour (§15). `HH:mm` needs about 34px
  // and an hour column is 21 [실측] — the minutes are always `00` on a
  // boundary anyway, so they were four characters of nothing that pushed the
  // hour out of its own label.
  if (unit === "hour") return edge.slice(11, 13);
  if (unit === "month") {
    return lang === "ko" ? `${Number(edge.slice(5, 7))}월` : edge.slice(0, 7);
  }
  // Day and week columns are both identified by their first day. Unpadded,
  // like the dates inside the bars (TIMELINE_V2_DESIGN.md §4) — `08.30` and
  // `8.31 – 9.3` on one screen are two ways of writing one thing.
  const date = `${Number(edge.slice(5, 7))}.${Number(edge.slice(8, 10))}`;
  // I7: only a DAY column has a weekday. A week column covers seven of them
  // and a month column thirty, so naming one would be naming the first and
  // implying the rest — and it is the week zoom where the reader is deciding
  // between a Tuesday and a Saturday in the first place.
  if (unit !== "day") return date;
  const weekday = new Date(`${edge.slice(0, 10)}T00:00:00`).getDay();
  return `${date} (${(lang === "ko" ? WEEKDAYS_KO : WEEKDAYS_EN)[weekday]})`;
}
