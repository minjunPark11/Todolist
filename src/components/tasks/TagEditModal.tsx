// Editing one tag: its name and its colour (TASK_TAG_CHIPS_DESIGN.md §5.2).
//
// The colour row is `CreateListModal`'s, moved here rather than invented: the
// same "none, eight presets, custom" group, the same roving arrows, the same
// stored form (a preset key or a `#RRGGBB`). Tags and Lists share a palette so
// a colour means one thing on a screen that shows both.
//
// The reference dialog also has a Parent Tag row. It is not here, on purpose —
// this app has no tag hierarchy, and building one was not what was asked for.
import { useCallback, useId, useRef, useState } from "react";
import type { Tag } from "../../types";
import { LIST_COLOR_PRESETS, isCustomListColor } from "../../domain/tasks/listColor";
import { tagNameRefusal } from "../../domain/tags/tagPicker";
import { isRovingKey, rovingNext } from "../../domain/tasks/rovingChoice";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { CustomColorPicker } from "./CustomColorPicker";
import { TagChip } from "./TagChip";
import { useT } from "../../i18n";

interface TagEditModalProps {
  tag: Tag;
  onSubmit: (patch: { name: string; color: string }) => void;
  onClose: () => void;
}

export function TagEditModal({ tag, onSubmit, onClose }: TagEditModalProps) {
  const { t } = useT();
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color ?? "");
  const nameRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  const colorValues = ["", ...LIST_COLOR_PRESETS.map((preset) => preset.key)];
  const colorCursor = isCustomListColor(color) ? "" : color;
  // The same rule the picker's inline create obeys (§13.35), so a name refused
  // there cannot be smuggled in here.
  const refusal = tagNameRefusal(name);

  function rove(event: React.KeyboardEvent, values: readonly string[], current: string, apply: (next: string) => void) {
    if (!isRovingKey(event.key)) return;
    const next = rovingNext(values, current, event.key);
    if (next === null) return;
    event.preventDefault();
    apply(next);
    const group = event.currentTarget as HTMLElement;
    group.querySelectorAll<HTMLElement>('[role="radio"]')[values.indexOf(next)]?.focus();
  }

  function submit() {
    if (refusal) return;
    onSubmit({ name: name.trim(), color });
  }

  const focusName = useCallback(() => nameRef.current, []);
  useFocusTrap(rootRef, { initial: focusName });

  return (
    <div className="tm-modal-scrim" role="presentation">
      <div
        ref={rootRef}
        className="tm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          onClose();
        }}
      >
        <div className="tm-modal-settings">
          <header className="tm-modal-head">
            <h2 id={titleId}>{t("tasks.editTagTitle")}</h2>
            <button type="button" className="tm-modal-close" aria-label={t("common.close")} onClick={onClose}>
              ×
            </button>
          </header>

          <form
            className="tm-modal-body"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <label className="tm-field">
              <span className="tm-field-label">{t("tasks.editTagNameLabel")}</span>
              <input
                ref={nameRef}
                type="text"
                className="tm-modal-input"
                value={name}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={refusal ? true : undefined}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  // The Enter that ends a Korean composition is a candidate
                  // being chosen, not a save (`CreateListModal` §1.9/§3.26).
                  if (event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  submit();
                }}
              />
            </label>

            <fieldset className="tm-field">
              <legend className="tm-field-label">{t("tasks.createListColorLabel")}</legend>
              <div className="tm-swatches">
                <div
                  className="tm-swatch-radios"
                  role="radiogroup"
                  aria-label={t("tasks.createListColorLabel")}
                  onKeyDown={(event) => rove(event, colorValues, colorCursor, setColor)}
                >
                  {/* "None" is a choice, not the absence of one: a tag with no
                      colour is drawn neutral rather than guessed at (§5.2). */}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={color === ""}
                    aria-label={t("tasks.createListColorNone")}
                    tabIndex={colorCursor === "" ? 0 : -1}
                    className={`tm-swatch is-none${color === "" ? " is-selected" : ""}`}
                    onClick={() => setColor("")}
                  />
                  {LIST_COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      role="radio"
                      aria-checked={color === preset.key}
                      aria-label={t(`tasks.color.${preset.key}`)}
                      tabIndex={colorCursor === preset.key ? 0 : -1}
                      className={`tm-swatch${color === preset.key ? " is-selected" : ""}`}
                      style={{ background: preset.hex }}
                      onClick={() => setColor(preset.key)}
                    />
                  ))}
                </div>
                <CustomColorPicker value={color} onChange={setColor} />
              </div>
            </fieldset>

            {/* What the choice will look like, in the thing it will look like.
                A swatch says which colour; this says what the chip becomes,
                which is the question actually being answered. */}
            <p className="tm-tag-edit-preview">
              <TagChip tag={{ ...tag, name: name.trim() || tag.name, color }} />
            </p>

            <div className="tm-modal-actions">
              <button type="button" className="tm-modal-cancel" onClick={onClose}>
                {t("tasks.createListCancel")}
              </button>
              <button type="submit" className="tm-modal-submit" disabled={Boolean(refusal)}>
                {t("tasks.editTagSave")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
