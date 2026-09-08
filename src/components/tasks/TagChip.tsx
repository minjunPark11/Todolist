// One chip, for every surface that draws a tag (TASK_TAG_CHIPS_DESIGN.md §4).
//
// There were two: a grey pill with an × in the Detail, and coloured `#name`
// text in the row. Same thing, two pictures. The difference that is real is
// whether the tag can be taken off here, and that is one prop.
//
// The `#` is gone with the second picture. It was there because the row's chip
// was grey text sitting beside a List's grey name and the two could not be
// told apart; a filled pill says it instead, and does not spend a third of a
// two-letter name saying it.
import type { CSSProperties } from "react";
import type { Tag } from "../../types";
import { tagChipColors } from "../../domain/tags/tagColor";
import { useT } from "../../i18n";

interface TagChipProps {
  tag: Tag;
  /** Present where the tag can be taken off — the Detail, and nowhere else. */
  onRemove?: () => void;
}

export function TagChip({ tag, onRemove }: TagChipProps) {
  const { t } = useT();
  const colors = tagChipColors(tag);
  // Both themes at once. The stylesheet picks; this does not know which one is
  // on, so a theme switch repaints without React hearing about it (§6).
  const style = {
    ["--tag-fill-light"]: colors.fillLight,
    ["--tag-ink-light"]: colors.inkLight,
    ["--tag-fill-dark"]: colors.fillDark,
    ["--tag-ink-dark"]: colors.inkDark,
  } as CSSProperties;

  return (
    <span className="tm-tag-chip" style={style} title={tag.name}>
      {tag.name}
      {onRemove ? (
        <button
          type="button"
          className="tm-tag-chip-remove"
          aria-label={t("tasks.removeTag", { value: tag.name })}
          onClick={onRemove}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
