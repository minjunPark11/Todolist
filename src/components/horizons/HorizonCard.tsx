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
          onClick={onOpen ?? onToggleDone}
          disabled={!onOpen && !onToggleDone}
        >
          {item.title}
        </button>
      </div>

      {item.parentTitle ? <p className="hz-card-parent">↳ {item.parentTitle}</p> : null}
      {item.doneCriteria ? <p className="hz-card-criteria">{item.doneCriteria}</p> : null}

      <div className="hz-card-meta">
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
