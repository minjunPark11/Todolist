// Horizons — goals laid out across time scales (HORIZONS_DESIGN.md).
//
// Five columns, widest to nearest, all visible at once: the perspective is
// the product, so nothing here scrolls sideways (D8). Every card is the same
// HorizonItem whatever it came from (D7), and the page writes only through
// stores that already own their records — it creates no record type of its
// own (D1).
//
// Phase 1 is deliberately drag-free. The derivation and the layout have to be
// right before a drag can know what to write.
import { useMemo, useState } from "react";
import type { LearningPath, Milestone, Project, Task } from "../types";
import { buildHorizonItems, itemsForHorizon, type HorizonItem } from "../utils/horizonItems";
import { canDropOnHorizon, dateForHorizonDrop, HORIZONS, type Horizon } from "../utils/horizons";
import { HorizonCard } from "./horizons/HorizonCard";
import { todayValue } from "../utils/date";
import type { ToastState } from "./kit";
import { useT } from "../i18n";

interface HorizonsPageProps {
  paths: LearningPath[];
  tasks: Task[];
  projects: Project[];
  // projectId is the board (SPACES_BOARD_DESIGN D1). Without it a goal made
  // here carried no board at all and so appeared in no Space — the two axes
  // stopped being one model. See TIMESTRIPE_REFERENCE.md §5.
  onCreatePath: (input: { goal: string; targetDate?: string; projectId?: string }) => void;
  onUpdatePath: (pathId: string, patch: Partial<Omit<LearningPath, "id">>) => void;
  onDeletePath: (pathId: string) => void;
  onAddMilestone: (pathId: string, input: { title: string }) => void;
  onUpdateMilestone: (pathId: string, milestoneId: string, patch: Partial<Omit<Milestone, "id">>) => void;
  onDeleteMilestone: (pathId: string, milestoneId: string) => void;
  onUpdateTask: (taskId: string, patch: { scheduledDate?: string; dueDate?: string }) => void;
  /** Month → Day bridge: makes a task for today and links it to the milestone. */
  onCreateTaskFromMilestone: (pathId: string, milestoneId: string, title: string) => void;
  onOpenTask: (taskId: string) => void;
  showToast: (toast: ToastState) => void;
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
  onCreateTaskFromMilestone,
  onOpenTask,
  showToast,
}: HorizonsPageProps) {
  const { t, lang } = useT();
  const today = todayValue();

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
    // dragging one into it land on the same date.
    // An empty board is allowed and stays visible as "no board" on the card,
    // rather than being refused: you often know the goal before you know
    // where it belongs, and a goal you cannot write down is worse than one
    // that is briefly unfiled.
    onCreatePath({
      goal,
      targetDate: dateForHorizonDrop(horizon, today),
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
      onOpenTask(item.sourceId);
      return;
    }
    const stamp = item.done ? undefined : new Date().toISOString();
    if (item.sourceType === "path") {
      onUpdatePath(item.sourceId, { completedAt: stamp });
    } else {
      onUpdateMilestone(item.parentId, item.sourceId, { completedAt: stamp });
    }
  }

  // Every drag writes a date and nothing else; the column the card ends up in
  // is re-derived from that date (D2), so the two can never disagree.
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
    if (item.horizon === horizon) return;

    const date = dateForHorizonDrop(horizon, today);
    if (item.sourceType === "path") {
      onUpdatePath(item.sourceId, { targetDate: date });
    } else if (item.sourceType === "milestone") {
      onUpdateMilestone(item.parentId, item.sourceId, { targetDate: date });
    } else if (date) {
      // Tasks move by their scheduled day — the due date is a commitment to
      // someone else and is never rewritten by a drag (the calendar holds the
      // same rule for its deadline markers).
      onUpdateTask(item.sourceId, { scheduledDate: date });
    }
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

  return (
    <div className="hz-page">
      <header className="hz-head">
        <div>
          <h1>{t("horizons.title")}</h1>
          <p>{t("horizons.subtitle")}</p>
        </div>
      </header>

      <div className="hz-columns">
        {HORIZONS.map((horizon) => {
          const columnItems = itemsForHorizon(items, horizon);
          const accepts = dragging ? canDropOnHorizon(dragging.sourceType, horizon) : false;
          const columnClass = [
            "hz-column",
            dragOver === horizon && accepts ? "is-drop" : "",
            dragging && !accepts ? "is-refused" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <section
              key={horizon}
              className={columnClass}
              aria-label={t(`horizons.${horizon}`)}
              onDragOver={(event) => {
                if (!accepts) return;
                // Only a prevented dragover marks the column as a valid drop
                // target; without this the browser shows a "no entry" cursor
                // and never fires onDrop.
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (dragOver !== horizon) setDragOver(horizon);
              }}
              onDragLeave={(event) => {
                // Ignore the leave events fired when the pointer crosses a
                // child card inside the same column.
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                if (dragOver === horizon) setDragOver(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                handleDrop(horizon);
              }}
            >
              <header className="hz-column-head">
                <h2>{t(`horizons.${horizon}`)}</h2>
                <span className="hz-column-count">{columnItems.length}</span>
              </header>
              <p className="hz-column-hint">{t(`horizons.${horizon}Hint`)}</p>

              <div className="hz-cards">
                {columnItems.map((item) => (
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
                    onOpen={item.sourceType === "task" ? () => onOpenTask(item.sourceId) : undefined}
                    onAddMilestone={
                      item.sourceType === "path"
                        ? () => {
                            setMilestoneFor(item.sourceId);
                            setMilestoneTitle("");
                          }
                        : undefined
                    }
                    onDelete={item.sourceType === "task" ? undefined : () => deleteItem(item)}
                    milestoneCount={
                      item.sourceType === "path" ? pathById.get(item.sourceId)?.milestones.length ?? 0 : undefined
                    }
                    boards={item.sourceType === "path" ? boards : undefined}
                    onChangeBoard={
                      item.sourceType === "path" ? (boardId) => changeBoard(item.sourceId, boardId) : undefined
                    }
                  />
                ))}

                {milestoneFor && columnItems.some((item) => item.sourceId === milestoneFor) ? (
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
                        // An IME fires Enter to commit its composition too;
                        // saving on that one stores a half-typed title.
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

                {columnItems.length === 0 && composing !== horizon ? (
                  <p className="hz-empty">{t("horizons.columnEmpty")}</p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
