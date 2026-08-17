// Horizons — goals laid out across time scales (HORIZONS_DESIGN.md).
//
// Five columns, widest to nearest, all visible at once: the perspective is
// the product, so nothing here scrolls sideways (D8). Every card is the same
// HorizonItem whatever it came from (D7), and the page writes only through
// stores that already own their records — it creates no record type of its
// own (D1).
//
// Horizons 2 gives each bounded column its own calendar-period anchor. Goals
// move by GoalSchedule; Tasks retain their date-based compatibility path.
import { useMemo, useState } from "react";
import type { GoalSchedule, LearningPath, Milestone, Project, Task } from "../types";
import {
  buildHorizonItems,
  carryoverItemsForHorizonAnchor,
  itemsForHorizonAnchor,
  type HorizonItem,
} from "../utils/horizonItems";
import { canDropOnHorizon, HORIZONS, type Horizon } from "../utils/horizons";
import {
  createHorizonAnchors,
  dateForTaskAnchorDrop,
  isCurrentHorizonAnchor,
  scheduleForHorizon,
  shiftHorizonAnchor,
  type HorizonAnchors,
} from "../domain/horizons/horizonAnchors";
import { HorizonCard } from "./horizons/HorizonCard";
import { addDays, formatDate, getDayLabel, getMonthLabel, getWeekLabel, todayValue } from "../utils/date";
import type { ToastState } from "./kit";
import { useT } from "../i18n";

interface HorizonsPageProps {
  paths: LearningPath[];
  tasks: Task[];
  projects: Project[];
  // projectId is the board (SPACES_BOARD_DESIGN D1). Without it a goal made
  // here carried no board at all and so appeared in no Space — the two axes
  // stopped being one model. See TIMESTRIPE_REFERENCE.md §5.
  onCreatePath: (input: { goal: string; schedule?: GoalSchedule; projectId?: string }) => void;
  onUpdatePath: (pathId: string, patch: Partial<Omit<LearningPath, "id">>) => void;
  onDeletePath: (pathId: string) => void;
  onAddMilestone: (pathId: string, input: { title: string }) => void;
  onUpdateMilestone: (pathId: string, milestoneId: string, patch: Partial<Omit<Milestone, "id">>) => void;
  onDeleteMilestone: (pathId: string, milestoneId: string) => void;
  onUpdateTask: (taskId: string, patch: { scheduledDate?: string; dueDate?: string }) => void;
  onToggleTaskDone: (taskId: string) => void;
  /** Month → Day bridge: makes a task for today and links it to the milestone. */
  onCreateTaskFromMilestone: (pathId: string, milestoneId: string, title: string) => void;
  onOpenTask: (taskId: string) => void;
  onOpenGoal: (pathId: string, milestoneId?: string) => void;
  showToast: (toast: ToastState) => void;
  /**
   * Mounted inside a scope's View Bar rather than as its own page (§50F).
   *
   * The only difference is the heading: §49A.1 forbids a second big page
   * title inside a view, because the Context Header already names the place.
   * The controls stay — §50F.4's canonical layout puts them on that same row.
   */
  embedded?: boolean;
}

export function HorizonsPage({
  paths,
  tasks,
  projects,
  onCreatePath,
  onUpdatePath,
  onDeletePath,
  onAddMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
  onUpdateTask,
  onToggleTaskDone,
  onCreateTaskFromMilestone,
  onOpenTask,
  onOpenGoal,
  showToast,
  embedded = false,
}: HorizonsPageProps) {
  const { t, lang } = useT();
  const today = todayValue();
  const currentAnchors = useMemo(() => createHorizonAnchors(today), [today]);
  const [anchors, setAnchors] = useState<HorizonAnchors>(() => createHorizonAnchors(today));
  const [focusedHorizon, setFocusedHorizon] = useState<Horizon | null>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches ? "day" : null,
  );
  const [hideCompleted, setHideCompleted] = useState(false);

  // Drag state: the item being carried and the column under the cursor. The
  // item is held in React rather than read back out of dataTransfer, which is
  // unreadable during dragover — the drop rule has to be known to highlight
  // (or refuse) the column before the release.
  const [dragging, setDragging] = useState<HorizonItem | null>(null);
  const [dragOver, setDragOver] = useState<Horizon | null>(null);

  const [composing, setComposing] = useState<Horizon | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  // Sticky across goals: someone adding three goals is usually adding them to
  // the same board, and re-picking each time would be the annoying part.
  const [draftBoardId, setDraftBoardId] = useState("");
  const [milestoneFor, setMilestoneFor] = useState<string>("");
  const [milestoneTitle, setMilestoneTitle] = useState("");

  const colorByProjectId = useMemo(
    () => new Map(projects.map((project) => [project.id, project.color])),
    [projects],
  );

  const items = useMemo(
    () => buildHorizonItems({ paths, tasks, today, colorByProjectId }),
    [paths, tasks, today, colorByProjectId],
  );

  const pathById = useMemo(() => new Map(paths.map((path) => [path.id, path])), [paths]);

  const boards = useMemo(
    () => projects.map((project) => ({ id: project.id, name: project.name })),
    [projects],
  );

  // The board axis was write-once: set at creation and never again, while the
  // time axis moved freely by drag. One axis of a two-axis model being frozen
  // is the model half-working (TIMESTRIPE_REFERENCE.md §5).
  function changeBoard(pathId: string, boardId: string) {
    onUpdatePath(pathId, { projectId: boardId || undefined });
  }

  function submitGoal(horizon: Horizon) {
    const goal = draftTitle.trim();
    if (!goal) return;
    // Same helper the drop path uses, so creating a goal in a column and
    // dragging one into it land in the exact same calendar period.
    // An empty board is allowed and stays visible as "no board" on the card,
    // rather than being refused: you often know the goal before you know
    // where it belongs, and a goal you cannot write down is worse than one
    // that is briefly unfiled.
    onCreatePath({
      goal,
      schedule: scheduleForHorizon(horizon, anchors),
      projectId: draftBoardId || undefined,
    });
    setDraftTitle("");
    setComposing(null);
    showToast({ message: t("horizons.toastGoalAdded") });
  }

  function submitMilestone(pathId: string) {
    const title = milestoneTitle.trim();
    if (!title) return;
    onAddMilestone(pathId, { title });
    setMilestoneTitle("");
    setMilestoneFor("");
  }

  function toggleDone(item: HorizonItem) {
    if (item.sourceType === "task") {
      // Tasks are not this page's to own — Today and the calendar already
      // have that job, and a checkbox here would need the same undo, repeat
      // and focus-session handling they carry.
      onToggleTaskDone(item.sourceId);
      return;
    }
    const stamp = item.done ? undefined : new Date().toISOString();
    if (item.sourceType === "path") {
      onUpdatePath(item.sourceId, { completedAt: stamp });
    } else {
      onUpdateMilestone(item.parentId, item.sourceId, { completedAt: stamp });
    }
  }

  // Goals and milestones write exact schedules. Tasks remain execution records
  // and keep their scheduled-day compatibility behavior.
  //
  // A drag deliberately does *not* materialise a milestone into a task — that
  // is the explicit "+ 오늘 할 일로" action below. Moving an item and spawning
  // a different kind of item are different intentions, and a drag that
  // silently did the second would be unpredictable.
  function handleDrop(horizon: Horizon) {
    const item = dragging;
    setDragging(null);
    setDragOver(null);
    if (!item || !canDropOnHorizon(item.sourceType, horizon)) return;
    const anchor = horizon === "life" ? undefined : anchors[horizon];
    if (item.horizon === horizon && item.anchor === anchor) return;

    if (item.sourceType === "path") {
      onUpdatePath(item.sourceId, { schedule: scheduleForHorizon(horizon, anchors) });
    } else if (item.sourceType === "milestone") {
      onUpdateMilestone(item.parentId, item.sourceId, { schedule: scheduleForHorizon(horizon, anchors) });
    } else {
      const date = dateForTaskAnchorDrop(horizon, anchors);
      if (!date) return;
      // Tasks move by their scheduled day — the due date is a commitment to
      // someone else and is never rewritten by a drag (the calendar holds the
      // same rule for its deadline markers).
      onUpdateTask(item.sourceId, { scheduledDate: date });
    }
  }

  function shiftAnchor(horizon: Exclude<Horizon, "life">, amount: number) {
    setAnchors((current) => ({
      ...current,
      [horizon]: shiftHorizonAnchor(horizon, current[horizon], amount),
    }));
  }

  function periodLabel(horizon: Horizon, full = true): string {
    if (horizon === "life") return t("horizons.life");
    const anchor = anchors[horizon];
    if (horizon === "year") return t("horizons.periodYear", { year: anchor.slice(0, 4) });
    if (horizon === "month") return getMonthLabel(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)) - 1, lang);
    if (horizon === "week") {
      return full ? getWeekLabel(anchor, lang) : `${formatDate(anchor, lang)}–${formatDate(addDays(anchor, 6), lang)}`;
    }
    return full ? getDayLabel(anchor, lang) : formatDate(anchor, lang);
  }

  function materialiseMilestone(item: HorizonItem) {
    onCreateTaskFromMilestone(item.parentId, item.sourceId, item.title);
    showToast({ message: t("horizons.toastTaskCreated") });
  }

  function deleteItem(item: HorizonItem) {
    if (item.sourceType === "path") {
      onDeletePath(item.sourceId);
    } else if (item.sourceType === "milestone") {
      onDeleteMilestone(item.parentId, item.sourceId);
    } else {
      return;
    }
    showToast({ message: t("horizons.toastRemoved") });
  }

  function renderCard(item: HorizonItem) {
    return (
      <HorizonCard
        key={item.key}
        item={item}
        lang={lang}
        isDragging={dragging?.key === item.key}
        onDragStart={() => setDragging(item)}
        onDragEnd={() => {
          setDragging(null);
          setDragOver(null);
        }}
        onToggleDone={() => toggleDone(item)}
        onMaterialise={item.sourceType === "milestone" ? () => materialiseMilestone(item) : undefined}
        onOpen={
          item.sourceType === "task"
            ? () => onOpenTask(item.sourceId)
            : item.sourceType === "path"
              ? () => onOpenGoal(item.sourceId)
              : () => onOpenGoal(item.parentId, item.sourceId)
        }
        onAddMilestone={
          item.sourceType === "path"
            ? () => {
                setMilestoneFor(item.sourceId);
                setMilestoneTitle("");
              }
            : undefined
        }
        onDelete={item.sourceType === "task" ? undefined : () => deleteItem(item)}
        milestoneCount={item.sourceType === "path" ? pathById.get(item.sourceId)?.milestones.length ?? 0 : undefined}
        boards={item.sourceType === "path" ? boards : undefined}
        onChangeBoard={item.sourceType === "path" ? (boardId) => changeBoard(item.sourceId, boardId) : undefined}
      />
    );
  }

  function renderColumn(horizon: Horizon) {
    const anchor = horizon === "life" ? undefined : anchors[horizon];
    const currentPeriod = isCurrentHorizonAnchor(horizon, anchors, currentAnchors);
    const periodItems = itemsForHorizonAnchor(items, horizon, anchor).filter((item) => !hideCompleted || !item.done);
    const carryoverItems = carryoverItemsForHorizonAnchor(items, horizon, anchor, currentPeriod);
    const allVisibleItems = [...carryoverItems, ...periodItems];
    const accepts = dragging ? canDropOnHorizon(dragging.sourceType, horizon) : false;
    const columnClass = [
      "hz-column",
      focusedHorizon === horizon ? "is-focused" : "",
      dragOver === horizon && accepts ? "is-drop" : "",
      dragging && !accepts ? "is-refused" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <section
        key={horizon}
        className={columnClass}
        aria-label={periodLabel(horizon)}
        onDragOver={(event) => {
          if (!accepts) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          if (dragOver !== horizon) setDragOver(horizon);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          if (dragOver === horizon) setDragOver(null);
        }}
        onDrop={(event) => {
          event.preventDefault();
          handleDrop(horizon);
        }}
      >
        <header className="hz-column-head">
          <button type="button" className="hz-column-title" onClick={() => setFocusedHorizon(horizon)}>
            <small>{t(`horizons.${horizon}`)}</small>
            <strong>{periodLabel(horizon, focusedHorizon === horizon)}</strong>
          </button>
          <span className="hz-column-count">{allVisibleItems.length}</span>
          {horizon !== "life" ? (
            <div className="hz-period-nav">
              <button
                type="button"
                aria-label={t("horizons.previousPeriod")}
                onClick={() => shiftAnchor(horizon, -1)}
              >
                ‹
              </button>
              <button
                type="button"
                aria-label={t("horizons.nextPeriod")}
                onClick={() => shiftAnchor(horizon, 1)}
              >
                ›
              </button>
            </div>
          ) : null}
        </header>

        <div className="hz-cards">
          {carryoverItems.length > 0 ? (
            <section className="hz-carryover" aria-label={t("horizons.carryover") }>
              <h3>{t("horizons.carryoverCount", { n: carryoverItems.length })}</h3>
              <div className="hz-carryover-cards">{carryoverItems.map(renderCard)}</div>
            </section>
          ) : null}

          {periodItems.map(renderCard)}

          {milestoneFor && allVisibleItems.some((item) => item.sourceId === milestoneFor) ? (
            <form
              className="hz-compose"
              onSubmit={(event) => {
                event.preventDefault();
                submitMilestone(milestoneFor);
              }}
            >
              <input
                autoFocus
                value={milestoneTitle}
                placeholder={t("horizons.milestonePlaceholder")}
                aria-label={t("horizons.milestonePlaceholder")}
                onChange={(event) => setMilestoneTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setMilestoneFor("");
                    return;
                  }
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  if (event.nativeEvent.isComposing) return;
                  submitMilestone(milestoneFor);
                }}
              />
            </form>
          ) : null}

          {composing === horizon ? (
            <form
              className="hz-compose"
              onSubmit={(event) => {
                event.preventDefault();
                submitGoal(horizon);
              }}
            >
              <input
                autoFocus
                value={draftTitle}
                placeholder={t("horizons.goalPlaceholder")}
                aria-label={t("horizons.goalPlaceholder")}
                onChange={(event) => setDraftTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setComposing(null);
                    setDraftTitle("");
                    return;
                  }
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  if (event.nativeEvent.isComposing) return;
                  submitGoal(horizon);
                }}
              />
              {boards.length > 0 ? (
                <select
                  className="hz-compose-board"
                  aria-label={t("horizons.board")}
                  value={draftBoardId}
                  onChange={(event) => setDraftBoardId(event.target.value)}
                >
                  <option value="">{t("horizons.noBoard")}</option>
                  {boards.map((board) => (
                    <option key={board.id} value={board.id}>
                      {board.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </form>
          ) : (
            <button
              type="button"
              className="hz-add"
              onClick={() => {
                setComposing(horizon);
                setDraftTitle("");
              }}
            >
              + {t("horizons.addGoal")}
            </button>
          )}

          {allVisibleItems.length === 0 && composing !== horizon ? (
            <p className="hz-empty">{t("horizons.columnEmpty")}</p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <div className={`hz-page${embedded ? " is-embedded" : ""}`}>
      <header className="hz-head">
        <div>
          {embedded ? (
            <h2>{t("horizons.title")}</h2>
          ) : (
            <>
              <h1>{t("horizons.title")}</h1>
              <p>{t("horizons.subtitle")}</p>
            </>
          )}
        </div>
        <div className="hz-toolbar">
          <label>
            <input type="checkbox" checked={hideCompleted} onChange={(event) => setHideCompleted(event.target.checked)} />
            {t("horizons.hideCompleted")}
          </label>
          <button type="button" onClick={() => setAnchors(currentAnchors)}>
            {t("horizons.backToToday")}
          </button>
        </div>
      </header>

      {focusedHorizon ? (
        <div className="hz-focus-bar">
          <button type="button" onClick={() => setFocusedHorizon(null)}>
            ← {t("horizons.allHorizons")}
          </button>
          <strong>{periodLabel(focusedHorizon)}</strong>
        </div>
      ) : null}

      <div className={`hz-columns${focusedHorizon ? " is-focus" : ""}`}>
        {(focusedHorizon ? [focusedHorizon] : HORIZONS).map(renderColumn)}
      </div>
    </div>
  );
}
