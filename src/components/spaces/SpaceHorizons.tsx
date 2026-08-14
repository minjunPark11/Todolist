// The time axis inside one board (SPACES_BOARD_DESIGN.md D2).
//
// Spaces had an area axis and no time axis; Horizons had the reverse. This is
// the join: the same HorizonItems the Horizons page lays out in five columns,
// narrowed to one board and stacked as rows. Nothing new is stored — the rows
// are derived from target dates exactly as the page's columns are (D2), so the
// two views cannot disagree about where a goal sits.
import { useMemo, useState } from "react";
import type { LearningPath, Milestone, Project, Task } from "../../types";
import { buildHorizonItems, itemsForBoard, itemsForHorizon, type HorizonItem } from "../../utils/horizonItems";
import { HORIZONS } from "../../utils/horizons";
import { HorizonCard } from "../horizons/HorizonCard";
import { todayValue } from "../../utils/date";
import { useT } from "../../i18n";

export function SpaceHorizons({
  boardId,
  paths,
  tasks,
  projects,
  onUpdatePath,
  onUpdateMilestone,
  onCreateGoal,
  onOpenTask,
  onOpenGoal,
  onToggleTaskDone,
  onOpenHorizons,
}: {
  /** The Project behind this Space. Empty for study/local spaces, which have no board yet (Phase S4). */
  boardId: string;
  paths: LearningPath[];
  tasks: Task[];
  projects: Project[];
  onUpdatePath: (pathId: string, patch: Partial<Omit<LearningPath, "id">>) => void;
  onUpdateMilestone: (pathId: string, milestoneId: string, patch: Partial<Omit<Milestone, "id">>) => void;
  /**
   * The only place a goal can be given a board. The Horizons page creates
   * goals with no projectId, so without this the board half of D2 would never
   * fill — a board would show its tasks and never its goals.
   */
  onCreateGoal: (input: { goal: string; projectId: string }) => void;
  onOpenTask: (taskId: string) => void;
  onOpenGoal: (pathId: string, milestoneId?: string) => void;
  onToggleTaskDone: (taskId: string) => void;
  onOpenHorizons: () => void;
}) {
  const { t, lang } = useT();
  const today = todayValue();
  const [composing, setComposing] = useState(false);
  const [draftGoal, setDraftGoal] = useState("");

  function submitGoal() {
    const goal = draftGoal.trim();
    // An undated goal lands on "life", which is the right place for one: a
    // direction with no deadline is exactly what the widest horizon is for.
    if (goal && boardId) onCreateGoal({ goal, projectId: boardId });
    setDraftGoal("");
    setComposing(false);
  }

  const colorByProjectId = useMemo(
    () => new Map(projects.map((project) => [project.id, project.color])),
    [projects],
  );
  const items = useMemo(
    () => itemsForBoard(buildHorizonItems({ paths, tasks, today, colorByProjectId }), boardId),
    [boardId, colorByProjectId, paths, tasks, today],
  );

  const pathById = useMemo(() => new Map(paths.map((path) => [path.id, path])), [paths]);

  // Only the horizons that hold something (D5). The page draws all five
  // because the five-way perspective is what it is for; here the question is
  // narrower — where is this board right now — and three empty rows answer it
  // with whitespace.
  const rows = HORIZONS.map((horizon) => ({ horizon, rowItems: itemsForHorizon(items, horizon) })).filter(
    (row) => row.rowItems.length > 0,
  );

  function toggleDone(item: HorizonItem) {
    if (item.sourceType === "task") {
      // Same reasoning as the Horizons page: tasks belong to Today and the
      // calendar, which carry the undo, repeat and focus-session handling a
      // checkbox here would have to duplicate.
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

  return (
    <section className="sdv-card sdv-horizons">
      <header className="sdv-card-head">
        <h2>{t("spaces.horizons.title")}</h2>
        <div className="sdv-card-head-actions">
          {boardId ? (
            <button type="button" className="sdv-btn sdv-btn-sm" onClick={() => setComposing(true)}>
              + {t("horizons.addGoal")}
            </button>
          ) : null}
          <button type="button" className="sdv-btn sdv-btn-sm" onClick={onOpenHorizons}>
            {t("spaces.horizons.openPage")}
          </button>
        </div>
      </header>

      {composing ? (
        <form
          className="hz-compose sdv-horizon-compose"
          onSubmit={(event) => {
            event.preventDefault();
            submitGoal();
          }}
        >
          <input
            autoFocus
            value={draftGoal}
            placeholder={t("horizons.goalPlaceholder")}
            aria-label={t("horizons.goalPlaceholder")}
            onChange={(event) => setDraftGoal(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setComposing(false);
                setDraftGoal("");
                return;
              }
              if (event.key !== "Enter") return;
              event.preventDefault();
              // Enter during Hangul/IME composition commits the candidate, not
              // the goal — the same guard the Horizons page carries.
              if (event.nativeEvent.isComposing) return;
              submitGoal();
            }}
          />
        </form>
      ) : null}

      {rows.length === 0 ? (
        <p className="sdv-empty-inline">{boardId ? t("spaces.horizons.empty") : t("spaces.horizons.noBoard")}</p>
      ) : (
        <div className="sdv-horizon-rows">
          {rows.map(({ horizon, rowItems }) => (
            <div key={horizon} className="sdv-horizon-row">
              <div className="sdv-horizon-label">
                <span className="sdv-horizon-name">{t(`horizons.${horizon}`)}</span>
                <span className="sdv-horizon-count">{rowItems.length}</span>
              </div>
              <div className="sdv-horizon-cards">
                {rowItems.map((item) => (
                  <HorizonCard
                    key={item.key}
                    item={item}
                    lang={lang}
                    onToggleDone={() => toggleDone(item)}
                    onOpen={
                      item.sourceType === "task"
                        ? () => onOpenTask(item.sourceId)
                        : item.sourceType === "path"
                          ? () => onOpenGoal(item.sourceId)
                          : () => onOpenGoal(item.parentId, item.sourceId)
                    }
                    milestoneCount={
                      item.sourceType === "path" ? pathById.get(item.sourceId)?.milestones.length ?? 0 : undefined
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
