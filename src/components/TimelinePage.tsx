// The timeline page (GANTT_TIMELINE_DESIGN P1, read-only).
//
// Shares the board's vocabulary on purpose: same scope selector, same
// grouping axis, same `Item[]`. Only `layout` differs — this is the engine's
// "timeline", not a second engine.
import { useMemo, useState } from "react";
import type { LearningPath, List, Project, Task } from "../types";
import { projectItems, type Item } from "../domain/view/item";
import { patchForSpanDrag, type SpanDrag } from "../domain/view/board";
import { groupRank, type GroupAxis, type GroupContext, type ViewSpec } from "../domain/view/viewSpec";
import { spanForItem, spanIntersects } from "../domain/view/span";
import { shiftWindow, timelineWindow, ZOOM_COLUMNS, type TimelineZoom } from "../domain/view/timeline";
import { todayValue } from "../utils/date";
import { TimelineView } from "./TimelineView";
import { EmptyState } from "./kit";
import { useT } from "../i18n";

const ALL_SPACES = "";
const ZOOMS: TimelineZoom[] = ["day", "week", "month", "year"];
// Space and List are the axes a timeline reads as rows; status would put a
// bar's colour and its row in disagreement.
const AXES: GroupAxis[] = ["space", "list", "none"];

interface TimelinePageProps {
  tasks: Task[];
  projects: Project[];
  lists: List[];
  learningPaths: LearningPath[];
  selectedTaskId: string;
  onOpenTask: (id: string) => void;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
}

export function TimelinePage({
  tasks,
  projects,
  lists,
  learningPaths,
  selectedTaskId,
  onOpenTask,
  onUpdateTask,
}: TimelinePageProps) {
  const { t, lang } = useT();
  const today = todayValue();
  const [zoom, setZoom] = useState<TimelineZoom>("week");
  const [anchor, setAnchor] = useState<string>(today);
  const [spaceId, setSpaceId] = useState<string>(ALL_SPACES);
  const [axis, setAxis] = useState<GroupAxis>("space");
  // D12: shown by default, and one click from gone.
  const [showDone, setShowDone] = useState(true);

  const activeSpaces = useMemo(
    () => projects.filter((project) => project.status !== "archived" && !project.archivedAt),
    [projects],
  );
  const scope = activeSpaces.some((space) => space.id === spaceId) ? spaceId : ALL_SPACES;
  const window = useMemo(() => timelineWindow(zoom, anchor), [zoom, anchor]);

  const allItems = useMemo(
    () =>
      projectItems({ tasks, paths: learningPaths, projects, lists, today }).filter(
        (item) => item.statusId !== "archived" && (showDone || !item.done),
      ),
    [tasks, learningPaths, projects, lists, today, showDone],
  );

  const scoped = useMemo(
    () => (scope ? allItems.filter((item) => item.spaceId === scope) : allItems),
    [allItems, scope],
  );

  // Split once: what the window can draw, and what has no dates to draw with.
  // D4 keeps off-window items out of the grid entirely rather than as blanks.
  const { onWindow, undated } = useMemo(() => {
    const drawn: Item[] = [];
    const tray: Item[] = [];
    for (const item of scoped) {
      const span = spanForItem(item);
      if (!span) tray.push(item);
      else if (spanIntersects(span, window.from, window.to)) drawn.push(item);
    }
    return { onWindow: drawn, undated: tray };
  }, [scoped, window]);

  const context: GroupContext = useMemo(
    () => ({
      today,
      taskById: new Map(tasks.map((task) => [task.id, task])),
      // D10: the board and the timeline must order Spaces identically.
      groupRank: groupRank(axis, { projects: activeSpaces, lists }),
    }),
    [today, tasks, axis, activeSpaces, lists],
  );

  const spec: ViewSpec = useMemo(
    () => ({
      id: `timeline-${axis}-${scope || "all"}`,
      name: t("timeline.title"),
      filter: {},
      groupBy: axis,
      sort: { key: "scheduledDate" },
      layout: "timeline",
    }),
    [axis, scope, t],
  );

  const columnLabels = useMemo(
    () => window.edges.slice(0, ZOOM_COLUMNS[zoom]).map((edge) => columnLabel(edge, zoom, lang)),
    [window, zoom, lang],
  );

  function groupLabel(groupId: string): string {
    if (!groupId) return t("timeline.ungrouped");
    if (axis === "space") return projects.find((p) => p.id === groupId)?.name ?? t("timeline.ungrouped");
    if (axis === "list") return lists.find((l) => l.id === groupId)?.name ?? t("timeline.ungrouped");
    return groupId;
  }

  const isCurrentWindow = today >= window.from && today <= window.to;

  function handleDrag(item: Item, drag: SpanDrag) {
    const task = context.taskById.get(item.sourceId);
    if (!task) return;
    const patch = patchForSpanDrag(task, drag);
    // An empty patch means the drag landed where the bar already was; writing
    // it would touch `updatedAt` and put a no-op row on the wire.
    if (Object.keys(patch).length > 0) onUpdateTask(task.id, patch);
  }

  return (
    <div className="ff-page">
      <header className="ff-page-head">
        <div>
          <h1 className="ff-page-title">{t("timeline.title")}</h1>
          <p className="ff-page-sub">{t("timeline.subtitle")}</p>
        </div>
        <div className="ff-board-controls">
          <label className="ff-board-control">
            <span>{t("board.scope")}</span>
            <select value={scope} onChange={(event) => setSpaceId(event.target.value)}>
              <option value={ALL_SPACES}>{t("board.allSpaces")}</option>
              {activeSpaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ff-board-control">
            <span>{t("board.groupBy")}</span>
            <select value={axis} onChange={(event) => setAxis(event.target.value as GroupAxis)}>
              {AXES.map((option) => (
                <option key={option} value={option}>
                  {t(`timeline.axis.${option}`)}
                </option>
              ))}
            </select>
          </label>
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
        </div>
      </header>

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
            {window.from} → {window.to}
          </span>
        </div>
        <label className="ff-timeline-toggle">
          <input type="checkbox" checked={showDone} onChange={(event) => setShowDone(event.target.checked)} />
          <span>{t("timeline.showDone")}</span>
        </label>
      </div>

      {onWindow.length === 0 && undated.length === 0 ? (
        <EmptyState icon="📆" title={t("timeline.empty")} text={t("timeline.emptyHint")} />
      ) : (
        <TimelineView
          items={onWindow}
          spec={spec}
          context={context}
          window={window}
          today={today}
          projects={projects}
          tasks={tasks}
          groupLabel={groupLabel}
          columnLabels={columnLabels}
          selectedTaskId={selectedTaskId}
          onOpenItem={(item) => {
            if (item.source === "task") onOpenTask(item.sourceId);
          }}
          onDragItem={handleDrag}
        />
      )}

      {undated.length > 0 ? (
        <section className="ff-timeline-tray">
          <h3>{t("timeline.trayTitle", { n: undated.length })}</h3>
          <p className="ff-timeline-tray-hint">{t("timeline.trayHint")}</p>
          <ul>
            {undated.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => {
                    if (item.source === "task") onOpenTask(item.sourceId);
                  }}
                >
                  <span className="ff-dot" style={{ background: item.color }} />
                  {item.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Narrow screens get a shorter label, never a shorter window (D11). */
function columnLabel(edge: string, zoom: TimelineZoom, lang: string): string {
  if (zoom === "year") return edge.slice(0, 4);
  if (zoom === "month") return lang === "ko" ? `${Number(edge.slice(5, 7))}월` : edge.slice(0, 7);
  // Day and week columns are both identified by their first day.
  return `${edge.slice(5, 7)}.${edge.slice(8, 10)}`;
}
