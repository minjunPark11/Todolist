// The one card every horizon view draws (HORIZONS_DESIGN.md D7).
//
// Extracted from HorizonsPage when the Space detail grew a horizon axis of its
// own (SPACES_BOARD_DESIGN.md D2): a goal has to look and behave the same in
// both places, and two copies of this markup would drift the first time either
// one changed.
//
// The drag handlers are optional because dragging is not (D6) — the Space
// detail renders rows, not columns, and a card there is not draggable at all.
// A card with no onDragStart sets draggable={false} rather than starting a
// drag that has nowhere to land.
import { type CSSProperties } from "react";
import type { HorizonItem } from "../../utils/horizonItems";
import { formatDate } from "../../utils/date";
import { useT } from "../../i18n";

export function HorizonCard({
  item,
  lang,
  isDragging,
  onDragStart,
  onDragEnd,
  onToggleDone,
  onOpen,
  onAddMilestone,
  onMaterialise,
  onDelete,
  milestoneCount,
  boards,
  onChangeBoard,
}: {
  item: HorizonItem;
  lang: "en" | "ko";
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onToggleDone: () => void;
  onOpen?: () => void;
  onAddMilestone?: () => void;
  onMaterialise?: () => void;
  onDelete?: () => void;
  milestoneCount?: number;
  /**
   * Board picker, shown only where the board actually lives — on the goal.
   * Milestones and tasks inherit their goal's board (horizonItems D3) and
   * already carry the goal's title as a breadcrumb, so repeating the board on
   * them would be noise rather than information.
   *
   * Absent inside a board's own detail view: naming the board you are
   * standing in tells the reader nothing.
   */
  boards?: Array<{ id: string; name: string }>;
  onChangeBoard?: (boardId: string) => void;
}) {
  const { t } = useT();
  const canDrag = Boolean(onDragStart) && item.draggable;
  return (
    <article
      className={[
        "hz-card",
        `hz-card-${item.sourceType}`,
        item.done ? "is-done" : "",
        isDragging ? "is-dragging" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ["--ev-color"]: item.color } as CSSProperties}
      draggable={canDrag}
      onDragStart={(event) => {
        if (!onDragStart) return;
        // A payload is required for the drag to start in Firefox; the actual
        // item travels in React state, which dragover can read and this cannot.
        event.dataTransfer.setData("text/plain", item.key);
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="hz-card-row">
        <button
          type="button"
          className={`hz-check${item.done ? " checked" : ""}`}
          aria-label={item.done ? t("horizons.markNotDone") : t("horizons.markDone")}
          onClick={onToggleDone}
        >
          {item.done ? "✓" : ""}
        </button>
        <button
          type="button"
          className="hz-card-title"
          onClick={onOpen}
          disabled={!onOpen}
        >
          {item.title}
        </button>
      </div>

      {item.parentTitle ? <p className="hz-card-parent">↳ {item.parentTitle}</p> : null}
      {item.doneCriteria ? <p className="hz-card-criteria">{item.doneCriteria}</p> : null}

      <div className="hz-card-meta">
        {boards && onChangeBoard ? (
          // The badge is the control: it has to name the board anyway, and a
          // separate label plus picker would double the card's chrome.
          <select
            className={`hz-card-board${item.boardId ? "" : " is-unassigned"}`}
            aria-label={t("horizons.board")}
            value={item.boardId ?? ""}
            onChange={(event) => onChangeBoard(event.target.value)}
          >
            <option value="">{t("horizons.noBoard")}</option>
            {boards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name}
              </option>
            ))}
          </select>
        ) : null}
        {item.targetDate ? <span className="hz-card-date">{formatDate(item.targetDate, lang)}</span> : null}
        {milestoneCount !== undefined && milestoneCount > 0 ? (
          <span className="hz-card-count">{t("horizons.milestoneCount", { n: milestoneCount })}</span>
        ) : null}
        {onAddMilestone ? (
          <button type="button" className="hz-card-action" onClick={onAddMilestone}>
            + {t("horizons.addMilestone")}
          </button>
        ) : null}
        {onMaterialise ? (
          <button type="button" className="hz-card-action" onClick={onMaterialise}>
            + {t("horizons.materialise")}
          </button>
        ) : null}
        {onDelete ? (
          <button type="button" className="hz-card-action is-danger" onClick={onDelete}>
            {t("common.delete")}
          </button>
        ) : null}
      </div>
    </article>
  );
}
